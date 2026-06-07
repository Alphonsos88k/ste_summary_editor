/**
 * @module codex
 * @description Character Codex — generates a multi-section character profile
 * from the active character card and ingested files. Opens as an overlay in
 * the Edit (Arcs) tab, same slot as Chat Files Manager.
 */

import { escHtml } from '../core/utils.js';
import { loadTemplate } from '../core/template-loader.js';
import { TEMPLATES } from '../core/constants.js';
import { registerPrompt, getPrompt } from '../core/system-prompts.js';
import { state } from '../core/state.js';
import { buildZipBlob, downloadFile } from '../export/export.js';

// ─── Prompt registration (self-registering pattern) ──────────────────────

registerPrompt('codex-main', 'Character Codex — Generation', '', {
    warnJson: true,
    location: 'Edit › Character Codex',
});

registerPrompt('codex-section-prompt', 'Character Codex — Section Regen Prompt', '', {
    warnJson: true,
    location: 'Edit › Character Codex (per-section regeneration)',
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

// ─── Module state (all session-only) ─────────────────────────────────────

let _panel          = null;
let _char           = null;
let _generating     = false;
let _dossier        = {};
let _dossierPrompts = {};
let _customSections = [];
let _nsfwRevealed   = new Set();

// ─── Public API ──────────────────────────────────────────────────────────

export async function openCodex() {
    closeCodex();
    const html = await loadTemplate(TEMPLATES.CODEX_PANEL);
    _panel = document.createElement('div');
    _panel.id = 'se-cx-panel';
    _panel.className = 'se-cx-panel';
    _panel.innerHTML = html;
    document.querySelector('#se-panel-arcs .se-acts-content').appendChild(_panel);
    _detectChar();
    _bindPanel();
    requestAnimationFrame(() => _panel?.classList.add('open'));
}

export function closeCodex() {
    _panel?.remove();
    _panel          = null;
    _char           = null;
    _generating     = false;
    _dossier        = {};
    _dossierPrompts = {};
    _customSections = [];
    _nsfwRevealed   = new Set();
}

// ─── Character detection ─────────────────────────────────────────────────

function _detectChar() {
    if (!_panel) return;
    const ctx    = SillyTavern.getContext();
    const charId = ctx.characterId;
    const chars  = ctx.characters ?? [];

    if (charId !== undefined && chars[charId]) {
        _char = chars[charId];
        _setCharHeader(_char);
        const pill = _panel.querySelector('#se-cx-char-pill');
        if (pill) pill.textContent = _char.name;
    } else {
        _char = null;
        _showCharDropdown(chars);
    }
    _updateTokenEstimate();
}

function _setCharHeader(char) {
    if (!_panel || !char) return;
    const nameEl   = _panel.querySelector('#se-cx-char-name');
    const avatarEl = _panel.querySelector('#se-cx-avatar');
    if (nameEl)   nameEl.textContent = char.name ?? '—';
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
            _setCharHeader(_char);
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
    if (tok > 20000)      el.classList.add('se-cx-tok-pink');
    else if (tok > 8000)  el.classList.add('se-cx-tok-orange');

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

    const parts = _buildCharParts(charName);
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
    const messages = _buildMessages(getPrompt('codex-main'), context);

    try {
        const parsed = _parseJson(await _callApi(messages, 4000));
        for (const key of SECTION_KEYS) {
            if (parsed[key]) _dossier[key] = parsed[key];
        }
        _setProgress(true, 'Complete', 100);
        _renderCards(charName);
        _showPostGenLayout();
    } catch (err) {
        _setProgress(false, '', 0);
        _showError(`Generation failed: ${err.message}`);
    } finally {
        _generating = false;
        _updateGenBtn();
    }
}

// ─── Layout helpers ───────────────────────────────────────────────────────

function _setProgress(visible, text, pct) {
    const bar   = _panel?.querySelector('#se-cx-progress');
    const fill  = _panel?.querySelector('#se-cx-progress-fill');
    const txt   = _panel?.querySelector('#se-cx-progress-txt');
    const empty = _panel?.querySelector('#se-cx-empty');
    if (!bar) return;
    bar.style.display  = visible ? '' : 'none';
    if (fill)  fill.style.width  = `${pct}%`;
    if (txt)   txt.textContent   = text;
    if (empty && visible) empty.style.display = 'none';
}

function _showPostGenLayout() {
    if (!_panel) return;
    const empty  = _panel.querySelector('#se-cx-empty');
    const cards  = _panel.querySelector('#se-cx-cards');
    const bar    = _panel.querySelector('#se-cx-bottom-bar');
    const setup  = _panel.querySelector('#se-cx-setup');
    const toggle = _panel.querySelector('#se-cx-settings-toggle');
    if (empty)  empty.style.display  = 'none';
    if (cards)  cards.style.display  = '';
    if (bar)    bar.style.display    = '';
    if (setup)  setup.style.display  = 'none';
    if (toggle) toggle.style.display = '';
    _updateExportBtn();
}

function _showError(msg) {
    const empty = _panel?.querySelector('#se-cx-empty');
    if (empty) { empty.style.display = ''; empty.textContent = msg; }
}

function _updateExportBtn() {
    const btn = _panel?.querySelector('#se-cx-export');
    if (btn) btn.disabled = Object.keys(_dossier).length === 0;
}

// ─── Card rendering ───────────────────────────────────────────────────────

function _allSections() {
    return [...SECTION_DEFS, ..._customSections.map(s => ({ key: s.key, label: s.label, nsfw: false }))];
}

function _renderCards(charName) {
    const container = _panel?.querySelector('#se-cx-cards');
    if (!container) return;
    container.innerHTML = _allSections()
        .filter(s => _dossier[s.key] !== undefined)
        .map(s => _cardHtml(s.key, s.label, _dossier[s.key] ?? '', s.nsfw))
        .join('');
    _bindCardEvents();
    const nameEl = _panel?.querySelector('#se-cx-char-name');
    if (nameEl && charName) nameEl.textContent = charName;
}

function _nsfwWrapHtml(key, content, isNsfw) {
    const blurCls    = (isNsfw && !_nsfwRevealed.has(key)) ? ' se-cx-nsfw-blur' : '';
    const nsfwToggle = isNsfw
        ? `<button class="se-cx-nsfw-toggle" data-nsfw-key="${escHtml(key)}">&#x1F441; Show</button>`
        : '';
    return (
        `<div class="se-cx-nsfw-wrap${blurCls}">` +
            nsfwToggle +
            `<textarea class="se-cx-card-ta" data-ta-key="${escHtml(key)}" readonly>${escHtml(content)}</textarea>` +
        `</div>`
    );
}

function _cardHtml(key, label, content, isNsfw) {
    const promptText = escHtml(_dossierPrompts[key] ?? '');
    return (
        `<div class="se-cx-card" data-card-key="${escHtml(key)}">` +
            `<div class="se-cx-card-hdr">` +
                `<span class="se-cx-card-label">${escHtml(label)}</span>` +
                `<span class="se-cx-card-stale" data-stale-key="${escHtml(key)}">&#9888; stale</span>` +
                `<button class="se-cx-card-edit-btn" data-edit-key="${escHtml(key)}" title="Toggle edit">&#x270E;</button>` +
                `<button class="se-cx-card-regen-btn" data-regen-key="${escHtml(key)}" title="Regenerate">&#x21BB;</button>` +
            `</div>` +
            `<div class="se-cx-card-body">` +
                _nsfwWrapHtml(key, content, isNsfw) +
                `<div class="se-cx-feedback-row">` +
                    `<input class="se-cx-feedback-inp" data-fb-key="${escHtml(key)}" type="text" placeholder="Feedback for regen&hellip;" />` +
                    `<button class="se-cx-regen-btn" data-regen-key="${escHtml(key)}">&#x21BB; Regen</button>` +
                `</div>` +
                `<details class="se-cx-prompt-details">` +
                    `<summary>System Prompt</summary>` +
                    `<textarea class="se-cx-prompt-ta" data-prompt-key="${escHtml(key)}" placeholder="Generated on first regen&hellip;">${promptText}</textarea>` +
                `</details>` +
            `</div>` +
        `</div>`
    );
}

function _bindEditBtn(cards, btn) {
    btn.addEventListener('click', () => {
        const key = btn.dataset.editKey;
        const ta  = cards.querySelector(`.se-cx-card-ta[data-ta-key="${key}"]`);
        if (!ta) return;
        ta.readOnly = !ta.readOnly;
        if (!ta.readOnly) {
            ta.focus();
            ta.addEventListener('input', () => { _dossier[key] = ta.value; _updateExportBtn(); });
        }
    });
}

function _bindCardEvents() {
    if (!_panel) return;
    const cards = _panel.querySelector('#se-cx-cards');
    if (!cards) return;

    cards.querySelectorAll('.se-cx-nsfw-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            _nsfwRevealed.add(btn.dataset.nsfwKey);
            btn.closest('.se-cx-nsfw-wrap')?.classList.remove('se-cx-nsfw-blur');
        });
    });

    cards.querySelectorAll('.se-cx-card-edit-btn').forEach(btn => _bindEditBtn(cards, btn));

    cards.querySelectorAll('.se-cx-regen-btn, .se-cx-card-regen-btn').forEach(btn => {
        btn.addEventListener('click', () => _regenSection(btn.dataset.regenKey));
    });
}

