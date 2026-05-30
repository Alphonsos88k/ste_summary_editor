/**
 * @module constants
 * @description Central place for all shared constants used across Summary Editor.
 * Changing a value here updates it everywhere — no magic strings scattered around.
 */

/** Extension identifier used for ST registration and localStorage keys. */
export const EXT_NAME = 'summary-editor';

/** Human-readable name shown in headers and UI. */
export const EXT_DISPLAY = 'Summary Editor';

/** localStorage key for persisted state (acts, entries, metadata). */
export const STORAGE_KEY = 'se_state';

/** How many table rows to show per page. */
export const ROWS_PER_PAGE = 20;

/**
 * Cycling palette for act badge colors.
 * Each entry has a `bg` (background) and `fg` (text) color.
 * Inspired by Monokai theme — high contrast on dark backgrounds.
 */
export const ACT_COLORS = [
    { bg: '#a6e22e', fg: '#272822' }, // green
    { bg: '#66d9e8', fg: '#272822' }, // cyan
    { bg: '#ae81ff', fg: '#272822' }, // purple
    { bg: '#fd971f', fg: '#272822' }, // orange
    { bg: '#f92672', fg: '#fff' },    // pink
    { bg: '#e6db74', fg: '#272822' }, // yellow
    { bg: '#dc143c', fg: '#fff' },    // crimson
    { bg: '#1a3a6b', fg: '#fff' },    // dark blue
];

/**
 * Cycling palette for file-range border colors.
 * Distinct from ACT_COLORS — these are border/highlight colors, not badge fills.
 * Intentionally softer/more transparent-friendly so they don't overwhelm the table.
 */
export const FILE_RANGE_COLORS = [
    '#4fc3f7', // light blue
    '#81c784', // light green
    '#ffb74d', // amber
    '#ce93d8', // lavender
    '#f48fb1', // pink
    '#80cbc4', // teal
    '#fff176', // yellow
    '#ffcc80', // peach
    '#b0bec5', // slate
    '#ef9a9a', // rose
];

/** Maximum estimated TXT file size (KB) for RAG embedding compatibility. */
export const FILE_SIZE_LIMIT_KB = 9.5;

/**
 * Regex patterns for detecting numbered summary entries.
 * Tries strict "1. text" first, then progressively fuzzier formats.
 * Each pattern captures: group(1) = entry number, group(2) = content text.
 */
export const ENTRY_PATTERNS = [
    /^#?(\d+)\.\s*(.*)/,      // 1. content  OR  #1. content
    /^(\d+)\s+\.\s*(.*)/,     // 1 . content
    /^(\d+)\.\.\s*(.*)/,      // 1.. content
    /^(\d+)\s+\.\.\s*(.*)/    // 1 .. content
];

/**
 * Regex to detect and parse the rich bracket metadata block in an entry line.
 * Matches: (Act|date:val|time:val|location:val)
 * All fields are optional and can appear in any order.
 * Group 1 = full bracket string (consumed from content).
 */
export const BRACKET_PATTERN = /^\(([^)]+)\)\s*/;

/**
 * Regex patterns for detecting "Part N" section headers.
 * Case-insensitive. "part" can appear anywhere in the line (e.g. "Story so far part 1:").
 * Captures: group(1) = part number, group(2) = rest of line after the part marker.
 */
export const PART_PATTERNS = [
    /\bpart\s*(\d+)\s*[:-]?\s*(.*)/i,    // part 1: ..., Story so far part 1: ..., Part1...
    /\bpart\s+#\s*(\d+)\s*[:-]?\s*(.*)/i, // part # 1, Part #1
    /\bpart\s*#(\d+)\s*[:-]?\s*(.*)/i,    // Part#1
];

/**
 * Conflict severity levels used by conflict-detection and content-editor.
 */
export const SEVERITY = Object.freeze({
    ERROR:   'error',
    WARNING: 'warning',
    INFO:    'info',
    OK:      'ok',
});

/**
 * CSS class name for each severity level (maps to .se-sev-* rules in style.css).
 */
export const SEV_CSS = Object.freeze({
    error:   'se-sev-error',
    warning: 'se-sev-warn',
    info:    'se-sev-info',
    ok:      'se-sev-ok',
});

/**
 * Entry metadata fields that support date/time/location tagging.
 */
export const ENTRY_FIELDS = Object.freeze(['date', 'time', 'location']);

/**
 * Review table column widths.
 * Fixed px for small controls; percentages for data columns.
 * Edit here — CSS vars are injected at startup from these values.
 */
export const TABLE_COLS = Object.freeze({
    check:    '36px',
    num:      '50px',
    act:      '9%',
    content:  '43%',
    date:     '8%',
    time:     '9%',
    location: '12%',
    notes:    '10%',
    feedback: '9%',
});

/**
 * Month names used by the date picker.
 */
export const MONTH_NAMES = Object.freeze([
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]);

/**
 * Words and fragments that suggest a folder contains summary/story content.
 * Used to auto-assign non-entry files from such folders as "Summary Related".
 */
export const SUMMARY_FOLDER_THESAURUS = Object.freeze([
    'summary', 'summaries', 'sum', 'sums', 'synopsis', 'synopses',
    'recap', 'recaps', 'story', 'stories', 'narrative', 'narratives',
    'lore', 'notes', 'entries', 'entry', 'logs', 'log',
    'archive', 'archives', 'history', 'histories', 'chronicle', 'chronicles',
]);

