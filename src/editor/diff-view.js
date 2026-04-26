/**
 * @module diff-view
 * @description Shared diff panel rendered after AI generates revised content.
 *
 * Shows original text (faint red, read-only) alongside revised text (faint green,
 * editable) so the user can review and tweak before accepting.
 * If original is empty (gap suggest, new entry), only the green side is shown.
 * Layout is side-by-side when wide enough, stacked otherwise.
 */

import { escHtml } from '../core/utils.js';
import { loadTemplate, fillTemplate } from '../core/template-loader.js';
import { TEMPLATES } from '../core/constants.js';

/** @type {string|null} */
let _tmpl = null;

function _lineDiv(cls, text) {
    return `<div class="${cls}">${escHtml(text) || '&nbsp;'}</div>`;
}

function _buildLeftHtml(parts) {
    return parts
        .filter(p => !p.added)
        .flatMap(part => {
            const cls = part.removed ? 'se-diff-line se-diff-removed' : 'se-diff-line se-diff-common';
            return part.value.replace(/\n$/, '').split('\n').map(l => _lineDiv(cls, l));
        })
        .join('');
}

function _plainLines(text) {
    return text.replace(/\n$/, '').split('\n')
        .map(l => _lineDiv('se-diff-line se-diff-common', l))
        .join('');
}

async function _ensureTemplate() {
    if (!_tmpl) _tmpl = await loadTemplate(TEMPLATES.DIFF_VIEW);
}

/**
 * Inject a diff view element after `anchor`.
 * Any existing element with the same `id` is removed first.
 *
 * @param {HTMLElement} anchor - Element to insert the diff view after
 * @param {string} original - Original text (may be empty for new entries)
 * @param {string} revised - AI-generated revised text
 * @param {{ onAccept: (text: string) => void, onCancel?: () => void, id?: string }} opts
 * @returns {Promise<HTMLElement>} The created diff view element
 */
export async function showDiffView(anchor, original, revised, { onAccept, onCancel, id = 'se-diff-view' }) {
    await _ensureTemplate();
    document.getElementById(id)?.remove();

    const hasOriginal = original.trim().length > 0;

    let leftHtml = '';
    let changedCount = 0;

    if (hasOriginal) {
        if (typeof Diff !== 'undefined') {
            const parts = Diff.diffLines(original, revised);
            changedCount = parts.reduce((n, p) => n + (p.added || p.removed ? (p.count ?? 1) : 0), 0);
            leftHtml = _buildLeftHtml(parts);
        } else {
            leftHtml = _plainLines(original);
        }
    }

    const lineSuffix = changedCount === 1 ? '' : 's';
    const countLabel = hasOriginal ? `${changedCount} line${lineSuffix} changed` : 'New content';

    const oldPanel = hasOriginal
        ? `<div class="se-diff-side se-diff-old"><div class="se-diff-side-label">Original</div><div class="se-diff-old-scroll">${leftHtml}</div></div>`
        : '';

    const viewCls = hasOriginal ? 'se-diff-view' : 'se-diff-view se-diff-new-only';
    const el = document.createElement('div');
    el.id = id;
    el.className = viewCls;
    el.innerHTML = fillTemplate(_tmpl, {
        countLabel:  escHtml(countLabel),
        oldPanel,
        revisedText: escHtml(revised),
    });

    anchor.after(el);

    el.querySelector('.se-diff-accept-btn').addEventListener('click', () => {
        onAccept(el.querySelector('.se-diff-new-ta').value);
        el.remove();
    });

    el.querySelector('.se-diff-cancel-btn').addEventListener('click', () => {
        onCancel?.();
        el.remove();
    });

    return el;
}
