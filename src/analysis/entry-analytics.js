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

    // Conflict counts — count distinct entries (not individual feedback items)
    let cfError = 0, cfWarn = 0, cfInfo = 0, cfOk = 0;
    for (const [numStr, items] of Object.entries(state.conflicts || {})) {
        if (!state.entries.has(Number(numStr))) continue;
        if (items.some(f => f.severity === 'error'))        cfError++;
        else if (items.some(f => f.severity === 'warning')) cfWarn++;
        else if (items.some(f => f.severity === 'info'))    cfInfo++;
        else                                                 cfOk++;
    }

    // Per-act word counts
    const actsData = [];
    for (const [, act] of state.acts) {
        const actWc = [...act.entryNums]
            .map(n => state.entries.get(n))
            .filter(Boolean)
            .reduce((sum, e) => sum + wordCount(e.content), 0);
        actsData.push({ name: act.name, color: act.color, wc: actWc, count: act.entryNums.size });
    }
    actsData.sort((a, b) => b.wc - a.wc);

    return {
        totalEntries: total,
        gapCount: state.gaps?.length ?? 0,
        actCount: state.acts.size,
        modifiedCount: state.modified?.size ?? 0,
        wcTotal, wcAvg, wcMin, wcMax,
        dateFilled, timeFilled, locationFilled,
        cfError, cfWarn, cfInfo, cfOk,
        acts: actsData,
    };
}

/**
 * Open (or focus) the Entry Analytics floating panel.
 */
export async function openAnalyticsPanel() {
    if ($panel && $panel.length && document.body.contains($panel[0])) {
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
    ].join('');

    const actListHtml = d.acts.length === 0
        ? '<div class="se-an-empty">No acts defined.</div>'
        : d.acts.map(a =>
            `<div class="se-an-act-row">
                <span class="se-an-act-badge" style="background:${escHtml(a.color || '#75715e')}">${escHtml(a.name)}</span>
                <span class="se-an-act-wc">${a.wc.toLocaleString()} w</span>
                <span class="se-an-act-entries">${a.count} entries</span>
            </div>`
          ).join('');

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
    ].join(''));

    const actListHtml = d.acts.length === 0
        ? '<div class="se-an-empty">No acts defined.</div>'
        : d.acts.map(a =>
            `<div class="se-an-act-row">
                <span class="se-an-act-badge" style="background:${escHtml(a.color || '#75715e')}">${escHtml(a.name)}</span>
                <span class="se-an-act-wc">${a.wc.toLocaleString()} w</span>
                <span class="se-an-act-entries">${a.count} entries</span>
            </div>`
          ).join('');
    $panel.find('#se-an-act-list').html(actListHtml);
}
