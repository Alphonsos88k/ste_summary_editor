/**
 * @module chat-files-analyser
 * @description LiteGraph.js node canvas for the Analyse tab.
 * Chat files appear as output nodes; summary entries as input nodes.
 * Connections are colour-coded; ports are ComfyUI-style circular slots.
 */

import { state, persistState, snapshotState, restoreSnapshot } from '../core/state.js';
import { escHtml } from '../core/utils.js';
import { registerPrompt, getRegisteredPrompts, getPrompt, setPrompt } from '../core/system-prompts.js';
import { loadTemplate } from '../core/template-loader.js';
import { TEMPLATES } from '../core/constants.js';
import { shiftEntriesUp } from '../table/reorder.js';
import { renderTable } from '../table/table.js';
import { detectGaps } from '../ingest/gap-detection.js';

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
let _char         = null;   // current ST character (for /getchat API)
let _activeFile      = null;
let _popPanels       = { files: null, entries: null };
let _edgeColorIdx    = 0;
let _typesReady      = false;
let _tipEl           = null;   // shared tooltip DOM element
let _fileTokens      = {};     // fileName → estimated input token count (cached on file add)
let _runMaxTokens            = null;   // per-run max_tokens override set from run confirm dialog
let _apiBusyListener         = null;
let _activeFileChangeListener = null;

const _LG_SRC     = '/scripts/extensions/third-party/summary-editor/lib/litegraph.min.js';

const _EDGE_PALETTE = ['#a6e22e', '#66d9e8', '#f92672', '#fd971f', '#ae81ff', '#e6db74', '#cfcfc2'];

// ─── Public API ──────────────────────────────────────────────

export async function initAnalyser(panel, files, char) {
    _panel = panel;
    _files = files ?? [];
    _char  = char ?? null;

    _renderFileListInto(_panel.querySelector('#se-cfm-an-file-list'));
    _renderEntryListInto(_panel.querySelector('#se-cfm-an-entry-list'));
    _bindPopOutButtons();

    const container = _panel.querySelector('#se-cfm-an-canvas');
    if (!container) return;

    _showMsg(container, 'Loading canvas library…');
    try {
        await _loadScript(_LG_SRC, () => window.LiteGraph);
    } catch {
        _showMsg(container, 'Failed to load canvas library.');
        return;
    }

    _showMsg(container, null);
    // Yield to browser so tab bar and container paint before heavy canvas init
    await new Promise(r => requestAnimationFrame(r));
    if (!_panel) return; // panel closed during yield — bail out
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
    _tipEl?.remove();
    _tipEl        = null;
    document.getElementById('se-cfm-an-tok-drop')?.remove();
    _panel        = null;
    _files        = [];
    _char         = null;
    _activeFile   = null;
    _edgeColorIdx = 0;
    _fileTokens   = {};
    _runMaxTokens = null;
}

export function refreshAnalyserCanvas() {
    _lgc?.setDirty(true, true);
}

export function getGraphState() {
    return _graph ? _graph.serialize() : null;
}

export function setGraphState(data) {
    if (!_graph || !data) return;
    _graph.configure(data);
    _lgc?.setDirty(true, true);
}

export function onApiStateChange(cb) {
    _apiBusyListener = cb;
}

export function onActiveFileChange(cb) {
    _activeFileChangeListener = cb;
}

export function setRunButtonBlocked(blocked) {
    const btn = _panel?.querySelector('#se-cfm-an-run');
    if (!btn) return;
    if (blocked) { btn.disabled = true; }
    else { _refreshRunBtn(); }
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
    _activeFileChangeListener?.(fileName);

    _estimateChatTokens(fileName).then(count => {
        if (count != null) {
            _fileTokens[fileName] = count;
            _refreshFileButtons();
        }
    });
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
    _lgc.node_title_color      = '#f0f0e8';

    _lgc.background_color      = '#181812';
    _lgc.clear_background      = true;
    _lgc.snap_to_grid          = 22;
    _lgc.render_shadows        = false;
    _lgc.render_canvas_border  = false;
    _lgc.connections_width     = 2;
    _lgc.default_link_color    = '#66d9e8';

    // Dot-grid background — all dots batched into a single path for perf
    _lgc.onDrawBackground = function(ctx, visArea) {
        ctx.fillStyle = '#181812';
        ctx.fillRect(visArea[0], visArea[1], visArea[2], visArea[3]);
        const G  = 22;
        const sx = Math.floor(visArea[0] / G) * G;
        const sy = Math.floor(visArea[1] / G) * G;
        ctx.fillStyle = '#3a3a2c';
        ctx.beginPath();
        for (let x = sx; x < visArea[0] + visArea[2]; x += G) {
            for (let y = sy; y < visArea[1] + visArea[3]; y += G) {
                ctx.moveTo(x + 1, y);
                ctx.arc(x, y, 1, 0, Math.PI * 2);
            }
        }
        ctx.fill();
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
                _activeFileChangeListener?.(null);
            }
        } else if (node.type === 'se/entry') {
            _markAdded(`[data-an-add-entry="${node.properties?.num}"]`, false);
        }
        _refreshRunBtn();
    };

    _graph.onNodeAdded        = () => _refreshRunBtn();
    _graph.onConnectionChange = () => _refreshRunBtn();

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
            this.color   = '#2e6632';
            this.bgcolor = '#181f14';
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
            ctx.strokeStyle = '#58b058';
            ctx.lineWidth   = 1.5;
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
            this.color   = '#1e4a60';
            this.bgcolor = '#111d28';
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
            ctx.strokeStyle = '#2a80b0';
            ctx.lineWidth   = 1.5;
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
        const date     = _anRelDate(f.last_mes);
        const onCanvas = _activeFile === name;
        const tkCount  = onCanvas && _fileTokens[name];
        let tkBadge = '';
        if (tkCount) {
            const tkText = tkCount >= 1000 ? `~${(tkCount / 1000).toFixed(1)}k` : `~${tkCount}`;
            tkBadge = `<span class="se-cfm-an-tk-badge">${tkText} tk</span>`;
        } else if (onCanvas) {
            tkBadge = `<span class="se-cfm-an-tk-badge se-cfm-an-tk-spin"><span class="se-an-spin">&#x27F3;</span></span>`;
        }
        return `<div class="se-cfm-an-node-item">` +
            `<span class="se-cfm-an-node-date">${escHtml(date)}</span>` +
            `<span class="se-cfm-an-node-label" title="${escHtml(name)}">${escHtml(label)}</span>` +
            tkBadge +
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
    p?.querySelector('#se-cfm-an-run')?.addEventListener('click', _doRun);
    p?.querySelector('#se-cfm-an-tok')?.addEventListener('click', _toggleTokDrop);
    p?.querySelector('#se-cfm-an-help')?.addEventListener('click', _openHelpDialog);
    _updateTokBtn();
    _initTooltips(p?.querySelector('.se-cfm-an-toolbar'));
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
        const allNodes = _graph._nodes;
        if (!allNodes.length) return;
        const fileNodes  = allNodes.filter(n => n.type === 'se/chat_file');
        const entryNodes = allNodes.filter(n => n.type === 'se/entry');
        fileNodes.forEach((n, i)  => { n.pos = [40,  i * 130 + 40]; });
        entryNodes.forEach((n, i) => { n.pos = [310, i * 130 + 40]; });
        _lgc.setDirty(true, true);
        _fitView();
    });
    p?.querySelector('#se-cfm-an-snake')?.addEventListener('click', _snakeLayout);
    p?.querySelector('#se-cfm-an-line')?.addEventListener('click', _lineLayout);
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

// ─── Run button state ─────────────────────────────────────────

function _refreshRunBtn() {
    const btn = _panel?.querySelector('#se-cfm-an-run');
    if (!btn) return;
    const hasLinks = _graph ? Object.keys(_graph.links ?? {}).length > 0 : false;
    btn.disabled = !hasLinks;
}

// ─── Connection graph traversal ───────────────────────────────

function _getConnectedGraph() {
    if (!_graph) return null;
    const fileNode = _graph._nodes.find(n => n.type === 'se/chat_file');
    if (!fileNode) return null;

    const seen = new Set();
    const entryNodes = [];

    function traverse(node) {
        for (const output of (node.outputs ?? [])) {
            for (const linkId of (output.links ?? [])) {
                const link = _graph.links[linkId];
                if (!link) continue;
                const target = _graph._nodes.find(n => n.id === link.target_id);
                if (!target || target.type !== 'se/entry' || seen.has(target.id)) continue;
                seen.add(target.id);
                entryNodes.push(target);
                traverse(target);
            }
        }
    }

    traverse(fileNode);
    return entryNodes.length > 0 ? { fileNode, entryNodes } : null;
}

// ─── Run (direct) ────────────────────────────────────────────

function _doRun() {
    const conn = _getConnectedGraph();
    if (!conn) return;
    _runAnalysis(conn.fileNode, conn.entryNodes);
}

// ─── Token override button ────────────────────────────────────

