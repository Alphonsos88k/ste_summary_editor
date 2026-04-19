/**
 * @module conflict-review
 * @description Draggable Conflict Review panel for the Edit tab.
 *
 * Lists all entries in state.conflicts sorted by severity (error → warning → info → ok).
 * Each row shows: entry number, content excerpt, severity chip, feedback text.
 * Clicking a row opens the Content Editor for that entry.
 * Severity filter buttons narrow the visible list.
 */

import { state } from '../core/state.js';
import { escHtml, spawnPanel } from '../core/utils.js';
import { loadTemplate, fillTemplate } from '../core/template-loader.js';
import { TEMPLATES, SEVERITY, SEV_CSS } from '../core/constants.js';

/** @type {jQuery|null} Cached panel element. */
let $panel = null;

/** @type {Function|null} Callback to open Content Editor for a given entry number. */
let _openEditorCallback = null;

const SEV_ORDER = { error: 0, warning: 1, info: 2, ok: 3 };

/**
 * Set the callback used to open the Content Editor.
 * Called from index.js so the module doesn't need to import it directly.
 * @param {Function} fn - fn(num: number) => void
 */
export function setConflictReviewEditorCallback(fn) {
    _openEditorCallback = fn;
}

/**
 * Build a single conflict row HTML string.
 * @param {number} num - Entry number.
 * @param {object} item - Conflict feedback item from state.conflicts[num][0].
 * @returns {string}
 */
function buildRow(num, item) {
    const entry = state.entries.get(num);
    const excerpt = entry
        ? escHtml((entry.content || '').slice(0, 120).trim()) + (entry.content?.length > 120 ? '&hellip;' : '')
        : '<em>Entry not found</em>';

    const sev = item.severity || 'warning';
    const sevLabel = sev.charAt(0).toUpperCase() + sev.slice(1);
    const sevCls = SEV_CSS[sev] || '';

    const feedbackLines = (item.feedback || item.criticism || []);
    const feedbackHtml = feedbackLines.length
        ? feedbackLines.map(f => `<div class="se-crp-feedback-line">${escHtml(f)}</div>`).join('')
        : '';

    return `<div class="se-crp-item" data-crp-num="${num}" data-crp-sev="${escHtml(sev)}">
        <div class="se-crp-item-header">
            <span class="se-crp-num">#${num}</span>
            <span class="se-crp-sev-chip ${sevCls}">${sevLabel}</span>
            <button class="se-btn se-btn-sm se-crp-fix-btn" data-crp-num="${num}" title="Open Content Editor for this entry">&#x270E; Fix</button>
        </div>
        <div class="se-crp-excerpt">${excerpt}</div>
        ${feedbackHtml ? `<div class="se-crp-feedback">${feedbackHtml}</div>` : ''}
    </div>`;
}

/**
 * Build all conflict items HTML sorted by severity.
 * @returns {{ html: string, countAll: number, countError: number, countWarn: number, countInfo: number }}
 */
function buildItems() {
    const entries = Object.entries(state.conflicts || {})
        .map(([numStr, items]) => ({ num: Number(numStr), item: items[0] || {} }))
        .filter(({ num }) => state.entries.has(num))
        .sort((a, b) => {
            const sevA = SEV_ORDER[a.item.severity] ?? 3;
            const sevB = SEV_ORDER[b.item.severity] ?? 3;
            return sevA !== sevB ? sevA - sevB : a.num - b.num;
        });

    const html = entries.map(({ num, item }) => buildRow(num, item)).join('');
    const countError = entries.filter(e => e.item.severity === 'error').length;
    const countWarn  = entries.filter(e => e.item.severity === 'warning').length;
    const countInfo  = entries.filter(e => e.item.severity === 'info').length;

    return { html, countAll: entries.length, countError, countWarn, countInfo };
}

/**
 * Apply a severity filter to the panel list.
 * @param {string} filter - 'all' | 'error' | 'warning' | 'info'
 */
function applyFilter(filter) {
    if (!$panel) return;
    $panel.find('.se-crp-item').each(function () {
        const sev = $(this).data('crp-sev');
        const show = filter === 'all' || sev === filter;
        $(this).toggle(show);
    });
    $panel.find('.se-crp-filter-btn').removeClass('active');
    $panel.find(`[data-crp-filter="${filter}"]`).addClass('active');
}

/**
 * Open (or focus) the Conflict Review floating panel.
 */
export async function openConflictReview() {
    if ($panel && $panel.length && document.body.contains($panel[0])) {
        return;
    }

    const tmpl = await loadTemplate(TEMPLATES.CONFLICT_REVIEW_PANEL);
    const { html: itemsHtml, countAll, countError, countWarn, countInfo } = buildItems();
    const hasItems = countAll > 0;

    const panelHtml = fillTemplate(tmpl, {
        itemsHtml,
        countAll,
        countError,
        countWarn,
        countInfo,
        emptyStyle: hasItems ? 'display:none;' : '',
    });

    const overlay = document.getElementById('se-modal-overlay');
    $panel = $(panelHtml).appendTo(overlay);
    spawnPanel($panel[0], overlay, '.se-float-panel-header');

    if (!hasItems) $panel.find('#se-crp-list').hide();

    $panel.find('.se-crp-close').on('click', () => {
        $panel.remove();
        $panel = null;
    });

    $panel.find('.se-crp-filter-btn').on('click', function () {
        applyFilter($(this).data('crp-filter'));
    });

    $panel.on('click', '.se-crp-fix-btn', function () {
        const num = Number($(this).data('crp-num'));
        if (_openEditorCallback) _openEditorCallback(num);
    });
}
