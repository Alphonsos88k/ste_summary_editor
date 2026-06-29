/**
 * @module codex
 * Character Codex — multi-section character profile panel.
 * Left page: always fixed (voxel canvas Stage 2 / avatar Stage 1 + config fields).
 * Right page: TOC (page 0) then one section per page; paginator footer navigates.
 */

import { escHtml } from '../core/utils.js';
import { loadTemplate } from '../core/template-loader.js';
import { TEMPLATES } from '../core/constants.js';
import { registerPrompt, getPrompt } from '../core/system-prompts.js';
import { state } from '../core/state.js';
import { buildZipBlob, downloadFile } from '../export/export.js';
import { initVoxel, disposeVoxel, setVoxelSpec, setView, toggleSpin, defaultSpec } from './codex-voxel.js';

// ─── Prompt registration ──────────────────────────────────────────────────

registerPrompt('codex-main', 'Character Codex — Generation', '', {
    warnJson: true,
    location: 'Edit › Character Codex',
});

registerPrompt('codex-section-prompt', 'Character Codex — Section Regen Prompt', '', {
    warnJson: true,
    location: 'Edit › Character Codex (per-section regeneration)',
});

registerPrompt('codex-voxel-spec', 'Character Codex — Voxel Spec Generator', '', {
    warnJson: true,
    location: 'Edit › Character Codex (voxel render)',
});

registerPrompt('codex-voxel-quick', 'Character Codex — Voxel Quick Description', '', {
    location: 'Edit › Character Codex (quick voxel description from biography)',
});

// ─── Section definitions ─────────────────────────────────────────────────

/** @type {Array<{key:string, label:string, nsfw:boolean}>} */
const SECTION_DEFS = [
    { key: 'intro',             label: 'Introduction & Highlights',  nsfw: false },
    { key: 'personality',       label: 'Personality',                nsfw: false },
    { key: 'appearance',        label: 'Appearance & Quirks',        nsfw: false },
    { key: 'relationship_user', label: 'Relationship with User',     nsfw: false },
    { key: 'nsfw_traits',       label: 'NSFW Traits & Tendencies',   nsfw: true  },
    { key: 'nsfw_relationship', label: 'Intimate Dynamic with User', nsfw: true  },
    { key: 'world_context',     label: 'Their World',                nsfw: false },
];

const SECTION_KEYS = SECTION_DEFS.map(s => s.key);

// ─── Module state ─────────────────────────────────────────────────────────

let _panel          = null;
let _char           = null;
let _generating     = false;
let _pageIdx        = 0;      // 0 = TOC, 1-N = section pages
let _dossier        = {};
let _dossierPrompts = {};
let _dossierEdited  = {};     // key → timestamp of last edit/gen
let _customSections = [];
let _nsfwRevealed   = new Set();
let _voxelSpec  = null;
let _voxelTier  = 'minimum';

// ─── Public API ──────────────────────────────────────────────────────────

export async function openCodex() {
    closeCodex();
    const html = await loadTemplate(TEMPLATES.CODEX_PANEL);
    _panel = document.createElement('div');
    _panel.id        = 'se-cx-panel';
    _panel.className = 'se-cx-panel';
    _panel.innerHTML = html;
    document.querySelector('#se-panel-arcs .se-acts-content').appendChild(_panel);
    _detectChar();
    _bindPanel();
    _pageIdx = 0;
    _renderPage();
    _updatePaginator();
    requestAnimationFrame(() => _panel?.classList.add('open'));
    _initVoxel();
}

export function closeCodex() {
    disposeVoxel();
    _panel?.remove();
    _panel          = null;
    _char           = null;
    _generating     = false;
    _pageIdx        = 0;
    _dossier        = {};
    _dossierPrompts = {};
    _dossierEdited  = {};
    _customSections = [];
    _nsfwRevealed   = new Set();
    _voxelSpec      = null;
}

// ─── Page model ──────────────────────────────────────────────────────────

function _pages() {
    return [
        { type: 'toc' },
        ...SECTION_DEFS.map(s => ({ type: 'section', ...s })),
        ..._customSections.map(s => ({ type: 'section', key: s.key, label: s.label, nsfw: false })),
    ];
}

