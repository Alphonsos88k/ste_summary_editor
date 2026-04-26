/**
 * @module dialogs
 * @description Styled replacements for browser-native alert / confirm / prompt.
 * All three return Promises and render as draggable panels matching the
 * Find & Replace panel style (se-find-replace / se-fr-header / se-fr-body).
 */

import { escHtml, escAttr, spawnPanel } from './utils.js';
import { loadTemplate, fillTemplate } from './template-loader.js';
import { TEMPLATES } from './constants.js';

/** @type {string|null} */
let _alertTmpl   = null;
/** @type {string|null} */
let _confirmTmpl = null;
/** @type {string|null} */
let _promptTmpl  = null;

async function _ensureTemplates() {
    if (_alertTmpl && _confirmTmpl && _promptTmpl) return;
    [_alertTmpl, _confirmTmpl, _promptTmpl] = await Promise.all([
        loadTemplate(TEMPLATES.CD_ALERT),
        loadTemplate(TEMPLATES.CD_CONFIRM),
        loadTemplate(TEMPLATES.CD_PROMPT),
    ]);
}

function _mount(html, width = 360) {
    const overlay = document.getElementById('se-modal-overlay') || document.body;
    const el = document.createElement('div');
    el.className = 'se-find-replace se-custom-dialog';
    el.style.width = width + 'px';
    el.innerHTML = html;
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
export async function seAlert(message, title = 'Summary Editor') {
    await _ensureTemplates();
    return new Promise(resolve => {
        const el = _mount(fillTemplate(_alertTmpl, {
            title:   escHtml(title),
            message: escHtml(message),
        }));
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
export async function seConfirm(message, { title = 'Confirm', danger = false } = {}) {
    await _ensureTemplates();
    return new Promise(resolve => {
        const okCls = `se-btn se-btn-sm se-cd-ok${danger ? ' se-btn-danger' : ' se-btn-primary'}`;
        const el = _mount(fillTemplate(_confirmTmpl, {
            title:   escHtml(title),
            message: escHtml(message),
            okCls,
        }));
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
export async function sePrompt(label, defaultValue = '', title = 'Summary Editor') {
    await _ensureTemplates();
    return new Promise(resolve => {
        const el = _mount(fillTemplate(_promptTmpl, {
            title:        escHtml(title),
            label:        escHtml(label),
            defaultValue: escAttr(String(defaultValue)),
        }));
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
