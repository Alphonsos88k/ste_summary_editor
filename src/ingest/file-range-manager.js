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
import { loadTemplate, fillTemplate } from '../core/template-loader.js';
import { TEMPLATES, FILE_SIZE_LIMIT_KB } from '../core/constants.js';
import {
    estimateRangeSizeKB, rangeExceedsLimit, nextRangeColor, suggestNextFilename,
} from './file-ranges.js';

/** @type {HTMLElement|null} */
let _panel = null;

/** @type {string|null} */
let _splitFormTmpl = null;

/** @type {string|null} */
let _newFileTmpl = null;

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
    if (newBtn) newBtn.onclick = () => _showInlineNewFileForm().then(() => { _sortRanges(); persistState(); _render(); });
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

async function _showSplitForm(key) {
    _panel.querySelectorAll('.se-frm-split-form').forEach(el => el.remove());
    _panel.querySelectorAll('.se-frm-new-form').forEach(el => el.remove());

    const range = state.fileRanges.get(key);
    if (!range || range.entryNums.length < 2) return;

    if (!_splitFormTmpl) _splitFormTmpl = await loadTemplate(TEMPLATES.FRM_SPLIT_FORM);

    const sourceRow = _panel.querySelector(`tr[data-key="${CSS.escape(key)}"]`);
    if (!sourceRow) return;

    const nums = [...range.entryNums].sort((a, b) => a - b);
    const optionsHtml = nums.slice(0, -1).map(n => `<option value="${n}">#${n}</option>`).join('');
    const formRow = document.createElement('tr');
    formRow.className = 'se-frm-split-form';
    formRow.dataset.key = key;
    formRow.innerHTML = fillTemplate(_splitFormTmpl, { key: escHtml(key), optionsHtml });
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

// ─── Orphan detection ─────────────────────────────────────────────────────────

function _findOrphanEntries() {
    const ranged = new Set([...state.fileRanges.values()].flatMap(r => r.entryNums));
    return [...state.entries.keys()].filter(n => !ranged.has(n)).sort((a, b) => a - b);
}

// ─── Inline new-file form (shared by + New File and Auto-balance Part 3) ──────

/**
 * Append an inline form row to the table allowing the user to name a new file.
 * Resolves with the confirmed key name, or null if cancelled.
 * If `overflow` is provided, the new range is pre-populated with those entry nums.
 *
 * @param {object} [opts]
 * @param {number[]} [opts.overflow] - Entry nums to assign to the new range on confirm.
 * @param {string}  [opts.label]     - Optional label hint shown in the form.
 * @returns {Promise<string|null>}
 */
async function _showInlineNewFileForm({ overflow = [], label = '' } = {}) {
    _panel.querySelectorAll('.se-frm-new-form').forEach(el => el.remove());
    _panel.querySelectorAll('.se-frm-split-form').forEach(el => el.remove());

    if (!_newFileTmpl) _newFileTmpl = await loadTemplate(TEMPLATES.FRM_NEW_FILE);

    const suggested = suggestNextFilename([...state.fileRanges.keys()]);
    const hint = label ? ` <span style="color:#75715e;font-size:0.8em;">(${escHtml(label)})</span>` : '';

    const formRow = document.createElement('tr');
    formRow.className = 'se-frm-new-form';
    formRow.innerHTML = fillTemplate(_newFileTmpl, { suggested: escHtml(suggested), hint });

    const tbody = _panel.querySelector('#se-frm-rows');
    tbody.appendChild(formRow);

    const nameInput = formRow.querySelector('.se-frm-new-name-input');
    const errSpan   = formRow.querySelector('.se-frm-new-err');
    nameInput.focus();
    nameInput.select();

    return new Promise(resolve => {
        const confirm = () => {
            const name = nameInput.value.trim();
            if (!name) return;
            if (state.fileRanges.has(name)) {
                errSpan.textContent = `"${name}" already exists`;
                errSpan.style.display = 'inline';
                return;
            }
            state.fileRanges.set(name, { color: nextRangeColor(), entryNums: [...overflow].sort((a, b) => a - b), label: name });
            formRow.remove();
            resolve(name);
        };
        const cancel = () => { formRow.remove(); resolve(null); };

        formRow.querySelector('.se-frm-new-confirm').onclick = confirm;
        formRow.querySelector('.se-frm-new-cancel').onclick = cancel;
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') confirm();
            if (e.key === 'Escape') cancel();
        });
        nameInput.addEventListener('input', () => { errSpan.style.display = 'none'; });
    });
}