function _currentKey() {
    const p = _pages()[_pageIdx];
    return (p?.type === 'section') ? p.key : null;
}

function _goToPage(idx) {
    const pages = _pages();
    if (idx < 0 || idx >= pages.length) return;
    _pageIdx = idx;
    _renderPage();
    _updatePaginator();
}

// ─── Character detection ─────────────────────────────────────────────────

function _detectChar() {
    if (!_panel) return;
    const ctx    = SillyTavern.getContext();
    const charId = ctx.characterId;
    const chars  = ctx.characters ?? [];
    if (charId !== undefined && chars[charId]) {
        _char = chars[charId];
        _setCharDisplay(_char);
        const pill = _panel.querySelector('#se-cx-char-pill');
        if (pill) pill.textContent = _char.name;
    } else {
        _char = null;
        _showCharDropdown(chars);
    }
    _updateTokenEstimate();
}

function _setCharDisplay(char) {
    if (!_panel || !char) return;
    const avatarEl = _panel.querySelector('#se-cx-avatar');
    if (avatarEl && char.avatar) avatarEl.src = `/characters/${char.avatar}`;
}

function _charOption(c, i) {
    const label = c.name || `Character ${i}`;
    return `<option value="${i}">${escHtml(label)}</option>`;
}

function _showCharDropdown(chars) {
    if (!_panel) return;
    const pill   = _panel.querySelector('#se-cx-char-pill');
    const select = _panel.querySelector('#se-cx-char-select');
    if (!pill || !select) return;
    pill.style.display   = 'none';
    select.style.display = '';
    select.innerHTML     = '<option value="">— Select character —</option>' +
        chars.map((c, i) => _charOption(c, i)).join('');
    select.addEventListener('change', () => {
        const idx = Number(select.value);
        if (!Number.isNaN(idx) && chars[idx]) {
            _char = chars[idx];
            _setCharDisplay(_char);
        }
        _updateTokenEstimate();
    });
}

// ─── Token estimate ───────────────────────────────────────────────────────

function _countSourceChars(inclSupp, inclEntries) {
    let count = 0;
    if (_char?.description) count += _char.description.length;
    if (_char?.personality)  count += _char.personality.length;
    if (inclSupp) {
        for (const f of state.supplementaryFiles?.values() ?? []) {
            count += (f.editedContent || f.content || '').length;
        }
    }
    if (inclEntries) {
        for (const e of state.entries?.values() ?? []) count += (e.content || '').length;
    }
    return count;
}

function _updateTokenEstimate() {
    const el = _panel?.querySelector('#se-cx-token-est');
    if (!el) return;
    const inclSupp    = _panel.querySelector('#se-cx-chk-supp')?.checked ?? false;
    const inclEntries = _panel.querySelector('#se-cx-chk-entries')?.checked ?? false;
    if (!inclSupp && !inclEntries) {
        el.textContent = 'Select sources above to estimate tokens';
        el.className   = 'se-cx-token-est';
        _updateGenBtn();
        return;
    }
    const tok = Math.round(_countSourceChars(inclSupp, inclEntries) / 3.8);
    const fmt = tok >= 1000 ? `~${(tok / 1000).toFixed(1)}k` : `~${tok}`;
    el.textContent = `${fmt} tokens estimated — may incur API cost`;
    el.className   = 'se-cx-token-est';
    if (tok > 20000)     el.classList.add('se-cx-tok-pink');
    else if (tok > 8000) el.classList.add('se-cx-tok-orange');
    _updateGenBtn();
}

function _updateGenBtn() {
    const btn = _panel?.querySelector('#se-cx-gen-btn');
    if (!btn) return;
    const inclSupp    = _panel.querySelector('#se-cx-chk-supp')?.checked ?? false;
    const inclEntries = _panel.querySelector('#se-cx-chk-entries')?.checked ?? false;
    btn.disabled = _generating || (!inclSupp && !inclEntries);
}

// ─── Context building ─────────────────────────────────────────────────────

function _buildCharParts(charName) {
    if (!_char) return [];
    const parts = [`CHARACTER CARD: ${charName}`];
    if (_char.description) parts.push(_char.description);
    if (_char.personality) parts.push(`Personality: ${_char.personality}`);
    if (_char.scenario)    parts.push(`Scenario: ${_char.scenario}`);
    if (_char.first_mes)   parts.push(`First message: ${_char.first_mes}`);
    return parts;
}

