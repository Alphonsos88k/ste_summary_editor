/**
 * @module llm-history
 * @description Session-only log of every LLM API call made by the extension.
 * Nothing is persisted — the log is cleared on page refresh (UI-state-is-ephemeral).
 *
 * Usage:
 *   import { logLLMCall } from '../core/llm-history.js';
 *   const raw = await callLLM(...);
 *   logLLMCall('Conflict Check', systemPrompt, raw);
 */

import { escHtml } from './utils.js';
import { loadTemplate } from './template-loader.js';
import { TEMPLATES } from './constants.js';

/** @type {Array<{id:number,ts:number,feature:string,prompt:string,response:string,tokens:number,status:'ok'|'error'}>} */
const _log = [];
let _nextId  = 1;
let _panel   = null;

const _TRUNC = 280;
const _REL   = t => {
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 5)   return 'just now';
    if (s < 60)  return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
};

/**
 * Record a completed LLM call.
 * @param {string} feature  Short label, e.g. "Conflict Check"
 * @param {string} prompt   Full system+user prompt text (or the user message)
 * @param {string|null} response  Raw response text, or null on error
 * @param {'ok'|'error'} [status]
 */
export function logLLMCall(feature, prompt, response, status = 'ok') {
    const tokens = Math.ceil((prompt.length + (response?.length ?? 0)) / 4);
    _log.push({ id: _nextId++, ts: Date.now(), feature, prompt, response: response ?? '', tokens, status });
    if (_panel) _refreshList();
    _updateBadge();
    document.dispatchEvent(new CustomEvent('se:llm-logged'));
}

/** Open or bring the Console History panel to front. */
export async function openLLMHistoryPanel() {
    if (_panel) { _panel.remove(); _panel = null; return; }

    const html = await loadTemplate(TEMPLATES.LLM_HISTORY_PANEL);
    _panel = document.createElement('div');
    _panel.id = 'se-llm-history-panel';
    _panel.className = 'se-llm-history-panel';
    _panel.innerHTML = html;
    document.body.appendChild(_panel);

    const rect = { left: window.innerWidth / 2 - 280, top: window.innerHeight / 2 - 220 };
    _panel.style.left = `${Math.max(8, rect.left)}px`;
    _panel.style.top  = `${Math.max(8, rect.top)}px`;

    const hdr = _panel.querySelector('.se-llm-hdr');
    if (hdr) {
        hdr.style.cursor = 'grab';
        let sx, sy, sl, st;
        hdr.addEventListener('pointerdown', e => {
            if (e.target.closest('button')) return;
            sx = e.clientX; sy = e.clientY;
            const r = _panel.getBoundingClientRect(); sl = r.left; st = r.top;
            hdr.setPointerCapture(e.pointerId);
            hdr.style.cursor = 'grabbing';
        });
        hdr.addEventListener('pointermove', e => {
            if (!hdr.hasPointerCapture(e.pointerId)) return;
            _panel.style.left = `${Math.max(0, sl + e.clientX - sx)}px`;
            _panel.style.top  = `${Math.max(0, st + e.clientY - sy)}px`;
        });
        hdr.addEventListener('pointerup', e => {
            if (hdr.hasPointerCapture(e.pointerId)) { hdr.releasePointerCapture(e.pointerId); hdr.style.cursor = 'grab'; }
        });
    }

    _panel.querySelector('#se-llm-close').addEventListener('click', () => { _panel?.remove(); _panel = null; });
    _panel.querySelector('#se-llm-clear').addEventListener('click', () => {
        _log.length = 0; _nextId = 1; _updateBadge(); _refreshList();
    });

    _refreshList();
}

/** Close the panel programmatically (e.g. on resetEditorState). */
export function closeLLMHistoryPanel() { _panel?.remove(); _panel = null; }

function _updateBadge() {
    const badge = document.getElementById('se-llm-history-badge');
    if (!badge) return;
    const count = _log.length;
    const label = count > 99 ? '99+' : String(count);
    badge.textContent    = count > 0 ? label : '';
    badge.style.display  = count > 0 ? '' : 'none';
}

function _refreshList() {
    const list = _panel?.querySelector('#se-llm-history-list');
    if (!list) return;
    if (!_log.length) {
        list.innerHTML = '<div class="se-llm-empty">No LLM calls yet this session.</div>';
        return;
    }
    list.innerHTML = [..._log].reverse().map(r => {
        const promptSnip = r.prompt.replace(/\s+/g, ' ').trim().slice(0, _TRUNC);
        const respSnip   = r.response.replace(/\s+/g, ' ').trim().slice(0, _TRUNC);
        const tokLabel   = r.tokens >= 1000 ? `~${(r.tokens / 1000).toFixed(1)}k tok` : `~${r.tokens} tok`;
        return `<div class="se-llm-entry${r.status === 'error' ? ' se-llm-entry-err' : ''}" data-llm-id="${r.id}">` +
            `<div class="se-llm-entry-head">` +
            `<span class="se-llm-feature">${escHtml(r.feature)}</span>` +
            `<span class="se-llm-tok">${tokLabel}</span>` +
            `<span class="se-llm-ts">${_REL(r.ts)}</span>` +
            `<button class="se-llm-expand" title="Toggle details" aria-expanded="false">&#9654;</button>` +
            `</div>` +
            `<div class="se-llm-detail" hidden>` +
            `<div class="se-llm-detail-lbl">Prompt</div>` +
            `<pre class="se-llm-detail-pre">${escHtml(promptSnip)}${r.prompt.length > _TRUNC ? '…' : ''}</pre>` +
            `<div class="se-llm-detail-lbl" style="margin-top:6px;">Response</div>` +
            `<pre class="se-llm-detail-pre">${escHtml(respSnip)}${r.response.length > _TRUNC ? '…' : ''}</pre>` +
            `</div></div>`;
    }).join('');

    list.querySelectorAll('.se-llm-expand').forEach(btn => {
        btn.addEventListener('click', () => {
            const detail = btn.closest('.se-llm-entry')?.querySelector('.se-llm-detail');
            if (!detail) return;
            const open = detail.hidden;
            detail.hidden = !open;
            btn.innerHTML = open ? '&#9660;' : '&#9654;';
            btn.setAttribute('aria-expanded', String(open));
        });
    });
}