function _updateTokBtn() {
    const btn = _panel?.querySelector('#se-cfm-an-tok');
    if (!btn) return;
    const ctx = SillyTavern.getContext();
    const def = ctx.chatCompletionSettings?.openai_max_tokens ?? 2000;
    const val = _runMaxTokens ?? def;
    btn.textContent = val >= 1000 ? `${+(val / 1000).toFixed(1)}k` : String(val);
    btn.classList.toggle('active', _runMaxTokens !== null);
}

function _toggleTokDrop() {
    const existing = document.getElementById('se-cfm-an-tok-drop');
    if (existing) { existing.remove(); return; }

    const btn = _panel?.querySelector('#se-cfm-an-tok');
    if (!btn) return;

    const ctx     = SillyTavern.getContext();
    const def     = ctx.chatCompletionSettings?.openai_max_tokens ?? 2000;
    const current = _runMaxTokens ?? def;

    const drop = document.createElement('div');
    drop.id        = 'se-cfm-an-tok-drop';
    drop.className = 'se-cfm-an-tok-drop';
    const defDisplay = def >= 1000 ? `${+(def / 1000).toFixed(1)}k` : String(def);
    const tokFooter  = _runMaxTokens !== null
        ? `<button class="se-cfm-an-tok-reset">&#x2715; Reset to ST default (${defDisplay})</button>`
        : `<div class="se-cfm-an-tok-hint">ST default: ${defDisplay}</div>`;
    drop.innerHTML =
        `<div class="se-cfm-an-tok-drop-lbl">Response token limit</div>` +
        `<div class="se-cfm-an-tok-drop-row">` +
        `<input class="se-cfm-an-tok-inp" type="number" min="256" max="32000" step="256" value="${current}">` +
        `<button class="se-cfm-an-tok-set">Set</button>` +
        `</div>` +
        tokFooter;

    const rect     = btn.getBoundingClientRect();
    drop.style.top  = `${rect.bottom + 6}px`;
    drop.style.left = `${rect.left}px`;
    document.body.appendChild(drop);

    const inp = /** @type {HTMLInputElement} */ (drop.querySelector('.se-cfm-an-tok-inp'));
    inp.focus();
    inp.select();

    const _apply = () => {
        const v = Number.parseInt(inp.value, 10);
        if (!isNaN(v) && v >= 256) {
            _runMaxTokens = v;
            drop.remove();
            _updateTokBtn();
        }
    };

    drop.querySelector('.se-cfm-an-tok-set').addEventListener('click', _apply);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') _apply(); });

    drop.querySelector('.se-cfm-an-tok-reset')?.addEventListener('click', () => {
        _runMaxTokens = null;
        drop.remove();
        _updateTokBtn();
    });

    setTimeout(() => {
        const dismiss = e => {
            if (!drop.contains(e.target) && e.target !== btn) {
                drop.remove();
                document.removeEventListener('mousedown', dismiss, { capture: true });
            }
        };
        document.addEventListener('mousedown', dismiss, { capture: true });
    }, 0);
}

// ─── Token estimation ─────────────────────────────────────────

async function _estimateChatTokens(fileName) {
    try {
        const ctx = SillyTavern.getContext();
        const resp = await fetch('/getchat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...ctx.getRequestHeaders() },
            body: JSON.stringify({
                ch_name:    _char?.name   ?? '',
                file_name:  fileName.replace(/\.jsonl$/, ''),
                avatar_url: _char?.avatar ?? '',
            }),
        });
        if (!resp.ok) return null;
        const lines    = await resp.json();
        const messages = Array.isArray(lines) ? lines : (lines?.chat ?? []);
        const text     = messages
            .filter(m => m.mes || m.content)
            .map(m => `${m.name ?? m.role ?? 'Unknown'}: ${m.mes ?? m.content}`)
            .join('\n\n');
        return Math.ceil(text.length / 4);
    } catch { return null; }
}

// ─── LLM helper ──────────────────────────────────────────────

async function _callLLM(sysPrompt, userMsg) {
    const ctx = SillyTavern.getContext();
    const oai = ctx.chatCompletionSettings;
    const r   = await fetch('/api/backends/chat-completions/generate', {
        method: 'POST',
        headers: ctx.getRequestHeaders(),
        body: JSON.stringify({
            type: 'quiet',
            chat_completion_source: oai.chat_completion_source,
            model: ctx.getChatCompletionModel(),
            messages: [
                { role: 'system', content: sysPrompt },
                { role: 'user',   content: userMsg   },
            ],
            max_tokens: _runMaxTokens ?? oai.openai_max_tokens ?? 2000,
            temperature: 0.3,
            stream: false,
        }),
    });
    if (!r.ok) throw new Error(`API ${r.status}`);
    const d = await r.json();
    return d?.choices?.[0]?.message?.content || d?.choices?.[0]?.text || '';
}

async function _callLLMWithRetry(sysPrompt, userMsg) {
    const raw = await _callLLM(sysPrompt, userMsg);
    if (_parseAction(raw)) return raw;
    const retryMsg = `[Your response must be a valid JSON object only — no prose before or after]\n\n${userMsg}`;
    return _callLLM(sysPrompt, retryMsg);
}

// ─── Analysis pipeline ────────────────────────────────────────

async function _runAnalysis(fileNode, entryNodes) {
    const runBtn   = _panel?.querySelector('#se-cfm-an-run');
    const setLabel = (msg, spin = false) => {
        if (!runBtn) return;
        runBtn.innerHTML = spin ? `<span class="se-an-spin">&#x27F3;</span> ${msg}` : msg;
        runBtn.disabled = true;
    };

    _apiBusyListener?.(true);

    try {
        const ctx      = SillyTavern.getContext();
        const fileName = fileNode.properties?.fileName ?? '';

        // ── Pass 1: Chat digest ──────────────────────────────────
        setLabel('Pass 1…', true);
        const chatResp = await fetch('/getchat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...ctx.getRequestHeaders() },
            body: JSON.stringify({
                ch_name: _char?.name ?? '',
                file_name: fileName.replace(/\.jsonl$/, ''),
                avatar_url: _char?.avatar ?? '',
            }),
        });
        if (!chatResp.ok) throw new Error(`Failed to load chat: HTTP ${chatResp.status}`);
        const chatLines = await chatResp.json();
        const messages  = Array.isArray(chatLines) ? chatLines : (chatLines?.chat ?? []);
        const chatText  = messages
            .filter(m => m.mes || m.content)
            .map(m => `${m.name ?? m.role ?? 'Unknown'}: ${m.mes ?? m.content}`)
            .join('\n\n');
        if (!chatText) throw new Error('Chat file is empty or could not be read.');

        const digestP1 = await _callLLM(getPrompt('chat-digest'), `Chat history:\n${chatText}`);

        // ── Stages 2 + 3: Unified pipeline dialog ─────────────────
        setLabel('✓ Pass 1');
        const result = await _showPipelineDialog(fileName, digestP1, entryNodes, setLabel);
        if (!result.proceed) { _refreshRunBtn(); return; }

        // ── Pass 2: Entry analysis — pipeline dialog updates in real-time ──
        const { digest, updateEntry } = result;
        const connectedNums = entryNodes.map(n => n.properties?.num);

        for (let i = 0; i < entryNodes.length; i++) {
            const eNode = entryNodes[i];
            const num   = eNode.properties?.num;
            const entry = state.entries?.get(num);
            if (!entry) { updateEntry(num, ''); continue; }
            setLabel(`Entry #${num} (${i + 1}/${entryNodes.length})…`, true);
            const userMsg = `Chat digest:\n${digest}\n\n---\nConnected entries:\n${_buildEntryContext(connectedNums)}\n\n---\nCurrent entry being analysed — Entry #${num}:\n${entry.content}`;
            const raw     = await _callLLM(getPrompt('entry-analysis'), userMsg);
            updateEntry(num, raw);
        }

        setLabel('↺ Re-run');
        setTimeout(() => _refreshRunBtn(), 1200);

    } catch (err) {
        console.error('[SE] Analysis error:', err);
        _showRunError(err.message);
        _refreshRunBtn();
    } finally {
        _apiBusyListener?.(false);
    }
}

// ─── Results dialog — card-based (Stage 3) ────────────────────

const _RC_PER_PAGE = 3;

function _parseAction(raw) {
    try {
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) {
            const obj = JSON.parse(m[0]);
            const a = (obj.action ?? '').toUpperCase();
            if (['REWRITE','SPLIT','MERGE','SWAP','MOVE','NO_CHANGE'].includes(a)) return { ...obj, action: a };
        }
    } catch { /* not JSON */ }
    for (const a of ['SPLIT','MERGE','SWAP','MOVE','REWRITE','NO_CHANGE']) {
        if (raw.toUpperCase().includes(a)) return { action: a };
    }
    return null;
}

function _actionClass(action) {
    return ({ REWRITE:'rewrite', SPLIT:'split', MERGE:'merge', SWAP:'swap', MOVE:'move', NO_CHANGE:'no-change' })[action] ?? 'pending';
}

const _ACTION_LABELS = { REWRITE:'↺ Rewrite', SPLIT:'✂ Split', MERGE:'⬡ Merge', SWAP:'⇄ Swap', MOVE:'→ Move', NO_CHANGE:'✓ No change' };

function _normaliseTarget(parsed) {
    const raw = parsed.target ?? parsed.with ?? parsed.entry ?? parsed.to ?? null;
    const n   = Number(raw);
    return !isNaN(n) && raw !== null ? n : null;
}

