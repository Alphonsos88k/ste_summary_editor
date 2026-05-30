/**
 * @module files-panel
 * @description Floating assignment panel for ingested files.
 *
 * Opened by clicking the "Ingested Files" drawer header title.
 * Shows all loaded files with a unified assignment <select> per non-entry file.
 * Supported assignments: None, Summary Related, Character Notes, World Details,
 * Personalities, Timeline Notes, Others.
 *
 * Empty files (0-byte) show a yellow "empty" badge and skip the assignment select.
 * Unassigned non-entry files show a per-row ! badge.
 * The panel header shows a circular ! button when any files need attention.
 */

import { state } from '../core/state.js';
import { toggleTimelineFile } from '../analysis/timeline-analysis.js';
import { escHtml, escAttr, makeDraggable, spawnPanel, registerPanel } from '../core/utils.js';
import { TEMPLATES } from '../core/constants.js';
import { loadTemplate } from '../core/template-loader.js';

/** All assignment options for non-entry files (none = unassigned). */
export const SUPP_CATEGORIES = [
    { value: 'summary-related',  label: 'Summary Related'  },
    { value: 'character-notes',  label: 'Character Notes'  },
    { value: 'personalities',    label: 'Personalities'    },
    { value: 'world-details',    label: 'World Details'    },
    { value: 'timeline-notes',   label: 'Timeline Notes'   },
    { value: 'others',           label: 'Others'           },
];

/** @type {HTMLElement|null} */
let _panel = null;
/** @type {HTMLElement|null} */
let _attentionDialog = null;

// ─── Public API ──────────────────────────────────────────────

export async function openFilesPanel() {
    if (_panel) { _renderRows(); return; }

    const overlay = document.getElementById('se-modal-overlay');
    if (!overlay) return;

    const tmpl = await loadTemplate(TEMPLATES.FILES_PANEL);
    _panel = document.createElement('div');
    _panel.id = 'se-files-panel';
    _panel.className = 'se-files-panel';
    _panel.innerHTML = tmpl;
    overlay.appendChild(_panel);

    const drawer = document.getElementById('se-file-drawer');
    if (drawer?.classList.contains('open')) {
        const drawerRect  = drawer.getBoundingClientRect();
        const overlayRect = overlay.getBoundingClientRect();
        _panel.style.left = Math.max(8, drawerRect.right - overlayRect.left + 10) + 'px';
        _panel.style.top  = Math.max(8, drawerRect.top   - overlayRect.top) + 'px';
        makeDraggable(_panel, _panel.querySelector('.se-fp-header'));
        registerPanel(_panel);
    } else {
        spawnPanel(_panel, overlay, '.se-fp-header', 360, 380);
    }
    _bindEvents();
    _renderRows();
}

export function closeFilesPanel() {
    _closeAttentionDialog();
    _panel?.remove();
    _panel = null;
}

export function toggleFilesPanel() {
    if (_panel) { closeFilesPanel(); return; }
    openFilesPanel();
}

export function refreshFilesPanel() {
    if (_panel) _renderRows();
    else _updateAttentionBadge(); // keep drawer badge in sync even when popup is closed
}

/**
 * Toggle the files-needing-attention dialog open/closed.
 * Called from both the popup panel button and the sidebar drawer button.
 */
export function toggleAttentionDialog() {
    _toggleAttentionDialog();
}

// ─── Private helpers ─────────────────────────────────────────

function _bindEvents() {
    _panel.querySelector('.se-fp-close').addEventListener('click', closeFilesPanel);
    _panel.addEventListener('change', _handleChange);
    document.addEventListener('se:supplementary-changed', _onSuppChanged);
}

function _onSuppChanged() {
    _renderRows();
    _renderAttentionDialog();
}

function _handleChange(e) {
    const sel = e.target.closest('select.se-fp-assign-select');
    if (sel) _handleAssignChange(sel);
}