function _buildSuppParts() {
    const parts = ['\n--- SUPPLEMENTARY FILES ---'];
    for (const [, f] of state.supplementaryFiles ?? []) {
        parts.push(`[${f.name} — ${f.category}]\n${f.editedContent || f.content || ''}`);
    }
    return parts;
}

function _buildEntryParts() {
    const parts  = ['\n--- STORY SUMMARIES ---'];
    const sorted = [...(state.entries?.values() ?? [])].toSorted((a, b) => a.num - b.num);
    for (const e of sorted) parts.push(`Entry ${e.num}: ${e.content || ''}`);
    return parts;
}

function _buildContext() {
    const override    = _panel?.querySelector('#se-cx-override')?.value.trim() ?? '';
    const inclSupp    = _panel?.querySelector('#se-cx-chk-supp')?.checked ?? false;
    const inclEntries = _panel?.querySelector('#se-cx-chk-entries')?.checked ?? false;
    const charName    = override || _char?.name || 'the character';
    const parts       = _buildCharParts(charName);
    if (inclSupp && state.supplementaryFiles?.size)  parts.push(..._buildSuppParts());
    if (inclEntries && state.entries?.size)           parts.push(..._buildEntryParts());
    if (state.storyContext) parts.push(`\n--- STORY CONTEXT ---\n${state.storyContext}`);
    return { charName, context: parts.join('\n\n') };
}

// ─── API helpers ──────────────────────────────────────────────────────────

function _buildMessages(systemPrompt, userContent) {
    return [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userContent  },
    ];
}

async function _callApi(messages, maxTokens = 2000) {
    const ctx  = SillyTavern.getContext();
    const resp = await fetch('/api/backends/chat-completions/generate', {
        method:  'POST',
        headers: ctx.getRequestHeaders(),
        body:    JSON.stringify({
            type:                   'quiet',
            chat_completion_source: ctx.chatCompletionSettings.chat_completion_source,
            model:                  ctx.getChatCompletionModel(),
            messages,
            max_tokens:             maxTokens,
            temperature:            0.7,
            stream:                 false,
        }),
    });
    if (!resp.ok) throw new Error(`API error ${resp.status}`);
    const data = await resp.json();
    return data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '';
}

function _parseJson(raw) {
    const cleaned = raw.replace(/^```\w*\n?/, '').replace(/\n?```$/, '').trim();
    return JSON.parse(cleaned);
}

// ─── Generation ───────────────────────────────────────────────────────────

async function _generate() {
    if (_generating || !_panel) return;
    const inclEntries = _panel.querySelector('#se-cx-chk-entries')?.checked ?? false;
    if (inclEntries && !globalThis.confirm(
        'Including summary entries will send your full story history and may use significantly more tokens. Continue?'
    )) return;

    _generating     = true;
    _dossier        = {};
    _dossierPrompts = {};
    _customSections = [];
    _nsfwRevealed   = new Set();
    _updateGenBtn();
    _setProgress(true, 'Generating codex…', 0);

    const { charName, context } = _buildContext();
    try {
        const parsed = _parseJson(await _callApi(_buildMessages(getPrompt('codex-main'), context), 4000));
        const now = Date.now();
        for (const key of SECTION_KEYS) {
            if (parsed[key]) { _dossier[key] = parsed[key]; _dossierEdited[key] = now; }
        }
        _showPostGenLayout(charName);
    } catch (err) {
        _setProgress(false, '', 0);
        globalThis.alert(`Generation failed: ${err.message}`);
    } finally {
        _generating = false;
        _updateGenBtn();
    }
}

// ─── Layout helpers ───────────────────────────────────────────────────────

function _setProgress(visible, text, pct) {
    const overlay = _panel?.querySelector('#se-cx-progress-overlay');
    const fill    = _panel?.querySelector('#se-cx-progress-fill');
    const txt     = _panel?.querySelector('#se-cx-progress-txt');
    if (!overlay) return;
    overlay.style.display = visible ? '' : 'none';
    if (fill) fill.style.width = `${pct}%`;
    if (txt)  txt.textContent  = text;
}

