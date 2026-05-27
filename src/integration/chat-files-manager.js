/**
 * @module chat-files-manager
 * @description Inline overlay panel for browsing and editing SillyTavern
 * chat JSONL files. Renders inside #se-panel-arcs (fills the arcs area).
 * Pop-out and fullscreen modes available via header buttons.
 */

import { escHtml } from '../core/utils.js';
import { loadTemplate } from '../core/template-loader.js';
import { TEMPLATES } from '../core/constants.js';
import { bindEditorControls, selectFile, applyFileSearch, clearFileSearch } from './chat-files-editor.js';
import { initAnalyser, destroyAnalyser, refreshEntries, refreshAnalyserCanvas } from './chat-files-analyser.js';

let _panel = null;
let _currentChar = null;
let _files = [];
let _analyserReady = false;
let _popped = false;
let _dragAbort = null;
let _userHandle = 'default-user';
let _contentCache = {};   // fileName → messages[] (fetched on demand, lives for panel lifetime)
let _searchGen    = 0;    // incremented on each new search to cancel stale async runs
let _searchTimer  = null;

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
    clearTimeout(_searchTimer);
    clearFileSearch();
    destroyAnalyser();
    _detachDrag();
    _panel?.remove();
    _panel         = null;
    _files         = [];
    _analyserReady = false;
    _contentCache  = {};
    _searchGen     = 0;
}

// ─── Drag helpers ─────────────────────────────────────────────

function _attachDrag() {
    _detachDrag();
    _dragAbort = new AbortController();
    const { signal } = _dragAbort;
    const header = _panel.querySelector('.se-cfm-header');
    let startX, startY, startLeft, startTop;

    header.addEventListener(
        'pointerdown',
        (e) => {
            if (e.target.closest('button')) return;
            startX = e.clientX;
            startY = e.clientY;
            const rect = _panel.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            header.setPointerCapture(e.pointerId);
        },
        { signal }
    );

    header.addEventListener(
        'pointermove',
        (e) => {
            if (!header.hasPointerCapture(e.pointerId)) return;
            const minV = 48;
            _panel.style.left =
                Math.max(
                    -(_panel.offsetWidth - minV),
                    Math.min(window.innerWidth - minV, startLeft + e.clientX - startX)
                ) + 'px';
            _panel.style.top = Math.max(0, Math.min(window.innerHeight - minV, startTop + e.clientY - startY)) + 'px';
        },
        { signal }
    );

    header.addEventListener(
        'pointerup',
        (e) => {
            if (header.hasPointerCapture(e.pointerId)) header.releasePointerCapture(e.pointerId);
        },
        { signal }
    );
}

function _detachDrag() {
    _dragAbort?.abort();
    _dragAbort = null;
    if (_panel) {
        _panel.style.left = '';
        _panel.style.top = '';
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
    } catch {
        /* fall back to default-user */
    }
}

// ─── File List ───────────────────────────────────────────────