function _handleAssignChange(sel) {
    const row = sel.closest('.se-fp-file-row');
    if (!row) return;
    const filename = row.dataset.file;
    const category = sel.value; // 'none' or a category value

    const existing = state.supplementaryFiles.get(filename);

    // Manage timelineFiles toggle
    const wasTl = state.timelineFiles.has(filename);
    const isTl  = category === 'timeline-notes';
    if (isTl && !wasTl)  toggleTimelineFile(filename);
    if (!isTl && wasTl)  toggleTimelineFile(filename);

    if (category && category !== 'none') {
        const rawContent = state.fileRawContent.get(filename) || '';
        /** @type {SuppFile} */
        const suppFile = {
            name:          filename,
            category,
            content:       rawContent,
            editedContent: existing?.editedContent ?? rawContent,
            date:          existing?.date     ?? '',
            time:          existing?.time     ?? '',
            location:      existing?.location ?? '',
            notes:         existing?.notes    ?? '',
        };
        state.supplementaryFiles.set(filename, suppFile);
    } else {
        state.supplementaryFiles.delete(filename);
    }

    document.dispatchEvent(new CustomEvent('se:supplementary-changed'));
    _renderRows();
}

function _renderRows() {
    _updateAttentionBadge(); // always run — drawer badge must update even when popup is closed

    const body = document.getElementById('se-fp-body');
    if (!body) return;

    if (state.files.length === 0) {
        body.innerHTML = '<div class="se-fp-empty">No files ingested yet.</div>';
        return;
    }

    body.innerHTML = state.files.map(file => _buildFileRow(file)).join('');
}

function _unassignedCount() {
    return state.files.filter(f =>
        f.isSupplementaryCandidate &&
        !f.isEmpty &&
        !state.supplementaryFiles.has(f.name)
    ).length;
}

function _updateAttentionBadge() {
    const count = _unassignedCount();
    const drawerBtn = document.getElementById('se-file-drawer-attn');
    if (drawerBtn) {
        drawerBtn.style.display = count > 0 ? '' : 'none';
        drawerBtn.textContent = count > 0 ? `! ${count}` : '';
    }
}

function _fileStatusIcon(file, isAssigned) {
    if (file.problematic)              return { icon: '?',       cls: 'se-fp-status-warn'          };
    if (file.isSupplementaryCandidate) return isAssigned
        ? { icon: '&#10003;', cls: 'se-fp-status-supp-assigned' }
        : { icon: '&#9432;',  cls: 'se-fp-status-supp'          };
    if (!file.valid)                   return { icon: '&#9432;', cls: 'se-fp-status-invalid'        };
    return { icon: '&#10003;', cls: '' };
}

function _buildAssignSelect(file, suppEntry) {
    const current = suppEntry?.category || 'none';
    const opts = SUPP_CATEGORIES.map(c => {
        const sel = current === c.value ? 'selected' : '';
        return `<option value="${c.value}" ${sel}>${c.label}</option>`;
    }).join('');
    return `<select class="se-fp-assign-select" title="Assign category">
        <option value="none"${current === 'none' ? ' selected' : ''}>— None —</option>
        ${opts}
    </select>`;
}

function _buildFileRow(file) {
    const suppEntry  = state.supplementaryFiles.get(file.name);
    const isAssigned = !!suppEntry?.category;

    const { icon: statusIcon, cls: statusClass } = _fileStatusIcon(file, isAssigned);

    let rowClass = '';
    if (isAssigned) rowClass = ' se-fp-supplementary';
    else if (suppEntry) rowClass = ' se-fp-supp-pending';

    const countBadge = file.entryCount > 0
        ? `<span class="se-fp-count">${file.entryCount}</span>` : '';

    // Valid summary entry files — no assignment UI
    if (file.valid) {
        return `
        <div class="se-fp-file-row" data-file="${escAttr(file.name)}">
            <div class="se-fp-file-info">
                <span class="se-fp-status ${statusClass}">${statusIcon}</span>
                <span class="se-fp-filename">${escHtml(file.name)}</span>
                ${countBadge}
            </div>
        </div>`;
    }

    // Empty file — yellow badge only, no assignment select
    if (file.isEmpty) {
        return `
        <div class="se-fp-file-row" data-file="${escAttr(file.name)}">
            <div class="se-fp-file-info">
                <span class="se-fp-status se-fp-status-warn">&#9432;</span>
                <span class="se-fp-filename">${escHtml(file.name)}</span>
                <span class="se-fp-empty-badge">empty</span>
            </div>
        </div>`;
    }

    const needsLabel = file.isSupplementaryCandidate && !isAssigned;
    const urgencyBadge = needsLabel
        ? '<span class="se-urgency-dot" title="Needs category assignment">!</span>' : '';

    const assignedLabel = isAssigned
        ? `<span class="se-fp-assigned-label">${escHtml(_suppLabel(suppEntry.category))}</span>` : '';

    return `
        <div class="se-fp-file-row${rowClass}" data-file="${escAttr(file.name)}">
            <div class="se-fp-file-info">
                <span class="se-fp-status ${statusClass}">${statusIcon}</span>
                <span class="se-fp-filename">${escHtml(file.name)}</span>
                ${countBadge}${assignedLabel}${urgencyBadge}
            </div>
            <div class="se-fp-assign-wrap">
                ${_buildAssignSelect(file, suppEntry)}
            </div>
        </div>`;
}