function _showPostGenLayout(charName) {
    if (!_panel) return;
    _setProgress(false, '', 0);
    const pill = _panel.querySelector('#se-cx-char-pill');
    if (pill && charName) pill.textContent = charName;
    _pageIdx = 1;
    _renderPage();
    _updatePaginator();
}

// ─── Paginator ────────────────────────────────────────────────────────────

function _updatePaginator() {
    const pages  = _pages();
    const total  = pages.length;
    const dotsEl = _panel?.querySelector('#se-cx-pager-dots');
    const prev   = _panel?.querySelector('#se-cx-prev');
    const next   = _panel?.querySelector('#se-cx-next');

    if (prev) prev.disabled = _pageIdx === 0;
    if (next) next.disabled = _pageIdx === total - 1;

    if (!dotsEl) return;

    if (total <= 10) {
        dotsEl.className = 'se-cx-pager-dots';
        dotsEl.innerHTML = pages.map((p, i) => {
            const hasCnt = (p.type === 'section' && _dossier[p.key]) ? ' has-content' : '';
            return `<span class="se-cx-pdot${i === _pageIdx ? ' active' : ''}${hasCnt}" data-pdot="${i}"></span>`;
        }).join('');
        dotsEl.querySelectorAll('[data-pdot]').forEach(dot => {
            dot.addEventListener('click', () => _goToPage(Number(dot.dataset.pdot)));
        });
    } else {
        dotsEl.className = 'se-cx-pager-dots';
        dotsEl.innerHTML = `<span class="se-cx-pager-count">${_pageIdx + 1}&thinsp;/&thinsp;${total}</span>`;
    }
}

// ─── Page rendering ───────────────────────────────────────────────────────

function _renderPage() {
    const container = _panel?.querySelector('#se-cx-right-content');
    if (!container) return;
    const page = _pages()[_pageIdx];
    if (!page) return;

    if (page.type === 'toc') {
        container.innerHTML = _tocPageHtml();
    } else {
        container.innerHTML = _sectionPageHtml(page);
    }
    _bindPageEvents(container, page);
}

// ─── TOC page HTML ────────────────────────────────────────────────────────

function _tocDotClass(p) {
    if (!_dossier[p.key]) return '';
    return p.nsfw ? ' nsfw-filled' : ' filled';
}

function _tocRow(p, pageIdx) {
    const dotCls   = _tocDotClass(p);
    const edited   = _editedLabel(p.key);
    const editedHtml = edited ? `<span class="se-cx-toc-edited">${escHtml(edited)}</span>` : '';
    return `<div class="se-cx-toc-row" data-goto="${pageIdx}">` +
        `<span class="se-cx-toc-dot${dotCls}"></span>` +
        `<span class="se-cx-toc-label">${escHtml(p.label)}</span>` +
        editedHtml +
        `<span class="se-cx-toc-chevron">&#8250;</span>` +
        `</div>`;
}

function _tocPageHtml() {
    const pages    = _pages();
    const hasAny   = Object.keys(_dossier).length > 0;
    const rows     = pages.map((p, i) => (p.type === 'section' ? _tocRow(p, i) : '')).join('');
    return `<div class="se-cx-toc-page">` +
        `<div class="se-cx-toc-heading">Contents</div>` +
        `<div class="se-cx-toc-list">${rows}</div>` +
        `<div class="se-cx-toc-actions">` +
            `<button class="se-cx-add-btn" id="se-cx-add-section">+ Add</button>` +
            `<button class="se-cx-suggest-btn" id="se-cx-ai-suggest">&#x1F4AC; Suggest</button>` +
            `<button class="se-cx-export-btn" id="se-cx-export" ${hasAny ? '' : 'disabled'}>&#x2B07; Export ZIP</button>` +
        `</div>` +
        `</div>`;
}

// ─── Section page HTML ────────────────────────────────────────────────────

function _nsfwToggleHtml(nsfw, revealed) {
    if (!nsfw || revealed) return '';
    return `<button class="se-cx-nsfw-toggle">&#x1F441; Show</button>`;
}