function _actionIcon(action) {
    if (action === 'SPLIT') return '✂';
    if (action === 'MERGE') return '⧫';
    if (action === 'MOVE')  return '→';
    return '⇄';
}

function _actionDesc(n, p, target) {
    if (p.action === 'SPLIT') return `Split #${n} into ${p.parts?.length ?? '?'} entries`;
    if (p.action === 'MERGE') return `Merge #${n} + #${target ?? (n + 1)}`;
    if (p.action === 'MOVE')  return `Move #${n} to after #${target ?? '?'}`;
    return `Swap #${n} ↔ #${target}`;
}

function _makePlanNote(parsed, num) {
    if (!parsed) return '';
    const a = parsed.action;
    let icon, text, canApply = false;

    if (a === 'SPLIT') {
        const parts  = parsed.parts;
        const into   = Array.isArray(parts) ? parts.length : (parsed.into ?? parsed.count ?? '?');
        icon     = '&#x2702;';
        text     = `Split into ${into} entries — entries #${num + 1}+ shift down`;
        canApply = Array.isArray(parts) && parts.length >= 2;
    } else if (a === 'MERGE') {
        const target = _normaliseTarget(parsed) ?? (num + 1);
        icon     = '&#x29EB;';
        text     = `Merge with entry #${target} — entries renumber`;
        canApply = _normaliseTarget(parsed) !== null;
    } else if (a === 'SWAP') {
        const target = _normaliseTarget(parsed);
        icon = '&#x21C4;';
        if (target === null) {
            text = `Swap — re-run to get target entry`;
        } else {
            text     = `Swap content with entry #${target}`;
            canApply = true;
        }
    } else if (a === 'MOVE') {
        const target = _normaliseTarget(parsed);
        icon = '&#x2192;';
        if (target === null) {
            text = `Move — re-run to get target position`;
        } else {
            text     = `Move #${num} to after entry #${target}`;
            canApply = true;
        }
    } else {
        return '';
    }

    return `<div class="se-cfm-an-rc-plan">` +
        `<span class="se-cfm-an-rc-plan-icon">${icon}</span>` +
        `<span class="se-cfm-an-rc-plan-txt">${escHtml(text)}</span>` +
        (canApply
            ? `<button class="se-cfm-an-rc-apply" data-apply-num="${num}">Apply</button>`
            : '') +
        `</div>`;
}

// ─── Structural apply operations (staged — caller owns persist/revert) ───────

function _stageSwap(numA, numB) {
    const a = state.entries.get(numA);
    const b = state.entries.get(numB);
    if (!a || !b) throw new Error(`Entry #${numA} or #${numB} not found`);
    [a.content, b.content] = [b.content, a.content];
    state.modified.add(numA);
    state.modified.add(numB);
    renderTable();
}

function _stageMoveForward(numFrom, numAfter, moving, proposed) {
    for (let n = numFrom; n < numAfter; n++) {
        const src = state.entries.get(n + 1);
        if (src) { state.entries.set(n, { ...src, num: n }); state.modified.add(n); }
    }
    const landed = { ...moving, num: numAfter };
    if (proposed) landed.content = proposed;
    state.entries.set(numAfter, landed);
    state.modified.add(numAfter);
}

function _stageMoveBackward(numFrom, numAfter, moving, proposed) {
    for (let n = numFrom; n > numAfter + 1; n--) {
        const src = state.entries.get(n - 1);
        if (src) { state.entries.set(n, { ...src, num: n }); state.modified.add(n); }
    }
    const landed = { ...moving, num: numAfter + 1 };
    if (proposed) landed.content = proposed;
    state.entries.set(numAfter + 1, landed);
    state.modified.add(numAfter + 1);
}

function _stageMove(numFrom, numAfter, proposed = null) {
    if (!state.entries.has(numFrom)) throw new Error(`Entry #${numFrom} not found`);
    if (numFrom === numAfter || numFrom === numAfter + 1) return;
    const moving = { ...state.entries.get(numFrom) };
    if (numFrom < numAfter) {
        _stageMoveForward(numFrom, numAfter, moving, proposed);
    } else {
        _stageMoveBackward(numFrom, numAfter, moving, proposed);
    }
    detectGaps();
    renderTable();
}

function _stageMerge(numKeep, numRemove) {
    const keep   = state.entries.get(numKeep);
    const remove = state.entries.get(numRemove);
    if (!keep || !remove) throw new Error(`Entry #${numKeep} or #${numRemove} not found`);
    keep.content = `${keep.content}\n${remove.content}`.trim();
    state.modified.add(numKeep);
    if (remove.actId) state.acts.get(remove.actId)?.entryNums.delete(numRemove);
    state.entries.delete(numRemove);
    state.selected.delete(numRemove);
    state.modified.delete(numRemove);
    shiftEntriesUp(numRemove, -1);
    detectGaps();
    renderTable();
}

function _stageSplit(num, parts) {
    if (!Array.isArray(parts) || parts.length < 2) throw new Error('SPLIT requires at least 2 parts');
    const entry = state.entries.get(num);
    if (!entry) throw new Error(`Entry #${num} not found`);
    const { actId, date, time, location, source } = entry;
    shiftEntriesUp(num, parts.length - 1);
    if (actId) state.acts.get(actId)?.entryNums.delete(num);
    for (let i = 0; i < parts.length; i++) {
        const n = num + i;
        state.entries.set(n, {
            num: n, content: parts[i].trim(),
            date: i === 0 ? (date || '') : '',
            time: i === 0 ? (time || '') : '',
            location: i === 0 ? (location || '') : '',
            notes: '', actId: actId || null, source: source || '',
        });
        if (actId) state.acts.get(actId)?.entryNums.add(n);
    }
    detectGaps();
    renderTable();
}

function _buildShiftBanner(entryNums, resultsByNum) {
    const ops = [];
    for (const num of entryNums) {
        const raw = resultsByNum[num] ?? '';
        const p = _parseAction(raw);
        if (!p) continue;
        if (p.action === 'SPLIT') ops.push({ type: 'split', num, into: p.into ?? p.parts ?? p.count ?? '?' });
        if (p.action === 'MERGE') ops.push({ type: 'merge', num, with_: p.with ?? p.target ?? (num + 1) });
    }
    if (!ops.length) return '';
    const lines = ops.map(o =>
        o.type === 'split'
            ? `Entry #${o.num} → split into ${o.into} entries`
            : `Entry #${o.num} → merge with #${o.with_}`
    ).join(' · ');
    return `<div class="se-cfm-an-shift-banner">` +
        `<span class="se-cfm-an-shift-icon">&#9432;</span>` +
        `<span><strong>Planned structural changes:</strong> ${escHtml(lines)}. ` +
        `Affected entries below will renumber when applied.</span>` +
        `</div>`;
}

function _cardHtml(num, snippet) {
    return `<div class="se-cfm-an-rc" id="se-cfm-an-rc-${num}">` +
        `<div class="se-cfm-an-rc-num">#${num}</div>` +
        `<div class="se-cfm-an-rc-entry">` +
        `<div class="se-cfm-an-rc-entry-lbl">Entry</div>` +
        `<pre class="se-cfm-an-rc-snippet">${escHtml(snippet)}</pre>` +
        `</div>` +
        `<div class="se-cfm-an-rc-right">` +
        `<div class="se-cfm-an-rc-status-row">` +
        `<div class="se-cfm-an-rc-status pending" id="se-cfm-an-rc-s-${num}">&#8987; Waiting</div>` +
        `<button class="se-cfm-an-rc-popout" data-rc-pop="${num}" title="Open full view" disabled>&#x2922;</button>` +
        `</div>` +
        `<textarea class="se-cfm-an-rc-result" id="se-cfm-an-rc-r-${num}" spellcheck="false" disabled placeholder="Analysis output…"></textarea>` +
        `<div id="se-cfm-an-rc-plan-${num}"></div>` +
        `<div class="se-cfm-an-rc-fb-row">` +
        `<textarea class="se-cfm-an-rc-fb" id="se-cfm-an-rc-f-${num}" placeholder="Feedback to re-run…" spellcheck="false" disabled></textarea>` +
        `<button class="se-cfm-an-rc-rerun" data-rc-num="${num}" disabled title="Re-run with feedback">&#8634;</button>` +
        `</div></div></div>`;
}

