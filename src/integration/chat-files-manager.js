/**
 * @module chat-files-manager
 * @description Inline overlay panel for browsing and editing SillyTavern
 * chat JSONL files. Renders inside #se-panel-arcs (fills the arcs area).
 * Pop-out and fullscreen modes available via header buttons.
 */

import { escHtml } from '../core/utils.js';
import { loadTemplate } from '../core/template-loader.js';
import { TEMPLATES } from '../core/constants.js';
import { bindEditorControls, selectFile, applyFileSearch, clearFileSearch, clearEditorSession } from './chat-files-editor.js';
import { initAnalyser, destroyAnalyser, refreshEntries, refreshAnalyserCanvas, getGraphState, setGraphState, addFileNode, onApiStateChange, onActiveFileChange, setRunButtonBlocked } from './chat-files-analyser.js';

let _panel = null;
let _currentChar = null;
let _files = [];
let _analyserReady = false;
let _popped = false;
let _dragAbort = null;
let _contentCache = {};   // fileName → messages[] (fetched on demand, lives for panel lifetime)
let _searchGen    = 0;    // incremented on each new search to cancel stale async runs
let _searchTimer  = null;
let _focusLockAbort = null;

// ─── Analyse tab state ────────────────────────────────────────
// Each tab stores its own serialized LiteGraph state (graphData).
// Only one analyser instance is active at a time; switching tabs
// saves the current graph, destroys, re-inits, and restores.

/** @type {Array<{id:number, label:string, tooltip?:string, graphData:object|null}>} */
let _tabs          = [];
let _activeTabId   = null;
let _nextTabId     = 1;
let _busyTabId     = null;
let _selectedFileName = null;

// ─── Public API ──────────────────────────────────────────────

export async function openChatFilesManager(char) {
    closeChatFilesManager();
    _currentChar = char;
    _popped = false;

    const html = await loadTemplate(TEMPLATES.CHAT_FILES_MANAGER);
    _panel = document.createElement('div');
    _panel.id = 'se-cfm-panel';
    _panel.className = 'se-cfm-panel';
    _panel.innerHTML = html;

    document.querySelector('#se-panel-arcs .se-acts-content').appendChild(_panel);
    _panel.querySelector('#se-cfm-char-name').textContent = char.name;

    _bindPanelEvents();
    bindEditorControls(_panel);
    await _loadFileList();

    requestAnimationFrame(() => _panel?.classList.add('open'));
}

export function closeChatFilesManager() {
    clearTimeout(_searchTimer);
    _unlockSearchFocus();
    clearFileSearch();
    clearEditorSession();
    destroyAnalyser();
    _detachDrag();
    _panel?.remove();
    _panel         = null;
    _files         = [];
    _analyserReady = false;
    _contentCache  = {};
    _searchGen     = 0;
    _tabs             = [];
    _activeTabId      = null;
    _nextTabId        = 1;
    _busyTabId        = null;
    _selectedFileName = null;
}

// ─── Search focus lock ────────────────────────────────────────
// While a content-search debounce is pending, keep focus in the search
// input so accidental Tab / clicks don't land in the editor area.
// Released when the timer fires, the query is cleared, or the user
// deliberately clicks an editable field or the find-bar nav buttons.

function _lockSearchFocus() {
    if (_focusLockAbort) return;
    _focusLockAbort = new AbortController();
    document.addEventListener('focusin', _onSearchFocusIn, { signal: _focusLockAbort.signal });
}

function _unlockSearchFocus() {
    _focusLockAbort?.abort();
    _focusLockAbort = null;
}

function _onSearchFocusIn(e) {
    const t = e.target;
    // Allowed: the search input itself and its clear button
    if (t.id === 'se-cfm-search' || t.id === 'se-cfm-search-clear') return;
    // Allowed + unlock: user intentionally clicked an editable content area
    if (t.id === 'se-cfm-textarea' || t.classList?.contains('se-cfm-mes-field')) {
        _unlockSearchFocus();
        return;
    }
    // Allowed + unlock: find-bar nav / close buttons
    if (t.closest?.('#se-cfm-find-bar')) {
        _unlockSearchFocus();
        return;
    }
    // Everything else: snap focus back to search input
    const inp = document.getElementById('se-cfm-search');
    if (inp) requestAnimationFrame(() => inp.focus());
}