function _sectionPageHtml(p) {
    const { key, label, nsfw } = p;
    const content  = _dossier[key] ?? '';
    const revealed = _nsfwRevealed.has(key);
    const blurCls  = (nsfw && !revealed) ? ' blurred' : '';
    const hasAny   = Object.keys(_dossier).length > 0;
    return `<div class="se-cx-section-page">` +
        `<div class="se-cx-section-hdr">` +
            `<button class="se-cx-back-toc" title="Back to Contents">&#8592;</button>` +
            `<span class="se-cx-section-title">${escHtml(label)}</span>` +
            (nsfw ? `<span class="se-cx-nsfw-badge">NSFW</span>` : '') +
            `<button class="se-cx-edit-btn" title="Toggle edit">&#x270E;</button>` +
            `<button class="se-cx-regen-hdr-btn" title="Regenerate">&#x21BB;</button>` +
        `</div>` +
        `<div class="se-cx-nsfw-wrap${blurCls}">` +
            _nsfwToggleHtml(nsfw, revealed) +
            `<textarea class="se-cx-section-ta" readonly>${escHtml(content)}</textarea>` +
        `</div>` +
        `<div class="se-cx-feedback-row">` +
            `<input class="se-cx-feedback-inp" type="text" placeholder="Feedback for regen&hellip;" />` +
            `<button class="se-cx-regen-btn">&#x21BB; Regen</button>` +
        `</div>` +
        `<details class="se-cx-prompt-details">` +
            `<summary>System Prompt</summary>` +
            `<textarea class="se-cx-prompt-ta">${escHtml(_dossierPrompts[key] ?? '')}</textarea>` +
        `</details>` +
        `<div class="se-cx-section-actions">` +
            `<button class="se-cx-add-btn" id="se-cx-add-section">+ Add</button>` +
            `<button class="se-cx-suggest-btn" id="se-cx-ai-suggest">&#x1F4AC; Suggest</button>` +
            `<button class="se-cx-export-btn" id="se-cx-export" ${hasAny ? '' : 'disabled'}>&#x2B07; Export ZIP</button>` +
        `</div>` +
        `</div>`;
}

// ─── Dynamic event binding ────────────────────────────────────────────────

function _bindTocEvents(container) {
    container.querySelectorAll('[data-goto]').forEach(row => {
        row.addEventListener('click', () => _goToPage(Number(row.dataset.goto)));
    });
}

function _bindSectionEditEvents(container, key) {
    container.querySelector('.se-cx-back-toc')?.addEventListener('click', () => _goToPage(0));

    const ta = container.querySelector('.se-cx-section-ta');
    if (ta) {
        ta.addEventListener('input', () => {
            if (!ta.readOnly) {
                _dossier[key] = ta.value;
                _dossierEdited[key] = Date.now();
                _updatePaginator();
            }
        });
    }
    container.querySelector('.se-cx-edit-btn')?.addEventListener('click', () => {
        if (!ta) return;
        ta.readOnly = !ta.readOnly;
        if (!ta.readOnly) ta.focus();
    });
}

function _bindNsfwToggle(container, key) {
    container.querySelector('.se-cx-nsfw-toggle')?.addEventListener('click', () => {
        _nsfwRevealed.add(key);
        const wrap = container.querySelector('.se-cx-nsfw-wrap');
        if (wrap) wrap.classList.remove('blurred');
        container.querySelector('.se-cx-nsfw-toggle')?.remove();
    });
}

function _bindPageEvents(container, page) {
    container.querySelector('#se-cx-add-section')?.addEventListener('click', _openAddForm);
    container.querySelector('#se-cx-ai-suggest')?.addEventListener('click',  _aiSuggestSections);
    container.querySelector('#se-cx-export')?.addEventListener('click', _exportZip);

    if (page.type === 'toc') {
        _bindTocEvents(container);
        return;
    }

    const { key, nsfw } = page;
    _bindSectionEditEvents(container, key);
    container.querySelector('.se-cx-regen-hdr-btn')?.addEventListener('click', () => _regenSection(key));
    container.querySelector('.se-cx-regen-btn')?.addEventListener('click',     () => _regenSection(key));
    if (nsfw) _bindNsfwToggle(container, key);
}

// ─── Per-section regeneration ─────────────────────────────────────────────

function _contentEl(sel) {
    return _panel?.querySelector(`#se-cx-right-content ${sel}`);
}