// ─── Auto-balance ─────────────────────────────────────────────────────────────

async function _autoBalance() {
    if (!state.fileRanges.size) return;
    await _balancePhase0Orphans();
    const allNums = [...state.fileRanges.values()].flatMap(r => r.entryNums).sort((a, b) => a - b);
    if (allNums.length === 0) return;
    _balancePhase1EvenDist(allNums);
    _balancePhase2SizeShift();
    await _balancePhase3Split();
    _sortRanges();
    persistState();
    _render();
}

async function _balancePhase0Orphans() {
    const orphans = _findOrphanEntries();
    if (orphans.length === 0) return;
    const suffix   = orphans.length > 20 ? ` … (+${orphans.length - 20} more)` : '';
    const entryList = orphans.slice(0, 20).map(n => `#${n}`).join(', ') + suffix;
    const tbody  = _panel.querySelector('#se-frm-rows');
    const infoRow = document.createElement('tr');
    infoRow.className = 'se-frm-new-form';
    infoRow.innerHTML = `<td colspan="5" class="se-frm-split-td" style="color:#fd971f;font-size:0.82em;padding:6px 10px;">
        Unassigned entries found: ${escHtml(entryList)}. Name a file to collect them, or Cancel to skip.
    </td>`;
    tbody.appendChild(infoRow);
    await new Promise(r => setTimeout(r, 0));
    await _showInlineNewFileForm({ overflow: orphans, label: 'orphans' });
    infoRow.remove();
    _sortRanges();
    persistState();
    _render();
}

function _balancePhase1EvenDist(allNums) {
    const rangeKeys = [...state.fileRanges.keys()];
    const n     = rangeKeys.length;
    const chunk = Math.ceil(allNums.length / n);
    for (let i = 0; i < n; i++) {
        state.fileRanges.get(rangeKeys[i]).entryNums = allNums.slice(i * chunk, (i + 1) * chunk);
    }
    _render();
}

function _balancePhase2SizeShift() {
    let changed = true;
    let guard   = 0;
    while (changed && guard++ < 200) {
        changed = false;
        const keys = [...state.fileRanges.keys()];
        for (let i = 0; i < keys.length - 1; i++) {
            const src  = state.fileRanges.get(keys[i]);
            const dest = state.fileRanges.get(keys[i + 1]);
            if (estimateRangeSizeKB(src.entryNums) <= FILE_SIZE_LIMIT_KB) continue;
            const sorted = [...src.entryNums].sort((a, b) => a - b);
            while (estimateRangeSizeKB(src.entryNums) > FILE_SIZE_LIMIT_KB) {
                const last = sorted[sorted.length - 1];
                if (estimateRangeSizeKB([last, ...dest.entryNums]) > FILE_SIZE_LIMIT_KB) break;
                sorted.pop();
                src.entryNums  = [...sorted];
                dest.entryNums = [...dest.entryNums, last].sort((a, b) => a - b);
                changed = true;
            }
        }
    }
    _render();
}

async function _balancePhase3Split() {
    const overKeys = [...state.fileRanges.keys()].filter(
        k => estimateRangeSizeKB(state.fileRanges.get(k).entryNums) > FILE_SIZE_LIMIT_KB
    );
    for (const key of overKeys) {
        const range = state.fileRanges.get(key);
        if (!range) continue;
        const sorted = [...range.entryNums].sort((a, b) => a - b);
        let splitAt = 0;
        while (splitAt < sorted.length - 1 &&
               estimateRangeSizeKB(sorted.slice(0, splitAt + 1)) <= FILE_SIZE_LIMIT_KB) {
            splitAt++;
        }
        if (splitAt === 0) splitAt = 1;
        const overflow = sorted.slice(splitAt);
        if (overflow.length === 0) continue;
        range.entryNums = sorted.slice(0, splitAt);
        const newKey = await _showInlineNewFileForm({ overflow, label: `overflow from ${key}` });
        if (!newKey) { range.entryNums = sorted; break; }
        _sortRanges();
        _render();
    }
}