// ─── Per-section regeneration ─────────────────────────────────────────────

async function _fetchInstruction(key, feedback, context, card) {
    const existing = (_dossierPrompts[key] ?? '').trim();
    const promptTa = card.querySelector('.se-cx-prompt-ta');
    if (existing) return promptTa?.value.trim() || existing;

    const def          = SECTION_DEFS.find(s => s.key === key) ?? _customSections.find(s => s.key === key);
    const sectionLabel = def?.label ?? key;
    const meta         = getPrompt('codex-section-prompt');
    const metaUser     = `Section: ${sectionLabel}\nFeedback: ${feedback || '(none)'}\n\nCharacter context:\n${context}`;
    const metaRaw      = await _callApi(_buildMessages(meta, metaUser), 400);
    let instruction;
    try { instruction = _parseJson(metaRaw).instruction ?? metaRaw; } catch { instruction = metaRaw; }
    _dossierPrompts[key] = instruction;
    if (promptTa) promptTa.value = instruction;
    return instruction;
}

async function _regenSection(key) {
    if (_generating || !key || !_panel) return;
    const card = _panel.querySelector(`.se-cx-card[data-card-key="${key}"]`);
    if (!card) return;

    const feedbackEl  = card.querySelector('.se-cx-feedback-inp');
    const feedback    = feedbackEl?.value.trim() ?? '';
    const { context } = _buildContext();

    _generating = true;
    card.querySelectorAll('.se-cx-regen-btn, .se-cx-card-regen-btn').forEach(b => { b.disabled = true; });

    try {
        const instruction = await _fetchInstruction(key, feedback, context, card);
        const sectionUser = `${instruction}\n\nFeedback: ${feedback || '(none)'}\n\nCharacter context:\n${context}`;
        const raw         = await _callApi(_buildMessages(getPrompt('codex-main'), sectionUser), 800);
        let content = raw;
        try { const p = _parseJson(raw); content = p[key] ?? p.content ?? raw; } catch { /* raw text fallback */ }

        _dossier[key] = content;
        const ta = card.querySelector('.se-cx-card-ta');
        if (ta) ta.value = content;
        if (feedbackEl) feedbackEl.value = '';
        card.querySelector('.se-cx-card-stale')?.classList.remove('visible');
        _updateExportBtn();
    } catch (err) {
        const ta = card.querySelector('.se-cx-card-ta');
        if (ta) ta.value = `[Error: ${err.message}]`;
    } finally {
        _generating = false;
        card.querySelectorAll('.se-cx-regen-btn, .se-cx-card-regen-btn').forEach(b => { b.disabled = false; });
    }
}

