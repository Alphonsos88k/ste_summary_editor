/**
 * @module chat-files-manager
 * @description Inline overlay panel for browsing and editing SillyTavern
 * chat JSONL files. Renders inside #se-panel-arcs (fills the arcs area).
 * Pop-out and fullscreen modes available via header buttons.
 */

import { escHtml } from '../core/utils.js';
import { loadTemplate } from '../core/template-loader.js';
import { TEMPLATES } from '../core/constants.js';
import { bindEditorControls, selectFile } from './chat-files-editor.js';
import { initAnalyser, destroyAnalyser, refreshEntries } from './chat-files-analyser.js';

let _panel         = null;
let _currentChar   = null;
let _files         = [];
let _analyserReady = false;
let _popped        = false;
let _dragAbort     = null;
let _userHandle    = 'default-user';

// ─── Public API ──────────────────────────────────────────────

export async function openChatFilesManager(char) {
    closeChatFilesManager();
    _currentChar = char;
    _popped = false;

    const html = await loadTemplate(TEMPLATES.CHAT_FILES_MANAGER);
    _panel = document.createElement('div');
    _panel.id = 'se-cfm-panel';
    _panel.className = 'se-cfm-panel';
    _panel.innerHTML = html;

    document.querySelector('#se-panel-arcs .se-acts-content').appendChild(_panel);
    _panel.querySelector('#se-cfm-char-name').textContent = char.name;

    _fetchUserHandle();
    _bindPanelEvents();
    bindEditorControls(_panel);
    await _loadFileList();

    requestAnimationFrame(() => _panel?.classList.add('open'));
}

export function closeChatFilesManager() {
    destroyAnalyser();
    _detachDrag();
    _panel?.remove();
    _panel         = null;
    _files         = [];
    _analyserReady = false;
}

// ─── Drag helpers ─────────────────────────────────────────────

function _attachDrag() {
    _detachDrag();
    _dragAbort = new AbortController();
    const { signal } = _dragAbort;
    const header = _panel.querySelector('.se-cfm-header');
    let startX, startY, startLeft, startTop;

    header.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return;
        startX = e.clientX;
        startY = e.clientY;
        const rect = _panel.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        header.setPointerCapture(e.pointerId);
    }, { signal });

    header.addEventListener('pointermove', (e) => {
        if (!header.hasPointerCapture(e.pointerId)) return;
        const minV = 48;
        _panel.style.left = Math.max(-((_panel.offsetWidth) - minV), Math.min(window.innerWidth - minV, startLeft + e.clientX - startX)) + 'px';
        _panel.style.top  = Math.max(0, Math.min(window.innerHeight - minV, startTop  + e.clientY - startY)) + 'px';
    }, { signal });

    header.addEventListener('pointerup', (e) => {
        if (header.hasPointerCapture(e.pointerId)) header.releasePointerCapture(e.pointerId);
    }, { signal });
}

function _detachDrag() {
    _dragAbort?.abort();
    _dragAbort = null;
    if (_panel) {
        _panel.style.left = '';
        _panel.style.top  = '';
    }
}

// ─── User handle (for folder path) ───────────────────────────

async function _fetchUserHandle() {
    try {
        const ctx = SillyTavern.getContext();
        const resp = await fetch('/api/users/me', { headers: ctx.getRequestHeaders() });
        if (resp.ok) {
            const data = await resp.json();
            if (data?.handle) _userHandle = data.handle;
        }
    } catch { /* fall back to default-user */ }
}

// ─── File List ───────────────────────────────────────────────

