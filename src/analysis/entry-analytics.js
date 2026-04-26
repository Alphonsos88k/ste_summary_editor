/**
 * @module entry-analytics
 * @description Draggable analytics panel for the Edit tab.
 *
 * Shows per-entry and per-act statistics computed from state:
 * word counts (total/avg/min/max), metadata coverage, conflict
 * counts by severity, and a per-act word count breakdown.
 */

import { state } from '../core/state.js';
import { escHtml, spawnPanel } from '../core/utils.js';
import { loadTemplate, fillTemplate } from '../core/template-loader.js';
import { TEMPLATES } from '../core/constants.js';

/** @type {jQuery|null} Cached panel element. */
let $panel = null;

/** @type {'name'|'wc'|'count'} Current act sort key. */
let _actSort = 'name';
/** @type {'asc'|'desc'} Current act sort direction. */
let _actDir = 'asc';

/**
 * Count words in a string.
 * @param {string} text
 * @returns {number}
 */
function wordCount(text) {
    return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Build the coverage row HTML for one metadata field.
 * @param {string} label
 * @param {number} filled
 * @param {number} total
 * @returns {string}
 */
function coverageRow(label, filled, total) {
    const pct = total === 0 ? 0 : Math.round((filled / total) * 100);
    return `<div class="se-an-coverage-row">
        <span class="se-an-coverage-label">${escHtml(label)}</span>
        <div class="se-an-coverage-bar-wrap">
            <div class="se-an-coverage-bar" style="width:${pct}%"></div>
        </div>
        <span class="se-an-coverage-pct">${pct}%</span>
    </div>`;
}

/**
 * Compute analytics data from current state.
 * @returns {object}
 */
function computeAnalytics() {
    const entries = [...state.entries.values()];
    const total = entries.length;

    if (total === 0) {
        return {
            totalEntries: 0, gapCount: state.gaps?.length ?? 0,
            actCount: state.acts.size, modifiedCount: state.modified?.size ?? 0,
            wcTotal: 0, wcAvg: 0, wcMin: 0, wcMax: 0,
            dateFilled: 0, timeFilled: 0, locationFilled: 0,
            cfError: 0, cfWarn: 0, cfInfo: 0, cfOk: 0,
            acts: [],
        };
    }

    const wcs = entries.map(e => wordCount(e.content));
    const wcTotal = wcs.reduce((a, b) => a + b, 0);
    const wcAvg = Math.round(wcTotal / total);
    const wcMin = Math.min(...wcs);
    const wcMax = Math.max(...wcs);

    const dateFilled     = entries.filter(e => (e.date     || '').trim()).length;
    const timeFilled     = entries.filter(e => (e.time     || '').trim()).length;
    const locationFilled = entries.filter(e => (e.location || '').trim()).length;
    const actFilled      = entries.filter(e => e.actId).length;

    // Conflict counts — count distinct entries (not individual feedback items)
    let cfError = 0, cfWarn = 0, cfInfo = 0, cfOk = 0;
    for (const [numStr, items] of Object.entries(state.conflicts || {})) {
        if (!state.entries.has(Number(numStr))) continue;
        if (items.some(f => f.severity === 'error'))        cfError++;
        else if (items.some(f => f.severity === 'warning')) cfWarn++;
        else if (items.some(f => f.severity === 'info'))    cfInfo++;
        else                                                 cfOk++;
    }

    // Per-act summary (word count + metadata completion)
    const actsData = [];
    for (const [, act] of state.acts) {
        const actEntries = [...act.entryNums].map(n => state.entries.get(n)).filter(Boolean);
        const actWc = actEntries.reduce((sum, e) => sum + wordCount(e.content), 0);
        actsData.push({
            name: act.name, color: act.color, wc: actWc, count: actEntries.length,
            dateFilled:     actEntries.filter(e => (e.date     || '').trim()).length,
            timeFilled:     actEntries.filter(e => (e.time     || '').trim()).length,
            locationFilled: actEntries.filter(e => (e.location || '').trim()).length,
        });
    }
    // sorting deferred to buildActListHtml

    return {
        totalEntries: total,
        gapCount: state.gaps?.length ?? 0,
        actCount: state.acts.size,
        modifiedCount: state.modified?.size ?? 0,
        wcTotal, wcAvg, wcMin, wcMax,
        dateFilled, timeFilled, locationFilled, actFilled,
        cfError, cfWarn, cfInfo, cfOk,
        acts: actsData,
    };
}

/**
 * Build per-act summary list HTML (word count + metadata completion).
 * @param {object[]} acts
 * @param {string} [sortKey]
 * @returns {string}
 */
function buildActListHtml(acts, sortKey = _actSort, dir = _actDir) {
    if (acts.length === 0) return '<div class="se-an-empty">No acts defined.</div>';
    const sorted = [...acts];
    if (sortKey === 'wc')         sorted.sort((a, b) => a.wc    - b.wc);
    else if (sortKey === 'count') sorted.sort((a, b) => a.count - b.count);
    else sorted.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    if (dir === 'desc') sorted.reverse();
    return sorted.map(a => {
        const n = a.count || 0;
        const pctD = n === 0 ? 0 : Math.round((a.dateFilled     / n) * 100);
        const pctT = n === 0 ? 0 : Math.round((a.timeFilled     / n) * 100);
        const pctL = n === 0 ? 0 : Math.round((a.locationFilled / n) * 100);
        return `<div class="se-an-act-row">
            <div class="se-an-act-row-header">
                <span class="se-an-act-badge" style="background:${escHtml(a.color || '#75715e')}">${escHtml(a.name)}</span>
                <span class="se-an-act-entries">${n} entries</span>
                <span class="se-an-act-wc">${a.wc.toLocaleString()} w</span>
            </div>
            <div class="se-an-act-completion">
                <span class="se-an-act-meta-lbl">D</span><div class="se-an-mini-bar-wrap"><div class="se-an-mini-bar" style="width:${pctD}%"></div></div><span class="se-an-act-meta-pct">${pctD}%</span>
                <span class="se-an-act-meta-lbl">T</span><div class="se-an-mini-bar-wrap"><div class="se-an-mini-bar" style="width:${pctT}%"></div></div><span class="se-an-act-meta-pct">${pctT}%</span>
                <span class="se-an-act-meta-lbl">L</span><div class="se-an-mini-bar-wrap"><div class="se-an-mini-bar" style="width:${pctL}%"></div></div><span class="se-an-act-meta-pct">${pctL}%</span>
            </div>
        </div>`;
    }).join('');
}

/**
 * Open (or focus) the Entry Analytics floating panel.
 */
export async function openAnalyticsPanel() {
    if ($panel?.length && document.body.contains($panel[0])) {
        refreshPanel();
        return;
    }

    const tmpl = await loadTemplate(TEMPLATES.ENTRY_ANALYTICS_PANEL);
    const d = computeAnalytics();
    const total = d.totalEntries;

    const coverageHtml = [
        coverageRow('Date',     d.dateFilled,     total),
        coverageRow('Time',     d.timeFilled,     total),
        coverageRow('Location', d.locationFilled, total),
        coverageRow('Act',      d.actFilled,      total),
    ].join('');

    const actListHtml = buildActListHtml(d.acts);

    const html = fillTemplate(tmpl, {
        totalEntries: total,
        gapCount:     d.gapCount,
        actCount:     d.actCount,
        modifiedCount: d.modifiedCount,
        wcTotal:  d.wcTotal.toLocaleString(),
        wcAvg:    d.wcAvg,
        wcMin:    d.wcMin,
        wcMax:    d.wcMax,
        coverageHtml,
        cfError:  d.cfError,
        cfWarn:   d.cfWarn,
        cfInfo:   d.cfInfo,
        cfOk:     d.cfOk,
        actListHtml,
    });

    const overlay = document.getElementById('se-modal-overlay');
    $panel = $(html).appendTo(overlay);
    spawnPanel($panel[0], overlay, '.se-float-panel-header');

    $panel.find('.se-analytics-close').on('click', () => {
        $panel.remove();
        $panel = null;
    });

    $panel.find('#se-an-act-sort').val(_actSort).on('change', function () {
        _actSort = this.value;
        $panel.find('#se-an-act-list').html(buildActListHtml(computeAnalytics().acts));
    });
    $panel.find('#se-an-act-dir').val(_actDir).on('change', function () {
        _actDir = this.value;
        $panel.find('#se-an-act-list').html(buildActListHtml(computeAnalytics().acts));
    });
    $panel.find('#se-an-act-expand').on('click', _openActTablePanel);
}

/** @type {HTMLElement|null} */
let _actTablePanel = null;

function _openActTablePanel() {
    if (_actTablePanel) { _actTablePanel.remove(); _actTablePanel = null; return; }
    const overlay = document.getElementById('se-modal-overlay');
    if (!overlay) return;

    _actTablePanel = document.createElement('div');
    _actTablePanel.className = 'se-float-panel se-act-table-panel';
    _actTablePanel.innerHTML = `
        <div class="se-float-panel-header">
            <span class="se-float-panel-title">&#x1F4CA; Per-Act Summary</span>
            <div class="se-act-table-controls">
                <select class="se-an-act-sort" id="se-atp-sort" title="Sort by">
                    <option value="name">A–Z</option>
                    <option value="wc">Words</option>
                    <option value="count">Entries</option>
                </select>
                <select class="se-an-act-sort" id="se-atp-dir" title="Direction">
                    <option value="asc">Asc</option>
                    <option value="desc">Desc</option>
                </select>
            </div>
            <button class="se-close-circle" title="Close">&times;</button>
        </div>
        <div class="se-act-table-wrap">
            <table class="se-act-table">
                <thead><tr>
                    <th>Act</th>
                    <th class="se-act-th-num">Entries</th>
                    <th class="se-act-th-num">Words</th>
                    <th class="se-act-th-pct">Date</th>
                    <th class="se-act-th-pct">Time</th>
                    <th class="se-act-th-pct">Loc</th>
                </tr></thead>
                <tbody id="se-atp-tbody"></tbody>
            </table>
        </div>`;
    overlay.appendChild(_actTablePanel);
    spawnPanel(_actTablePanel, overlay, '.se-float-panel-header');

    const render = () => {
        const acts = computeAnalytics().acts;
        const sorted = [...acts];
        const key = _actTablePanel.querySelector('#se-atp-sort').value;
        const dir = _actTablePanel.querySelector('#se-atp-dir').value;
        if (key === 'wc')          sorted.sort((a, b) => a.wc    - b.wc);
        else if (key === 'count')  sorted.sort((a, b) => a.count - b.count);
        else sorted.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        if (dir === 'desc') sorted.reverse();

        _actTablePanel.querySelector('#se-atp-tbody').innerHTML = sorted.map(a => {
            const n = a.count || 0;
            const pD = n ? Math.round((a.dateFilled     / n) * 100) : 0;
            const pT = n ? Math.round((a.timeFilled     / n) * 100) : 0;
            const pL = n ? Math.round((a.locationFilled / n) * 100) : 0;
            const pctCell = (p) =>
                `<td class="se-act-td-pct"><div class="se-act-pct-bar-wrap"><div class="se-act-pct-bar" style="width:${p}%"></div></div><span>${p}%</span></td>`;
            return `<tr>
                <td><span class="se-an-act-badge" style="background:${escHtml(a.color || '#75715e')}">${escHtml(a.name)}</span></td>
                <td class="se-act-td-num">${n}</td>
                <td class="se-act-td-num">${a.wc.toLocaleString()}</td>
                ${pctCell(pD)}${pctCell(pT)}${pctCell(pL)}
            </tr>`;
        }).join('');
    };
    render();

    _actTablePanel.querySelector('#se-atp-sort').value = _actSort;
    _actTablePanel.querySelector('#se-atp-dir').value  = _actDir;
    _actTablePanel.querySelector('#se-atp-sort').onchange = render;
    _actTablePanel.querySelector('#se-atp-dir').onchange  = render;
    const closeActTable = () => { _actTablePanel?.remove(); _actTablePanel = null; };
    _actTablePanel.querySelector('.se-close-circle').onclick = closeActTable;

    const onKey = (e) => { if (e.key === 'Escape') { closeActTable(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
}

/**
 * Refresh panel values in place (if panel is open).
 */
function refreshPanel() {
    if (!$panel) return;
    const d = computeAnalytics();
    const total = d.totalEntries;

    $panel.find('#se-an-total').text(total);
    $panel.find('#se-an-gaps').text(d.gapCount);
    $panel.find('#se-an-acts').text(d.actCount);
    $panel.find('#se-an-modified').text(d.modifiedCount);
    $panel.find('#se-an-wc-total').text(d.wcTotal.toLocaleString());
    $panel.find('#se-an-wc-avg').text(d.wcAvg);
    $panel.find('#se-an-wc-min').text(d.wcMin);
    $panel.find('#se-an-wc-max').text(d.wcMax);
    $panel.find('#se-an-cf-error').text(d.cfError);
    $panel.find('#se-an-cf-warn').text(d.cfWarn);
    $panel.find('#se-an-cf-info').text(d.cfInfo);
    $panel.find('#se-an-cf-ok').text(d.cfOk);

    $panel.find('#se-an-coverage').html([
        coverageRow('Date',     d.dateFilled,     total),
        coverageRow('Time',     d.timeFilled,     total),
        coverageRow('Location', d.locationFilled, total),
        coverageRow('Act',      d.actFilled,      total),
    ].join(''));

    $panel.find('#se-an-act-list').html(buildActListHtml(d.acts));
}
