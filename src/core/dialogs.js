/**
 * @module dialogs
 * @description Styled replacements for browser-native alert / confirm / prompt.
 * All three return Promises and render as draggable panels matching the
 * Find & Replace panel style (se-find-replace / se-fr-header / se-fr-body).
 */

import { escHtml, escAttr, spawnPanel } from './utils.js';

function _build(title, bodyHtml, width = 360) {
    const overlay = document.getElementById('se-modal-overlay') || document.body;
    const el = document.createElement('div');
    el.className = 'se-find-replace se-custom-dialog';
    el.style.width = width + 'px';
    el.innerHTML =
        `<div class="se-fr-header">` +
            `<span class="se-fr-title">${escHtml(title)}</span>` +
            `<button class="se-close-circle se-cd-dismiss">&times;</button>` +
        `</div>` +
        `<div class="se-fr-body">${bodyHtml}</div>`;
    overlay.appendChild(el);
    spawnPanel(el, overlay, '.se-fr-header', width, 180);
    return el;
}

/**
 * Styled alert panel. Resolves when dismissed.
 * @param {string} message
 * @param {string} [title]
 * @returns {Promise<void>}
 */
export function seAlert(message, title = 'Summary Editor') {
    return new Promise(resolve => {
        const el = _build(title,
            `<p class="se-cd-msg">${escHtml(message)}</p>` +
            `<div class="se-cd-actions">` +
                `<button class="se-btn se-btn-primary se-btn-sm se-cd-ok">OK</button>` +
            `</div>`
        );
        const done = () => { el.remove(); resolve(); };
        el.querySelector('.se-cd-ok').addEventListener('click', done);
        el.querySelector('.se-cd-dismiss').addEventListener('click', done);
        el.addEventListener('keydown', e => { if (e.key === 'Escape' || e.key === 'Enter') done(); });
        el.setAttribute('tabindex', '-1');
        el.focus();
    });
}

/**
 * Styled confirm panel. Resolves true (confirm) or false (cancel/dismiss).
 * @param {string} message
 * @param {{ title?: string, danger?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
export function seConfirm(message, { title = 'Confirm', danger = false } = {}) {
    return new Promise(resolve => {
        const okCls = `se-btn se-btn-sm se-cd-ok${danger ? ' se-btn-danger' : ' se-btn-primary'}`;
        const el = _build(title,
            `<p class="se-cd-msg">${escHtml(message)}</p>` +
            `<div class="se-cd-actions">` +
                `<button class="se-btn se-btn-sm se-cd-cancel">Cancel</button>` +
                `<button class="${okCls}">Confirm</button>` +
            `</div>`
        );
        const done = v => { el.remove(); resolve(v); };
        el.querySelector('.se-cd-ok').addEventListener('click', () => done(true));
        el.querySelector('.se-cd-cancel').addEventListener('click', () => done(false));
        el.querySelector('.se-cd-dismiss').addEventListener('click', () => done(false));
        el.addEventListener('keydown', e => { if (e.key === 'Escape') done(false); });
        el.setAttribute('tabindex', '-1');
        el.focus();
    });
}

/**
 * Styled prompt panel. Resolves with the entered string or null if cancelled.
 * @param {string} label
 * @param {string} [defaultValue]
 * @param {string} [title]
 * @returns {Promise<string|null>}
 */
export function sePrompt(label, defaultValue = '', title = 'Summary Editor') {
    return new Promise(resolve => {
        const el = _build(title,
            `<p class="se-cd-msg">${escHtml(label)}</p>` +
            `<input class="se-fr-input se-cd-input" type="text" value="${escAttr(String(defaultValue))}" />` +
            `<div class="se-cd-actions">` +
                `<button class="se-btn se-btn-sm se-cd-cancel">Cancel</button>` +
                `<button class="se-btn se-btn-primary se-btn-sm se-cd-ok">OK</button>` +
            `</div>`
        );
        const input = el.querySelector('.se-cd-input');
        const done = v => { el.remove(); resolve(v); };
        el.querySelector('.se-cd-ok').addEventListener('click', () => done(input.value));
        el.querySelector('.se-cd-cancel').addEventListener('click', () => done(null));
        el.querySelector('.se-cd-dismiss').addEventListener('click', () => done(null));
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') done(input.value);
            if (e.key === 'Escape') done(null);
        });
        setTimeout(() => { input.focus(); input.select(); }, 30);
    });
}
