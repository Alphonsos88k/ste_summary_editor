/**
 * @module chat-files-manager
 * @description Floating panel for browsing and editing SillyTavern chat JSONL
 * files for the currently associated character.
 */

import { spawnPanel, escHtml } from '../core/utils.js';
import { loadTemplate } from '../core/template-loader.js';
import { TEMPLATES } from '../core/constants.js';
import { bindEditorControls, selectFile } from './chat-files-editor.js';
import { initAnalyser, destroyAnalyser, refreshEntries } from './chat-files-analyser.js';

let _panel         = null;
let _currentChar   = null;
let _files         = [];
let _analyserReady = false;

// ─── Public API ──────────────────────────────────────────────

export async function openChatFilesManager(char) {
    document.getElementById('se-cfm-panel')?.remove();
    _currentChar = char;

    const html = await loadTemplate(TEMPLATES.CHAT_FILES_MANAGER);
    _panel = document.createElement('div');
    _panel.id = 'se-cfm-panel';
    _panel.className = 'se-float-panel se-cfm-panel';
    _panel.innerHTML = html;

    const overlay = document.getElementById('se-modal-overlay');
    overlay.appendChild(_panel);
    spawnPanel(_panel, overlay, '.se-cfm-header');

    _panel.querySelector('#se-cfm-char-name').textContent = char.name;

    _bindPanelEvents();
    bindEditorControls(_panel);
    await _loadFileList();
}

export function closeChatFilesManager() {
    destroyAnalyser();
    document.getElementById('se-cfm-panel')?.remove();
    _panel         = null;
    _files         = [];
    _analyserReady = false;
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

    const sorted   = chats.toSorted((a, b) => (b.last_mes ?? 0) - (a.last_mes ?? 0));
    const roots    = sorted.filter(c => !c.parent_chat_id);
    const branches = sorted.filter(c => c.parent_chat_id);

    listEl.innerHTML = roots.map(chat => {
        const subs = branches.filter(b => b.parent_chat_id === chat.file_name);
        return _fileItemHtml(chat, false) + subs.map(b => _fileItemHtml(b, true)).join('');
    }).join('');

    listEl.querySelectorAll('[data-cfm-file]').forEach(el =>
        el.addEventListener('click', () => selectFile(el.dataset.cfmFile, _currentChar))
    );
}

function _fileItemHtml(chat, isBranch) {
    const name   = chat.file_name ?? '';
    const label  = name.replace(/\.jsonl$/, '').slice(-36);
    const date   = chat.last_mes ? _relDate(chat.last_mes) : '';
    const cls    = isBranch ? ' se-cfm-branch' : '';
    const prefix = isBranch ? '&#8627; ' : '';
    return `<div class="se-cfm-file-item${cls}" data-cfm-file="${escHtml(name)}">` +
        `<span class="se-cfm-fname">${prefix}${escHtml(label)}</span>` +
        `<span class="se-cfm-fdate">${date}</span>` +
        '</div>';
}

function _relDate(ts) {
    const days = Math.floor((Date.now() - ts * 1000) / 86_400_000);
    if (days === 0) return 'Today';
    if (days === 1) return '1d ago';
    return `${days}d ago`;
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

    _panel.querySelector('#se-cfm-path-copy')?.addEventListener('click', () => {
        const val = _panel.querySelector('#se-cfm-path-input')?.value;
        if (val) navigator.clipboard.writeText(val).catch(() => {});
    });

    const folder     = _currentChar?.avatar.replace(/\.[^.]+$/, '') ?? '';
    const folderPath = `public/chats/${folder}/`;
    const folderInput = _panel.querySelector('#se-cfm-folder-input');
    if (folderInput) folderInput.value = folderPath;

    _panel.querySelector('#se-cfm-folder-btn')?.addEventListener('click', () => {
        navigator.clipboard.writeText(folderPath).catch(() => {});
        const toast = _panel.querySelector('#se-cfm-folder-toast');
        if (!toast) return;
        toast.textContent = 'Folder path copied!';
        toast.classList.add('se-cfm-folder-toast-visible');
        clearTimeout(toast._hideTimer);
        toast._hideTimer = setTimeout(() => toast.classList.remove('se-cfm-folder-toast-visible'), 2000);
    });

    // Tab switching — Files / Analyse
    _panel.querySelectorAll('.se-cfm-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            _panel.querySelectorAll('.se-cfm-tab').forEach(t => t.classList.toggle('active', t === tab));
            _panel.querySelector('#se-cfm-tab-files').style.display   = target === 'files'   ? '' : 'none';
            _panel.querySelector('#se-cfm-tab-analyse').style.display = target === 'analyse' ? '' : 'none';

            if (target === 'analyse') {
                if (_analyserReady) {
                    refreshEntries();
                } else {
                    _analyserReady = true;
                    initAnalyser(_panel, _files);
                }
            }
        });
    });
}
