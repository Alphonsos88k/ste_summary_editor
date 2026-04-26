/**
 * @module file-range-manager
 * @description Output Planner — draggable panel for viewing and reorganising file ranges.
 *
 * Each range row shows: color swatch, editable label, entry count, size bar + KB estimate.
 * Actions per row: Split (disabled when empty), Merge↓ (disabled on last), Delete.
 * Footer: New File (creates next-pattern empty range), Auto-balance.
 * Panel has a max-height (~2/3 viewport) with overflow scroll on the table.
 */

import { state, persistState } from '../core/state.js';
import { makeDraggable, escHtml } from '../core/utils.js';
import { loadTemplate } from '../core/template-loader.js';
import { TEMPLATES, FILE_SIZE_LIMIT_KB } from '../core/constants.js';
import {
    estimateRangeSizeKB, rangeExceedsLimit, nextRangeColor, suggestNextFilename,
} from './file-ranges.js';

/** @type {HTMLElement|null} */
let _panel = null;

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Open the Output Planner panel (toggle if already open).
 */
export async function openFileRangeManager() {
    if (_panel) { closeFileRangeManager(); return; }
    const overlay = document.getElementById('se-modal-overlay');
    if (!overlay) return;

    const html = await loadTemplate(TEMPLATES.FILE_RANGE_MANAGER);
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    _panel = tmp.firstElementChild;
    overlay.appendChild(_panel);

    const overlayRect = overlay.getBoundingClientRect();
    _panel.style.left = Math.max(8, Math.round(overlayRect.width / 2 - 230)) + 'px';
    _panel.style.top  = '60px';

    makeDraggable(_panel, _panel.querySelector('.se-frm-header'));

    _panel.addEventListener('click', (e) => {
        if (e.target.classList.contains('se-frm-close')) closeFileRangeManager();
    });

    _render();
}

/**
 * Close and remove the Output Planner panel.
 */
export function closeFileRangeManager() {
    _panel?.remove();
    _panel = null;
}

// ─── Rendering ───────────────────────────────────────────────────────────────

function _render() {
    if (!_panel) return;
    const tbody   = _panel.querySelector('#se-frm-rows');
    const summary = _panel.querySelector('#se-frm-summary');
    if (!tbody) return;

    const ranges = [...state.fileRanges.entries()];

    if (ranges.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="se-frm-empty">No file ranges loaded.</td></tr>';
        if (summary) summary.textContent = '';
        _bindEvents();
        return;
    }

    tbody.innerHTML = ranges.map(([key, range], idx) => {
        const isEmpty  = range.entryNums.length === 0;
        const sizeKb   = estimateRangeSizeKB(range.entryNums);
        const over     = sizeKb > FILE_SIZE_LIMIT_KB;
        const pct      = Math.min(100, (sizeKb / FILE_SIZE_LIMIT_KB) * 100).toFixed(1);
        const isLast   = idx === ranges.length - 1;
        const overCls  = over ? ' se-frm-row--over' : '';
        const emptyCls = isEmpty ? ' se-frm-row--empty' : '';

        const splitDis = isEmpty ? ' disabled' : '';
        const mergeDis = isLast  ? ' disabled' : '';

        let barClr;
        if (over) { barClr = '#f92672'; }
        else if (pct > 75) { barClr = '#fd971f'; }
        else { barClr = '#a6e22e'; }

        let sizeDisplay;
        if (isEmpty) {
            sizeDisplay = '<span class="se-frm-size-txt se-frm-empty-lbl">empty</span>';
        } else {
            const overWarn  = over ? '&nbsp;&#9888;' : '';
            const overClass = over ? ' se-frm-over' : '';
            sizeDisplay = `<div class="se-frm-bar-wrap" title="${sizeKb} KB / ${FILE_SIZE_LIMIT_KB} KB limit">
                   <div class="se-frm-bar" style="width:${pct}%;background:${barClr};"></div>
               </div>
               <span class="se-frm-size-txt${overClass}">${sizeKb}&nbsp;KB${overWarn}</span>`;
        }

        return `<tr class="se-frm-row${overCls}${emptyCls}" data-key="${escHtml(key)}">
            <td class="se-frm-td-color">
                <span class="se-frm-swatch" style="background:${escHtml(range.color)};"></span>
            </td>
            <td class="se-frm-td-label">
                <input class="se-frm-label-input" value="${escHtml(range.label)}" data-key="${escHtml(key)}" />
            </td>
            <td class="se-frm-td-count">${isEmpty ? '—' : range.entryNums.length}</td>
            <td class="se-frm-td-size">${sizeDisplay}</td>
            <td class="se-frm-td-actions">
                <button class="se-btn se-btn-xs se-frm-btn-split" data-key="${escHtml(key)}"${splitDis}>Split</button>
                <button class="se-btn se-btn-xs se-frm-btn-merge" data-key="${escHtml(key)}"${mergeDis}>Merge&#8595;</button>
                <button class="se-btn se-btn-xs se-frm-btn-delete" data-key="${escHtml(key)}" title="Delete range — entries absorbed into previous">&#10005;</button>
            </td>
        </tr>`;
    }).join('');

    if (summary) {
        const total   = ranges.reduce((s, [, r]) => s + estimateRangeSizeKB(r.entryNums), 0);
        const overCnt = ranges.filter(([, r]) => rangeExceedsLimit(r.entryNums)).length;
        summary.innerHTML =
            `${ranges.length} ranges &middot; ~${Math.round(total * 100) / 100}&nbsp;KB total` +
            (overCnt ? ` &middot; <span class="se-frm-over">${overCnt} over limit</span>` : '');
    }

    _bindEvents();
}