/**
 * Returns true if the given folder name resembles a summary/story content folder.
 * Matches exact words or folder names that contain a thesaurus term.
 * @param {string} folderName
 * @returns {boolean}
 */
export function isSummaryFolder(folderName) {
    const lower = folderName.toLowerCase().replace(/[-_\s]/g, '');
    return SUMMARY_FOLDER_THESAURUS.some(w => lower === w.replace(/[-_\s]/g, '') || lower.includes(w));
}

/**
 * Template path keys for all loadTemplate() calls.
 * Values are the path strings passed to loadTemplate().
 */
export const TEMPLATES = Object.freeze({
    // Top-level templates
    MODAL:                   'modal',
    EXPORT_PANEL:            'export-panel',
    ENTRY_ROW:               'entry-row',
    GAP_ROW:                 'gap-row',
    ACT_ITEM:                'act-item',
    // chat-files/
    CHAT_FILES_MANAGER:        'partials/chat-files/chat-files-manager',
    CHAT_FILES_HELP:           'partials/chat-files/chat-files-help',
    ANALYSER_ENTRY_DETAIL:     'partials/chat-files/analyser-entry-detail',
    ANALYSER_PROMPTS:          'partials/chat-files/analyser-prompts',
    ANALYSER_RUN_ERROR:        'partials/chat-files/analyser-run-error',
    // dialogs/
    DIALOG_ALERT:            'partials/dialogs/dialog-alert',
    DIALOG_CONFLICT_RESULTS: 'partials/dialogs/dialog-conflict-results',
    DIALOG_COLOR_PICKER:     'partials/dialogs/dialog-color-picker',
    DIALOG_ENTRY_SELECTOR:   'partials/dialogs/dialog-entry-selector',
    DIALOG_DATABANK_INJECT:  'partials/dialogs/dialog-databank-inject',
    DIALOG_TAG_BROWSER:      'partials/dialogs/dialog-tag-browser',
    CD_ALERT:                'partials/dialogs/cd-alert',
    CD_CONFIRM:              'partials/dialogs/cd-confirm',
    CD_PROMPT:               'partials/dialogs/cd-prompt',
    FILES_ATTENTION_DIALOG:  'partials/dialogs/files-attention-dialog',
    SPLIT_DIALOG:            'partials/dialogs/split-dialog',
    FRM_SPLIT_FORM:          'partials/dialogs/frm-split-form',
    INGEST_SPLIT_PANEL:      'partials/dialogs/ingest-split-panel',
    INGEST_PREVIEW_PANEL:    'partials/dialogs/ingest-preview-panel',
    // editor/
    CONTENT_EDITOR:          'partials/editor/content-editor',
    FIND_REPLACE_PANEL:      'partials/editor/find-replace-panel',
    DIFF_VIEW:               'partials/editor/diff-view',
    SUPP_EDITOR:             'partials/editor/supp-editor',
    // analysis/
    TIMELINE_ANALYSIS_PANEL: 'partials/analysis/timeline-analysis-panel',
    TIMELINE_EDITOR_PANEL:   'partials/analysis/timeline-editor-panel',
    ENTRY_ANALYTICS_PANEL:   'partials/analysis/entry-analytics-panel',
    CONFLICT_REVIEW_PANEL:   'partials/analysis/conflict-review-panel',
    BULK_REFINE_PANEL:       'partials/analysis/bulk-refine-panel',
    BULK_REFINE_ENTRY:       'partials/analysis/bulk-refine-entry',
    GAP_SUGGEST_PANEL:       'partials/analysis/gap-suggest-panel',
    GAPS_PANEL:              'partials/analysis/gaps-panel',
    // table/
    SEG_ITEM:                'partials/table/seg-item',
    CE_FEEDBACK_ITEM:        'partials/table/ce-feedback-item',
    ACD_ITEM:                'partials/table/acd-item',
    // arcs/
    CAUSAL_POPOVER:          'partials/arcs/causal-popover',
    CHAIN_PILL:              'partials/arcs/chain-pill',
    CHAIN_PILL_RANGE:        'partials/arcs/chain-pill-range',
    ESG_CELL:                'partials/arcs/esg-cell',
    ESG_PILL:                'partials/arcs/esg-pill',
    // prompts/
    EDIT_PROMPT_POPUP:       'partials/prompts/edit-prompt-popup',
    SYSTEM_PROMPT_HUB:       'partials/prompts/system-prompt-hub',
    SPH_CARD:                'partials/prompts/sph-card',
    NEW_ENTRY_PROMPT:        'partials/prompts/new-entry-prompt',
    // shared/
    DATEPICKER:              'partials/shared/datepicker',
    TIMEPICKER:              'partials/shared/timepicker',
    TB_TAB:                  'partials/shared/tb-tab',
    TB_PILL:                 'partials/shared/tb-pill',
    TB_PANEL:                'partials/shared/tb-panel',
    UTILS_PANEL:             'partials/shared/utils-panel',
    LLM_HISTORY_PANEL:       'partials/shared/llm-history-panel',
    KEYBOARD_SHORTCUTS_PANEL:'partials/shared/keyboard-shortcuts-panel',
    STORY_CONTEXT_PANEL:     'partials/shared/story-context-panel',
    BULK_FILL_PANEL:         'partials/shared/bulk-fill-panel',
    FILE_ITEM:               'partials/shared/file-item',
    FILES_PANEL:             'partials/shared/files-panel',
    FILE_RANGE_MANAGER:      'partials/shared/file-range-manager',
});