// ─── Drag helpers ─────────────────────────────────────────────

function _attachDrag() {
    _detachDrag();
    _dragAbort = new AbortController();
    const { signal } = _dragAbort;
    const header = _panel.querySelector('.se-cfm-header');
    let startX, startY, startLeft, startTop;

    header.addEventListener(
        'pointerdown',
        (e) => {
            if (e.target.closest('button')) return;
            startX = e.clientX;
            startY = e.clientY;
            const rect = _panel.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            header.setPointerCapture(e.pointerId);
        },
        { signal }
    );

    header.addEventListener(
        'pointermove',
        (e) => {
            if (!header.hasPointerCapture(e.pointerId)) return;
            const minV = 48;
            _panel.style.left =
                Math.max(
                    -(_panel.offsetWidth - minV),
                    Math.min(window.innerWidth - minV, startLeft + e.clientX - startX)
                ) + 'px';
            _panel.style.top = Math.max(0, Math.min(window.innerHeight - minV, startTop + e.clientY - startY)) + 'px';
        },
        { signal }
    );

    header.addEventListener(
        'pointerup',
        (e) => {
            if (header.hasPointerCapture(e.pointerId)) header.releasePointerCapture(e.pointerId);
        },
        { signal }
    );
}

function _detachDrag() {
    _dragAbort?.abort();
    _dragAbort = null;
    if (_panel) {
        _panel.style.left = '';
        _panel.style.top = '';
    }
}


// ─── File List ───────────────────────────────────────────────

