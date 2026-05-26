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
const _fmt = { align: 'left', font: 'mono', theme: 'monokai', size: 'sm', spacing: false, wrap: false };

const _THEMES = {
    monokai: {
        bg: '#0e0e0e',
        fg: '#f8f8f2',
        key: '#a6e22e',
        str: '#e6db74',
        num: '#ae81ff',
        bool: '#66d9e8',
        nil: '#f92672',
        op: '#f8f8f2',
    },
    dracula: {
        bg: '#282a36',
        fg: '#f8f8f2',
        key: '#50fa7b',
        str: '#f1fa8c',
        num: '#bd93f9',
        bool: '#8be9fd',
        nil: '#ff79c6',
        op: '#cdd6f4',
    },
    tokyo: {
        bg: '#1a1b2e',
        fg: '#c0caf5',
        key: '#7dcfff',
        str: '#9ece6a',
        num: '#ff9e64',
        bool: '#bb9af7',
        nil: '#f7768e',
        op: '#c0caf5',
    },
};

// ─── Public API ──────────────────────────────────────────────

export function bindEditorControls(panel) {
    _bindFmtGroup(panel, 'align', '[data-align]');
    _bindFmtGroup(panel, 'font', '[data-font]');
    _bindFmtGroup(panel, 'theme', '[data-theme]');
    _bindFmtGroup(panel, 'size', '[data-size]');

    panel.querySelector('#se-cfm-spacing-btn')?.addEventListener('click', function () {
        _fmt.spacing = !_fmt.spacing;
        this.classList.toggle('active', _fmt.spacing);
        _applyFormatting();
    });

    panel.querySelector('#se-cfm-wrap-btn')?.addEventListener('click', function () {
        _fmt.wrap = !_fmt.wrap;
        this.classList.toggle('active', _fmt.wrap);
        _applyFormatting();
    });

    panel
        .querySelectorAll('.se-cfm-seg[data-view]')
        .forEach((btn) => btn.addEventListener('click', () => _renderView(btn.dataset.view)));

    panel.querySelector('#se-cfm-save-btn')?.addEventListener('click', () => {
        clearTimeout(_saveTimer);
        _dirty = true;
        _doSave();
    });

    panel.querySelector('#se-cfm-path-copy')?.addEventListener('click', () => {
        const val = document.getElementById('se-cfm-path-input')?.value;
        if (val) navigator.clipboard.writeText(val).catch(() => {});
    });

    panel.querySelector('#se-cfm-textarea')?.addEventListener('input', () => {
        _updateHighlight();
        _scheduleAutoSave();
    });

    panel.querySelector('#se-cfm-textarea')?.addEventListener('scroll', function () {
        const pre = document.getElementById('se-cfm-highlight-pre');
        if (pre) {
            pre.scrollTop = this.scrollTop;
            pre.scrollLeft = this.scrollLeft;
        }
    });
}

