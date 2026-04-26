/**
 * @module bulk-refine
 * @description Bulk API refinement for selected entries.
 *
 * Sends selected entries (with any conflict feedback) to the LLM for revision.
 * Reuses the Content Editor system prompt key so they share one configurable prompt.
 *
 * Flow:
 * 1. User selects entries → clicks "Bulk Refine" in Utils panel
 * 2. Module checks conflict data for each entry
 *    - None have data → warn "No conflict check run, proceed anyway?"
 *    - Some have data → confirm with counts
 * 3. On confirm → open draggable panel, show selected entries
 * 4. "Run All" → streams API calls sequentially per entry
 * 5. Each result shown with Accept / Discard buttons
 * 6. Accept → saves to entry.content, marks as modified
 */

import { state, persistState } from '../core/state.js';
import { renderTable } from '../table/table.js';
import { escHtml, spawnPanel } from '../core/utils.js';
import { loadTemplate, fillTemplate } from '../core/template-loader.js';
import { TEMPLATES } from '../core/constants.js';
import { getPrompt } from '../core/system-prompts.js';
import { seAlert, seConfirm } from '../core/dialogs.js';
import { showDiffView } from './diff-view.js';

/** Shared prompt key — reuses Content Editor's configurable prompt. */
const PROMPT_KEY = 'content-editor';

/** @type {HTMLElement|null} */
let _panel = null;

/** @type {string|null} */
let _panelTmpl = null;
/** @type {string|null} */
let _entryTmpl = null;

