/**
 * @module file-ranges
 * @description Core utilities for the file-range system.
 *
 * File ranges map a range key (initially the source filename) to a set of entry
 * numbers, a display color, and a label. They are the unit of export chunking —
 * each range becomes one output file. Acts are independent (story structure only).
 *
 * This module is the single source of truth for range mutations so that ingestion,
 * table rendering, the stats bar, and the range manager panel all share the same
 * logic without duplication.
 */

import { FILE_SIZE_LIMIT_KB } from '../core/constants.js';
import { state } from '../core/state.js';

// ─── Color allocation ────────────────────────────────────────────────────────

/**
 * Generate the next range color using the golden angle (137.508°).
 * Returns a hex string so iro.js and CSS are both happy.
 */
export function nextRangeColor() {
    const idx = state.fileRangeColorIdx++;
    const hue = (idx * 137.508 + state.fileRangeHueOffset) % 360;
    const sat = (62 + (idx % 3) * 9) / 100;
    const light = (56 + (idx % 2) * 8) / 100;
    return _hslToHex(hue, sat, light);
}

function _hslToHex(h, s, l) {
    const a = s * Math.min(l, 1 - l);
    const f = n => {
        const k = (n + h / 30) % 12;
        const val = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * val).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

// ─── Range creation ──────────────────────────────────────────────────────────

/**
 * Register a new file range from an ingested file.
 * Called once per file during ingestion — populates `state.fileRanges`.
 *
 * @param {string} fileName - The ingested filename (used as range key).
 * @param {number[]} entryNums - Entry numbers belonging to this file.
 */
export function registerFileRange(fileName, entryNums) {
    if (entryNums.length === 0) return;
    state.fileRanges.set(fileName, {
        color: nextRangeColor(),
        entryNums: [...entryNums].sort((a, b) => a - b),
        label: fileName,
    });
}

// ─── Range lookup ────────────────────────────────────────────────────────────

/**
 * Find the range key that owns a given entry number.
 * Returns null if the entry isn't in any range (shouldn't happen in normal use).
 *
 * @param {number} num - Entry number to look up.
 * @returns {string|null} Range key, or null.
 */
export function getRangeKeyForEntry(num) {
    for (const [key, range] of state.fileRanges) {
        if (range.entryNums.includes(num)) return key;
    }
    return null;
}

/**
 * Get the range object for a given entry number.
 * @param {number} num
 * @returns {{color: string, entryNums: number[], label: string}|null}
 */
export function getRangeForEntry(num) {
    const key = getRangeKeyForEntry(num);
    return key ? state.fileRanges.get(key) : null;
}

// ─── Range membership mutations ──────────────────────────────────────────────

/**
 * Move an entry from its current range into a target range.
 * Used by move/swap/new-entry/merge/split operations.
 *
 * @param {number} num - Entry number to reassign.
 * @param {string} targetKey - Range key to assign it to.
 */
export function reassignEntryToRange(num, targetKey) {
    // Remove from current range
    for (const range of state.fileRanges.values()) {
        const idx = range.entryNums.indexOf(num);
        if (idx !== -1) {
            range.entryNums.splice(idx, 1);
            break;
        }
    }
    // Add to target
    const target = state.fileRanges.get(targetKey);
    if (target && !target.entryNums.includes(num)) {
        target.entryNums.push(num);
        target.entryNums.sort((a, b) => a - b);
    }
}

/**
 * Add a new entry number to the range that owns a given neighbor entry.
 * Used when inserting a new entry after an existing one.
 *
 * @param {number} newNum - The new entry number to register.
 * @param {number} neighborNum - An existing entry whose range the new one inherits.
 */
export function inheritRangeFromNeighbor(newNum, neighborNum) {
    const key = getRangeKeyForEntry(neighborNum);
    if (!key) return;
    const range = state.fileRanges.get(key);
    if (range && !range.entryNums.includes(newNum)) {
        range.entryNums.push(newNum);
        range.entryNums.sort((a, b) => a - b);
    }
}

/**
 * Shift all entry numbers > aboveNum upward by count in every range.
 * Called by shiftEntriesUp so file-range membership stays in sync after
 * split/new-entry operations.
 *
 * @param {number} aboveNum - Entries strictly above this number get shifted.
 * @param {number} count - Positions to shift.
 */
export function shiftRangeEntryNums(aboveNum, count) {
    for (const range of state.fileRanges.values()) {
        range.entryNums = range.entryNums.map(n => (n > aboveNum ? n + count : n));
    }
}

/**
 * Remove an entry number from whichever range owns it.
 * Called when an entry is deleted.
 *
 * @param {number} num - Entry number to remove.
 */
export function removeEntryFromRange(num) {
    for (const range of state.fileRanges.values()) {
        const idx = range.entryNums.indexOf(num);
        if (idx !== -1) {
            range.entryNums.splice(idx, 1);
            break;
        }
    }
}

/**
 * Remove a file range entirely (e.g. when its source file is removed from the ingest list).
 * Orphaned entry numbers are absorbed into the numerically nearest remaining range.
 *
 * @param {string} key - Range key to remove.
 */
export function deleteFileRange(key) {
    const dying = state.fileRanges.get(key);
    if (!dying) return;

    const orphans = [...dying.entryNums];
    state.fileRanges.delete(key);

    for (const num of orphans) {
        // Find the range whose last entryNum is closest (numerically) to num
        let bestKey = null;
        let bestDist = Infinity;
        for (const [k, range] of state.fileRanges) {
            if (range.entryNums.length === 0) continue;
            const dist = Math.min(...range.entryNums.map(n => Math.abs(n - num)));
            if (dist < bestDist) { bestDist = dist; bestKey = k; }
        }
        if (bestKey) {
            const target = state.fileRanges.get(bestKey);
            if (!target.entryNums.includes(num)) {
                target.entryNums.push(num);
                target.entryNums.sort((a, b) => a - b);
            }
        }
    }
}

// ─── Size estimation ─────────────────────────────────────────────────────────

/**
 * Estimate the TXT output size (in KB) for a range.
 * Uses the actual content of entries currently in state.
 *
 * @param {number[]} entryNums - Entry numbers to measure.
 * @returns {number} Estimated size in KB, rounded to 2 decimal places.
 */
export function estimateRangeSizeKB(entryNums) {
    let chars = 0;
    for (const num of entryNums) {
        const entry = state.entries.get(num);
        if (!entry) continue;
        // Approximate TXT export line: "N. (meta) content\n"
        const meta = [entry.date, entry.time, entry.location].filter(Boolean).join(' | ');
        const metaStr = meta ? `[${meta}] ` : '';
        const line = `${num}. ${metaStr}${entry.content}\n`;
        chars += line.length;
    }
    return Math.round((chars / 1024) * 100) / 100;
}

/**
 * Return true if the estimated size of a range exceeds the limit.
 * @param {number[]} entryNums
 * @returns {boolean}
 */
export function rangeExceedsLimit(entryNums) {
    return estimateRangeSizeKB(entryNums) > FILE_SIZE_LIMIT_KB;
}

// ─── Filename pattern detection ──────────────────────────────────────────────

/**
 * Given a list of existing filenames in a set, detect a naming pattern and
 * suggest a name for the next file in the series.
 *
 * Supports patterns like: `summary_1.txt`, `sum_part2.txt`, `story_3.yaml`
 * Falls back to `<stem>_<n>.<ext>` if no pattern is detected.
 *
 * @param {string[]} existingNames - Filenames already in the range set.
 * @returns {string} Suggested filename for the next file.
 */
export function suggestNextFilename(existingNames) {
    if (existingNames.length === 0) return 'summary_1.txt';

    // Try to find trailing number in filenames
    const TRAILING_NUM = /^(.*?)(\d+)(\.[^.]+)$/;
    const matches = existingNames.map(n => TRAILING_NUM.exec(n)).filter(Boolean);

    if (matches.length === existingNames.length) {
        // All follow the pattern — find max number and increment
        const nums = matches.map(m => Number.parseInt(m[2], 10));
        const next = Math.max(...nums) + 1;
        const ref = matches[0];
        const padLen = ref[2].length; // preserve zero-padding if any
        const nextStr = String(next).padStart(padLen, '0');
        return `${ref[1]}${nextStr}${ref[3]}`;
    }

    // Fallback: use the stem+ext of the last filename
    const last = existingNames.at(-1);
    const extIdx = last.lastIndexOf('.');
    const stem = extIdx === -1 ? last : last.slice(0, extIdx);
    const ext  = extIdx === -1 ? '.txt' : last.slice(extIdx);
    const n = existingNames.length + 1;
    return `${stem}_${n}${ext}`;
}