async function _loadFileList() {
    const listEl = _panel.querySelector('#se-cfm-file-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="se-cfm-hint">Loading&hellip;</div>';

    const ctx = SillyTavern.getContext();
    try {
        const resp = await fetch('/api/characters/chats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...ctx.getRequestHeaders() },
            body: JSON.stringify({ avatar_url: _currentChar.avatar }),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        _renderFileList(Array.isArray(data) ? data : []);
    } catch (err) {
        listEl.innerHTML = `<div class="se-cfm-hint se-cfm-error">Failed to load: ${escHtml(err.message)}</div>`;
    }
}

function _renderFileList(chats) {
    _files = chats.toSorted((a, b) => _toMs(b.last_mes) - _toMs(a.last_mes));
    const listEl = _panel.querySelector('#se-cfm-file-list');
    if (!listEl) return;
    if (!_files.length) {
        listEl.innerHTML = '<div class="se-cfm-hint">No chats found</div>';
        return;
    }

    listEl.innerHTML = _files.map((chat) => _fileItemHtml(chat)).join('');

    listEl.querySelectorAll('[data-cfm-file]').forEach((el) => {
        el.addEventListener('click', () => {
            _selectedFileName = el.dataset.cfmFile;
            _updateTabLimitBtns();
            selectFile(el.dataset.cfmFile, _currentChar);
        });
        _attachMarquee(el);
    });
}

const _LABEL_MAX = 52;

function _fileItemHtml(chat) {
    const name = chat.file_name ?? '';
    const base = name.replace(/\.jsonl$/, '');
    const label = base.length > _LABEL_MAX ? `${base.slice(0, _LABEL_MAX)}…` : base;
    const date = _relDate(chat.last_mes);
    return (
        `<div class="se-cfm-file-item" data-cfm-file="${escHtml(name)}" title="${escHtml(name)}">` +
        `<span class="se-cfm-fname"><span class="se-cfm-fname-text">${escHtml(label)}</span></span>` +
        `<span class="se-cfm-fdate">${date}</span>` +
        '</div>'
    );
}

function _attachMarquee(item) {
    const outer = item.querySelector('.se-cfm-fname');
    const inner = item.querySelector('.se-cfm-fname-text');
    if (!outer || !inner) return;
    item.addEventListener('mouseenter', () => {
        const overflow = inner.scrollWidth - outer.clientWidth;
        if (overflow > 4) {
            const dur = Math.min(0.6 + overflow / 80, 3.5);
            inner.style.transition = `transform ${dur}s ease-in-out`;
            inner.style.transform = `translateX(-${overflow}px)`;
        }
    });
    item.addEventListener('mouseleave', () => {
        inner.style.transition = 'transform 0.25s ease';
        inner.style.transform = '';
    });
}

function _toMs(val) {
    if (!val) return 0;
    if (typeof val === 'number') return val > 1e10 ? val : val * 1000;
    const parsed = Date.parse(String(val));
    return Number.isNaN(parsed) ? 0 : parsed;
}

function _relDate(val) {
    const ms = _toMs(val);
    if (!ms) return '';
    const days = Math.floor((Date.now() - ms) / 86_400_000);
    if (days <= 0) return 'Today';
    if (days === 1) return '1d ago';
    if (days < 30) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 8) return `${weeks}w ago`;
    return `${Math.floor(days / 30)}mo ago`;
}

// ─── Content search ──────────────────────────────────────────

async function _runContentSearch(q, gen) {
    const items = [...(_panel?.querySelectorAll('.se-cfm-file-item') ?? [])];
    for (const chat of _files) {
        if (gen !== _searchGen) return;
        const name = chat.file_name ?? '';
        const el   = items.find(x => x.dataset.cfmFile === name);
        if (el) await _searchOneFile(el, name, q, gen);
    }
}

async function _searchOneFile(el, name, q, gen) {
    const nameMatch = name.toLowerCase().includes(q);
    if (_contentCache[name] === undefined) {
        const spin = document.createElement('span');
        spin.className = 'se-cfm-match-badge se-cfm-match-spin';
        spin.innerHTML = '<span class="se-an-spin">&#x27F3;</span>';
        el.querySelector('.se-cfm-fdate')?.before(spin);
        const msgs = await _fetchChatContent(name);
        if (gen !== _searchGen) return;
        _contentCache[name] = msgs ?? [];
        spin.remove();
    }
    const matchCount = _contentCache[name].filter(
        m => `${m.name ?? ''} ${m.mes ?? m.content ?? ''}`.toLowerCase().includes(q)
    ).length;
    el.querySelector('.se-cfm-match-badge')?.remove();
    if (nameMatch || matchCount > 0) {
        el.style.display = '';
        if (matchCount > 0) {
            const badge = document.createElement('span');
            badge.className   = 'se-cfm-match-badge';
            badge.textContent = `${matchCount} msg${matchCount === 1 ? '' : 's'}`;
            el.querySelector('.se-cfm-fdate')?.before(badge);
        }
    } else {
        el.style.display = 'none';
    }
}

async function _fetchChatContent(fileName) {
    try {
        const ctx  = SillyTavern.getContext();
        const resp = await fetch('/getchat', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', ...ctx.getRequestHeaders() },
            body:    JSON.stringify({
                ch_name:    _currentChar?.name   ?? '',
                file_name:  fileName.replace(/\.jsonl$/, ''),
                avatar_url: _currentChar?.avatar ?? '',
            }),
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        return Array.isArray(data) ? data : (data?.chat ?? []);
    } catch { return null; }
}

// ─── Panel-level events ──────────────────────────────────────

function _bindPanelEvents() {
    _panel.querySelector('.se-cfm-close')?.addEventListener('click', closeChatFilesManager);

    const searchInp  = _panel.querySelector('#se-cfm-search');
    const searchClear = _panel.querySelector('#se-cfm-search-clear');

    const _syncClearBtn = () => {
        if (searchClear) searchClear.hidden = !searchInp?.value;
    };

    searchInp?.addEventListener('input', function () {
        _syncClearBtn();
        const q = this.value.toLowerCase().trim();

        // Instant: filename filter + clear stale badges
        const items = [..._panel.querySelectorAll('.se-cfm-file-item')];
        items.forEach(el => {
            el.querySelector('.se-cfm-match-badge')?.remove();
            el.style.display = !q || el.dataset.cfmFile.toLowerCase().includes(q) ? '' : 'none';
        });

        // Update editor search state immediately
        if (q.length >= 2) applyFileSearch(q);
        else clearFileSearch();

        // Async content search (debounced)
        clearTimeout(_searchTimer);
        ++_searchGen;
        if (q.length >= 2) {
            const gen = _searchGen;
            _lockSearchFocus();
            _searchTimer = setTimeout(() => { _unlockSearchFocus(); _runContentSearch(q, gen); }, 750);
        } else {
            _unlockSearchFocus();
        }
    });

    searchInp?.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            searchInp.value = '';
            searchInp.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });

    searchClear?.addEventListener('click', () => {
        if (searchInp) { searchInp.value = ''; searchInp.dispatchEvent(new Event('input', { bubbles: true })); }
    });

    _panel.querySelector('#se-cfm-btn-popout')?.addEventListener('click', () => {
        _popped = !_popped;
        _panel.classList.toggle('se-cfm-popped', _popped);
        _panel.classList.remove('se-cfm-fullscreen');
        if (_popped) _attachDrag();
        else _detachDrag();
    });

    _panel.querySelector('#se-cfm-btn-fullscreen')?.addEventListener('click', function () {
        const isFull = _panel.classList.toggle('se-cfm-fullscreen');
        if (isFull) {
            _panel.classList.remove('se-cfm-popped');
            _detachDrag();
            _popped = false;
        }
        this.innerHTML = isFull ? '&#x2922;' : '&#x26F6;';
        this.title = isFull ? 'Exit fullscreen' : 'Fullscreen';
    });

    // "+ Analyze" shortcut — opens selected file in a new Analyse canvas tab
    _panel.querySelector('#se-cfm-analyze-shortcut-btn')?.addEventListener('click', () => {
        if (_selectedFileName) _openFileInAnalyseTab(_selectedFileName);
    });

    // Tab switching — Files / Analyse
    _panel.querySelectorAll('.se-cfm-tab').forEach((tab) => {
        tab.addEventListener('click', async () => {
            const target = tab.dataset.tab;
            _panel.querySelectorAll('.se-cfm-tab').forEach((t) => t.classList.toggle('active', t === tab));
            _panel.querySelector('#se-cfm-tab-files').style.display = target === 'files' ? '' : 'none';
            _panel.querySelector('#se-cfm-tab-analyse').style.display = target === 'analyse' ? '' : 'none';

            if (target === 'analyse') {
                if (_analyserReady) {
                    refreshEntries();
                    refreshAnalyserCanvas();
                } else {
                    _analyserReady = true;
                    const saved    = _loadTabState();
                    if (saved) {
                        _tabs        = saved.tabs;
                        _activeTabId = saved.activeTabId;
                        _nextTabId   = saved.nextTabId;
                    } else {
                        _tabs        = [{ id: 1, label: 'Canvas 1', graphData: null }];
                        _activeTabId = 1;
                        _nextTabId   = 2;
                    }
                    _renderTabBar();
                    _bindTabBarEvents();
                    _registerBusyListener();
                    _registerActiveFileListener();
                    await initAnalyser(_panel, _files, _currentChar);
                    const active = _tabs.find(t => t.id === _activeTabId);
                    if (active?.graphData) setGraphState(active.graphData);
                }
            }
        });
    });
}