// ─── Add section ──────────────────────────────────────────────────────────

function _positionForm(form) {
    const btn = _panel?.querySelector('#se-cx-add-section');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    form.style.bottom = `${window.innerHeight - rect.top + 6}px`;
    form.style.left   = `${Math.min(rect.left, window.innerWidth - 340)}px`;
}

async function _submitAddForm(label, form) {
    if (!label) return;
    const key = `custom_${Date.now()}`;
    _customSections.push({ key, label });
    form.remove();
    _dossier[key] = '';
    _appendCard(key, label, '', false);
    await _regenSection(key);
}

function _openAddForm() {
    const existing = document.getElementById('se-cx-add-form');
    if (existing) { existing.remove(); return; }

    const form = document.createElement('div');
    form.id = 'se-cx-add-form';
    form.className = 'se-cx-add-form';
    form.innerHTML =
        `<span class="se-cx-add-form-lbl">New Section Label</span>` +
        `<input class="se-cx-add-form-inp" id="se-cx-add-form-label" type="text" placeholder="e.g. Combat Style" autocomplete="off" />` +
        `<div class="se-cx-add-form-foot">` +
            `<button class="se-cx-add-form-cancel">Cancel</button>` +
            `<button class="se-cx-add-form-go">Add &amp; Generate</button>` +
        `</div>`;

    _positionForm(form);
    document.body.appendChild(form);

    form.querySelector('.se-cx-add-form-cancel').addEventListener('click', () => form.remove());
    form.querySelector('.se-cx-add-form-go').addEventListener('click', () => {
        _submitAddForm(form.querySelector('#se-cx-add-form-label').value.trim(), form);
    });
    form.querySelector('#se-cx-add-form-label').focus();
}