async function _fetchInstruction(key, feedback, context) {
    const promptTa = _contentEl('.se-cx-prompt-ta');
    const existing = (_dossierPrompts[key] ?? '').trim();
    if (existing) return promptTa?.value.trim() || existing;

    const def    = _pages().find(p => p.key === key);
    const label  = def?.label ?? key;
    const meta   = getPrompt('codex-section-prompt');
    const user   = `Section: ${label}\nFeedback: ${feedback || '(none)'}\n\nCharacter context:\n${context}`;
    const raw    = await _callApi(_buildMessages(meta, user), 400);
    let instruction;
    try { instruction = _parseJson(raw).instruction ?? raw; } catch { instruction = raw; }
    _dossierPrompts[key] = instruction;
    if (promptTa) promptTa.value = instruction;
    return instruction;
}

function _setRegenBtnsDisabled(disabled) {
    _contentEl('.se-cx-regen-btn')?.toggleAttribute('disabled', disabled);
    _contentEl('.se-cx-regen-hdr-btn')?.toggleAttribute('disabled', disabled);
}

async function _regenSection(key) {
    if (_generating || !key || !_panel) return;
    const feedbackEl  = _contentEl('.se-cx-feedback-inp');
    const feedback    = feedbackEl?.value.trim() ?? '';
    const { context } = _buildContext();

    _generating = true;
    _setRegenBtnsDisabled(true);

    try {
        const instruction = await _fetchInstruction(key, feedback, context);
        const user        = `${instruction}\n\nFeedback: ${feedback || '(none)'}\n\nCharacter context:\n${context}`;
        const raw         = await _callApi(_buildMessages(getPrompt('codex-main'), user), 800);
        let content = raw;
        try { const p = _parseJson(raw); content = p[key] ?? p.content ?? raw; } catch { /* raw fallback */ }

        _dossier[key] = content;
        _dossierEdited[key] = Date.now();
        if (_currentKey() === key) {
            const ta = _contentEl('.se-cx-section-ta');
            if (ta) ta.value = content;
            if (feedbackEl) feedbackEl.value = '';
        }
        _updatePaginator();
    } catch (err) {
        if (_currentKey() === key) {
            const ta = _contentEl('.se-cx-section-ta');
            if (ta) ta.value = `[Error: ${err.message}]`;
        }
    } finally {
        _generating = false;
        _setRegenBtnsDisabled(false);
    }
}

// ─── Add section ──────────────────────────────────────────────────────────

function _positionForm(form) {
    const btn = _panel?.querySelector('#se-cx-right-content #se-cx-add-section');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    form.style.bottom = `${window.innerHeight - rect.top + 6}px`;
    form.style.left   = `${Math.min(rect.left, window.innerWidth - 340)}px`;
}

async function _submitAddForm(label, form) {
    if (!label) return;
    form.remove();
    const key = `custom_${Date.now()}`;
    _customSections.push({ key, label });
    _dossier[key] = '';
    _goToPage(_pages().length - 1);
    await _regenSection(key);
}

function _openAddForm() {
    const existing = document.getElementById('se-cx-add-form');
    if (existing) { existing.remove(); return; }
    const form = document.createElement('div');
    form.id        = 'se-cx-add-form';
    form.className = 'se-cx-add-form';
    form.innerHTML =
        `<span class="se-cx-add-form-lbl">New Section Label</span>` +
        `<input class="se-cx-add-form-inp" id="se-cx-add-form-inp" type="text" placeholder="e.g. Combat Style" autocomplete="off" />` +
        `<div class="se-cx-add-form-foot">` +
            `<button class="se-cx-add-form-cancel">Cancel</button>` +
            `<button class="se-cx-add-form-go">Add &amp; Generate</button>` +
        `</div>`;
    _positionForm(form);
    document.body.appendChild(form);
    form.querySelector('.se-cx-add-form-cancel').addEventListener('click', () => form.remove());
    form.querySelector('.se-cx-add-form-go').addEventListener('click', () => {
        _submitAddForm(form.querySelector('#se-cx-add-form-inp').value.trim(), form);
    });
    form.querySelector('#se-cx-add-form-inp').focus();
}