// ─── Inner analyse tab bar ────────────────────────────────────

// UI state resets on refresh — no localStorage persistence for tabs or canvas.
function _saveTabState() { /* intentional no-op */ }
function _loadTabState()  { return null; }

function _fileTabLabel(fileName) {
    const base = fileName.replace(/\.jsonl$/, '');
    return base.length > 22 ? `${base.slice(0, 22)}…` : base;
}

function _renderTabBar() {
    const bar = _panel?.querySelector('#se-cfm-an-inner-tab-bar');
    if (!bar) return;
    bar.querySelectorAll('.se-cfm-an-inner-tab-item').forEach(el => el.remove());
    const newBtn = bar.querySelector('#se-cfm-an-tab-new');
    for (const tab of _tabs) {
        const item = document.createElement('div');
        const classes = ['se-cfm-an-inner-tab-item'];
        if (tab.id === _activeTabId) classes.push('active');
        if (tab.id === _busyTabId)   classes.push('se-cfm-an-tab-busy');
        item.className = classes.join(' ');
        item.dataset.tabId = String(tab.id);
        item.draggable = true;
        item.innerHTML =
            `<span class="se-cfm-an-inner-tab-label" title="${escHtml(tab.tooltip ?? tab.label)}">${escHtml(tab.label)}</span>` +
            (_tabs.length > 1 ? `<button class="se-cfm-an-inner-tab-close" data-close-tab="${tab.id}" draggable="false" title="Close">×</button>` : '');
        newBtn.before(item);
    }
    _updateTabLimitBtns();
}

