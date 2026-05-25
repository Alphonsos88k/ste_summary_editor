/**
 * @module chat-files-analyser
 * @description Cytoscape.js node canvas for the Analyse tab.
 * Chat files and summary entries appear as draggable nodes with edge-handle
 * docks; relationships drawn as colour-coded directed edges.
 */

import { state } from '../core/state.js';
import { escHtml } from '../core/utils.js';
import { registerPrompt } from '../core/system-prompts.js';
import { openSystemPromptHub } from '../core/system-prompts.js';

// ─── Prompt registration ──────────────────────────────────────

registerPrompt('chat-digest',    'Chat Digest — Pass 1',       '', { location: 'Chat Files › Analyse tab' });
registerPrompt('digest-refine',  'Chat Digest Refinement',     '', { location: 'Chat Files › Analyse tab' });
registerPrompt('entry-analysis', 'Entry Analysis — Pass 2',    '', { warnJson: true, location: 'Chat Files › Analyse tab' });

// ─── Module state ─────────────────────────────────────────────

let _cy          = null;
let _eh          = null;   // edgehandles instance
let _panel       = null;
let _files       = [];
let _activeFile  = null;   // only one chat file on canvas at a time
let _removeBtn   = null;   // floating × overlay
let _popPanels   = { files: null, entries: null };
let _edgeColorIdx = 0;

const _CDN_CY = 'https://cdn.jsdelivr.net/npm/cytoscape@3/dist/cytoscape.min.js';
const _CDN_EH = 'https://cdn.jsdelivr.net/npm/cytoscape-edgehandles@4/cytoscape-edgehandles.min.js';

const _EDGE_PALETTE = ['#a6e22e', '#66d9e8', '#f92672', '#fd971f', '#ae81ff', '#e6db74', '#66d9e8', '#cfcfc2'];

const _C = {
    file:  '#a6e22e',
    entry: '#66d9e8',
    bg:    '#1e1e18',
    sel:   '#fd971f',
};

// ─── Public API ──────────────────────────────────────────────

export async function initAnalyser(panel, files) {
    _panel = panel;
    _files = files ?? [];

    _renderFileListInto(_panel.querySelector('#se-cfm-an-file-list'));
    _renderEntryListInto(_panel.querySelector('#se-cfm-an-entry-list'));
    _bindPopOutButtons();

    const canvasEl = _panel.querySelector('#se-cfm-an-canvas');
    if (!canvasEl) return;

    _showMsg(canvasEl, 'Loading Cytoscape…');

    try {
        await _loadScript(_CDN_CY, () => window.cytoscape);
        await _loadScript(_CDN_EH, () => window.cytoscapeEdgehandles);
        window.cytoscape.use(window.cytoscapeEdgehandles);
    } catch {
        _showMsg(canvasEl, 'Failed to load canvas library — check internet connection.');
        return;
    }

    _cy = window.cytoscape({
        container: canvasEl,
        elements:  [],
        style:     _buildStyle(),
        layout:    { name: 'preset' },
        minZoom:   0.15,
        maxZoom:   3,
    });

    _showMsg(canvasEl, null);
    _initRemoveBtn(canvasEl);
    _initEdgeHandles();
    _bindToolbar();
    _bindNodeEvents();
    _bindEntryRefresh();
}

export function destroyAnalyser() {
    _eh?.disable?.();
    _cy?.destroy();
    _cy = _eh = null;
    _removeBtn?.remove();
    _removeBtn = null;
    _popPanels.files?.panel?.remove();
    _popPanels.entries?.panel?.remove();
    _popPanels   = { files: null, entries: null };
    _panel       = null;
    _files       = [];
    _activeFile  = null;
    _edgeColorIdx = 0;
}

/** Refresh the entries sidebar — call when entries state changes. */
export function refreshEntries() {
    const container = _popPanels.entries
        ? _popPanels.entries.panel.querySelector('#se-cfm-an-pop-entries')
        : _panel?.querySelector('#se-cfm-an-entry-list');
    if (container) _renderEntryListInto(container);
}

// ─── Node operations ─────────────────────────────────────────

export function addFileNode(fileName) {
    if (!_cy || _activeFile) return;
    const id = `file::${fileName}`;
    if (_cy.getElementById(id).length) return;

    const label = fileName.replace(/\.jsonl$/, '');
    _cy.add({ data: { id, label, type: 'file', fileName }, position: _nextPos('file') });

    _activeFile = fileName;
    _refreshFileButtons();
}