function _suppLabel(value) {
    return SUPP_CATEGORIES.find(c => c.value === value)?.label ?? value;
}

// ─── Attention dialog ─────────────────────────────────────────

async function _toggleAttentionDialog() {
    if (_attentionDialog) { _closeAttentionDialog(); return; }

    const overlay = document.getElementById('se-modal-overlay');
    if (!overlay) return;

    const tmpl = await loadTemplate(TEMPLATES.FILES_ATTENTION_DIALOG);
    _attentionDialog = document.createElement('div');
    _attentionDialog.id = 'se-fp-attention-dialog';
    _attentionDialog.className = 'se-fp-attention-dialog';
    _attentionDialog.innerHTML = tmpl;
    overlay.appendChild(_attentionDialog);

    const panelRect   = _panel?.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    if (panelRect) {
        _attentionDialog.style.left = Math.max(8, panelRect.right - overlayRect.left + 10) + 'px';
        _attentionDialog.style.top  = Math.max(8, panelRect.top   - overlayRect.top) + 'px';
    } else {
        spawnPanel(_attentionDialog, overlay, '.se-fp-attn-header', 320, 260);
    }
    makeDraggable(_attentionDialog, _attentionDialog.querySelector('.se-fp-attn-header'));
    registerPanel(_attentionDialog);

    _attentionDialog.querySelector('.se-fp-attn-close').addEventListener('click', _closeAttentionDialog);
    _renderAttentionDialog();
}

function _closeAttentionDialog() {
    _attentionDialog?.remove();
    _attentionDialog = null;
}

function _renderAttentionDialog() {
    if (!_attentionDialog) return;
    const tbody = _attentionDialog.querySelector('#se-fp-attn-rows');
    if (!tbody) return;

    const candidates = state.files.filter(f => f.isSupplementaryCandidate && !f.isEmpty);

    if (candidates.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="se-fp-attn-none">No supplementary files loaded.</td></tr>';
        return;
    }

    tbody.innerHTML = candidates.map(file => {
        const suppEntry = state.supplementaryFiles.get(file.name);
        const isAssigned = !!suppEntry?.category;
        const statusIcon = isAssigned
            ? '<span class="se-fp-attn-check">&#10003;</span>'
            : '<span class="se-urgency-dot">!</span>';
        const label = isAssigned ? escHtml(_suppLabel(suppEntry.category)) : '<span class="se-fp-attn-unset">unassigned</span>';
        return `<tr class="${isAssigned ? 'se-fp-attn-row-done' : 'se-fp-attn-row-pending'}">
            <td class="se-fp-attn-status">${statusIcon}</td>
            <td class="se-fp-attn-name" title="${escAttr(file.name)}">${escHtml(file.name)}</td>
            <td class="se-fp-attn-label">${label}</td>
        </tr>`;
    }).join('');

    // Auto-close if everything is assigned
    if (candidates.every(f => !!state.supplementaryFiles.get(f.name)?.category)) {
        setTimeout(_closeAttentionDialog, 1200);
    }
}