function _bindTabBarEvents() {
    const bar = _panel?.querySelector('#se-cfm-an-inner-tab-bar');
    if (!bar) return;

    bar.addEventListener('click', async e => {
        const closeBtn = e.target.closest('[data-close-tab]');
        if (closeBtn) { await _closeTab(Number(closeBtn.dataset.closeTab)); return; }
        const item = e.target.closest('.se-cfm-an-inner-tab-item');
        if (item) await _switchTab(Number(item.dataset.tabId));
    });
    bar.querySelector('#se-cfm-an-tab-new')?.addEventListener('click', () => _createTab());

    // ── Drag-to-reorder ─────────────────────────────────────────
    // Rects cached once on dragstart — no getBoundingClientRect() during drag.
    // dragover updates throttled to one rAF per frame.
    let dragId        = null;
    let dragRects     = null; // [{el, id, left, mid, right}]
    let dragOverEl    = null; // last highlighted element — avoids querySelectorAll
    let rafPending    = false;

    const clearDrag = () => {
        if (dragOverEl) {
            dragOverEl.classList.remove('se-cfm-an-tab-drag-before', 'se-cfm-an-tab-drag-after');
            dragOverEl = null;
        }
    };

    bar.addEventListener('dragstart', e => {
        const item = e.target.closest('.se-cfm-an-inner-tab-item');
        if (!item) return;
        dragId = Number(item.dataset.tabId);
        e.dataTransfer.effectAllowed = 'move';
        dragRects = [...bar.querySelectorAll('.se-cfm-an-inner-tab-item')].map(el => {
            const r = el.getBoundingClientRect();
            return { el, id: Number(el.dataset.tabId), left: r.left, mid: r.left + r.width / 2, right: r.right };
        });
    });

    bar.addEventListener('dragover', e => {
        e.preventDefault();
        if (rafPending) return;
        rafPending = true;
        const clientX = e.clientX; // capture before rAF — event may be recycled
        requestAnimationFrame(() => {
            rafPending = false;
            if (dragId === null || !dragRects) return;
            const hit = dragRects.find(r => r.id !== dragId && clientX >= r.left && clientX <= r.right);
            if (!hit) return;
            const before = clientX < hit.mid;
            if (dragOverEl === hit.el) {
                hit.el.classList.toggle('se-cfm-an-tab-drag-before', before);
                hit.el.classList.toggle('se-cfm-an-tab-drag-after', !before);
                return;
            }
            clearDrag();
            dragOverEl = hit.el;
            hit.el.classList.add(before ? 'se-cfm-an-tab-drag-before' : 'se-cfm-an-tab-drag-after');
        });
    });

    bar.addEventListener('dragleave', e => {
        if (!bar.contains(e.relatedTarget)) clearDrag();
    });

    bar.addEventListener('drop', e => {
        e.preventDefault();
        const item = e.target.closest('.se-cfm-an-inner-tab-item');
        const dropId = item ? Number(item.dataset.tabId) : null;
        clearDrag();
        if (dragId === null || dropId === null || dragId === dropId) { dragId = null; dragRects = null; return; }
        const fromIdx = _tabs.findIndex(t => t.id === dragId);
        if (fromIdx < 0) { dragId = null; dragRects = null; return; }
        const cached = dragRects?.find(r => r.id === dropId);
        const insertBefore = cached ? e.clientX < cached.mid : false;
        const [moved] = _tabs.splice(fromIdx, 1);
        const newToIdx = _tabs.findIndex(t => t.id === dropId);
        if (newToIdx < 0) { _tabs.splice(fromIdx, 0, moved); dragId = null; dragRects = null; return; }
        _tabs.splice(insertBefore ? newToIdx : newToIdx + 1, 0, moved);
        dragId = null; dragRects = null;
        _renderTabBar();
    });

    bar.addEventListener('dragend', () => { clearDrag(); dragId = null; dragRects = null; rafPending = false; });
}

function _dedupeLabel(base, currentTabId) {
    const others = new Set(_tabs.filter(t => t.id !== currentTabId).map(t => t.label));
    if (!others.has(base)) return base;
    let n = 2;
    while (others.has(`${base} - ${n}`)) n++;
    return `${base} - ${n}`;
}

const _CANVAS_RE = /^Canvas (\d+)$/;

function _nextCanvasNum() {
    const used = new Set(
        _tabs.map(t => { const m = _CANVAS_RE.exec(t.label ?? ''); return m ? Number(m[1]) : null; })
             .filter(n => n !== null)
    );
    let n = 1;
    while (used.has(n)) n++;
    return n;
}

const _TAB_LIMIT = 10;