export function removeFileNode(fileName) {
    if (!_cy) return;
    _cy.remove(`[id = "file::${fileName}"]`);
    _cy.remove(`[source = "file::${fileName}"]`);
    if (_activeFile === fileName) {
        _activeFile = null;
        _refreshFileButtons();
    }
    _hideRemoveBtn();
}

export function addEntryNode(num) {
    if (!_cy) return;
    const id = `entry::${num}`;
    if (_cy.getElementById(id).length) return;

    const entry   = state.entries?.get(num);
    const snippet = entry ? String(entry.content ?? '').slice(0, 55).replace(/\n/g, ' ') : `Entry ${num}`;
    _cy.add({ data: { id, label: `#${num}`, snippet, type: 'entry', num }, position: _nextPos('entry') });
    _markAdded(`[data-an-add-entry="${num}"]`, true);
}

export function removeEntryNode(num) {
    if (!_cy) return;
    _cy.remove(`[id = "entry::${num}"]`);
    _cy.remove(`[target = "entry::${num}"]`);
    _markAdded(`[data-an-add-entry="${num}"]`, false);
    _hideRemoveBtn();
}

/** Draw a directed edge from a file node to an entry node (called by analysis pass). */
export function connectNodes(fileName, entryNum) {
    if (!_cy) return;
    const src = `file::${fileName}`;
    const tgt = `entry::${entryNum}`;
    const id  = `edge::${src}::${tgt}`;
    if (_cy.getElementById(id).length) return;
    if (!_cy.getElementById(src).length || !_cy.getElementById(tgt).length) return;
    const color = _nextEdgeColor();
    _cy.add({ data: { id, source: src, target: tgt, color } });
}

// ─── Sidebar renderers ────────────────────────────────────────

function _renderFileListInto(container) {
    if (!container) return;
    if (!_files.length) {
        container.innerHTML = '<div class="se-cfm-hint">No files found</div>';
        return;
    }
    container.innerHTML = _files.map(f => {
        const name    = f.file_name ?? '';
        const label   = name.replace(/\.jsonl$/, '');
        const onCanvas = _activeFile === name;
        return `<div class="se-cfm-an-node-item">` +
            `<span class="se-cfm-an-node-label" title="${escHtml(name)}">${escHtml(label)}</span>` +
            `<button class="se-cfm-an-add-btn${onCanvas ? ' added' : ''}" data-an-add-file="${escHtml(name)}">${onCanvas ? '×' : '+'}</button>` +
            `</div>`;
    }).join('');
    _updateFileListState(container);
    container.querySelectorAll('[data-an-add-file]').forEach(btn => {
        btn.addEventListener('click', () => {
            const fn = btn.dataset.anAddFile;
            if (btn.classList.contains('added')) removeFileNode(fn);
            else addFileNode(fn);
        });
    });
}

function _renderEntryListInto(container) {
    if (!container) return;
    const entries = [...(state.entries?.values() ?? [])];
    if (!entries.length) {
        container.innerHTML = '<div class="se-cfm-hint">No entries loaded</div>';
        return;
    }
    container.innerHTML = entries
        .sort((a, b) => a.num - b.num)
        .map(e => {
            const onCanvas = _cy?.getElementById(`entry::${e.num}`).length > 0;
            const snippet  = String(e.content ?? '').slice(0, 38).replace(/\n/g, ' ');
            return `<div class="se-cfm-an-node-item">` +
                `<span class="se-cfm-an-node-label" title="${escHtml(String(e.content ?? ''))}">` +
                `<span style="color:var(--se-cyan);margin-right:4px;">#${e.num}</span>${escHtml(snippet)}` +
                `</span>` +
                `<button class="se-cfm-an-add-btn${onCanvas ? ' added' : ''}" data-an-add-entry="${e.num}">${onCanvas ? '×' : '+'}</button>` +
                `</div>`;
        }).join('');
    container.querySelectorAll('[data-an-add-entry]').forEach(btn => {
        btn.addEventListener('click', () => {
            const num = Number(btn.dataset.anAddEntry);
            if (btn.classList.contains('added')) removeEntryNode(num);
            else addEntryNode(num);
        });
    });
}