function _bindEvents() {
    if (!_panel) return;

    _panel.querySelectorAll('.se-frm-label-input').forEach(input => {
        input.onchange = () => {
            const range = state.fileRanges.get(input.dataset.key);
            if (range) { range.label = input.value.trim() || input.dataset.key; persistState(); }
        };
    });

    _panel.querySelectorAll('.se-frm-btn-split').forEach(btn => {
        btn.onclick = () => _showSplitForm(btn.dataset.key);
    });

    _panel.querySelectorAll('.se-frm-btn-merge').forEach(btn => {
        btn.onclick = () => _mergeWithNext(btn.dataset.key);
    });

    _panel.querySelectorAll('.se-frm-btn-delete').forEach(btn => {
        btn.onclick = () => _deleteRange(btn.dataset.key);
    });

    const balBtn = _panel.querySelector('#se-frm-auto-balance');
    if (balBtn) balBtn.onclick = _autoBalance;

    const newBtn = _panel.querySelector('#se-frm-new-file');
    if (newBtn) newBtn.onclick = _showNewFileForm;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _sortRanges() {
    state.fileRanges = new Map(
        [...state.fileRanges.entries()].sort(([a], [b]) =>
            a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
        )
    );
}

// ─── Split form ───────────────────────────────────────────────────────────────

function _showSplitForm(key) {
    _panel.querySelectorAll('.se-frm-split-form').forEach(el => el.remove());
    _panel.querySelectorAll('.se-frm-new-form').forEach(el => el.remove());

    const range = state.fileRanges.get(key);
    if (!range || range.entryNums.length < 2) return;

    const sourceRow = _panel.querySelector(`tr[data-key="${CSS.escape(key)}"]`);
    if (!sourceRow) return;

    const nums = [...range.entryNums].sort((a, b) => a - b);
    const formRow = document.createElement('tr');
    formRow.className = 'se-frm-split-form';
    formRow.dataset.key = key;
    formRow.innerHTML = `
        <td colspan="5" class="se-frm-split-td">
            <div class="se-frm-split-inner">
                <label class="se-frm-split-lbl">Split after entry:</label>
                <select class="se-frm-split-sel">
                    ${nums.slice(0, -1).map(n => `<option value="${n}">#${n}</option>`).join('')}
                </select>
                <div class="se-frm-split-preview"></div>
                <div class="se-frm-split-actions">
                    <button class="se-btn se-btn-xs se-frm-split-ok" data-key="${escHtml(key)}">Split</button>
                    <button class="se-btn se-btn-xs se-frm-split-cancel">Cancel</button>
                </div>
            </div>
        </td>`;
    sourceRow.after(formRow);

    const sel     = formRow.querySelector('.se-frm-split-sel');
    const preview = formRow.querySelector('.se-frm-split-preview');

    const updatePreview = () => {
        const splitAfter = Number(sel.value);
        const splitIdx   = nums.indexOf(splitAfter);
        const part1 = nums.slice(0, splitIdx + 1);
        const part2 = nums.slice(splitIdx + 1);
        const s1 = estimateRangeSizeKB(part1);
        const s2 = estimateRangeSizeKB(part2);
        const w1 = s1 > FILE_SIZE_LIMIT_KB ? ' se-frm-over' : '';
        const w2 = s2 > FILE_SIZE_LIMIT_KB ? ' se-frm-over' : '';
        preview.innerHTML =
            `<span class="se-frm-prev-part${w1}">A: ${part1.length} entries, ~${s1}&nbsp;KB${w1 ? '&nbsp;&#9888;' : ''}</span>` +
            `<span class="se-frm-prev-part${w2}">B: ${part2.length} entries, ~${s2}&nbsp;KB${w2 ? '&nbsp;&#9888;' : ''}</span>`;
    };
    updatePreview();
    sel.onchange = updatePreview;

    formRow.querySelector('.se-frm-split-ok').onclick = () => _doSplitRange(key, Number(sel.value));
    formRow.querySelector('.se-frm-split-cancel').onclick = () => formRow.remove();
}

function _doSplitRange(key, splitAfter) {
    const range = state.fileRanges.get(key);
    if (!range) return;

    const nums     = [...range.entryNums].sort((a, b) => a - b);
    const splitIdx = nums.indexOf(splitAfter);
    if (splitIdx < 0 || splitIdx >= nums.length - 1) return;

    const part1 = nums.slice(0, splitIdx + 1);
    const part2 = nums.slice(splitIdx + 1);

    const newKey = suggestNextFilename([...state.fileRanges.keys()]);
    range.entryNums = part1;

    const newRanges = new Map();
    for (const [k, r] of state.fileRanges) {
        newRanges.set(k, r);
        if (k === key) {
            newRanges.set(newKey, { color: nextRangeColor(), entryNums: part2, label: newKey });
        }
    }
    state.fileRanges = newRanges;

    _sortRanges();
    persistState();
    _render();
}

// ─── Merge ────────────────────────────────────────────────────────────────────

function _mergeWithNext(key) {
    const keys  = [...state.fileRanges.keys()];
    const idx   = keys.indexOf(key);
    if (idx < 0 || idx >= keys.length - 1) return;

    const nextKey   = keys[idx + 1];
    const range     = state.fileRanges.get(key);
    const nextRange = state.fileRanges.get(nextKey);
    if (!range || !nextRange) return;

    range.entryNums = [...new Set([...range.entryNums, ...nextRange.entryNums])].sort((a, b) => a - b);
    state.fileRanges.delete(nextKey);

    _sortRanges();
    persistState();
    _render();
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Delete a range. Entries absorbed into the previous range, or next if first.
 * @param {string} key
 */
function _deleteRange(key) {
    _panel.querySelectorAll('.se-frm-split-form').forEach(el => el.remove());

    const keys  = [...state.fileRanges.keys()];
    const idx   = keys.indexOf(key);
    const dying = state.fileRanges.get(key);
    if (!dying) return;

    // Absorb into previous range (or next if this is the first)
    const targetKey = idx > 0 ? keys[idx - 1] : keys[idx + 1];
    if (targetKey && dying.entryNums.length > 0) {
        const target = state.fileRanges.get(targetKey);
        target.entryNums = [...new Set([...target.entryNums, ...dying.entryNums])].sort((a, b) => a - b);
    }

    state.fileRanges.delete(key);
    _sortRanges();
    persistState();
    _render();
}

// ─── New File form ────────────────────────────────────────────────────────────

function _showNewFileForm() {
    _panel.querySelectorAll('.se-frm-new-form').forEach(el => el.remove());
    _panel.querySelectorAll('.se-frm-split-form').forEach(el => el.remove());

    const suggested = suggestNextFilename([...state.fileRanges.keys()]);

    const formRow = document.createElement('tr');
    formRow.className = 'se-frm-new-form';
    formRow.innerHTML = `
        <td colspan="5" class="se-frm-split-td">
            <div class="se-frm-split-inner">
                <label class="se-frm-split-lbl">New file name:</label>
                <input class="se-frm-new-name-input" value="${escHtml(suggested)}" spellcheck="false" />
                <span class="se-frm-new-err" style="display:none;"></span>
                <div class="se-frm-split-actions">
                    <button class="se-btn se-btn-xs se-frm-new-confirm">Add</button>
                    <button class="se-btn se-btn-xs se-frm-new-cancel">Cancel</button>
                </div>
            </div>
        </td>`;

    // Append after the last data row (before any gap rows)
    const tbody = _panel.querySelector('#se-frm-rows');
    tbody.appendChild(formRow);

    const nameInput = formRow.querySelector('.se-frm-new-name-input');
    const errSpan   = formRow.querySelector('.se-frm-new-err');
    nameInput.focus();
    nameInput.select();

    formRow.querySelector('.se-frm-new-confirm').onclick = () => {
        const name = nameInput.value.trim();
        if (!name) return;
        if (state.fileRanges.has(name)) {
            errSpan.textContent = `"${name}" already exists`;
            errSpan.style.display = 'inline';
            return;
        }
        state.fileRanges.set(name, { color: nextRangeColor(), entryNums: [], label: name });
        _sortRanges();
        persistState();
        _render();
    };

    formRow.querySelector('.se-frm-new-cancel').onclick = () => formRow.remove();

    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') formRow.querySelector('.se-frm-new-confirm').click();
        if (e.key === 'Escape') formRow.remove();
    });

    nameInput.addEventListener('input', () => {
        errSpan.style.display = 'none';
    });
}

// ─── Auto-balance ─────────────────────────────────────────────────────────────

function _autoBalance() {
    const ranges  = [...state.fileRanges.entries()];
    if (ranges.length === 0) return;

    const allNums = ranges.flatMap(([, r]) => r.entryNums).sort((a, b) => a - b);
    if (allNums.length === 0) return;

    const n     = ranges.length;
    const chunk = Math.ceil(allNums.length / n);
    for (let i = 0; i < n; i++) {
        ranges[i][1].entryNums = allNums.slice(i * chunk, (i + 1) * chunk);
    }

    persistState();
    _render();
}