function _showPipelineDialog(fileName, digestP1, entryNodes, setLabel) {
    document.getElementById('se-cfm-an-pipeline-dlg')?.remove();

    // Deferred resolver — avoids wrapping all logic inside Promise callback
    let _pipeResolve;
    const promise = new Promise(r => { _pipeResolve = r; });

    let _currentNums       = entryNodes.map(n => n.properties?.num);
    const _origNums        = [..._currentNums];
    const _snap            = snapshotState();
    const resultsByNum     = {};
    const confirmedRewrites = {}; // num → confirmed proposed text, used in re-run context
    let _staged        = false;
    let _receivedCount = 0;
    let _isRunning     = false;
    let _resolved      = false;
    let _visitedS3     = false;
    let _currentDigest = digestP1;
    let _showCurrentPage = null;

    // ── Dialog shell ─────────────────────────────────────────────
    const dlg = document.createElement('div');
    dlg.id        = 'se-cfm-an-pipeline-dlg';
    dlg.className = 'se-cfm-an-pipeline-dlg';
    dlg.innerHTML =
        `<div class="se-cfm-an-run-hdr" id="se-cfm-an-pl-hdr">` +
        `<span id="se-cfm-an-pl-title">Pass 1 — Digest Review</span>` +
        `<button class="se-close-circle se-cfm-an-pl-x">&times;</button></div>` +
        `<div class="se-cfm-an-pl-body"></div>`;

    document.body.appendChild(dlg);
    _centerDialog(dlg);
    _makeDraggable(dlg, dlg.querySelector('#se-cfm-an-pl-hdr'));

    const bodyEl  = dlg.querySelector('.se-cfm-an-pl-body');
    const titleEl = dlg.querySelector('#se-cfm-an-pl-title');

    // ── Cancel (any stage) ────────────────────────────────────────
    const _cancel = () => {
        if (_staged) {
            restoreSnapshot(_snap);
            renderTable();
            document.dispatchEvent(new CustomEvent('se:entries-changed'));
        }
        dlg.remove();
        if (!_resolved) _pipeResolve({ proceed: false });
    };
    dlg.querySelector('.se-cfm-an-pl-x').addEventListener('click', _cancel);

    // ── Actions task-list panel ───────────────────────────────────
    const _refreshActionsPanel = () => {
        const btn   = /** @type {HTMLButtonElement|null} */ (bodyEl.querySelector('#se-cfm-an-actions-btn'));
        const panel = /** @type {HTMLElement|null} */ (bodyEl.querySelector('#se-cfm-an-actions-panel'));
        const list  = bodyEl.querySelector('#se-cfm-an-actions-list');
        if (!btn) return;

        const actionItems = _currentNums.map(n => {
            const p = _parseAction(resultsByNum[n] ?? '');
            if (!p || !['SPLIT', 'MERGE', 'SWAP', 'MOVE'].includes(p.action)) return null;
            return { num: n, parsed: p };
        }).filter(Boolean);

        const count = actionItems.length;
        btn.hidden = count === 0;
        btn.textContent = `⚡ Actions (${count})`;
        if (count === 0 && panel) panel.hidden = true;
        if (!list) return;

        list.innerHTML = actionItems.map(({ num: n, parsed: p }) => {
            const icon   = _actionIcon(p.action);
            const target = _normaliseTarget(p);
            const desc   = _actionDesc(n, p, target);
            return `<li class="se-cfm-an-action-item">` +
                `<span class="se-cfm-an-action-icon">${icon}</span>` +
                `<span class="se-cfm-an-action-lbl">${escHtml(desc)}</span>` +
                `<button class="se-cfm-an-action-apply" data-action-num="${n}">Apply</button>` +
                `</li>`;
        }).join('');
    };

    // ── Mutable entry list helpers ────────────────────────────────
    const _updateCurrentNums = (action, num, parsed) => {
        if (action === 'SPLIT') {
            const n = parsed.parts?.length ?? 0;
            if (n < 2) return;
            _currentNums = _currentNums.flatMap(x => {
                if (x === num) return Array.from({ length: n }, (_, i) => num + i);
                if (x > num) return [x + n - 1];
                return [x];
            });
        } else if (action === 'MERGE') {
            const target = parsed.target ?? parsed.with ?? (num + 1);
            _currentNums = _currentNums.filter(x => x !== target).map(x => x > target ? x - 1 : x);
        } else if (action === 'MOVE') {
            const target = _normaliseTarget(parsed);
            if (target === null) return;
            if (num < target) {
                // moving forward: num disappears, entries [num+1..target] shift down, num lands at target
                _currentNums = _currentNums.map(x => {
                    if (x === num) return target;
                    if (x > num && x <= target) return x - 1;
                    return x;
                });
            } else if (num > target + 1) {
                // moving backward: num disappears, entries [target+1..num-1] shift up, num lands at target+1
                _currentNums = _currentNums.map(x => {
                    if (x === num) return target + 1;
                    if (x > target && x < num) return x + 1;
                    return x;
                });
            }
        }
        // SWAP: nums don't change
    };

    const _rerenderCards = () => {
        const listEl = /** @type {HTMLElement|null} */ (bodyEl.querySelector('#se-cfm-an-rc-list'));
        if (!listEl) return;
        listEl.innerHTML = _currentNums.map(n => {
            const entry   = state.entries?.get(n);
            const snippet = entry ? String(entry.content ?? '').slice(0, 280) : '';
            return _cardHtml(n, snippet + (snippet.length >= 280 ? '…' : ''));
        }).join('');
        for (const n of _currentNums) {
            if (resultsByNum[n] != null) _applyResult(n, resultsByNum[n]);
        }
        listEl.querySelectorAll('[data-rc-num]').forEach(btn => {
            btn.addEventListener('click', () => _doRerun(
                Number(btn.dataset.rcNum),
                listEl.querySelector(`#se-cfm-an-rc-f-${btn.dataset.rcNum}`)?.value.trim() ?? ''
            ));
        });
        listEl.querySelectorAll('[data-rc-pop]').forEach(btn => {
            btn.addEventListener('click', () => _openEntryDetail(
                Number(btn.dataset.rcPop), _currentDigest, _currentNums, resultsByNum, confirmedRewrites, dlg, _detApplyCallback
            ));
        });
        const totalPages = Math.ceil(_currentNums.length / _RC_PER_PAGE);
        const pager = bodyEl.querySelector('.se-cfm-an-rc-pager');
        if (pager) pager.style.display = totalPages > 1 ? '' : 'none';
        if (totalPages > 1) _showCurrentPage?.(0);
        _enableNewCards();
        _refreshActionsPanel();
    };

    const _handleActionPanelClick = e => {
        const applyBtn = /** @type {HTMLButtonElement|null} */ (e.target.closest('.se-cfm-an-action-apply'));
        if (!applyBtn || applyBtn.disabled) return;
        const num    = Number(applyBtn.dataset.actionNum);
        const parsed = _parseAction(resultsByNum[num] ?? '');
        if (!parsed) return;
        const hintEl = bodyEl.querySelector('#se-cfm-an-rc-footer-hint');
        const hint   = msg => { if (hintEl) hintEl.textContent = msg; };
        applyBtn.disabled = true;
        try {
            if (parsed.action === 'SWAP') {
                const target = _normaliseTarget(parsed);
                if (target === null) throw new Error('No target entry for SWAP');
                _stageSwap(num, target);
                hint(`⇄ Swapped #${num} ↔ #${target} — staged, not yet committed`);
            } else if (parsed.action === 'MERGE') {
                const target = _normaliseTarget(parsed) ?? (num + 1);
                _stageMerge(num, target);
                hint(`⧫ Merged #${num} + #${target} — staged, not yet committed`);
            } else if (parsed.action === 'SPLIT') {
                _stageSplit(num, parsed.parts);
                hint(`✂ Split #${num} into ${parsed.parts.length} entries — staged, not yet committed`);
            } else if (parsed.action === 'MOVE') {
                const target = _normaliseTarget(parsed);
                if (target === null) throw new Error('No target entry for MOVE');
                _stageMove(num, target, parsed.proposed ?? null);
                hint(`→ Moved #${num} to after #${target}${parsed.proposed ? ' + content adjusted' : ''} — staged, not yet committed`);
            }
            _staged = true;
            resultsByNum[num] = JSON.stringify({ action: 'NO_CHANGE', reason: 'Applied' });
            _updateCurrentNums(parsed.action, num, parsed);
            _rerenderCards();
        } catch (err) {
            applyBtn.disabled = false;
            hint(`Error: ${err.message}`);
        }
    };

    // ── _applyResult ──────────────────────────────────────────────
    const _applyResult = (num, raw) => {
        resultsByNum[num] = raw;
        const result = bodyEl.querySelector(`#se-cfm-an-rc-r-${num}`);
        const status = bodyEl.querySelector(`#se-cfm-an-rc-s-${num}`);
        const rerun  = bodyEl.querySelector(`[data-rc-num="${num}"]`);
        const popout = bodyEl.querySelector(`[data-rc-pop="${num}"]`);
        const planEl = bodyEl.querySelector(`#se-cfm-an-rc-plan-${num}`);
        if (result) { result.value = raw; result.disabled = false; }
        if (rerun)  rerun.disabled  = false;
        if (popout) popout.disabled = false;
        const parsed = _parseAction(raw);
        const action = parsed?.action ?? null;
        if (status) {
            status.textContent = _ACTION_LABELS[action] ?? '✓ Done';
            status.className   = `se-cfm-an-rc-status ${_actionClass(action)}`;
        }
        if (planEl) planEl.innerHTML = _makePlanNote(parsed, num);
        const shiftWrap = bodyEl.querySelector('#se-cfm-an-shift-wrap');
        if (shiftWrap) shiftWrap.innerHTML = _buildShiftBanner(_currentNums, resultsByNum);
        _refreshActionsPanel();
    };

    // ── Entry content helper — uses confirmed rewrite if available ─
    const _entryText = num => confirmedRewrites[num] ?? state.entries?.get(num)?.content ?? '';

    const _buildContextWithRewrites = () => {
        const entries = _currentNums
            .map(n => ({ num: n, content: _entryText(n) }))
            .filter(e => e.content)
            .sort((a, b) => a.num - b.num);
        if (!entries.length) return '';
        return entries.map(e => `Entry #${e.num}:\n${e.content}`).join('\n\n---\n');
    };


    // ── Enable controls for new (unanalysed) cards ────────────────
    const _enableNewCards = () => {
        for (const n of _currentNums) {
            if (resultsByNum[n] != null) continue;
            const rerun  = bodyEl.querySelector(`[data-rc-num="${n}"]`);
            const fb     = bodyEl.querySelector(`#se-cfm-an-rc-f-${n}`);
            const popout = bodyEl.querySelector(`[data-rc-pop="${n}"]`);
            if (rerun)  rerun.disabled  = false;
            if (fb)     fb.disabled     = false;
            if (popout) popout.disabled = false;
            const status = bodyEl.querySelector(`#se-cfm-an-rc-s-${n}`);
            if (status) { status.textContent = '⏳ Waiting — click ↺ to analyse'; status.className = 'se-cfm-an-rc-status pending'; }
        }
    };

    // ── _doRerun ──────────────────────────────────────────────────
    const _doRerun = async (num, feedbackVal) => {
        const entryContent = _entryText(num);
        if (!entryContent) return;
        const result = bodyEl.querySelector(`#se-cfm-an-rc-r-${num}`);
        const fb     = bodyEl.querySelector(`#se-cfm-an-rc-f-${num}`);
        const status = bodyEl.querySelector(`#se-cfm-an-rc-s-${num}`);
        const rerun  = bodyEl.querySelector(`[data-rc-num="${num}"]`);
        const popout = bodyEl.querySelector(`[data-rc-pop="${num}"]`);
        if (rerun)  rerun.disabled  = true;
        if (popout) popout.disabled = true;
        if (result) result.disabled = true;
        if (fb)     fb.disabled     = true;
        if (status) { status.innerHTML = '<span class="se-an-spin">&#x27F3;</span> Running…'; status.className = 'se-cfm-an-rc-status pending'; }
        try {
            let userMsg = `Chat digest:\n${_currentDigest}\n\n---\nConnected entries:\n${_buildContextWithRewrites()}\n\n---\nCurrent entry being analysed — Entry #${num}:\n${entryContent}`;
            if (feedbackVal) userMsg += `\n\n---\nFeedback on previous analysis:\n${feedbackVal}`;
            const raw = await _callLLMWithRetry(getPrompt('entry-analysis'), userMsg);
            _applyResult(num, raw);
            if (fb) { fb.value = ''; fb.disabled = false; }
        } catch (err) {
            if (status) { status.textContent = `Error: ${err.message}`; status.className = 'se-cfm-an-rc-status rewrite'; }
            if (fb) fb.disabled = false;
        } finally {
            if (rerun)  rerun.disabled  = false;
            if (popout) popout.disabled = false;
            if (result) result.disabled = false;
        }
    };

    // ── _runOneForRerunAll — extracted to avoid deep nesting ──────
    const _runOneForRerunAll = async num => {
        const entryContent = _entryText(num);
        if (!entryContent) { _applyResult(num, ''); return; }
        const stEl = bodyEl.querySelector(`#se-cfm-an-rc-s-${num}`);
        const rlEl = bodyEl.querySelector(`#se-cfm-an-rc-r-${num}`);
        if (stEl) { stEl.innerHTML = '<span class="se-an-spin">&#x27F3;</span> Running…'; stEl.className = 'se-cfm-an-rc-status pending'; }
        if (rlEl) rlEl.disabled = true;
        setLabel(`Entry #${num}…`, true);
        const userMsg = `Chat digest:\n${_currentDigest}\n\n---\nConnected entries:\n${_buildContextWithRewrites()}\n\n---\nCurrent entry being analysed — Entry #${num}:\n${entryContent}`;
        try {
            const raw = await _callLLMWithRetry(getPrompt('entry-analysis'), userMsg);
            _applyResult(num, raw);
        } catch (err) {
            if (stEl) { stEl.textContent = `Error: ${err.message}`; stEl.className = 'se-cfm-an-rc-status rewrite'; }
        }
    };

    // ── _handleApplyClick — extracted to avoid deep nesting ───────
    const _handleApplyClick = e => {
        const applyBtn = e.target.closest('.se-cfm-an-rc-apply');
        if (!applyBtn || applyBtn.disabled) return;
        const num    = Number(applyBtn.dataset.applyNum);
        const parsed = _parseAction(resultsByNum[num] ?? '');
        if (!parsed) return;
        const hintEl = bodyEl.querySelector('#se-cfm-an-rc-footer-hint');
        const hint   = msg => { if (hintEl) hintEl.textContent = msg; };
        applyBtn.disabled = true;
        try {
            if (parsed.action === 'SWAP') {
                const target = _normaliseTarget(parsed);
                if (target === null) throw new Error('No target entry for SWAP');
                _stageSwap(num, target);
                hint(`⇄ Swapped #${num} ↔ #${target} — staged, not yet committed`);
            } else if (parsed.action === 'MERGE') {
                const target = _normaliseTarget(parsed) ?? (num + 1);
                _stageMerge(num, target);
                hint(`⧫ Merged #${num} + #${target} — staged, not yet committed`);
            } else if (parsed.action === 'SPLIT') {
                _stageSplit(num, parsed.parts);
                hint(`✂ Split #${num} into ${parsed.parts.length} entries — staged, not yet committed`);
            } else if (parsed.action === 'MOVE') {
                const target = _normaliseTarget(parsed);
                if (target === null) throw new Error('No target entry for MOVE');
                _stageMove(num, target, parsed.proposed ?? null);
                hint(`→ Moved #${num} to after #${target}${parsed.proposed ? ' + content adjusted' : ''} — staged, not yet committed`);
            }
            _staged = true;
            resultsByNum[num] = JSON.stringify({ action: 'NO_CHANGE', reason: 'Applied' });
            _updateCurrentNums(parsed.action, num, parsed);
            _rerenderCards();
        } catch (err) {
            applyBtn.disabled = false;
            hint(`Error: ${err.message}`);
        }
    };

    // ── Apply callback passed to _openEntryDetail ─────────────────
    const _detApplyCallback = (num, parsed, _rawVal) => {
        if (parsed.action === 'SWAP') {
            const target = _normaliseTarget(parsed);
            if (target === null) throw new Error('No target entry for SWAP');
            _stageSwap(num, target);
        } else if (parsed.action === 'MERGE') {
            const target = _normaliseTarget(parsed) ?? (num + 1);
            _stageMerge(num, target);
        } else if (parsed.action === 'SPLIT') {
            const parts = parsed.parts ?? parsed.sections;
            if (!Array.isArray(parts) || parts.length < 2) throw new Error('No valid parts for SPLIT');
            _stageSplit(num, parts);
        } else if (parsed.action === 'MOVE') {
            const target = _normaliseTarget(parsed);
            if (target === null) throw new Error('No target entry for MOVE');
            _stageMove(num, target, parsed.proposed ?? null);
        }
        _staged = true;
        resultsByNum[num] = JSON.stringify({ action: 'NO_CHANGE', reason: 'Applied' });
        _updateCurrentNums(parsed.action, num, parsed);
        _rerenderCards();
    };

    // ── updateEntry (exposed to _runAnalysis) ─────────────────────
    const _updateEntry = (num, raw) => {
        _receivedCount++;
        _isRunning = _receivedCount < _origNums.length;
        const backBtn = bodyEl.querySelector('.se-cfm-an-pl-back');
        if (backBtn) backBtn.disabled = _isRunning;
        const fb = bodyEl.querySelector(`#se-cfm-an-rc-f-${num}`);
        if (fb) fb.disabled = false;
        _applyResult(num, raw ?? '');
    };

    // ── Stage 2 renderer ──────────────────────────────────────────
    const renderStage2 = () => {
        const hasRefine = !!getPrompt('digest-refine');
        titleEl.textContent = 'Pass 1 — Digest Review';
        dlg.classList.remove('se-cfm-an-pl-wide');

        bodyEl.innerHTML =
            `<div class="se-cfm-an-digest-body">` +
            `<div class="se-cfm-an-digest-sec">` +
            `<div class="se-cfm-an-digest-lbl">Generated digest <em class="se-cfm-an-digest-status"></em></div>` +
            `<textarea class="se-cfm-an-digest-ta" spellcheck="false"></textarea>` +
            `</div>` +
            (hasRefine
                ? `<div class="se-cfm-an-digest-sec">` +
                  `<div class="se-cfm-an-digest-lbl">Refinement feedback <span style="color:#555;font-weight:400;">(optional)</span></div>` +
                  `<textarea class="se-cfm-an-digest-fb" placeholder="Describe what to improve…" spellcheck="false"></textarea>` +
                  `</div>`
                : '') +
            `</div>` +
            `<div class="se-cfm-an-run-foot">` +
            `<button class="se-cfm-an-run-cancel-btn se-cfm-an-pl-s2-cancel">Cancel</button>` +
            (hasRefine
                ? `<span class="se-cfm-an-digest-refine-wrap">` +
                  `<button class="se-cfm-an-digest-refine-btn">&#8634;&ensp;Refine</button>` +
                  `<span class="se-cfm-an-help-pip" tabindex="0" aria-label="What is Refine?">?` +
                  `<span class="se-cfm-an-pip-tip">Sends the digest back to the LLM with your feedback to improve it before Pass 2 runs. You can refine as many times as you like.</span></span></span>`
                : '') +
            `<button class="se-cfm-an-run-go-btn se-cfm-an-pl-proceed">Pass 2 &rsaquo;</button>` +
            `</div>`;

        const ta     = bodyEl.querySelector('.se-cfm-an-digest-ta');
        const fb     = bodyEl.querySelector('.se-cfm-an-digest-fb');
        const status = bodyEl.querySelector('.se-cfm-an-digest-status');
        ta.value = _currentDigest;

        const lock   = msg => { bodyEl.querySelectorAll('button,textarea').forEach(el => { el.disabled = true; }); if (status) status.textContent = ` — ${msg}`; };
        const unlock = ()   => { bodyEl.querySelectorAll('button,textarea').forEach(el => { el.disabled = false; }); if (status) status.textContent = ''; };

        bodyEl.querySelector('.se-cfm-an-pl-s2-cancel').addEventListener('click', _cancel);
        bodyEl.querySelector('.se-cfm-an-pl-proceed').addEventListener('click', () => {
            _currentDigest = ta.value;
            renderStage3(/* preserveResults */ _resolved);
            if (!_resolved) {
                _resolved = true;
                _pipeResolve({ proceed: true, digest: _currentDigest, updateEntry: _updateEntry });
            }
        });

        bodyEl.querySelector('.se-cfm-an-digest-refine-btn')?.addEventListener('click', async () => {
            const feedback = fb?.value.trim() ?? '';
            const current  = ta.value;
            lock('Refining…');
            try {
                const userMsg = `Current digest:\n${current}` + (feedback ? `\n\nUser feedback:\n${feedback}` : '');
                const refined = await _callLLM(getPrompt('digest-refine'), userMsg);
                if (refined) { ta.value = refined; if (fb) fb.value = ''; }
            } catch (err) {
                if (status) status.textContent = ` — Error: ${err.message}`;
            }
            unlock();
        });
    };

    // ── Stage 3 renderer ──────────────────────────────────────────
    const renderStage3 = preserveResults => {
        titleEl.textContent = `Analysis Results — ${fileName}`;
        dlg.classList.add('se-cfm-an-pl-wide');

        const totalPages = Math.ceil(_currentNums.length / _RC_PER_PAGE);
        const page_      = { v: 0 };

        const rerunBar = _visitedS3
            ? `<div class="se-cfm-an-pl-rerun-bar">` +
              `<span>Digest changed?&ensp;</span>` +
              `<button class="se-cfm-an-pl-rerun-all">&#8634;&ensp;Re-run all entries</button>` +
              `</div>`
            : '';

        const allCardsHtml = _currentNums.map(num => {
            const entry   = state.entries?.get(num);
            const snippet = entry ? String(entry.content ?? '').slice(0, 280) : '';
            return _cardHtml(num, snippet + (snippet.length >= 280 ? '…' : ''));
        }).join('');

        bodyEl.innerHTML =
            rerunBar +
            `<div id="se-cfm-an-shift-wrap"></div>` +
            `<div class="se-cfm-an-actions-bar">` +
            `<button class="se-cfm-an-actions-tog" id="se-cfm-an-actions-btn" hidden>&#9889;&ensp;Actions (0)</button>` +
            `</div>` +
            `<div class="se-cfm-an-actions-panel" id="se-cfm-an-actions-panel" hidden>` +
            `<ul class="se-cfm-an-actions-list" id="se-cfm-an-actions-list"></ul>` +
            `</div>` +
            `<div class="se-cfm-an-results-cards" id="se-cfm-an-rc-list">${allCardsHtml}</div>` +
            (totalPages > 1
                ? `<div class="se-cfm-an-rc-pager">` +
                  `<button class="se-cfm-an-rc-page-btn" id="se-cfm-an-rc-prev" disabled>&#8249; Prev</button>` +
                  `<span class="se-cfm-an-rc-page-lbl" id="se-cfm-an-rc-page-lbl">1 / ${totalPages}</span>` +
                  `<button class="se-cfm-an-rc-page-btn" id="se-cfm-an-rc-next">Next &#8250;</button>` +
                  `</div>`
                : '') +
            `<div class="se-cfm-an-rc-footer">` +
            `<span class="se-cfm-an-rc-footer-hint" id="se-cfm-an-rc-footer-hint"></span>` +
            `<button class="se-cfm-an-run-cancel-btn se-cfm-an-pl-back"` +
            ` title="Back to digest review"${_isRunning ? ' disabled' : ''}>&#8249; Back</button>` +
            `<button class="se-cfm-an-run-cancel-btn se-cfm-an-pl-s3-cancel">Cancel</button>` +
            `<button class="se-cfm-an-run-go-btn se-cfm-an-rc-commit">&#10003;&ensp;Commit changes</button>` +
            `</div>`;

        _visitedS3 = true;

        if (preserveResults) {
            for (const num of _currentNums) {
                if (resultsByNum[num] != null) _applyResult(num, resultsByNum[num]);
            }
        }

        const showPage = p => {
            page_.v = p;
            const start = p * _RC_PER_PAGE;
            const cards = bodyEl.querySelectorAll('.se-cfm-an-rc');
            cards.forEach((card, i) => { card.style.display = (i >= start && i < start + _RC_PER_PAGE) ? '' : 'none'; });
            const lbl = bodyEl.querySelector('#se-cfm-an-rc-page-lbl');
            if (lbl) lbl.textContent = `${p + 1} / ${totalPages}`;
            const prev = bodyEl.querySelector('#se-cfm-an-rc-prev');
            const next = bodyEl.querySelector('#se-cfm-an-rc-next');
            if (prev) prev.disabled = p === 0;
            if (next) next.disabled = p >= totalPages - 1;
        };
        _showCurrentPage = showPage;
        if (totalPages > 1) {
            showPage(0);
            bodyEl.querySelector('#se-cfm-an-rc-prev')?.addEventListener('click', () => showPage(page_.v - 1));
            bodyEl.querySelector('#se-cfm-an-rc-next')?.addEventListener('click', () => showPage(page_.v + 1));
        }

        bodyEl.querySelector('.se-cfm-an-pl-back').addEventListener('click', () => { if (!_isRunning) renderStage2(); });
        bodyEl.querySelector('.se-cfm-an-pl-s3-cancel').addEventListener('click', _cancel);
        bodyEl.querySelector('.se-cfm-an-rc-commit').addEventListener('click', () => {
            if (_staged) { persistState(); document.dispatchEvent(new CustomEvent('se:entries-changed')); }
            dlg.remove();
        });

        bodyEl.querySelector('.se-cfm-an-pl-rerun-all')?.addEventListener('click', async () => {
            const backBtn   = bodyEl.querySelector('.se-cfm-an-pl-back');
            const rerunBtn  = bodyEl.querySelector('.se-cfm-an-pl-rerun-all');
            if (rerunBtn) rerunBtn.disabled = true;
            _isRunning = true;
            if (backBtn) backBtn.disabled = true;
            for (const num of _currentNums) { await _runOneForRerunAll(num); }
            _isRunning = false;
            if (rerunBtn) rerunBtn.disabled = false;
            if (backBtn)  backBtn.disabled  = false;
            setLabel('↺ Re-run');
            setTimeout(() => _refreshRunBtn(), 1200);
        });

        bodyEl.querySelectorAll('[data-rc-num]').forEach(btn => {
            btn.addEventListener('click', () => _doRerun(Number(btn.dataset.rcNum), bodyEl.querySelector(`#se-cfm-an-rc-f-${btn.dataset.rcNum}`)?.value.trim() ?? ''));
        });
        bodyEl.querySelectorAll('[data-rc-pop]').forEach(btn => {
            btn.addEventListener('click', () => _openEntryDetail(Number(btn.dataset.rcPop), _currentDigest, _currentNums, resultsByNum, confirmedRewrites, dlg, _detApplyCallback));
        });

        bodyEl.querySelector('#se-cfm-an-rc-list')?.addEventListener('click', _handleApplyClick);
        bodyEl.querySelector('#se-cfm-an-actions-panel')?.addEventListener('click', _handleActionPanelClick);
        bodyEl.querySelector('#se-cfm-an-actions-btn')?.addEventListener('click', () => {
            const panel = /** @type {HTMLElement|null} */ (bodyEl.querySelector('#se-cfm-an-actions-panel'));
            const btn   = /** @type {HTMLButtonElement|null} */ (bodyEl.querySelector('#se-cfm-an-actions-btn'));
            if (!panel) return;
            panel.hidden = !panel.hidden;
            if (btn) btn.classList.toggle('active', !panel.hidden);
        });
    };

    renderStage2();
    return promise;
}