async function _loadFileList() {
    const listEl = _panel.querySelector('#se-cfm-file-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="se-cfm-hint">Loading&hellip;</div>';

    const ctx = SillyTavern.getContext();
    try {
        const resp = await fetch('/api/characters/chats', {
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
    _files = chats.toSorted((a, b) => _toMs(b.last_mes) - _toMs(a.last_mes));
    const listEl = _panel.querySelector('#se-cfm-file-list');
    if (!listEl) return;
    if (!_files.length) {
        listEl.innerHTML = '<div class="se-cfm-hint">No chats found</div>';
        return;
    }

    listEl.innerHTML = _files.map((chat) => _fileItemHtml(chat)).join('');

    listEl.querySelectorAll('[data-cfm-file]').forEach((el) => {
        el.addEventListener('click', () => selectFile(el.dataset.cfmFile, _currentChar));
        _attachMarquee(el);
    });
}

const _LABEL_MAX = 52;

function _fileItemHtml(chat) {
    const name = chat.file_name ?? '';
    const base = name.replace(/\.jsonl$/, '');
    const label = base.length > _LABEL_MAX ? `${base.slice(0, _LABEL_MAX)}…` : base;
    const date = _relDate(chat.last_mes);
    return (
        `<div class="se-cfm-file-item" data-cfm-file="${escHtml(name)}" title="${escHtml(name)}">` +
        `<span class="se-cfm-fname"><span class="se-cfm-fname-text">${escHtml(label)}</span></span>` +
        `<span class="se-cfm-fdate">${date}</span>` +
        '</div>'
    );
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
            inner.style.transform = `translateX(-${overflow}px)`;
        }
    });
    item.addEventListener('mouseleave', () => {
        inner.style.transition = 'transform 0.25s ease';
        inner.style.transform = '';
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

// ─── Content search ──────────────────────────────────────────

async function _runContentSearch(q, gen) {
    const items = [...(_panel?.querySelectorAll('.se-cfm-file-item') ?? [])];
    for (const chat of _files) {
        if (gen !== _searchGen) return;
        const name = chat.file_name ?? '';
        const el   = items.find(x => x.dataset.cfmFile === name);
        if (el) await _searchOneFile(el, name, q, gen);
    }
}

async function _searchOneFile(el, name, q, gen) {
    const nameMatch = name.toLowerCase().includes(q);
    if (_contentCache[name] === undefined) {
        const spin = document.createElement('span');
        spin.className = 'se-cfm-match-badge se-cfm-match-spin';
        spin.innerHTML = '<span class="se-an-spin">&#x27F3;</span>';
        el.querySelector('.se-cfm-fdate')?.before(spin);
        const msgs = await _fetchChatContent(name);
        if (gen !== _searchGen) return;
        _contentCache[name] = msgs ?? [];
        spin.remove();
    }
    const matchCount = _contentCache[name].filter(
        m => `${m.name ?? ''} ${m.mes ?? m.content ?? ''}`.toLowerCase().includes(q)
    ).length;
    el.querySelector('.se-cfm-match-badge')?.remove();
    if (nameMatch || matchCount > 0) {
        el.style.display = '';
        if (matchCount > 0) {
            const badge = document.createElement('span');
            badge.className   = 'se-cfm-match-badge';
            badge.textContent = `${matchCount} msg${matchCount === 1 ? '' : 's'}`;
            el.querySelector('.se-cfm-fdate')?.before(badge);
        }
    } else {
        el.style.display = 'none';
    }
}

async function _fetchChatContent(fileName) {
    try {
        const ctx  = SillyTavern.getContext();
        const resp = await fetch('/getchat', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', ...ctx.getRequestHeaders() },
            body:    JSON.stringify({
                ch_name:    _currentChar?.name   ?? '',
                file_name:  fileName.replace(/\.jsonl$/, ''),
                avatar_url: _currentChar?.avatar ?? '',
            }),
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        return Array.isArray(data) ? data : (data?.chat ?? []);
    } catch { return null; }
}

// ─── Panel-level events ──────────────────────────────────────

function _bindPanelEvents() {
    _panel.querySelector('.se-cfm-close')?.addEventListener('click', closeChatFilesManager);

    const searchInp  = _panel.querySelector('#se-cfm-search');
    const searchClear = _panel.querySelector('#se-cfm-search-clear');

    const _syncClearBtn = () => {
        if (searchClear) searchClear.hidden = !searchInp?.value;
    };

    searchInp?.addEventListener('input', function () {
        _syncClearBtn();
        const q = this.value.toLowerCase().trim();

        // Instant: filename filter + clear stale badges
        const items = [..._panel.querySelectorAll('.se-cfm-file-item')];
        items.forEach(el => {
            el.querySelector('.se-cfm-match-badge')?.remove();
            el.style.display = !q || el.dataset.cfmFile.toLowerCase().includes(q) ? '' : 'none';
        });

        // Update editor search state immediately
        if (q.length >= 2) applyFileSearch(q);
        else clearFileSearch();

        // Async content search (debounced)
        clearTimeout(_searchTimer);
        ++_searchGen;
        if (q.length >= 2) {
            const gen = _searchGen;
            _searchTimer = setTimeout(() => _runContentSearch(q, gen), 300);
        }
    });

    searchInp?.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            searchInp.value = '';
            searchInp.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });

    searchClear?.addEventListener('click', () => {
        if (searchInp) { searchInp.value = ''; searchInp.dispatchEvent(new Event('input', { bubbles: true })); }
    });

    _panel.querySelector('#se-cfm-btn-popout')?.addEventListener('click', () => {
        _popped = !_popped;
        _panel.classList.toggle('se-cfm-popped', _popped);
        _panel.classList.remove('se-cfm-fullscreen');
        if (_popped) _attachDrag();
        else _detachDrag();
    });

    _panel.querySelector('#se-cfm-btn-fullscreen')?.addEventListener('click', function () {
        const isFull = _panel.classList.toggle('se-cfm-fullscreen');
        if (isFull) {
            _panel.classList.remove('se-cfm-popped');
            _detachDrag();
            _popped = false;
        }
        this.innerHTML = isFull ? '&#x2922;' : '&#x26F6;';
        this.title = isFull ? 'Exit fullscreen' : 'Fullscreen';
    });

    const folder = _currentChar?.avatar.replace(/\.[^.]+$/, '') ?? '';
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
    _panel.querySelectorAll('.se-cfm-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            _panel.querySelectorAll('.se-cfm-tab').forEach((t) => t.classList.toggle('active', t === tab));
            _panel.querySelector('#se-cfm-tab-files').style.display = target === 'files' ? '' : 'none';
            _panel.querySelector('#se-cfm-tab-analyse').style.display = target === 'analyse' ? '' : 'none';

            if (target === 'analyse') {
                if (_analyserReady) {
                    refreshEntries();
                    refreshAnalyserCanvas();
                } else {
                    _analyserReady = true;
                    initAnalyser(_panel, _files, _currentChar);
                }
            }
        });
    });
}
