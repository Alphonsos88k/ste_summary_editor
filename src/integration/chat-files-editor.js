/**
 * @module chat-files-editor
 * @description Editor state, view rendering, formatting, and save logic
 * for the Chat Files Manager panel.
 */

import { escHtml } from '../core/utils.js';

let _file = null;
let _char = null;
let _lines = [];
let _view = 'jsonl';
let _dirty = false;
let _saveTimer = null;
let _fmt = { align: 'left', font: 'mono', theme: 'monokai', size: 'sm', spacing: false, wrap: false };

// ─── Public API ──────────────────────────────────────────────

/**
 * Bind format-bar and status-bar controls once after panel is created.
 * @param {HTMLElement} panel
 */
export function bindEditorControls(panel) {
    _bindFmtGroup(panel, 'align', '[data-align]');
    _bindFmtGroup(panel, 'font',  '[data-font]');
    _bindFmtGroup(panel, 'theme', '[data-theme]');
    _bindFmtGroup(panel, 'size',  '[data-size]');

    panel.getElementById?.('se-cfm-spacing-btn') ??
        panel.querySelector('#se-cfm-spacing-btn')
            ?.addEventListener('click', function () {
                _fmt.spacing = !_fmt.spacing;
                this.classList.toggle('active', _fmt.spacing);
                _applyFormatting();
            });

    panel.querySelector('#se-cfm-wrap-btn')?.addEventListener('click', function () {
        _fmt.wrap = !_fmt.wrap;
        this.classList.toggle('active', _fmt.wrap);
        _applyFormatting();
    });

    panel.querySelectorAll('[data-view]').forEach(btn =>
        btn.addEventListener('click', () => _renderView(btn.dataset.view))
    );

    panel.querySelector('#se-cfm-save-btn')?.addEventListener('click', () => {
        clearTimeout(_saveTimer);
        _dirty = true;
        _doSave();
    });

    // Textarea input is stable DOM — bind once
    panel.querySelector('#se-cfm-textarea')?.addEventListener('input', _scheduleAutoSave);
}