// ─── Entry detail pop-out ─────────────────────────────────────

function _openEntryDetail(num, digest, connectedNums, resultsByNum, confirmedRewrites, parentDlg, applyCallback = null) {
    const existId = `se-cfm-an-entry-det-${num}`;
    document.getElementById(existId)?.remove();

    const entry          = state.entries?.get(num);
    const originalContent = String(entry?.content ?? '');
    const raw            = resultsByNum[num] ?? '';
    const fbInit         = parentDlg?.querySelector(`#se-cfm-an-rc-f-${num}`)?.value ?? '';

    // Only show entries linked to the connected chat file
    const allEntries = connectedNums
        .map(n => state.entries?.get(n))
        .filter(Boolean)
        .toSorted((a, b) => a.num - b.num);
    const selOptions = allEntries.map(e => {
        const preview = String(e.content ?? '').slice(0, 44).replaceAll('\n', ' ');
        return `<option value="${e.num}" ${e.num === num ? 'selected' : ''}>#${e.num} — ${escHtml(preview)}…</option>`;
    }).join('');

    const det = document.createElement('div');
    det.id = existId;
    det.className = 'se-cfm-an-entry-det';
    det.innerHTML =
        `<div class="se-cfm-an-run-hdr">` +
        `<span>Entry #${num} &mdash; Full View</span>` +
        `<button class="se-close-circle se-cfm-an-det-close">&times;</button></div>` +
        `<div class="se-cfm-an-det-body">` +
        // ── Left col: entry browser + content ──
        `<div class="se-cfm-an-det-col">` +
        `<div class="se-cfm-an-det-entry-nav">` +
        `<select class="se-cfm-an-det-entry-sel" title="Browse all entries for reference">${selOptions}</select>` +
        `<button class="se-cfm-an-det-orig-tog" hidden title="Toggle between proposed and original ingested content">ORIG</button>` +
        `</div>` +
        `<div class="se-cfm-an-digest-lbl se-cfm-an-det-entry-lbl">Entry #${num}</div>` +
        `<pre class="se-cfm-an-det-pre" id="se-cfm-an-det-pre-${num}">${escHtml(originalContent)}</pre>` +
        `</div>` +
        // ── Right col: analysis + feedback ──
        `<div class="se-cfm-an-det-col">` +
        `<div class="se-cfm-an-digest-lbl">Analysis output</div>` +
        `<textarea class="se-cfm-an-det-ta" id="se-cfm-an-det-ta-${num}" spellcheck="false">${escHtml(raw)}</textarea>` +
        `<div class="se-cfm-an-digest-lbl" style="margin-top:8px;">Feedback</div>` +
        `<textarea class="se-cfm-an-det-fb" id="se-cfm-an-det-fb-${num}" placeholder="e.g. Entry #4 should swap with #7; align tone with #3…" spellcheck="false">${escHtml(fbInit)}</textarea>` +
        `<div class="se-cfm-an-det-foot">` +
        `<span class="se-cfm-an-det-status" id="se-cfm-an-det-st-${num}"></span>` +
        `<button class="se-cfm-an-rc-rerun se-cfm-an-det-rerun" data-det-num="${num}">&#8634;&ensp;Re-run</button>` +
        `<button class="se-cfm-an-det-struct-apply" id="se-cfm-an-det-apply-${num}" hidden>&#9889;&ensp;Apply</button>` +
        `<button class="se-cfm-an-digest-proceed-btn se-cfm-an-det-confirm" data-det-num="${num}">&#10003;&ensp;Confirm</button>` +
        `</div></div></div>`;

    document.body.appendChild(det);
    _centerDialog(det);
    _makeDraggable(det, det.querySelector('.se-cfm-an-run-hdr'));

    const preEl   = det.querySelector(`#se-cfm-an-det-pre-${num}`);
    const lblEl   = det.querySelector('.se-cfm-an-det-entry-lbl');
    const selEl   = det.querySelector('.se-cfm-an-det-entry-sel');
    const origTog = det.querySelector('.se-cfm-an-det-orig-tog');

    let proposedContent  = null;
    let showingProposed  = false;
    let refEntryNum      = num;   // which entry the left pane is currently showing

    // ── Entry browser selector ────────────────────────────────────
    const showEntry = n => {
        refEntryNum = n;
        const e = state.entries?.get(n);
        preEl.textContent = String(e?.content ?? '');
        const isCurrent = n === num;
        lblEl.textContent = isCurrent ? `Entry #${num}` : `Entry #${n} (reference)`;
        // Only show proposed toggle when viewing the current entry and a proposal exists
        origTog.hidden = !(isCurrent && proposedContent !== null);
        if (!isCurrent && showingProposed) {
            showingProposed = false;
            origTog.textContent = 'ORIG';
        }
    };

    selEl.addEventListener('change', () => {
        const n = Number(selEl.value);
        showEntry(n);
        // Update right-side analysis and feedback to match the selected entry
        const ta = /** @type {HTMLTextAreaElement|null} */ (det.querySelector(`#se-cfm-an-det-ta-${num}`));
        const fb = /** @type {HTMLTextAreaElement|null} */ (det.querySelector(`#se-cfm-an-det-fb-${num}`));
        const hdr = det.querySelector('.se-cfm-an-run-hdr span');
        if (ta) ta.value = resultsByNum[n] ?? '';
        if (fb) fb.value = '';
        if (hdr) hdr.textContent = `Entry #${n} — Full View`;
        _updateStructApplyBtn(resultsByNum[n] ?? '');
    });

    // ── Proposed/Original toggle ──────────────────────────────────
    origTog.addEventListener('click', () => {
        showingProposed = !showingProposed;
        preEl.textContent = showingProposed ? (proposedContent ?? originalContent) : originalContent;
        origTog.textContent = showingProposed ? 'ORIG' : 'PROPOSED';
        origTog.title = showingProposed
            ? 'Switch back to original ingested content'
            : 'Switch to LLM-proposed rewrite';
        lblEl.textContent = showingProposed ? `Entry #${num} — proposed` : `Entry #${num}`;
    });

    // ── Structural apply button ───────────────────────────────────
    const structApplyBtn = /** @type {HTMLButtonElement|null} */ (det.querySelector(`#se-cfm-an-det-apply-${num}`));
    const taEl2          = /** @type {HTMLTextAreaElement|null} */ (det.querySelector(`#se-cfm-an-det-ta-${num}`));
    const stEl2          = /** @type {HTMLElement|null} */ (det.querySelector(`#se-cfm-an-det-st-${num}`));

    const _updateStructApplyBtn = rawVal => {
        if (!applyCallback || !structApplyBtn) return;
        const p = _parseAction(rawVal);
        const structural = p && (p.action === 'SPLIT' || p.action === 'MERGE' || p.action === 'SWAP' || p.action === 'MOVE');
        structApplyBtn.hidden = !structural;
        if (structural) structApplyBtn.textContent = `⚡ Apply ${p.action}`;
    };

    if (applyCallback) {
        taEl2?.addEventListener('input', function () { _updateStructApplyBtn(this.value); });
        _updateStructApplyBtn(raw);

        structApplyBtn?.addEventListener('click', () => {
            const currentRaw = taEl2?.value ?? '';
            const p = _parseAction(currentRaw);
            if (!p) return;
            try {
                applyCallback(num, p, currentRaw);
                if (stEl2) { stEl2.textContent = `✓ Applied ${p.action}`; stEl2.style.color = '#a6e22e'; }
                structApplyBtn.disabled = true;
                structApplyBtn.textContent = '✓ Applied';
                if (p.action === 'SPLIT' || p.action === 'MERGE') setTimeout(() => det.remove(), 900);
            } catch (err) {
                if (stEl2) { stEl2.textContent = `Error: ${err.message}`; stEl2.style.color = '#f92672'; }
            }
        });
    }

    // ── Close ─────────────────────────────────────────────────────
    det.querySelector('.se-cfm-an-det-close').addEventListener('click', () => det.remove());

    // ── Confirm: write back to card ───────────────────────────────
    det.querySelector('.se-cfm-an-det-confirm').addEventListener('click', () => {
        const activeNum = refEntryNum;
        const taVal  = det.querySelector(`#se-cfm-an-det-ta-${num}`)?.value ?? '';
        const fbVal  = det.querySelector(`#se-cfm-an-det-fb-${num}`)?.value ?? '';
        const cardFb = parentDlg?.querySelector(`#se-cfm-an-rc-f-${activeNum}`);
        const cardRl = parentDlg?.querySelector(`#se-cfm-an-rc-r-${activeNum}`);
        if (cardRl) { cardRl.value = taVal; resultsByNum[activeNum] = taVal; }
        if (cardFb) { cardFb.value = fbVal; cardFb.disabled = false; }
        // Store confirmed rewrite for use in future re-runs
        const parsed = _parseAction(taVal);
        if (parsed?.proposed) confirmedRewrites[activeNum] = parsed.proposed;
        const st = det.querySelector(`#se-cfm-an-det-st-${num}`);
        if (st) { st.textContent = '✓ Confirmed'; st.style.color = '#a6e22e'; }
        // Feedback badge on card
        let badge = parentDlg?.querySelector(`#se-cfm-an-rc-fb-badge-${activeNum}`);
        if (!badge) {
            const statusRow = parentDlg?.querySelector(`#se-cfm-an-rc-s-${activeNum}`)?.parentElement;
            if (statusRow) {
                badge = document.createElement('span');
                badge.id = `se-cfm-an-rc-fb-badge-${activeNum}`;
                badge.className = 'se-cfm-an-rc-fb-badge';
                badge.title = 'Feedback written back to card from detail view';
                badge.textContent = '✓ Feedback';
                statusRow.appendChild(badge);
            }
        }
        det.remove();
    });

    // ── Re-run ────────────────────────────────────────────────────
    det.querySelector('.se-cfm-an-det-rerun').addEventListener('click', async () => {
        const entry2 = state.entries?.get(num);
        if (!entry2) return;
        const fbVal  = det.querySelector(`#se-cfm-an-det-fb-${num}`)?.value.trim() ?? '';
        const taEl   = det.querySelector(`#se-cfm-an-det-ta-${num}`);
        const stEl   = det.querySelector(`#se-cfm-an-det-st-${num}`);
        const rerunB = det.querySelector('.se-cfm-an-det-rerun');
        const confB  = det.querySelector('.se-cfm-an-det-confirm');
        rerunB.disabled = confB.disabled = true;
        if (taEl) taEl.disabled = true;
        if (stEl) { stEl.innerHTML = '<span class="se-an-spin">&#x27F3;</span> Running…'; stEl.style.color = '#75715e'; }
        try {
            const content2 = confirmedRewrites[num] ?? entry2.content;
            let userMsg = `Chat digest:\n${digest}\n\n---\nConnected entries:\n${_buildEntryContext(connectedNums)}\n\n---\nCurrent entry being analysed — Entry #${num}:\n${content2}`;
            if (fbVal) userMsg += `\n\n---\nFeedback:\n${fbVal}`;
            const newRaw = await _callLLMWithRetry(getPrompt('entry-analysis'), userMsg);
            if (taEl) taEl.value = newRaw;
            resultsByNum[num] = newRaw;

            // If the result contains a proposed rewrite, show it on the left
            const parsed = _parseAction(newRaw);
            const proposal = parsed?.proposed ?? parsed?.rewritten ?? parsed?.suggestion ?? null;
            if (proposal) {
                proposedContent = proposal;
                showingProposed = true;
                if (refEntryNum === num) {
                    preEl.textContent = proposedContent;
                    lblEl.textContent = `Entry #${num} — proposed`;
                    origTog.textContent = 'ORIG';
                    origTog.title = 'Switch back to original ingested content';
                    origTog.hidden = false;
                }
            }

            if (stEl) { stEl.textContent = '✓ Done'; stEl.style.color = '#a6e22e'; }
        } catch (err) {
            if (stEl) { stEl.textContent = `Error: ${err.message}`; stEl.style.color = '#f92672'; }
        } finally {
            rerunB.disabled = confB.disabled = false;
            if (taEl) taEl.disabled = false;
        }
    });
}

