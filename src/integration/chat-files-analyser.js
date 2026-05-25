/**
 * @module chat-files-analyser
 * @description LiteGraph.js node canvas for the Analyse tab.
 * Chat files appear as output nodes; summary entries as input nodes.
 * Connections are colour-coded; ports are ComfyUI-style circular slots.
 */

import { state } from '../core/state.js';
import { escHtml } from '../core/utils.js';
import { registerPrompt, getRegisteredPrompts, getPrompt, setPrompt } from '../core/system-prompts.js';
import { loadTemplate } from '../core/template-loader.js';
import { TEMPLATES } from '../core/constants.js';

// ─── Prompt registration ──────────────────────────────────────

registerPrompt('chat-digest',    'Chat Digest — Pass 1',    '', { location: 'Chat Files › Analyse tab' });
registerPrompt('digest-refine',  'Chat Digest Refinement',  '', { location: 'Chat Files › Analyse tab' });
registerPrompt('entry-analysis', 'Entry Analysis — Pass 2', '', { warnJson: true, location: 'Chat Files › Analyse tab' });

// ─── Module state ─────────────────────────────────────────────

let _graph        = null;
let _lgc          = null;   // LGraphCanvas
let _lgCanvas     = null;   // <canvas> element inside container
let _panel        = null;
let _files        = [];
let _activeFile   = null;
let _popPanels    = { files: null, entries: null };
let _edgeColorIdx = 0;
let _typesReady   = false;

const _CDN_LG     = 'https://cdn.jsdelivr.net/npm/litegraph.js/build/litegraph.min.js';

const _EDGE_PALETTE = ['#a6e22e', '#66d9e8', '#f92672', '#fd971f', '#ae81ff', '#e6db74', '#cfcfc2'];

// ─── Public API ──────────────────────────────────────────────

export async function initAnalyser(panel, files) {
    _panel = panel;
    _files = files ?? [];

    _renderFileListInto(_panel.querySelector('#se-cfm-an-file-list'));
    _renderEntryListInto(_panel.querySelector('#se-cfm-an-entry-list'));
    _bindPopOutButtons();

    const container = _panel.querySelector('#se-cfm-an-canvas');
    if (!container) return;

    _showMsg(container, 'Loading LiteGraph…');
    try {
        await _loadScript(_CDN_LG, () => window.LiteGraph);
    } catch {
        _showMsg(container, 'Failed to load canvas library — check internet connection.');
        return;
    }

    _showMsg(container, null);
    _registerNodeTypes();
    _initCanvas(container);
    _bindToolbar();
    _bindEntryRefresh();
}

export function destroyAnalyser() {
    _graph?.stop?.();
    _lgc?.stopRendering?.();
    _lgCanvas?.remove();
    _graph = _lgc = _lgCanvas = null;
    _popPanels.files?.panel?.remove();
    _popPanels.entries?.panel?.remove();
    _popPanels    = { files: null, entries: null };
    _panel        = null;
    _files        = [];
    _activeFile   = null;
    _edgeColorIdx = 0;
}

export function refreshEntries() {
    const container = _popPanels.entries
        ? _popPanels.entries.panel.querySelector('#se-cfm-an-pop-entries')
        : _panel?.querySelector('#se-cfm-an-entry-list');
    if (container) _renderEntryListInto(container);
}

// ─── Node operations ─────────────────────────────────────────

export function addFileNode(fileName) {
    if (!_lgc || _activeFile) return;
    if (_findFileNode(fileName)) return;

    const node = window.LiteGraph.createNode('se/chat_file');
    node.properties.fileName = fileName;
    node.title = fileName.replace(/\.jsonl$/, '').slice(-28);
    _placeNode(node, 'file');
    _graph.add(node);

    _activeFile = fileName;
    _refreshFileButtons();
}

export function removeFileNode(fileName) {
    const node = _findFileNode(fileName);
    if (!node) return;
    _graph.remove(node);
    if (_activeFile === fileName) {
        _activeFile = null;
        _refreshFileButtons();
    }
}