// ─── AI suggest sections ──────────────────────────────────────────────────

async function _aiSuggestSections() {
    if (_generating || !_panel) return;
    const { charName, context } = _buildContext();
    const existing = _pages().filter(p => p.type === 'section').map(p => p.label).join(', ');
    const prompt   = `Character: ${charName}\n\n${context}\n\nSuggest 3–5 additional biography sections not already covered. Existing: ${existing}. Return JSON: {"suggestions":["Section Name",...]}`;
    _generating = true;
    try {
        const data = _parseJson(await _callApi(_buildMessages('', prompt), 300));
        for (const s of (data.suggestions ?? [])) {
            if (!globalThis.confirm(`Add section: "${s}"?`)) continue;
            const key = `custom_${Date.now()}`;
            _customSections.push({ key, label: s });
            _dossier[key] = '';
            _goToPage(_pages().length - 1);
            await _regenSection(key);
            break;
        }
    } catch (err) {
        globalThis.alert(`Suggest failed: ${err.message}`);
    } finally {
        _generating = false;
    }
}

// ─── Export ZIP ───────────────────────────────────────────────────────────

const _MAX_BYTES = 9500;

function _splitContent(content, folder, baseName, idx, encoder) {
    const files = [];
    let part = 1;
    let start = 0;
    while (start < content.length) {
        let end = start + 1;
        let size = 0;
        while (end < content.length && size + encoder.encode(content[end]).length <= _MAX_BYTES) {
            size += encoder.encode(content[end]).length;
            end++;
        }
        const pb = content.lastIndexOf('\n\n', end);
        if (pb > start) { end = pb; }
        files.push({
            name: `${folder}/${String(idx).padStart(2, '0')}_${baseName}_part${part}.txt`,
            content: content.slice(start, end),
        });
        part++;
        start = end === start ? start + 1 : end;
    }
    return files;
}

function _exportZip() {
    const charName = (_char?.name ?? 'Character').replaceAll(' ', '_').replace(/[^a-zA-Z0-9_-]/g, '');
    const folder   = `${charName}_Codex_${new Date().toISOString().slice(0, 10)}`;
    const encoder  = new TextEncoder();
    const files    = [];
    let idx = 1;
    for (const p of _pages().filter(pg => pg.type === 'section')) {
        const content = _dossier[p.key];
        if (!content) continue;
        const base = p.label.toLowerCase().replaceAll(' ', '_').replace(/[^a-z0-9_]/g, '');
        if (encoder.encode(content).length <= _MAX_BYTES) {
            files.push({ name: `${folder}/${String(idx).padStart(2, '0')}_${base}.txt`, content });
        } else {
            files.push(..._splitContent(content, folder, base, idx, encoder));
        }
        idx++;
    }
    if (!files.length) { globalThis.alert('No content to export.'); return; }
    downloadFile(`${folder}.zip`, buildZipBlob(files), 'application/zip');
}

// ─── Last-edited label ────────────────────────────────────────────────────