// ─── Pop-out panels ───────────────────────────────────────────

function _bindPopOutButtons() {
    _panel?.querySelectorAll('[data-pop-section]').forEach(btn => {
        btn.addEventListener('click', () => _popOut(btn.dataset.popSection));
    });
}

function _popOut(type) {
    if (_popPanels[type]) return;

    const title   = type === 'files' ? 'Chat Files' : 'Entries';
    const listId  = `se-cfm-an-pop-${type}`;
    const pop     = document.createElement('div');
    pop.className = 'se-cfm-an-pop-panel';
    pop.innerHTML =
        `<div class="se-cfm-an-pop-hdr" id="se-cfm-an-pop-hdr-${type}">` +
        `<span>${escHtml(title)}</span>` +
        `<button class="se-cfm-an-pop-close" title="Restore to panel">&#x00D7;</button></div>` +
        `<div class="se-cfm-an-pop-body"><div class="se-cfm-an-${type === 'files' ? 'file' : 'entry'}-list" id="${listId}"></div></div>`;

    // Position near sidebar
    const sbRect = _panel?.querySelector('.se-cfm-an-sidebar')?.getBoundingClientRect();
    if (sbRect) {
        pop.style.left = `${sbRect.left + 4}px`;
        pop.style.top  = `${sbRect.top + (type === 'entries' ? 180 : 20)}px`;
    }

    document.body.appendChild(pop);

    if (type === 'files') _renderFileListInto(pop.querySelector(`#${listId}`));
    else _renderEntryListInto(pop.querySelector(`#${listId}`));

    const abort = _attachPopDrag(pop, `#se-cfm-an-pop-hdr-${type}`);
    pop.querySelector('.se-cfm-an-pop-close').addEventListener('click', () => _popIn(type));

    _popPanels[type] = { panel: pop, abort };
    _updateSidebarLayout();
}

function _popIn(type) {
    const entry = _popPanels[type];
    if (!entry) return;
    entry.abort?.abort();
    entry.panel.remove();
    _popPanels[type] = null;

    const listEl = _panel?.querySelector(type === 'files' ? '#se-cfm-an-file-list' : '#se-cfm-an-entry-list');
    if (type === 'files') _renderFileListInto(listEl);
    else _renderEntryListInto(listEl);

    _updateSidebarLayout();
}

function _updateSidebarLayout() {
    const sidebar = _panel?.querySelector('.se-cfm-an-sidebar');
    if (!sidebar) return;
    const fp = !!_popPanels.files;
    const ep = !!_popPanels.entries;
    sidebar.querySelector('#se-cfm-an-files-section')?.style.setProperty('display', fp ? 'none' : '');
    sidebar.querySelector('#se-cfm-an-entries-section')?.style.setProperty('display', ep ? 'none' : '');
    sidebar.style.display = (fp && ep) ? 'none' : '';
}

function _attachPopDrag(pop, hdrSelector) {
    const abort  = new AbortController();
    const { signal } = abort;
    const hdr    = pop.querySelector(hdrSelector);
    let sx, sy, sl, st;
    hdr?.addEventListener('pointerdown', e => {
        if (e.target.closest('button')) return;
        sx = e.clientX; sy = e.clientY;
        const r = pop.getBoundingClientRect();
        sl = r.left;   st = r.top;
        hdr.setPointerCapture(e.pointerId);
    }, { signal });
    hdr?.addEventListener('pointermove', e => {
        if (!hdr.hasPointerCapture(e.pointerId)) return;
        pop.style.left = `${Math.max(0, sl + e.clientX - sx)}px`;
        pop.style.top  = `${Math.max(0, st + e.clientY - sy)}px`;
    }, { signal });
    hdr?.addEventListener('pointerup', e => {
        if (hdr.hasPointerCapture(e.pointerId)) hdr.releasePointerCapture(e.pointerId);
    }, { signal });
    return abort;
}

// ─── Toolbar ─────────────────────────────────────────────────

