/**
 * @module codex
 * @description Character Codex — generates a multi-section character profile
 * from the active character card and ingested files. Opens as an overlay in
 * the Edit (Arcs) tab, same slot as Chat Files Manager.
 *
 * Layout: left page = character portrait (Stage 2: voxel canvas)
 *         right page = setup pre-gen; sections paginator post-gen
 */

import { escHtml } from '../core/utils.js';
import { loadTemplate } from '../core/template-loader.js';
import { TEMPLATES } from '../core/constants.js';
import { registerPrompt, getPrompt } from '../core/system-prompts.js';
import { state } from '../core/state.js';
import { buildZipBlob, downloadFile } from '../export/export.js';

// ─── Prompt registration ──────────────────────────────────────────────────

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
let _sectionIdx     = 0;
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
    _showDefaultLayout();  // pager + tab bar visible from the start
    requestAnimationFrame(() => _panel?.classList.add('open'));
}

export function closeCodex() {
    _panel?.remove();
    _panel          = null;
    _char           = null;
    _generating     = false;
    _sectionIdx     = 0;
    _dossier        = {};
    _dossierPrompts = {};
    _customSections = [];
    _nsfwRevealed   = new Set();
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function _allSections() {
    return [...SECTION_DEFS, ..._customSections.map(s => ({ key: s.key, label: s.label, nsfw: false }))];
}

function _currentKey() {
    return _allSections()[_sectionIdx]?.key ?? null;
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
    // Switch to Sections tab and show progress overlay
    _panel.querySelectorAll('.se-cx-rtab').forEach(t => t.classList.toggle('active', t.dataset.rtab === 'sections'));
    _panel.querySelector('#se-cx-setup').style.display = 'none';
    _panel.querySelector('#se-cx-pager').style.display = '';
    _setProgress(true, 'Generating codex…', 0);

    const { charName, context } = _buildContext();
    try {
        const parsed = _parseJson(await _callApi(_buildMessages(getPrompt('codex-main'), context), 4000));
        for (const key of SECTION_KEYS) {
            if (parsed[key]) _dossier[key] = parsed[key];
        }
        _setProgress(true, 'Complete', 100);
        _showPostGenLayout(charName);
    } catch (err) {
        _setProgress(false, '', 0);
        // Switch to Settings tab so user can retry
        _panel?.querySelectorAll('.se-cx-rtab').forEach(t => t.classList.toggle('active', t.dataset.rtab === 'settings'));
        _panel?.querySelector('#se-cx-setup')?.style && (_panel.querySelector('#se-cx-setup').style.display = '');
        _panel?.querySelector('#se-cx-pager')?.style  && (_panel.querySelector('#se-cx-pager').style.display  = 'none');
        globalThis.alert(`Generation failed: ${err.message}`);
    } finally {
        _generating = false;
        _updateGenBtn();
    }
}

// ─── Layout transitions ───────────────────────────────────────────────────

function _showDefaultLayout() {
    // Sections pager + tab bar always visible; settings accessible via ⚙ Settings tab
    if (!_panel) return;
    _panel.querySelector('#se-cx-rtab-bar').style.display    = '';
    _panel.querySelector('#se-cx-pager').style.display       = '';
    _panel.querySelector('#se-cx-bottom-bar').style.display  = '';
    _panel.querySelector('#se-cx-setup').style.display       = 'none';
    _panel.querySelector('#se-cx-progress').style.display    = 'none';
    _renderToc();
    _renderPager();
}

function _setProgress(visible, text, pct) {
    const bar   = _panel?.querySelector('#se-cx-progress');
    const fill  = _panel?.querySelector('#se-cx-progress-fill');
    const txt   = _panel?.querySelector('#se-cx-progress-txt');
    if (!bar) return;
    bar.style.display = visible ? '' : 'none';
    if (fill) fill.style.width = `${pct}%`;
    if (txt)  txt.textContent  = text;
}

function _showPostGenLayout(charName) {
    if (!_panel) return;
    _setProgress(false, '', 0);
    // Switch back to Sections tab
    _panel.querySelectorAll('.se-cx-rtab').forEach(t => t.classList.toggle('active', t.dataset.rtab === 'sections'));
    _panel.querySelector('#se-cx-setup').style.display  = 'none';
    _panel.querySelector('#se-cx-pager').style.display  = '';
    const nameEl = _panel.querySelector('#se-cx-char-name');
    if (nameEl && charName) nameEl.textContent = charName;
    _sectionIdx = 0;
    _renderToc();
    _renderPager();
    _updateExportBtn();
}

function _updateExportBtn() {
    const btn = _panel?.querySelector('#se-cx-export');
    if (btn) btn.disabled = Object.keys(_dossier).length === 0;
}

// ─── Mini TOC ────────────────────────────────────────────────────────────

function _tocChipHtml(s, i) {
    const active     = i === _sectionIdx ? ' active' : '';
    const hasCnt     = _dossier[s.key] ? ' has-content' : '';
    const nsfwCls    = s.nsfw ? ' nsfw-chip' : '';
    const shortLabel = s.label.split(' ').slice(0, 2).join(' ');
    return `<button class="se-cx-toc-chip${active}${hasCnt}${nsfwCls}" data-toc-idx="${i}">${escHtml(shortLabel)}</button>`;
}

function _renderToc() {
    const toc = _panel?.querySelector('#se-cx-toc');
    if (!toc) return;
    toc.innerHTML = _allSections().map((s, i) => _tocChipHtml(s, i)).join('');
    toc.querySelectorAll('[data-toc-idx]').forEach(btn => {
        btn.addEventListener('click', () => _navTo(Number(btn.dataset.tocIdx)));
    });
}

function _updateTocActive() {
    _panel?.querySelectorAll('.se-cx-toc-chip').forEach((chip, i) => {
        chip.classList.toggle('active', i === _sectionIdx);
        const key = _allSections()[i]?.key;
        chip.classList.toggle('has-content', !!_dossier[key]);
    });
}

// ─── Paginator ────────────────────────────────────────────────────────────

function _navTo(idx) {
    const sections = _allSections();
    if (idx < 0 || idx >= sections.length) return;
    _sectionIdx = idx;
    _renderPager();
    _updateTocActive();
}

function _renderPager() {
    const sections = _allSections();
    const def      = sections[_sectionIdx];
    if (!def || !_panel) return;
    const { key, label, nsfw } = def;

    const ta       = _panel.querySelector('#se-cx-pager-ta');
    const labelEl  = _panel.querySelector('#se-cx-pager-label');
    const countEl  = _panel.querySelector('#se-cx-pager-count');
    const prevBtn  = _panel.querySelector('#se-cx-prev');
    const nextBtn  = _panel.querySelector('#se-cx-next');
    const stale    = _panel.querySelector('#se-cx-stale-badge');
    const nsfwWrap = _panel.querySelector('#se-cx-nsfw-wrap');
    const nsfwBtn  = _panel.querySelector('#se-cx-nsfw-toggle');
    const promptTa = _panel.querySelector('#se-cx-pager-prompt-ta');
    const feedback = _panel.querySelector('#se-cx-pager-feedback');

    if (labelEl) labelEl.textContent = label;
    if (countEl) countEl.textContent = `${_sectionIdx + 1} / ${sections.length}`;
    if (ta) { ta.value = _dossier[key] ?? ''; ta.readOnly = true; }
    if (prevBtn) prevBtn.disabled = _sectionIdx === 0;
    if (nextBtn) nextBtn.disabled = _sectionIdx === sections.length - 1;
    if (stale)   stale.style.display   = 'none';
    if (feedback) feedback.value       = '';
    if (promptTa) promptTa.value       = _dossierPrompts[key] ?? '';

    const isNsfw   = nsfw;
    const revealed = _nsfwRevealed.has(key);
    if (nsfwWrap) nsfwWrap.classList.toggle('se-cx-nsfw-blur', isNsfw && !revealed);
    if (nsfwBtn) {
        nsfwBtn.style.display    = (isNsfw && !revealed) ? '' : 'none';
        nsfwBtn.dataset.nsfwKey  = key;
    }
}

// ─── Per-section regeneration ─────────────────────────────────────────────

async function _fetchInstruction(key, feedback, context) {
    const existing = (_dossierPrompts[key] ?? '').trim();
    const promptTa = _panel?.querySelector('#se-cx-pager-prompt-ta');
    if (existing) return promptTa?.value.trim() || existing;

    const def    = _allSections().find(s => s.key === key);
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

async function _regenSection(key) {
    if (_generating || !key || !_panel) return;
    const feedbackEl  = _panel.querySelector('#se-cx-pager-feedback');
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
        if (_currentKey() === key) {
            const ta = _panel.querySelector('#se-cx-pager-ta');
            if (ta) ta.value = content;
        }
        if (feedbackEl) feedbackEl.value = '';
        _updateTocActive();
        _updateExportBtn();
    } catch (err) {
        const ta = _panel?.querySelector('#se-cx-pager-ta');
        if (ta && _currentKey() === key) ta.value = `[Error: ${err.message}]`;
    } finally {
        _generating = false;
        _setRegenBtnsDisabled(false);
    }
}

function _setRegenBtnsDisabled(disabled) {
    _panel?.querySelector('#se-cx-regen-btn')?.toggleAttribute('disabled', disabled);
    _panel?.querySelector('#se-cx-regen-hdr-btn')?.toggleAttribute('disabled', disabled);
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
    form.remove();
    const key = `custom_${Date.now()}`;
    _customSections.push({ key, label });
    _dossier[key] = '';
    _renderToc();
    _navTo(_allSections().length - 1);
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

// ─── AI suggest sections ──────────────────────────────────────────────────

async function _aiSuggestSections() {
    if (_generating || !_panel) return;
    const { charName, context } = _buildContext();
    const existing = _allSections().map(s => s.label).join(', ');
    const prompt   = `Character: ${charName}\n\n${context}\n\nSuggest 3–5 additional biography sections not already covered. Existing: ${existing}. Return JSON: {"suggestions":["Section Name",...]}`;
    _generating = true;
    try {
        const data = _parseJson(await _callApi(_buildMessages('', prompt), 300));
        for (const s of (data.suggestions ?? [])) {
            if (!globalThis.confirm(`Add section: "${s}"?`)) continue;
            const key = `custom_${Date.now()}`;
            _customSections.push({ key, label: s });
            _dossier[key] = '';
            _renderToc();
            _navTo(_allSections().length - 1);
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
        if (pb > start) end = pb;
        files.push({ name: `${folder}/${String(idx).padStart(2, '0')}_${baseName}_part${part}.txt`, content: content.slice(start, end) });
        part++;
        start = end === start ? start + 1 : end;
    }
    return files;
}

function _exportZip() {
    const rawName  = _panel?.querySelector('#se-cx-char-name')?.textContent ?? 'Character';
    const charName = rawName.replaceAll(' ', '_').replace(/[^a-zA-Z0-9_-]/g, '');
    const folder   = `${charName}_Codex_${new Date().toISOString().slice(0, 10)}`;
    const encoder  = new TextEncoder();
    const files    = [];
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

function _bindRightTabs() {
    _panel?.querySelectorAll('.se-cx-rtab').forEach(tab => {
        tab.addEventListener('click', () => {
            _panel.querySelectorAll('.se-cx-rtab').forEach(t => t.classList.toggle('active', t === tab));
            const showPager = tab.dataset.rtab === 'sections';
            _panel.querySelector('#se-cx-pager').style.display = showPager ? '' : 'none';
            _panel.querySelector('#se-cx-setup').style.display = showPager ? 'none' : '';
        });
    });
}

function _bindEditBtn() {
    _panel?.querySelector('#se-cx-edit-btn')?.addEventListener('click', () => {
        const ta = _panel.querySelector('#se-cx-pager-ta');
        if (!ta) return;
        ta.readOnly = !ta.readOnly;
        if (!ta.readOnly) {
            ta.focus();
            const key = _currentKey();
            ta.addEventListener('input', () => {
                if (key) _dossier[key] = ta.value;
                _updateExportBtn();
            });
        }
    });
}

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

    _panel.querySelector('#se-cx-prev')?.addEventListener('click', () => _navTo(_sectionIdx - 1));
    _panel.querySelector('#se-cx-next')?.addEventListener('click', () => _navTo(_sectionIdx + 1));

    _panel.querySelector('#se-cx-nsfw-toggle')?.addEventListener('click', () => {
        const key = _currentKey();
        if (key) { _nsfwRevealed.add(key); _renderPager(); }
    });

    _panel.querySelector('#se-cx-regen-btn')?.addEventListener('click',     () => _regenSection(_currentKey()));
    _panel.querySelector('#se-cx-regen-hdr-btn')?.addEventListener('click', () => _regenSection(_currentKey()));

    _panel.querySelector('#se-cx-add-section')?.addEventListener('click', _openAddForm);
    _panel.querySelector('#se-cx-ai-suggest')?.addEventListener('click',  _aiSuggestSections);
    _panel.querySelector('#se-cx-export')?.addEventListener('click', _exportZip);

    _bindEditBtn();
    _bindRightTabs();
}
