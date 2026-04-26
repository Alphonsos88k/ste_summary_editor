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

/**
 * Inject a diff view element after `anchor`.
 * Any existing element with the same `id` is removed first.
 *
 * @param {HTMLElement} anchor - Element to insert the diff view after
 * @param {string} original - Original text (may be empty for new entries)
 * @param {string} revised - AI-generated revised text
 * @param {{ onAccept: (text: string) => void, onCancel?: () => void, id?: string }} opts
 * @returns {HTMLElement} The created diff view element
 */
export function showDiffView(anchor, original, revised, { onAccept, onCancel, id = 'se-diff-view' }) {
    document.getElementById(id)?.remove();

    const hasOriginal = original.trim().length > 0;

    let leftHtml = '';
    let changedCount = 0;

    if (hasOriginal) {
        if (typeof Diff !== 'undefined') {
            const parts = Diff.diffLines(original, revised);
            changedCount = parts.reduce((n, p) => n + (p.added || p.removed ? (p.count ?? 1) : 0), 0);
            for (const part of parts) {
                if (part.added) continue;
                const cls = part.removed ? 'se-diff-line se-diff-removed' : 'se-diff-line se-diff-common';
                const rawLines = part.value.replace(/\n$/, '').split('\n');
                for (const line of rawLines) {
                    leftHtml += `<div class="${cls}">${escHtml(line) || '&nbsp;'}</div>`;
                }
            }
        } else {
            leftHtml = original.replace(/\n$/, '').split('\n')
                .map(l => `<div class="se-diff-line se-diff-common">${escHtml(l) || '&nbsp;'}</div>`)
                .join('');
        }
    }

    const countLabel = hasOriginal
        ? `${changedCount} line${changedCount === 1 ? '' : 's'} changed`
        : 'New content';

    const oldPanel = hasOriginal
        ? `<div class="se-diff-side se-diff-old"><div class="se-diff-side-label">Original</div><div class="se-diff-old-scroll">${leftHtml}</div></div>`
        : '';

    const el = document.createElement('div');
    el.id = id;
    el.className = `se-diff-view${hasOriginal ? '' : ' se-diff-new-only'}`;
    el.innerHTML =
        `<div class="se-diff-hdr">` +
            `<span class="se-diff-title">&#9654; Diff <span class="se-diff-count">${escHtml(countLabel)}</span></span>` +
            `<div class="se-diff-btns">` +
                `<button class="se-btn se-btn-sm se-diff-cancel-btn">Cancel</button>` +
                `<button class="se-btn se-btn-primary se-btn-sm se-diff-accept-btn">Accept</button>` +
            `</div>` +
        `</div>` +
        `<div class="se-diff-body">` +
            oldPanel +
            `<div class="se-diff-side se-diff-new">` +
                `<div class="se-diff-side-label">Revised</div>` +
                `<textarea class="se-diff-new-ta">${escHtml(revised)}</textarea>` +
            `</div>` +
        `</div>`;

    anchor.insertAdjacentElement('afterend', el);

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