function _bindToolbar() {
    const p = _panel;
    p?.querySelector('#se-cfm-an-fit')?.addEventListener('click', () => {
        if (_cy?.elements().length) _cy.fit(undefined, 48);
    });
    p?.querySelector('#se-cfm-an-layout')?.addEventListener('click', () => {
        _cy?.layout({ name: 'cose', animate: true, animationDuration: 300, padding: 48 }).run();
    });
    p?.querySelector('#se-cfm-an-clear')?.addEventListener('click', _clearCanvas);
    p?.querySelector('#se-cfm-an-prompts')?.addEventListener('click', () => openSystemPromptHub());

    // Zoom controls
    const slider = p?.querySelector('#se-cfm-an-zoom');
    const label  = p?.querySelector('#se-cfm-an-zoom-label');
    p?.querySelector('#se-cfm-an-zoom-in')?.addEventListener('click',  () => _stepZoom(0.15));
    p?.querySelector('#se-cfm-an-zoom-out')?.addEventListener('click', () => _stepZoom(-0.15));
    slider?.addEventListener('input', () => {
        const z = Number(slider.value) / 100;
        _cy?.zoom({ level: z, renderedPosition: { x: _cy.container().offsetWidth / 2, y: _cy.container().offsetHeight / 2 } });
        if (label) label.textContent = `${slider.value}%`;
    });
    _cy?.on('zoom', () => {
        const pct = Math.round((_cy.zoom() ?? 1) * 100);
        if (slider) slider.value = String(pct);
        if (label)  label.textContent = `${pct}%`;
    });
}

function _stepZoom(delta) {
    if (!_cy) return;
    const next = Math.min(3, Math.max(0.15, _cy.zoom() + delta));
    _cy.zoom({ level: next, renderedPosition: { x: _cy.container().offsetWidth / 2, y: _cy.container().offsetHeight / 2 } });
}

function _clearCanvas() {
    _cy?.elements().remove();
    _activeFile = null;
    _refreshFileButtons();
    _panel?.querySelectorAll('[data-an-add-entry].added').forEach(b => { b.classList.remove('added'); b.textContent = '+'; });
    _hideRemoveBtn();
}

// ─── Node events ──────────────────────────────────────────────

function _bindNodeEvents() {
    if (!_cy) return;

    _cy.on('select', 'node', e => _showRemoveBtn(e.target));
    _cy.on('unselect', 'node', () => _hideRemoveBtn());
    _cy.on('tap', e => { if (e.target === _cy) { _cy.elements().unselect(); _hideRemoveBtn(); } });
    _cy.on('zoom pan position', () => {
        const sel = _cy.$(':selected').first();
        if (sel.length) _showRemoveBtn(sel);
        else _hideRemoveBtn();
    });

    // Right-click also removes
    _cy.on('cxttap', 'node', e => {
        const node = e.target;
        if (node.data('type') === 'file') removeFileNode(node.data('fileName'));
        else removeEntryNode(node.data('num'));
    });
}

function _bindEntryRefresh() {
    document.addEventListener('se:entries-changed', refreshEntries);
}

// ─── Floating remove button ───────────────────────────────────

function _initRemoveBtn(canvasEl) {
    _removeBtn = document.createElement('button');
    _removeBtn.className = 'se-cfm-an-node-remove';
    _removeBtn.title = 'Remove node';
    _removeBtn.textContent = '×';
    _removeBtn.style.display = 'none';
    canvasEl.appendChild(_removeBtn);

    _removeBtn.addEventListener('click', e => {
        e.stopPropagation();
        const sel = _cy?.$(':selected').first();
        if (!sel?.length) return;
        if (sel.data('type') === 'file') removeFileNode(sel.data('fileName'));
        else removeEntryNode(sel.data('num'));
    });
}

function _showRemoveBtn(node) {
    if (!_removeBtn || !_cy || !node?.length) return;
    const pos = node.renderedPosition();
    const w   = node.renderedWidth()  / 2;
    const h   = node.renderedHeight() / 2;
    _removeBtn.style.left    = `${pos.x + w - 8}px`;
    _removeBtn.style.top     = `${pos.y - h - 8}px`;
    _removeBtn.style.display = 'flex';
}

function _hideRemoveBtn() {
    if (_removeBtn) _removeBtn.style.display = 'none';
}

// ─── Edge handles ─────────────────────────────────────────────