export function addEntryNode(num) {
    if (!_lgc) return;
    if (_findEntryNode(num)) return;

    const entry   = state.entries?.get(num);
    const snippet = entry ? String(entry.content ?? '').slice(0, 55).replaceAll('\n', ' ') : `Entry ${num}`;
    const node    = window.LiteGraph.createNode('se/entry');
    node.properties.num     = num;
    node.properties.snippet = snippet;
    node.title = `#${num}`;
    _placeNode(node, 'entry');
    _graph.add(node);
    _markAdded(`[data-an-add-entry="${num}"]`, true);
}

export function removeEntryNode(num) {
    const node = _findEntryNode(num);
    if (!node) return;
    _graph.remove(node);
    _markAdded(`[data-an-add-entry="${num}"]`, false);
}

export function connectNodes(fileName, entryNum) {
    const src = _findFileNode(fileName);
    const tgt = _findEntryNode(entryNum);
    if (!src || !tgt) return;
    src.connect(0, tgt, 0);
}

// ─── Canvas initialisation ────────────────────────────────────

function _initCanvas(container) {
    const LG = window.LiteGraph;

    // Monokai global defaults
    LG.NODE_DEFAULT_COLOR        = '#2a2a1e';
    LG.NODE_DEFAULT_BGCOLOR      = '#1a1a12';
    LG.NODE_TITLE_HEIGHT         = 26;
    LG.NODE_SLOT_HEIGHT          = 22;
    LG.DEFAULT_SHADOW_OFFSET_X   = 0;
    LG.DEFAULT_SHADOW_OFFSET_Y   = 0;
    LG.NODE_TEXT_SIZE            = 11;

    _lgCanvas = document.createElement('canvas');
    _lgCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    container.insertBefore(_lgCanvas, container.firstChild);

    _graph = new LG.LGraph();
    _lgc   = new LG.LGraphCanvas(_lgCanvas, _graph);
    _lgc.pixel_ratio           = window.devicePixelRatio || 1;
    _lgc.show_info             = false;

    _lgc.background_color      = '#181812';
    _lgc.clear_background      = true;
    _lgc.snap_to_grid          = 22;
    _lgc.render_shadows        = false;
    _lgc.render_canvas_border  = false;
    _lgc.connections_width     = 2;
    _lgc.default_link_color    = '#66d9e8';

    // Dot-grid background drawn on canvas (not CSS — LG owns the canvas pixels)
    _lgc.onDrawBackground = function(ctx, visArea) {
        ctx.fillStyle = '#181812';
        ctx.fillRect(visArea[0], visArea[1], visArea[2], visArea[3]);
        ctx.fillStyle = '#3a3a2c';
        const G = 22;
        const sx = Math.floor(visArea[0] / G) * G;
        const sy = Math.floor(visArea[1] / G) * G;
        for (let x = sx; x < visArea[0] + visArea[2]; x += G) {
            for (let y = sy; y < visArea[1] + visArea[3]; y += G) {
                ctx.beginPath();
                ctx.arc(x, y, 1, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    };

    // Disable canvas right-click "Add Node" menu — nodes come from sidebar only
    _lgc.getCanvasMenuOptions = () => [];

    // Zoom pill sync
    const label = _panel?.querySelector('#se-cfm-an-zoom-label');
    _lgc.onAfterRender = function() {
        if (label) label.textContent = `${Math.round((_lgc.ds?.scale ?? 1) * 100)}%`;
    };

    // Sync sidebar when nodes removed via LiteGraph native context menu
    _graph.onNodeRemoved = function(node) {
        if (node.type === 'se/chat_file') {
            if (_activeFile === node.properties?.fileName) {
                _activeFile = null;
                _refreshFileButtons();
            }
        } else if (node.type === 'se/entry') {
            _markAdded(`[data-an-add-entry="${node.properties?.num}"]`, false);
        }
    };

    _graph.start(60);
    _lgc.resize();

    new ResizeObserver(() => _lgc?.resize()).observe(container);

    // XY coordinate display — bottom-left of canvas
    _lgCanvas.addEventListener('mousemove', e => {
        const xy = _panel?.querySelector('#se-cfm-an-xy');
        if (!xy || !_lgc?.ds) return;
        const x = Math.round((e.offsetX - _lgc.ds.offset[0]) / _lgc.ds.scale);
        const y = Math.round((e.offsetY - _lgc.ds.offset[1]) / _lgc.ds.scale);
        xy.textContent = `${x}, ${y}`;
    });
    _lgCanvas.addEventListener('mouseleave', () => {
        const xy = _panel?.querySelector('#se-cfm-an-xy');
        if (xy) xy.textContent = '';
    });
}

// ─── Node type registration ───────────────────────────────────

function _registerNodeTypes() {
    if (_typesReady) return;
    _typesReady = true;

    const LG = window.LiteGraph;

    // Port colours
    LG.registered_link_types = LG.registered_link_types ?? {};
    LG.registered_link_types['se_chat']  = { name: 'se_chat',  color: '#a6e22e' };
    LG.registered_link_types['se_entry'] = { name: 'se_entry', color: '#66d9e8' };

    // ── Chat File node ──────────────────────────────────────────────
    class SEChatFileNode extends LG.LGraphNode {
        constructor() {
            super();
            this.addOutput('chats', 'se_chat');
            this.title   = 'Chat File';
            this.color   = '#2d6030';
            this.bgcolor = '#141f12';
            this.size    = [220, 58];
            this.properties = { fileName: '' };
        }

        onConnectionsChange(type, _slot, isConnected, link) {
            if (type === LG.OUTPUT && isConnected && link) {
                link.color = _nextEdgeColor();
            }
        }

        onDrawForeground(ctx) {
            if (!this.properties?.fileName) return;
            ctx.fillStyle = '#a6e22e';
            ctx.font      = '10px monospace';
            const name    = this.properties.fileName.replace(/\.jsonl$/, '');
            ctx.fillText(_canvasEllipsis(ctx, name, this.size[0] - 16), 8, this.size[1] - 10);
            // border
            ctx.strokeStyle = '#3a6a3a';
            ctx.lineWidth   = 1;
            ctx.strokeRect(0.5, 0.5, this.size[0] - 1, this.size[1] - 1);
        }
    }
    SEChatFileNode.title = 'Chat File';
    LG.registerNodeType('se/chat_file', SEChatFileNode);

    // ── Entry node ──────────────────────────────────────────────────
    class SEEntryNode extends LG.LGraphNode {
        constructor() {
            super();
            this.addInput('from', '*');
            this.addOutput('ref', 'se_entry');
            this.title   = 'Entry';
            this.color   = '#1a3d50';
            this.bgcolor = '#0e1e28';
            this.size    = [214, 74];
            this.properties = { num: 0, snippet: '' };
        }

        onConnectionsChange(type, _slot, isConnected, link) {
            if (type === LG.INPUT && isConnected && link) {
                link.color = _nextEdgeColor();
            }
        }

        onDrawForeground(ctx) {
            const snippet = String(this.properties?.snippet ?? '');
            if (!snippet) return;
            ctx.fillStyle = '#66d9e8';
            ctx.font      = '10px monospace';
            ctx.fillText(_canvasEllipsis(ctx, snippet, this.size[0] - 16), 8, this.size[1] - 10);
            // border
            ctx.strokeStyle = '#1e5068';
            ctx.lineWidth   = 1;
            ctx.strokeRect(0.5, 0.5, this.size[0] - 1, this.size[1] - 1);
        }
    }
    SEEntryNode.title = 'Entry';
    LG.registerNodeType('se/entry', SEEntryNode);
}

// ─── Sidebar renderers ────────────────────────────────────────

function _renderFileListInto(container) {
    if (!container) return;
    if (!_files.length) {
        container.innerHTML = '<div class="se-cfm-hint">No files found</div>';
        return;
    }
    container.innerHTML = _files.map(f => {
        const name     = f.file_name ?? '';
        const label    = name.replace(/\.jsonl$/, '');
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
        .toSorted((a, b) => a.num - b.num)
        .map(e => {
            const onCanvas = !!_findEntryNode(e.num);
            const snippet  = String(e.content ?? '').slice(0, 38).replaceAll('\n', ' ');
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

    const title  = type === 'files' ? 'Chat Files' : 'Entries';
    const listId = `se-cfm-an-pop-${type}`;
    const pop    = document.createElement('div');
    pop.className = 'se-cfm-an-pop-panel';
    pop.innerHTML =
        `<div class="se-cfm-an-pop-hdr" id="se-cfm-an-pop-hdr-${type}">` +
        `<span>${escHtml(title)}</span>` +
        `<button class="se-cfm-an-pop-close" title="Restore to panel">&#x00D7;</button></div>` +
        `<div class="se-cfm-an-pop-body">` +
        `<div class="se-cfm-an-${type === 'files' ? 'file' : 'entry'}-list" id="${listId}"></div>` +
        `</div>`;

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
        sl = r.left; st = r.top;
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
    p?.querySelector('#se-cfm-an-fit')?.addEventListener('click', _fitView);
    p?.querySelector('#se-cfm-an-help')?.addEventListener('click', _openHelpDialog);
    p?.querySelector('#se-cfm-an-origin')?.addEventListener('click', () => {
        if (!_lgc) return;
        _lgc.ds.scale  = 1;
        _lgc.ds.offset = [0, 0];
        _lgc.setDirty(true, true);
        _updateZoomLabel();
    });
    p?.querySelector('#se-cfm-an-gather')?.addEventListener('click', _gatherNodes);
    p?.querySelector('#se-cfm-an-layout')?.addEventListener('click', () => {
        if (!_graph) return;
        const nodes = _graph._nodes;
        if (!nodes.length) return;
        const COLS = Math.ceil(Math.sqrt(nodes.length));
        nodes.forEach((node, i) => {
            node.pos = [(i % COLS) * 270 + 40, Math.floor(i / COLS) * 130 + 40];
        });
        _lgc.setDirty(true, true);
        _fitView();
    });
    p?.querySelector('#se-cfm-an-clear')?.addEventListener('click', _clearCanvas);
    p?.querySelector('#se-cfm-an-prompts')?.addEventListener('click', _openAnalysePrompts);

    // Floating zoom pill
    const label = p?.querySelector('#se-cfm-an-zoom-label');
    p?.querySelector('#se-cfm-an-zoom-in')?.addEventListener('click',  () => _stepZoom(0.15));
    p?.querySelector('#se-cfm-an-zoom-out')?.addEventListener('click', () => _stepZoom(-0.15));
    label?.addEventListener('click', () => {
        if (!_lgc || !_lgCanvas) return;
        _lgc.ds.scale  = 1;
        _lgc.ds.offset = [_lgCanvas.offsetWidth / 2, _lgCanvas.offsetHeight / 2];
        _lgc.setDirty(true, true);
        _updateZoomLabel();
    });
}

function _openAnalysePrompts() {
    const existing = document.getElementById('se-cfm-an-prompts-dlg');
    if (existing) { existing.remove(); return; }

    const prompts = getRegisteredPrompts().filter(p => p.location === 'Chat Files › Analyse tab');
    if (!prompts.length) return;

    const dlg = document.createElement('div');
    dlg.id = 'se-cfm-an-prompts-dlg';
    dlg.className = 'se-cfm-an-prompts-dlg';
    dlg.innerHTML =
        `<div class="se-cfm-an-pdlg-hdr">` +
        `<span class="se-cfm-an-pdlg-title">Analyse Prompts</span>` +
        `<button class="se-cfm-an-pdlg-close se-close-circle">&times;</button>` +
        `</div>` +
        `<div class="se-cfm-an-prompts-dlg-body">` +
        prompts.map(p =>
            `<div class="se-cfm-an-pdlg-item">` +
            `<label class="se-cfm-an-pdlg-label">${escHtml(p.label)}</label>` +
            `<textarea class="se-cfm-an-pdlg-ta" data-pk="${escHtml(p.key)}" rows="5" spellcheck="false">${escHtml(getPrompt(p.key))}</textarea>` +
            `</div>`
        ).join('') +
        `</div>`;

    document.body.appendChild(dlg);
    _centerDialog(dlg);
    _makeDraggable(dlg, dlg.querySelector('.se-cfm-an-pdlg-hdr'));

    dlg.querySelectorAll('[data-pk]').forEach(ta => {
        ta.addEventListener('input', () => setPrompt(ta.dataset.pk, ta.value));
    });
    dlg.querySelector('.se-cfm-an-pdlg-close').addEventListener('click', () => dlg.remove());
}

async function _openHelpDialog() {
    const existing = document.getElementById('se-cfm-an-help-dlg');
    if (existing) { existing.remove(); return; }

    const dlg = document.createElement('div');
    dlg.id = 'se-cfm-an-help-dlg';
    dlg.className = 'se-cfm-an-help-dlg';
    dlg.innerHTML = await loadTemplate(TEMPLATES.CHAT_FILES_HELP);

    document.body.appendChild(dlg);
    _centerDialog(dlg);
    _makeDraggable(dlg, dlg.querySelector('.se-cfm-an-help-hdr'));
    dlg.querySelector('.se-cfm-an-help-close').addEventListener('click', () => dlg.remove());

    // ── Booklet navigation ──────────────────────────────────────
    const navItems = [...dlg.querySelectorAll('.se-cfm-an-help-nav-item')];
    const sections = [...dlg.querySelectorAll('.se-cfm-an-help-sec')];
    const prevBtn  = dlg.querySelector('.se-cfm-an-help-prev');
    const nextBtn  = dlg.querySelector('.se-cfm-an-help-next');
    const pageNum  = dlg.querySelector('.se-cfm-an-help-page-num');

    function getPages(sec) { return [...sec.querySelectorAll('.se-cfm-an-help-page')]; }
    function activeSec()   { return sections.find(s => s.classList.contains('active')); }

    function showPage(sec, idx) {
        const pages = getPages(sec);
        pages.forEach((p, i) => { p.hidden = (i !== idx); });
        sec.dataset.pageIdx = idx;
        const multi = pages.length > 1;
        if (pageNum) pageNum.textContent = multi ? `${idx + 1} / ${pages.length}` : '';
        if (prevBtn) { prevBtn.disabled = (idx === 0);              prevBtn.style.visibility = multi ? '' : 'hidden'; }
        if (nextBtn) { nextBtn.disabled = (idx >= pages.length - 1); nextBtn.style.visibility = multi ? '' : 'hidden'; }
    }

    function showSection(sec) {
        sections.forEach(s => s.classList.remove('active'));
        navItems.forEach(n => n.classList.remove('active'));
        sec.classList.add('active');
        dlg.querySelector(`.se-cfm-an-help-nav-item[data-sec="${sec.dataset.sec}"]`)?.classList.add('active');
        showPage(sec, 0);
    }

    navItems.forEach(btn => {
        btn.addEventListener('click', () => {
            const sec = sections.find(s => s.dataset.sec === btn.dataset.sec);
            if (sec) showSection(sec);
        });
    });
    prevBtn?.addEventListener('click', () => {
        const sec = activeSec();
        if (sec) showPage(sec, Math.max(0, Number(sec.dataset.pageIdx ?? 0) - 1));
    });
    nextBtn?.addEventListener('click', () => {
        const sec = activeSec();
        if (sec) showPage(sec, Math.min(getPages(sec).length - 1, Number(sec.dataset.pageIdx ?? 0) + 1));
    });

    showSection(sections.find(s => s.classList.contains('active')) ?? sections[0]);
}

function _centerDialog(dlg) {
    requestAnimationFrame(() => {
        const w = dlg.offsetWidth  || 420;
        const h = dlg.offsetHeight || 400;
        dlg.style.left = `${Math.max(8, (window.innerWidth  - w) / 2)}px`;
        dlg.style.top  = `${Math.max(8, (window.innerHeight - h) / 2)}px`;
    });
}

function _makeDraggable(el, handle) {
    if (!handle) return;
    handle.style.cursor = 'grab';
    let sx, sy, sl, st;
    handle.addEventListener('pointerdown', e => {
        if (e.target.closest('button')) return;
        sx = e.clientX; sy = e.clientY;
        const r = el.getBoundingClientRect();
        sl = r.left; st = r.top;
        handle.setPointerCapture(e.pointerId);
        handle.style.cursor = 'grabbing';
    });
    handle.addEventListener('pointermove', e => {
        if (!handle.hasPointerCapture(e.pointerId)) return;
        el.style.left = `${Math.max(0, sl + e.clientX - sx)}px`;
        el.style.top  = `${Math.max(0, st + e.clientY - sy)}px`;
    });
    handle.addEventListener('pointerup', e => {
        if (handle.hasPointerCapture(e.pointerId)) {
            handle.releasePointerCapture(e.pointerId);
            handle.style.cursor = 'grab';
        }
    });
}

function _stepZoom(delta) {
    if (!_lgc || !_lgCanvas) return;
    const next = Math.min(3, Math.max(0.15, (_lgc.ds?.scale ?? 1) + delta));
    _lgc.ds.changeScale(next, [_lgCanvas.offsetWidth / 2, _lgCanvas.offsetHeight / 2]);
    _lgc.setDirty(true, true);
    _updateZoomLabel();
}

function _updateZoomLabel() {
    const label = _panel?.querySelector('#se-cfm-an-zoom-label');
    if (label) label.textContent = `${Math.round((_lgc?.ds?.scale ?? 1) * 100)}%`;
}

function _fitView() {
    if (!_lgc || !_graph || !_lgCanvas) return;
    const nodes = _graph._nodes;
    if (!nodes.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
        minX = Math.min(minX, n.pos[0]);
        minY = Math.min(minY, n.pos[1]);
        maxX = Math.max(maxX, n.pos[0] + n.size[0]);
        maxY = Math.max(maxY, n.pos[1] + n.size[1]);
    }
    const w   = _lgCanvas.offsetWidth;
    const h   = _lgCanvas.offsetHeight;
    const PAD = 60;
    const scale = Math.min(
        (w - PAD * 2) / Math.max(1, maxX - minX),
        (h - PAD * 2) / Math.max(1, maxY - minY),
        2,
    );
    _lgc.ds.scale  = scale;
    _lgc.ds.offset = [w / 2 - ((minX + maxX) / 2) * scale, h / 2 - ((minY + maxY) / 2) * scale];
    _lgc.setDirty(true, true);
    _updateZoomLabel();
}

function _gatherNodes() {
    if (!_lgc || !_graph) return;
    const nodes  = _graph._nodes;
    if (!nodes.length) return;
    const GRID   = 22;
    const perRow = Math.ceil(Math.sqrt(nodes.length));
    nodes.forEach((node, i) => {
        node.pos = [
            Math.round(((i % perRow) * 240) / GRID) * GRID,
            Math.round((Math.floor(i / perRow) * 120) / GRID) * GRID,
        ];
    });
    _lgc.setDirty(true, true);
    _fitView();
}

function _clearCanvas() {
    if (!_graph) return;
    _graph.clear();
    _activeFile = null;
    _refreshFileButtons();
    _panel?.querySelectorAll('[data-an-add-entry].added').forEach(b => {
        b.classList.remove('added');
        b.textContent = '+';
    });
}

function _bindEntryRefresh() {
    document.addEventListener('se:entries-changed', refreshEntries);
}

// ─── Helpers ─────────────────────────────────────────────────

function _canvasEllipsis(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    while (text.length && ctx.measureText(text + '…').width > maxWidth) text = text.slice(0, -1);
    return text + '…';
}

function _findFileNode(fileName) {
    return _graph?._nodes.find(n => n.type === 'se/chat_file' && n.properties?.fileName === fileName) ?? null;
}

function _findEntryNode(num) {
    return _graph?._nodes.find(n => n.type === 'se/entry' && n.properties?.num === num) ?? null;
}

function _placeNode(node, type) {
    const GRID  = 22;
    const col   = type === 'file' ? 2 : 12;
    const count = (_graph?._nodes ?? []).filter(n => n.type === (type === 'file' ? 'se/chat_file' : 'se/entry')).length;
    node.pos = [col * GRID, (2 + count * 5) * GRID];
}

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
    const sidebar = _panel?.querySelector('#se-cfm-an-file-list');
    if (sidebar) _renderFileListInto(sidebar);
    if (_popPanels.files) {
        const popList = _popPanels.files.panel.querySelector('#se-cfm-an-pop-files');
        if (popList) _renderFileListInto(popList);
    }
}

function _updateFileListState(container) {
    container.classList.toggle('has-active-file', !!_activeFile);
}

function _nextEdgeColor() {
    const color = _EDGE_PALETTE[_edgeColorIdx % _EDGE_PALETTE.length];
    _edgeColorIdx++;
    return color;
}

function _showMsg(container, msg) {
    let el = container.querySelector('.se-cfm-an-loading');
    if (msg) {
        if (!el) { el = document.createElement('div'); el.className = 'se-cfm-an-loading'; container.appendChild(el); }
        el.textContent = msg;
    } else {
        el?.remove();
    }
}

// ─── Asset loaders ────────────────────────────────────────────

function _loadScript(src, check) {
    return new Promise((resolve, reject) => {
        if (check?.()) { resolve(); return; }
        const s = document.createElement('script');
        s.src     = src;
        s.onload  = () => resolve();
        s.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(s);
    });
}