async function _ensureTemplates() {
    if (_panelTmpl && _entryTmpl) return;
    [_panelTmpl, _entryTmpl] = await Promise.all([
        loadTemplate(TEMPLATES.BULK_REFINE_PANEL),
        loadTemplate(TEMPLATES.BULK_REFINE_ENTRY),
    ]);
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Open the Bulk Refine panel for currently selected entries.
 * Validates selection and conflict state, then shows the panel.
 */
export async function openBulkRefine() {
    const selected = [...state.selected].sort((a, b) => a - b);
    if (selected.length === 0) {
        await seAlert('Select at least one entry to refine.');
        return;
    }

    const withFeedback = selected.filter(n => _hasNonOkConflict(n));
    const noFeedback   = selected.filter(n => !_hasNonOkConflict(n));

    if (noFeedback.length === selected.length) {
        const ok = await seConfirm(
            `None of the ${selected.length} selected entr${selected.length === 1 ? 'y has' : 'ies have'} been conflict-checked.\n\n` +
            `The AI will revise based on content only.\n\nProceed anyway?`
        );
        if (!ok) return;
    } else if (noFeedback.length > 0) {
        const ok = await seConfirm(
            `${withFeedback.length} of ${selected.length} entries have conflict feedback.\n` +
            `${noFeedback.length} entries have no conflict data and will be revised on content only.\n\nProceed?`
        );
        if (!ok) return;
    }

    _showPanel(selected);
}

/**
 * Close and remove the Bulk Refine panel.
 */
export function closeBulkRefine() {
    _panel?.remove();
    _panel = null;
}

// ─── Private helpers ─────────────────────────────────────────

function _hasNonOkConflict(num) {
    return (state.conflicts[num] || []).some(c => c.severity !== 'ok');
}

async function _showPanel(nums) {
    closeBulkRefine();
    const overlay = document.getElementById('se-modal-overlay');
    if (!overlay) return;

    await _ensureTemplates();

    const entries = nums.map(n => {
        const entry = state.entries.get(n);
        if (!entry) return '';
        const conflicts = (state.conflicts[n] || []).filter(c => c.severity !== 'ok');
        const hasConfl  = conflicts.length > 0;
        const preview   = escHtml(entry.content.slice(0, 140)) + (entry.content.length > 140 ? '…' : '');
        const badgeCls  = hasConfl ? 'se-br-badge-warn' : 'se-br-badge-none';
        const conflictWord = conflicts.length > 1 ? 'conflicts' : 'conflict';
        const badgeTxt  = hasConfl ? `${conflicts.length} ${conflictWord}` : 'no conflicts';
        return fillTemplate(_entryTmpl, { num: n, badgeCls, badgeTxt, preview });
    }).join('');

    const entryLabel = `${nums.length} entr${nums.length === 1 ? 'y' : 'ies'}`;

    _panel = document.createElement('div');
    _panel.id = 'se-bulk-refine-panel';
    _panel.className = 'se-bulk-refine-panel';
    _panel.innerHTML = fillTemplate(_panelTmpl, { entryLabel, entries });
    overlay.appendChild(_panel);

    spawnPanel(_panel, overlay, '.se-br-header', 520, 560);
    _bindEvents(nums);
}

function _bindEvents(nums) {
    _panel.querySelector('.se-br-close').addEventListener('click', closeBulkRefine);
    _panel.querySelector('#se-br-run').addEventListener('click', () => _runAll(nums));
}

async function _runAll(nums) {
    const runBtn    = _panel?.querySelector('#se-br-run');
    const statusEl  = _panel?.querySelector('#se-br-overall-status');

    if (runBtn) runBtn.disabled = true;
    if (statusEl) { statusEl.textContent = `Running 0 / ${nums.length}…`; statusEl.style.color = '#fd971f'; }

    let done = 0;
    for (const num of nums) {
        if (!_panel) break; // panel was closed mid-run
        await _runSingle(num);
        done++;
        if (statusEl) statusEl.textContent = `Running ${done} / ${nums.length}…`;
    }

    if (statusEl && _panel) {
        statusEl.textContent = `Done (${done} / ${nums.length}) ✓`;
        statusEl.style.color = '#a6e22e';
    }
    if (runBtn && _panel) runBtn.disabled = false;
}

async function _runSingle(num) {
    const entry    = state.entries.get(num);
    if (!entry) return;

    const statusEl = _panel?.querySelector(`#se-br-status-${num}`);
    if (statusEl) { statusEl.textContent = 'Thinking…'; statusEl.style.color = '#fd971f'; }

    const conflicts = (state.conflicts[num] || []).filter(c => c.severity !== 'ok');
    const feedbackLines = conflicts.flatMap(c => [
        ...(c.criticism || []).map(t => `• ${t}`),
        ...(c.feedback  || []).map(t => `→ ${t}`),
    ]);

    let userMsg = '';
    if (feedbackLines.length > 0) {
        userMsg += `Conflict feedback for this entry:\n${feedbackLines.join('\n')}\n\n`;
    }
    userMsg += `Entry #${num} (rewrite this):\n${entry.content}`;

    const base      = getPrompt(PROMPT_KEY);
    const sysPrompt = state.storyContext
        ? `${base}\n\n---\nStory context:\n${state.storyContext}`
        : base;

    try {
        const ctx  = SillyTavern.getContext();
        const resp = await fetch('/api/backends/chat-completions/generate', {
            method: 'POST',
            headers: ctx.getRequestHeaders(),
            body: JSON.stringify({
                type: 'quiet',
                chat_completion_source: ctx.chatCompletionSettings.chat_completion_source,
                model: ctx.getChatCompletionModel(),
                messages: [
                    { role: 'system', content: sysPrompt },
                    { role: 'user',   content: userMsg   },
                ],
                max_tokens:  ctx.chatCompletionSettings.openai_max_tokens || 800,
                temperature: 0.5,
                stream:      false,
            }),
        });

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data   = await resp.json();
        const result = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '';

        if (result && _panel) {
            const anchor = _panel.querySelector(`#se-br-original-${num}`);
            if (anchor) {
                showDiffView(anchor, entry.content, result.trim(), {
                    id: `se-br-diff-${num}`,
                    onAccept: (newText) => {
                        entry.content = newText.trim();
                        state.modified.add(num);
                        persistState();
                        renderTable();
                        if (statusEl) { statusEl.textContent = 'Saved ✓'; statusEl.style.color = '#a6e22e'; }
                    },
                    onCancel: () => {
                        if (statusEl) { statusEl.textContent = 'Discarded'; statusEl.style.color = '#75715e'; }
                    },
                });
            }
            if (statusEl) { statusEl.textContent = 'Ready ✓'; statusEl.style.color = '#a6e22e'; }
        } else if (_panel) {
            if (statusEl) { statusEl.textContent = 'No response'; statusEl.style.color = '#f92672'; }
        }
    } catch (err) {
        console.error('[SE] Bulk refine error:', err);
        if (statusEl && _panel) { statusEl.textContent = 'Error'; statusEl.style.color = '#f92672'; }
    }
}