function _updateTabLimitBtns() {
    const atLimit = _tabs.length >= _TAB_LIMIT;
    _panel?.querySelector('#se-cfm-an-tab-new')?.toggleAttribute('disabled', atLimit);
    const analyzeBtn = _panel?.querySelector('#se-cfm-analyze-shortcut-btn');
    if (analyzeBtn) analyzeBtn.disabled = atLimit || !_selectedFileName;
}

function _registerBusyListener() {
    onApiStateChange(busy => {
        _busyTabId = busy ? _activeTabId : null;
        _renderTabBar();
        if (!busy && _busyTabId === null) setRunButtonBlocked(false);
    });
}

function _registerActiveFileListener() {
    onActiveFileChange(fileName => {
        const tab = _tabs.find(t => t.id === _activeTabId);
        if (!tab) return;
        if (fileName) {
            tab.tooltip = fileName.replace(/\.jsonl$/, '');
            tab.label   = _dedupeLabel(_fileTabLabel(fileName), _activeTabId);
        }
        _renderTabBar();
        _saveTabState();
    });
}

async function _switchTab(id) {
    if (id === _activeTabId || !_analyserReady) return;
    const current = _tabs.find(t => t.id === _activeTabId);
    if (current) current.graphData = getGraphState();
    destroyAnalyser();
    _activeTabId = id;
    _renderTabBar();
    const next = _tabs.find(t => t.id === id);
    await initAnalyser(_panel, _files, _currentChar);
    if (next?.graphData) setGraphState(next.graphData);
    if (_busyTabId !== null && _busyTabId !== id) setRunButtonBlocked(true);
    _saveTabState();
}

async function _createTab(label) {
    if (!_analyserReady || _tabs.length >= _TAB_LIMIT) return;
    const current = _tabs.find(t => t.id === _activeTabId);
    if (current) current.graphData = getGraphState();
    destroyAnalyser();
    const id = _nextTabId++;
    _tabs.push({ id, label: label ?? `Canvas ${_nextCanvasNum()}`, graphData: null });
    _activeTabId = id;
    _renderTabBar();
    await initAnalyser(_panel, _files, _currentChar);
    if (_busyTabId !== null) setRunButtonBlocked(true);
    _saveTabState();
}

async function _closeTab(id) {
    if (_tabs.length <= 1) return;
    const idx = _tabs.findIndex(t => t.id === id);
    if (idx < 0) return;
    if (id === _busyTabId) _busyTabId = null;
    _tabs.splice(idx, 1);
    if (id === _activeTabId) {
        const next = _tabs[Math.min(idx, _tabs.length - 1)];
        destroyAnalyser();
        _activeTabId = next.id;
        _renderTabBar();
        await initAnalyser(_panel, _files, _currentChar);
        if (next.graphData) setGraphState(next.graphData);
        if (_busyTabId !== null && _busyTabId !== next.id) setRunButtonBlocked(true);
    } else {
        _renderTabBar();
    }
    _saveTabState();
}

// ─── Open file in new Analyse tab ─────────────────────────────

async function _openFileInAnalyseTab(fileName) {
    if (_analyserReady && _tabs.length >= _TAB_LIMIT) return;
    const label = _fileTabLabel(fileName);

    // Activate the Analyse tab visually
    _panel.querySelectorAll('.se-cfm-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === 'analyse');
    });
    _panel.querySelector('#se-cfm-tab-files').style.display    = 'none';
    _panel.querySelector('#se-cfm-tab-analyse').style.display  = '';

    if (!_analyserReady) {
        _analyserReady = true;
        const saved = _loadTabState();
        if (saved) {
            _tabs        = saved.tabs;
            _activeTabId = saved.activeTabId;
            _nextTabId   = saved.nextTabId;
        } else {
            _tabs        = [{ id: 1, label, graphData: null }];
            _activeTabId = 1;
            _nextTabId   = 2;
        }
        _renderTabBar();
        _bindTabBarEvents();
        _registerBusyListener();
        await initAnalyser(_panel, _files, _currentChar);
        const active = _tabs.find(t => t.id === _activeTabId);
        if (active?.graphData) setGraphState(active.graphData);
        if (saved) { return; }
        addFileNode(fileName);
        _saveTabState();
    } else {
        await _createTab(label);
        addFileNode(fileName);
        _saveTabState();
    }
}