export async function selectFile(fileName, char) {
    _file = fileName;
    _char = char;
    _dirty = false;
    clearTimeout(_saveTimer);

    document
        .querySelectorAll('.se-cfm-file-item')
        .forEach((el) => el.classList.toggle('se-cfm-active', el.dataset.cfmFile === fileName));

    const charFolder = char.avatar.replace(/\.[^.]+$/, '');
    const pathInput = document.getElementById('se-cfm-path-input');
    if (pathInput) pathInput.value = `public/chats/${charFolder}/${fileName}`;

    _setStatus('Loading…');

    const ctx = SillyTavern.getContext();
    try {
        const resp = await fetch('/getchat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...ctx.getRequestHeaders() },
            body: JSON.stringify({
                ch_name: char.name,
                file_name: fileName.replace(/\.jsonl$/, ''),
                avatar_url: char.avatar,
            }),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const raw = await resp.json();
        if (Array.isArray(raw)) _lines = raw;
        else if (Array.isArray(raw?.chat)) _lines = raw.chat;
        else _lines = [];
        const saveBtn = document.getElementById('se-cfm-save-btn');
        if (saveBtn) saveBtn.disabled = false;
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
    document
        .querySelectorAll('.se-cfm-seg[data-view]')
        .forEach((b) => b.classList.toggle('active', b.dataset.view === view));

    const wrap = document.getElementById('se-cfm-textarea-wrap');
    const textarea = document.getElementById('se-cfm-textarea');
    const formView = document.getElementById('se-cfm-form-view');
    const emptyEl = document.getElementById('se-cfm-empty-state');
    const disc = document.getElementById('se-cfm-disclaimer');

    if (!_lines.length) {
        _showEmpty('Empty file');
        return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    const editable = view === 'plain' || view === 'form';
    if (disc) disc.textContent = editable ? '' : 'Read-only — edit in Plain or Form';

    if (view === 'form') {
        if (wrap) wrap.style.display = 'none';
        formView.style.display = '';
        formView.innerHTML = _buildFormView();
        formView.querySelectorAll('.se-cfm-mes-field').forEach((ta) => {
            _fitField(ta);
            ta.addEventListener('input', () => {
                _fitField(ta);
                _scheduleAutoSave();
            });
        });
    } else {
        formView.style.display = 'none';
        if (wrap) wrap.style.display = '';
        let content;
        if (view === 'plain') content = _toPlain();
        else if (view === 'yaml') content = _toYaml();
        else content = _toJsonl();
        textarea.value = content;
        textarea.readOnly = !editable;
        _updateHighlight();
    }
    _applyFormatting();
}

function _buildFormView() {
    return _lines
        .map((line, i) => {
            if (typeof line !== 'object' || !('mes' in line)) return '';
            const isUser = Boolean(line.is_user);
            const roleLabel = escHtml(isUser ? 'User' : line.name || 'AI');
            const roleCls = isUser ? 'se-cfm-role-user' : 'se-cfm-role-ai';
            return (
                `<div class="se-cfm-msg-block">` +
                `<div class="se-cfm-msg-role ${roleCls}">${roleLabel}</div>` +
                `<textarea class="se-cfm-mes-field" data-line="${i}">${escHtml(line.mes ?? '')}</textarea>` +
                '</div>'
            );
        })
        .join('');
}

function _toJsonl() {
    return _lines.map((l) => JSON.stringify(l)).join('\n');
}

function _toPlain() {
    return _lines
        .filter((l) => l && typeof l === 'object' && 'mes' in l)
        .map((l) => `[${l.is_user ? 'User' : l.name || 'AI'}]: ${l.mes ?? ''}`)
        .join('\n\n');
}

function _toYaml() {
    return _lines
        .map((l, i) => {
            if (typeof l !== 'object') return '';
            return (
                `- # message ${i}\n` +
                Object.entries(l)
                    .map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
                    .join('\n')
            );
        })
        .join('\n');
}

function _parsePlain(text) {
    const msgEntries = _lines.map((l, i) => ({ l, i })).filter(({ l }) => l && typeof l === 'object' && 'mes' in l);
    const blocks = text.split(/\n\n+/);
    const updated = [..._lines];
    blocks.forEach((block, bi) => {
        const m = block.match(/^\[[^\]]+\]:\s*([\s\S]*)/);
        if (m && msgEntries[bi]) updated[msgEntries[bi].i] = { ...msgEntries[bi].l, mes: m[1] };
    });
    return updated;
}

// ─── Save ────────────────────────────────────────────────────

function _scheduleAutoSave() {
    if (_view === 'jsonl' || _view === 'yaml') return;
    _dirty = true;
    _setStatus('Autosaving…');
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(_doSave, 2000);
}

async function _doSave() {
    if (!_dirty || !_file) return;
    clearTimeout(_saveTimer);

    let updated;
    if (_view === 'form') {
        updated = [..._lines];
        document.querySelectorAll('.se-cfm-mes-field').forEach((ta) => {
            const i = Number.parseInt(ta.dataset.line, 10);
            if (updated[i]) updated[i] = { ...updated[i], mes: ta.value };
        });
    } else if (_view === 'plain') {
        updated = _parsePlain(/** @type {HTMLTextAreaElement} */ (document.getElementById('se-cfm-textarea')).value);
    } else {
        return;
    }

    const ctx = SillyTavern.getContext();
    try {
        const resp = await fetch('/savechat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...ctx.getRequestHeaders() },
            body: JSON.stringify({ avatar_url: _char.avatar, file_name: _file.replace(/\.jsonl$/, ''), chat: updated }),
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

// ─── Syntax highlighting ─────────────────────────────────────

function _updateHighlight() {
    const pre = document.getElementById('se-cfm-highlight-pre');
    const ta = /** @type {HTMLTextAreaElement} */ (document.getElementById('se-cfm-textarea'));
    if (!pre || !ta) return;
    let html;
    if (_view === 'jsonl') html = _highlightJsonl(ta.value);
    else if (_view === 'yaml') html = _highlightYaml(ta.value);
    else html = _highlightPlain(ta.value);
    pre.innerHTML = html;
}

function _highlightJsonl(text) {
    const t = _THEMES[_fmt.theme] ?? _THEMES.monokai;
    const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const STR = String.raw`"(?:[^"\\]|\\.)*"`;
    const TOK = new RegExp(
        String.raw`${STR}\s*:|${STR}|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\btrue\b|\bfalse\b|\bnull\b`,
        'g'
    );

    return (
        text
            .split('\n')
            .map((line) => {
                let out = '';
                let last = 0;
                for (const m of line.matchAll(TOK)) {
                    if (m.index > last) out += `<span style="color:${t.op}">${esc(line.slice(last, m.index))}</span>`;
                    const tok = m[0];
                    let color;
                    if (tok.startsWith('"')) {
                        color = tok.trimEnd().endsWith(':') ? t.key : t.str;
                    } else if (tok === 'true' || tok === 'false') {
                        color = t.bool;
                    } else if (tok === 'null') {
                        color = t.nil;
                    } else {
                        color = t.num;
                    }
                    out += `<span style="color:${color}">${esc(tok)}</span>`;
                    last = m.index + tok.length;
                }
                if (last < line.length) out += `<span style="color:${t.op}">${esc(line.slice(last))}</span>`;
                return out || esc(line);
            })
            .join('\n') + '\n'
    );
}

function _highlightYaml(text) {
    const t = _THEMES[_fmt.theme] ?? _THEMES.monokai;
    const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    return (
        text
            .split('\n')
            .map((line) => {
                const m = line.match(/^(\s*)([\w-]+)(:)(.*)/);
                if (!m) return `<span style="color:${t.op}">${esc(line)}</span>`;
                return (
                    `<span style="color:${t.op}">${esc(m[1])}</span>` +
                    `<span style="color:${t.key}">${esc(m[2])}</span>` +
                    `<span style="color:${t.op}">${esc(m[3])}</span>` +
                    `<span style="color:${t.str}">${esc(m[4])}</span>`
                );
            })
            .join('\n') + '\n'
    );
}

function _highlightPlain(text) {
    const t = _THEMES[_fmt.theme] ?? _THEMES.monokai;
    const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    return (
        text
            .split('\n')
            .map((line) => {
                const m = line.match(/^(\[[^\]]+\])(:\s*)([\s\S]*)/);
                if (!m) return `<span style="color:${t.fg}">${esc(line)}</span>`;
                return (
                    `<span style="color:${t.key}">${esc(m[1])}</span>` +
                    `<span style="color:${t.op}">${esc(m[2])}</span>` +
                    `<span style="color:${t.fg}">${esc(m[3])}</span>`
                );
            })
            .join('\n') + '\n'
    );
}

// ─── Formatting ──────────────────────────────────────────────

function _applyFormatting() {
    const wrap = document.getElementById('se-cfm-textarea-wrap');
    const textarea = document.getElementById('se-cfm-textarea');
    const pre = document.getElementById('se-cfm-highlight-pre');
    const formView = document.getElementById('se-cfm-form-view');
    const fonts = { mono: 'monospace', sans: 'sans-serif', serif: 'serif' };
    const sizes = { sm: '12px', md: '14px', lg: '16px' };
    const theme = _THEMES[_fmt.theme] ?? _THEMES.monokai;
    const font = fonts[_fmt.font] ?? fonts.mono;
    const size = sizes[_fmt.size] ?? sizes.sm;
    const lh = _fmt.spacing ? '2' : '1.55';
    const ws = _fmt.wrap ? 'pre-wrap' : 'pre';

    if (wrap) {
        wrap.style.background = theme.bg;
        wrap.style.setProperty('--se-cfm-font', font);
        wrap.style.setProperty('--se-cfm-size', size);
        wrap.style.setProperty('--se-cfm-lh', lh);
        wrap.style.setProperty('--se-cfm-caret', theme.fg);
    }

    if (pre) {
        pre.style.color = theme.fg;
        pre.style.textAlign = _fmt.align;
        pre.style.whiteSpace = ws;
    }

    if (textarea) {
        textarea.style.textAlign = _fmt.align;
        textarea.style.whiteSpace = ws;
        textarea.style.overflowX = _fmt.wrap ? 'hidden' : 'auto';
        textarea.style.overflowY = 'auto';
    }

    if (formView) {
        formView.style.background = theme.bg;
        formView.style.color = theme.fg;
        formView.style.fontFamily = font;
        formView.style.fontSize = size;
        formView.style.lineHeight = lh;
    }
}

function _bindFmtGroup(panel, key, sel) {
    panel.querySelectorAll(sel).forEach((btn) => {
        btn.addEventListener('click', () => {
            _fmt[key] = btn.dataset[key];
            panel.querySelectorAll(sel).forEach((b) => b.classList.toggle('active', b === btn));
            _applyFormatting();
            if (key === 'theme' || key === 'size' || key === 'font' || key === 'spacing') _updateHighlight();
        });
    });
}

// ─── Helpers ─────────────────────────────────────────────────

function _fitField(ta) {
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
}

function _showEmpty(msg) {
    const el = document.getElementById('se-cfm-empty-state');
    const wrap = document.getElementById('se-cfm-textarea-wrap');
    const fv = document.getElementById('se-cfm-form-view');
    if (el) {
        el.textContent = msg;
        el.style.display = '';
    }
    if (wrap) wrap.style.display = 'none';
    if (fv) fv.style.display = 'none';
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
        const last = _lines.findLast((l) => l?.send_date);
        modEl.textContent = last?.send_date ? last.send_date : '';
    }
}