function _editedLabel(key) {
    const ts = _dossierEdited[key];
    if (!ts) return '';
    const mins = Math.floor((Date.now() - ts) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── Voxel integration ────────────────────────────────────────────────────

async function _initVoxel() {
    const frame = _panel?.querySelector('#se-cx-voxel-frame');
    if (!frame) return;
    const ok = await initVoxel(frame, _voxelSpec ?? defaultSpec());
    const promptSec = _panel?.querySelector('#se-cx-voxel-prompt-section');
    if (promptSec) promptSec.style.display = ok ? '' : 'none';
    _setVoxelBtnsEnabled(ok);
}

function _setVoxelBtnsEnabled(enabled) {
    ['#se-cx-vctl-front', '#se-cx-vctl-spin', '#se-cx-vctl-regen', '#se-cx-vctl-quick', '#se-cx-vctl-fit'].forEach(id => {
        const btn = _panel?.querySelector(id);
        if (btn) btn.disabled = !enabled;
    });
}

async function _generateVoxelSpec() {
    if (_generating || !_panel) return;
    const notes   = _panel.querySelector('#se-cx-voxel-notes')?.value.trim() ?? '';
    const { context } = _buildContext();
    const userMsg = notes
        ? `Character context:\n${context}\n\nAdditional voxel notes:\n${notes}`
        : `Character context:\n${context}`;

    _generating = true;
    const btn = _panel.querySelector('#se-cx-vctl-regen');
    if (btn) btn.textContent = '…';

    try {
        const sys = getPrompt('codex-voxel-spec');
        const raw = await _callApi(_buildMessages(sys, userMsg), 600);
        const spec = _parseJson(raw);
        spec.tier  = _voxelTier;
        _voxelSpec = spec;
        const frame = _panel?.querySelector('#se-cx-voxel-frame');
        if (frame) setVoxelSpec(spec);
    } catch (err) {
        globalThis.alert(`Voxel spec failed: ${err.message}`);
    } finally {
        _generating = false;
        if (btn) btn.textContent = '✦';
    }
}

async function _quickGenVoxelDesc() {
    if (_generating || !_panel) return;
    const appearance  = (_dossier.appearance  ?? '').trim();
    const personality = (_dossier.personality ?? '').trim();
    if (!appearance || !personality) {
        globalThis.alert('Quick gen requires both Appearance & Quirks and Personality sections — generate the Codex first.');
        return;
    }

    _generating = true;
    const btn = _panel.querySelector('#se-cx-vctl-quick');
    if (btn) btn.textContent = '…';

    try {
        const sys    = getPrompt('codex-voxel-quick');
        const userMsg = `Tier: ${_voxelTier}\n\nPersonality:\n${personality}\n\nAppearance & Quirks:\n${appearance}`;
        const raw    = await _callApi(_buildMessages(sys, userMsg), 300);
        const notes  = _panel.querySelector('#se-cx-voxel-notes');
        if (notes) notes.value = raw.trim();
    } catch (err) {
        globalThis.alert(`Quick gen failed: ${err.message}`);
    } finally {
        _generating = false;
        if (btn) btn.textContent = '⚡';
    }
}

function _bindVoxelControls() {
    _panel?.querySelector('#se-cx-vctl-front')?.addEventListener('click', () => setView('front'));

    _panel?.querySelector('#se-cx-vctl-spin')?.addEventListener('click', function () {
        const spinning = toggleSpin();
        this.style.color = spinning ? 'var(--se-green)' : '';
    });

    _panel?.querySelector('#se-cx-vctl-regen')?.addEventListener('click', _generateVoxelSpec);
    _panel?.querySelector('#se-cx-vctl-quick')?.addEventListener('click', _quickGenVoxelDesc);
    _panel?.querySelector('#se-cx-vctl-fit')?.addEventListener('click', () => setView('fit'));

    _panel?.querySelectorAll('.se-cx-tier-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _voxelTier = btn.dataset.tier ?? 'minimum';
            _panel.querySelectorAll('.se-cx-tier-btn').forEach(b => b.classList.toggle('active', b === btn));
            if (_voxelSpec) {
                _voxelSpec.tier = _voxelTier;
                setVoxelSpec(_voxelSpec);
            }
        });
    });
}

// ─── Panel binding ────────────────────────────────────────────────────────

function _bindPanel() {
    if (!_panel) return;

    _panel.querySelector('#se-cx-close-btn')?.addEventListener('click', closeCodex);

    _panel.querySelector('#se-cx-fullscreen-btn')?.addEventListener('click', function () {
        const isFull = _panel.classList.toggle('se-cx-fullscreen');
        this.innerHTML = isFull ? '&#x2922;' : '&#x26F6;';
        this.title     = isFull ? 'Exit fullscreen' : 'Fullscreen';
    });

    _panel.querySelector('#se-cx-chk-supp')?.addEventListener('change',    _updateTokenEstimate);
    _panel.querySelector('#se-cx-chk-entries')?.addEventListener('change',  _updateTokenEstimate);
    _panel.querySelector('#se-cx-override')?.addEventListener('input',      _updateTokenEstimate);
    _panel.querySelector('#se-cx-gen-btn')?.addEventListener('click',       _generate);

    _panel.querySelector('#se-cx-prev')?.addEventListener('click', () => _goToPage(_pageIdx - 1));
    _panel.querySelector('#se-cx-next')?.addEventListener('click', () => _goToPage(_pageIdx + 1));

    _bindVoxelControls();
}