function _initEdgeHandles() {
    if (!_cy || !window.cytoscapeEdgehandles) return;
    _eh = _cy.edgehandles({
        preview:         false,
        hoverDelay:      100,
        snap:            false,
        noEdgeEventsInDraw: true,
        handlePosition:  () => 'middle top',
        edgeParams:      (src, tgt) => {
            const color = _nextEdgeColor();
            return { data: { id: `edge::${src.id()}::${tgt.id()}`, color } };
        },
        loopAllowed:     () => false,
    });
    _eh.enable();
}

// ─── Helpers ─────────────────────────────────────────────────

function _markAdded(selector, added) {
    _panel?.querySelectorAll(selector).forEach(b => {
        b.classList.toggle('added', added);
        b.textContent = added ? '×' : '+';
    });
    if (_popPanels.entries) {
        _popPanels.entries.panel.querySelectorAll(selector).forEach(b => {
            b.classList.toggle('added', added);
            b.textContent = added ? '×' : '+';
        });
    }
}

function _refreshFileButtons() {
    // Re-render all file list containers
    const sidebar = _panel?.querySelector('#se-cfm-an-file-list');
    if (sidebar) _renderFileListInto(sidebar);
    if (_popPanels.files) {
        const popList = _popPanels.files.panel.querySelector('#se-cfm-an-pop-files');
        if (popList) _renderFileListInto(popList);
    }
}

function _updateFileListState(container) {
    const hasActive = !!_activeFile;
    container.classList.toggle('has-active-file', hasActive);
}

function _nextPos(type) {
    if (!_cy) return { x: 100, y: 100 };
    const col   = type === 'file' ? 130 : 440;
    const count = _cy.nodes(`[type = "${type}"]`).length;
    return { x: col, y: 80 + count * 90 };
}

function _nextEdgeColor() {
    const color = _EDGE_PALETTE[_edgeColorIdx % _EDGE_PALETTE.length];
    _edgeColorIdx++;
    return color;
}

function _showMsg(canvasEl, msg) {
    let el = canvasEl.querySelector('.se-cfm-an-loading');
    if (msg) {
        if (!el) { el = document.createElement('div'); el.className = 'se-cfm-an-loading'; canvasEl.appendChild(el); }
        el.textContent = msg;
    } else {
        el?.remove();
    }
}

// ─── Script loader ────────────────────────────────────────────

function _loadScript(src, check) {
    return new Promise((resolve, reject) => {
        if (check?.()) { resolve(); return; }
        const s = document.createElement('script');
        s.src = src;
        s.onload  = () => resolve();
        s.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(s);
    });
}

// ─── Cytoscape stylesheet ─────────────────────────────────────

function _buildStyle() {
    return [
        {
            selector: 'node[type = "file"]',
            style: {
                shape:              'round-rectangle',
                'background-color': _C.bg,
                'border-width':     2,
                'border-color':     _C.file,
                label:              'data(label)',
                color:              _C.file,
                'font-size':        '11px',
                'font-family':      'monospace',
                'text-valign':      'center',
                'text-halign':      'center',
                width:              170,
                height:             46,
                'text-max-width':   '150px',
                'text-wrap':        'ellipsis',
            },
        },
        {
            selector: 'node[type = "entry"]',
            style: {
                shape:              'round-rectangle',
                'background-color': _C.bg,
                'border-width':     1.5,
                'border-color':     _C.entry,
                label:              'data(label)',
                color:              _C.entry,
                'font-size':        '11px',
                'font-family':      'monospace',
                'text-valign':      'center',
                'text-halign':      'center',
                width:              90,
                height:             38,
            },
        },
        {
            selector: 'edge',
            style: {
                width:                1.5,
                'line-color':         'data(color)',
                'target-arrow-color': 'data(color)',
                'target-arrow-shape': 'triangle',
                'curve-style':        'bezier',
                'arrow-scale':        0.8,
            },
        },
        {
            selector: ':selected',
            style: { 'border-color': _C.sel, 'border-width': 2.5 },
        },
        {
            selector: 'node:active',
            style: { 'overlay-opacity': 0.12 },
        },
        {
            selector: '.eh-handle',
            style: {
                'background-color': '#fd971f',
                width:  10,
                height: 10,
                shape:  'ellipse',
            },
        },
        {
            selector: '.eh-ghost-edge',
            style: {
                'line-color':         '#fd971f',
                'target-arrow-color': '#fd971f',
                'target-arrow-shape': 'triangle',
                'curve-style':        'bezier',
            },
        },
    ];
}