async function _loadFileList() {
    const listEl = _panel.querySelector('#se-cfm-file-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="se-cfm-hint">Loading&hellip;</div>';

    const ctx = SillyTavern.getContext();
    try {
        const resp = await fetch('/getallchatsofcharacter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...ctx.getRequestHeaders() },
            body: JSON.stringify({ avatar_url: _currentChar.avatar }),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        _renderFileList(Array.isArray(data) ? data : []);
    } catch (err) {
        listEl.innerHTML = `<div class="se-cfm-hint se-cfm-error">Failed to load: ${escHtml(err.message)}</div>`;
    }
}

function _renderFileList(chats) {
    _files = chats;
    const listEl = _panel.querySelector('#se-cfm-file-list');
    if (!listEl) return;
    if (!chats.length) {
        listEl.innerHTML = '<div class="se-cfm-hint">No chats found</div>';
        return;
    }

    const sorted   = chats.toSorted((a, b) => _toMs(b.last_mes) - _toMs(a.last_mes));
    const roots    = sorted.filter(c => !c.parent_chat_id);
    const branches = sorted.filter(c => c.parent_chat_id);

    listEl.innerHTML = roots.map(chat => {
        const subs = branches.filter(b => b.parent_chat_id === chat.file_name);
        return _fileItemHtml(chat, false) + subs.map(b => _fileItemHtml(b, true)).join('');
    }).join('');

    listEl.querySelectorAll('[data-cfm-file]').forEach(el => {
        el.addEventListener('click', () => selectFile(el.dataset.cfmFile, _currentChar));
        _attachMarquee(el);
    });
}

const _LABEL_MAX = 52;

function _fileItemHtml(chat, isBranch) {
    const name  = chat.file_name ?? '';
    const base  = name.replace(/\.jsonl$/, '');
    const label = base.length > _LABEL_MAX ? `${base.slice(0, _LABEL_MAX)}…` : base;
    const date  = _relDate(chat.last_mes);
    const cls   = isBranch ? ' se-cfm-branch' : '';
    const pfx   = isBranch ? '&#8627;&nbsp;' : '';
    return `<div class="se-cfm-file-item${cls}" data-cfm-file="${escHtml(name)}" title="${escHtml(name)}">` +
        `<span class="se-cfm-fname"><span class="se-cfm-fname-text">${pfx}${escHtml(label)}</span></span>` +
        `<span class="se-cfm-fdate">${date}</span>` +
        '</div>';
}

function _attachMarquee(item) {
    const outer = item.querySelector('.se-cfm-fname');
    const inner = item.querySelector('.se-cfm-fname-text');
    if (!outer || !inner) return;
    item.addEventListener('mouseenter', () => {
        const overflow = inner.scrollWidth - outer.clientWidth;
        if (overflow > 4) {
            const dur = Math.min(0.6 + overflow / 80, 3.5);
            inner.style.transition = `transform ${dur}s ease-in-out`;
            inner.style.transform  = `translateX(-${overflow}px)`;
        }
    });
    item.addEventListener('mouseleave', () => {
        inner.style.transition = 'transform 0.25s ease';
        inner.style.transform  = '';
    });
}

function _toMs(val) {
    if (!val) return 0;
    if (typeof val === 'number') return val > 1e10 ? val : val * 1000;
    const parsed = Date.parse(String(val));
    return Number.isNaN(parsed) ? 0 : parsed;
}

function _relDate(val) {
    const ms = _toMs(val);
    if (!ms) return '';
    const days = Math.floor((Date.now() - ms) / 86_400_000);
    if (days <= 0) return 'Today';
    if (days === 1) return '1d ago';
    if (days < 30) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 8) return `${weeks}w ago`;
    return `${Math.floor(days / 30)}mo ago`;
}

// ─── Panel-level events ──────────────────────────────────────

function _bindPanelEvents() {
    _panel.querySelector('.se-cfm-close')?.addEventListener('click', closeChatFilesManager);

    _panel.querySelector('#se-cfm-search')?.addEventListener('input', function () {
        const q = this.value.toLowerCase().trim();
        _panel.querySelectorAll('.se-cfm-file-item').forEach(el => {
            el.style.display = !q || el.dataset.cfmFile.toLowerCase().includes(q) ? '' : 'none';
        });
    });

    _panel.querySelector('#se-cfm-btn-popout')?.addEventListener('click', () => {
        _popped = !_popped;
        _panel.classList.toggle('se-cfm-popped', _popped);
        _panel.classList.remove('se-cfm-fullscreen');
        if (_popped) _attachDrag();
        else _detachDrag();
    });

    _panel.querySelector('#se-cfm-btn-fullscreen')?.addEventListener('click', () => {
        const isFull = _panel.classList.toggle('se-cfm-fullscreen');
        if (isFull) {
            _panel.classList.remove('se-cfm-popped');
            _detachDrag();
            _popped = false;
        }
    });

    const folder     = _currentChar?.avatar.replace(/\.[^.]+$/, '') ?? '';
    _panel.querySelector('#se-cfm-folder-btn')?.addEventListener('click', () => {
        const path = `data/${_userHandle}/chats/${folder}/`;
        navigator.clipboard.writeText(path).catch(() => {});
        const toast = _panel.querySelector('#se-cfm-folder-toast');
        if (!toast) return;
        toast.textContent = 'Copied!';
        toast.classList.add('se-cfm-folder-toast-visible');
        clearTimeout(toast._t);
        toast._t = setTimeout(() => toast.classList.remove('se-cfm-folder-toast-visible'), 1800);
    });

    // Tab switching — Files / Analyse
    _panel.querySelectorAll('.se-cfm-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            _panel.querySelectorAll('.se-cfm-tab').forEach(t => t.classList.toggle('active', t === tab));
            _panel.querySelector('#se-cfm-tab-files').style.display   = target === 'files'   ? '' : 'none';
            _panel.querySelector('#se-cfm-tab-analyse').style.display = target === 'analyse' ? '' : 'none';

            if (target === 'analyse') {
                if (_analyserReady) refreshEntries();
                else { _analyserReady = true; initAnalyser(_panel, _files); }
            }
        });
    });
}