export async function selectFile(fileName, char) {
    _file = fileName;
    _char = char;
    _dirty = false;
    clearTimeout(_saveTimer);

    document.querySelectorAll('.se-cfm-file-item').forEach(el =>
        el.classList.toggle('se-cfm-active', el.dataset.cfmFile === fileName)
    );

    const charFolder = char.avatar.replace(/\.[^.]+$/, '');
    const pathInput = document.getElementById('se-cfm-path-input');
    if (pathInput) pathInput.value = `public/chats/${charFolder}/${fileName}`;

    _setStatus('Loading…');

    const ctx = SillyTavern.getContext();
    try {
        const resp = await fetch('/getchat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...ctx.getRequestHeaders() },
            body: JSON.stringify({ ch_name: char.name, file_name: fileName, avatar_url: char.avatar }),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const messages = await resp.json();
        _lines = Array.isArray(messages) ? messages : [];
        document.getElementById('se-cfm-save-btn').disabled = false;
        _setStatus('');
        _updateMeta();
        _renderView(_view);
    } catch (err) {
        _showEmpty(`Failed to load: ${escHtml(err.message)}`);
    }
}

// ─── View rendering ──────────────────────────────────────────

function _renderView(view) {
    _view = view;
    document.querySelectorAll('.se-cfm-view-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.view === view)
    );

    const textarea = document.getElementById('se-cfm-textarea');
    const formView = document.getElementById('se-cfm-form-view');
    const emptyEl  = document.getElementById('se-cfm-empty-state');

    if (!_lines.length) { _showEmpty('Empty file'); return; }
    emptyEl.style.display = 'none';

    if (view === 'form') {
        textarea.style.display = 'none';
        formView.style.display = '';
        formView.innerHTML = _buildFormView();
        formView.querySelectorAll('.se-cfm-mes-field').forEach(ta =>
            ta.addEventListener('input', _scheduleAutoSave)
        );
    } else {
        formView.style.display = 'none';
        textarea.style.display = '';
        textarea.value = view === 'plain' ? _toPlain() : view === 'yaml' ? _toYaml() : _toJsonl();
        textarea.readOnly = view !== 'jsonl';
    }
    _applyFormatting();
}

function _buildFormView() {
    return _lines.map((line, i) => {
        if (typeof line !== 'object' || !('mes' in line)) return '';
        const role = escHtml(line.is_user ? 'User' : (line.name || 'AI'));
        return `<div class="se-cfm-msg-block">` +
            `<div class="se-cfm-msg-role">${role}</div>` +
            `<textarea class="se-cfm-mes-field" data-line="${i}">${escHtml(line.mes ?? '')}</textarea>` +
            '</div>';
    }).join('');
}

function _toJsonl() { return _lines.map(l => JSON.stringify(l)).join('\n'); }

function _toPlain() {
    return _lines
        .filter(l => l && typeof l === 'object' && 'mes' in l)
        .map(l => `[${l.is_user ? 'User' : (l.name || 'AI')}]: ${l.mes ?? ''}`)
        .join('\n\n');
}

function _toYaml() {
    return _lines.map((l, i) => {
        if (typeof l !== 'object') return '';
        return `- # message ${i}\n` +
            Object.entries(l).map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`).join('\n');
    }).join('\n');
}

// ─── Save ────────────────────────────────────────────────────

function _scheduleAutoSave() {
    _dirty = true;
    _setStatus('Unsaved…');
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(_doSave, 2000);
}

async function _doSave() {
    if (!_dirty || !_file) return;
    clearTimeout(_saveTimer);

    let updated;
    if (_view === 'form') {
        updated = [..._lines];
        document.querySelectorAll('.se-cfm-mes-field').forEach(ta => {
            const i = parseInt(ta.dataset.line, 10);
            if (updated[i]) updated[i] = { ...updated[i], mes: ta.value };
        });
    } else if (_view === 'jsonl') {
        try {
            updated = document.getElementById('se-cfm-textarea').value
                .split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
        } catch {
            _setStatus('⚠ Invalid JSON — not saved');
            return;
        }
    } else {
        return; // plain / yaml are read-only
    }

    const ctx = SillyTavern.getContext();
    try {
        const resp = await fetch('/savechat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...ctx.getRequestHeaders() },
            body: JSON.stringify({ ch_name: _char.name, chat_name: _file, chat: updated }),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        _lines = updated;
        _dirty = false;
        _updateMeta();

        const active = ctx.characters?.[ctx.characterId];
        if (active?.avatar === _char.avatar) {
            _setStatus('Saved — reload chat to see changes');
        } else {
            _setStatus('Saved');
            setTimeout(() => _setStatus(''), 2000);
        }
    } catch (err) {
        _setStatus(`⚠ Save failed: ${err.message}`);
    }
}

// ─── Formatting ──────────────────────────────────────────────

function _applyFormatting() {
    const textarea = document.getElementById('se-cfm-textarea');
    const formView = document.getElementById('se-cfm-form-view');
    const fonts  = { mono: 'monospace', sans: 'sans-serif', serif: 'serif' };
    const sizes  = { sm: '12px', md: '14px', lg: '16px' };
    const themes = {
        monokai:  { bg: '#272822', fg: '#f8f8f2' },
        light:    { bg: '#fafafa', fg: '#2d2d2d' },
        contrast: { bg: '#000',    fg: '#fff' },
    };
    const { bg, fg } = themes[_fmt.theme] ?? themes.monokai;

    [textarea, formView].filter(Boolean).forEach(el => {
        el.style.fontFamily = fonts[_fmt.font] ?? fonts.mono;
        el.style.fontSize   = sizes[_fmt.size] ?? sizes.sm;
        el.style.lineHeight = _fmt.spacing ? '2' : '1.5';
        el.style.background = bg;
        el.style.color      = fg;
    });

    if (textarea) {
        textarea.style.textAlign  = _fmt.align;
        textarea.style.whiteSpace = _fmt.wrap ? 'pre-wrap' : 'pre';
    }
}

function _bindFmtGroup(panel, key, sel) {
    panel.querySelectorAll(sel).forEach(btn => {
        btn.addEventListener('click', () => {
            _fmt[key] = btn.dataset[key];
            panel.querySelectorAll(sel).forEach(b => b.classList.toggle('active', b === btn));
            _applyFormatting();
        });
    });
}

// ─── Helpers ────────────────────────────────────────────────

function _showEmpty(msg) {
    const el = document.getElementById('se-cfm-empty-state');
    if (el) { el.textContent = msg; el.style.display = ''; }
    const textarea = document.getElementById('se-cfm-textarea');
    const formView = document.getElementById('se-cfm-form-view');
    if (textarea) textarea.style.display = 'none';
    if (formView) formView.style.display = 'none';
}

function _setStatus(msg) {
    const el = document.getElementById('se-cfm-autosave-status');
    if (el) el.textContent = msg;
}

function _updateMeta() {
    const totalChars = _lines.reduce((sum, l) => sum + (l?.mes?.length ?? 0), 0);
    const tokEl = document.getElementById('se-cfm-tokens');
    if (tokEl) tokEl.textContent = `~${Math.round(totalChars / 4).toLocaleString()} tokens`;

    const modEl = document.getElementById('se-cfm-modified-date');
    if (modEl) {
        const last = _lines.findLast(l => l?.send_date);
        modEl.textContent = last?.send_date ? `Modified: ${last.send_date}` : '';
    }
}