function _appendCard(key, label, content, isNsfw) {
    const container = _panel?.querySelector('#se-cx-cards');
    if (!container) return;
    const div = document.createElement('div');
    div.innerHTML = _cardHtml(key, label, content, isNsfw);
    while (div.firstChild) container.appendChild(div.firstChild);
    _bindCardEvents();
}

// ─── AI suggest sections ──────────────────────────────────────────────────

async function _aiSuggestSections() {
    if (_generating || !_panel) return;
    const { charName, context } = _buildContext();
    const existing = _allSections().map(s => s.label).join(', ');
    const prompt   = `Character: ${charName}\n\n${context}\n\nSuggest 3–5 additional biography sections not already covered. Existing: ${existing}. Return JSON: {"suggestions":["Section Name",...]}`;
    _generating = true;
    try {
        const data        = _parseJson(await _callApi(_buildMessages('', prompt), 300));
        const suggestions = data.suggestions ?? [];
        for (const s of suggestions) {
            if (!globalThis.confirm(`Add section: "${s}"?`)) continue;
            const key = `custom_${Date.now()}`;
            _customSections.push({ key, label: s });
            _dossier[key] = '';
            _appendCard(key, s, '', false);
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
        const paraBreak = content.lastIndexOf('\n\n', end);
        if (paraBreak > start) end = paraBreak;
        files.push({
            name:    `${folder}/${String(idx).padStart(2, '0')}_${baseName}_part${part}.txt`,
            content: content.slice(start, end),
        });
        part++;
        start = end === start ? start + 1 : end;
    }
    return files;
}

function _exportZip() {
    const rawName = _panel?.querySelector('#se-cx-char-name')?.textContent ?? 'Character';
    const charName = rawName.replaceAll(' ', '_').replace(/[^a-zA-Z0-9_-]/g, '');
    const folder   = `${charName}_Codex_${new Date().toISOString().slice(0, 10)}`;
    const encoder  = new TextEncoder();

    const files = [];
    let idx = 1;
    for (const def of _allSections()) {
        const content = _dossier[def.key];
        if (!content) continue;
        const baseName = def.label.toLowerCase().replaceAll(' ', '_').replace(/[^a-z0-9_]/g, '');
        if (encoder.encode(content).length <= _MAX_BYTES) {
            files.push({ name: `${folder}/${String(idx).padStart(2, '0')}_${baseName}.txt`, content });
        } else {
            files.push(..._splitContent(content, folder, baseName, idx, encoder));
        }
        idx++;
    }

    if (!files.length) { globalThis.alert('No content to export.'); return; }
    downloadFile(`${folder}.zip`, buildZipBlob(files), 'application/zip');
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

    _panel.querySelector('#se-cx-chk-supp')?.addEventListener('change', _updateTokenEstimate);
    _panel.querySelector('#se-cx-chk-entries')?.addEventListener('change', _updateTokenEstimate);
    _panel.querySelector('#se-cx-override')?.addEventListener('input', _updateTokenEstimate);

    _panel.querySelector('#se-cx-gen-btn')?.addEventListener('click', _generate);

    _panel.querySelector('#se-cx-settings-toggle')?.addEventListener('click', () => {
        const setup  = _panel.querySelector('#se-cx-setup');
        const toggle = _panel.querySelector('#se-cx-settings-toggle');
        if (!setup || !toggle) return;
        const open = setup.style.display === 'none';
        setup.style.display  = open ? '' : 'none';
        toggle.textContent   = open ? '▲ Hide Settings' : '⚙ Settings';
    });

    _panel.querySelector('#se-cx-add-section')?.addEventListener('click', _openAddForm);
    _panel.querySelector('#se-cx-ai-suggest')?.addEventListener('click', _aiSuggestSections);
    _panel.querySelector('#se-cx-export')?.addEventListener('click', _exportZip);
}