function _showRunError(msg) {
    document.getElementById('se-cfm-an-results-dlg')?.remove();
    const dlg = document.createElement('div');
    dlg.id = 'se-cfm-an-results-dlg';
    dlg.className = 'se-cfm-an-results-dlg';
    dlg.innerHTML =
        `<div class="se-cfm-an-run-hdr" style="background:#3a1018;">` +
        `<span style="color:#f92672;">Analysis Error</span>` +
        `<button class="se-close-circle se-cfm-an-results-close">&times;</button></div>` +
        `<div style="padding:16px;color:#f8b0b0;font-size:12px;">${escHtml(msg)}</div>`;
    document.body.appendChild(dlg);
    _centerDialog(dlg);
    _makeDraggable(dlg, dlg.querySelector('.se-cfm-an-run-hdr'));
    dlg.querySelector('.se-cfm-an-results-close').addEventListener('click', () => dlg.remove());
}

// ─── Tooltip widget ───────────────────────────────────────────

function _initTooltips(toolbar) {
    if (!toolbar) return;
    if (!_tipEl) {
        _tipEl = document.createElement('div');
        _tipEl.className = 'se-cfm-an-tip';
        document.body.appendChild(_tipEl);
    }
    toolbar.querySelectorAll('[data-tip]').forEach(btn => {
        btn.addEventListener('mouseenter', () => {
            _tipEl.textContent = btn.dataset.tip;
            _tipEl.style.display = 'block';
            _tipEl.style.visibility = 'hidden';
            requestAnimationFrame(() => {
                const r  = btn.getBoundingClientRect();
                const tw = _tipEl.offsetWidth;
                _tipEl.style.left = `${Math.max(4, Math.min(window.innerWidth - tw - 4, r.left + r.width / 2 - tw / 2))}px`;
                _tipEl.style.top  = `${r.bottom + 6}px`;
                _tipEl.style.visibility = 'visible';
            });
        });
        btn.addEventListener('mouseleave', () => { _tipEl.style.display = 'none'; });
        btn.addEventListener('click',      () => { _tipEl.style.display = 'none'; });
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
        `<span class="se-cfm-an-pdlg-title">Analyze Prompts</span>` +
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
    const allNodes = _graph._nodes;
    if (!allNodes.length) return;
    const GRID       = 22;
    const fileNodes  = allNodes.filter(n => n.type === 'se/chat_file');
    const entryNodes = allNodes.filter(n => n.type === 'se/entry');
    fileNodes.forEach((n, i)  => { n.pos = [GRID * 2,  (2 + i * 6) * GRID]; });
    entryNodes.forEach((n, i) => { n.pos = [GRID * 14, (2 + i * 6) * GRID]; });
    _lgc.setDirty(true, true);
    _fitView();
}

function _snakeLayout() {
    if (!_lgc || !_graph) return;
    const allNodes = _graph._nodes;
    if (!allNodes.length) return;
    const fileNodes  = allNodes.filter(n => n.type === 'se/chat_file');
    const entryNodes = allNodes.filter(n => n.type === 'se/entry')
        .sort((a, b) => (a.properties?.num ?? 0) - (b.properties?.num ?? 0));
    const COL_W   = 240;
    const ROW_H   = 110;
    const COLS    = Math.max(3, Math.ceil(Math.sqrt(entryNodes.length)));
    const START_X = 40;
    const START_Y = fileNodes.length ? 160 : 40;
    fileNodes.forEach((n, i) => { n.pos = [START_X + i * COL_W, 40]; });
    entryNodes.forEach((n, i) => {
        const row = Math.floor(i / COLS);
        const col = row % 2 === 0 ? i % COLS : COLS - 1 - (i % COLS);
        n.pos = [START_X + col * COL_W, START_Y + row * ROW_H];
    });
    _lgc.setDirty(true, true);
    _fitView();
}

function _lineLayout() {
    if (!_lgc || !_graph) return;
    const allNodes = _graph._nodes;
    if (!allNodes.length) return;
    const fileNodes  = allNodes.filter(n => n.type === 'se/chat_file');
    const entryNodes = allNodes.filter(n => n.type === 'se/entry')
        .sort((a, b) => (a.properties?.num ?? 0) - (b.properties?.num ?? 0));
    const GAP   = 30;
    const NODE_W = 200;
    let x = 40;
    fileNodes.forEach(n => { n.pos = [x, 80]; x += NODE_W + GAP; });
    if (fileNodes.length) x += 40;
    entryNodes.forEach(n => { n.pos = [x, 80]; x += NODE_W + GAP; });
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
    _refreshRunBtn();
}

function _bindEntryRefresh() {
    document.addEventListener('se:entries-changed', () => {
        if (_graph) {
            const stale = _graph._nodes.filter(n =>
                n.type === 'se/entry' && !state.entries?.has(n.properties?.num)
            );
            stale.forEach(n => _graph.remove(n));
            if (stale.length > 0) _refreshRunBtn();
        }
        _panel?.querySelectorAll('[data-an-add-entry]').forEach(b => {
            const num = Number(b.dataset.anAddEntry);
            const isAdded = !!_graph?._nodes.find(n => n.type === 'se/entry' && n.properties?.num === num);
            b.classList.toggle('added', isAdded);
            b.textContent = isAdded ? '✓' : '+';
        });
        refreshEntries();
    });
}

// ─── Helpers ─────────────────────────────────────────────────

function _buildEntryContext(nums) {
    const entries = nums
        .map(n => state.entries?.get(n))
        .filter(Boolean)
        .toSorted((a, b) => a.num - b.num);
    if (!entries.length) return '';
    return entries.map(e => `Entry #${e.num}:\n${e.content}`).join('\n\n---\n');
}

function _anRelDate(val) {
    if (!val) return '';
    let ms;
    if (typeof val === 'number') ms = val > 1e10 ? val : val * 1000;
    else { ms = Date.parse(String(val)); if (Number.isNaN(ms)) return ''; }
    const days = Math.floor((Date.now() - ms) / 86_400_000);
    if (days <= 0) return 'Today';
    if (days === 1) return '1d';
    if (days < 30) return `${days}d`;
    const wk = Math.floor(days / 7);
    if (wk < 8) return `${wk}w`;
    return `${Math.floor(days / 30)}mo`;
}

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
