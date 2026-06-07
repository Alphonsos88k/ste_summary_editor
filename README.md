# Summary Editor

> A SillyTavern third-party extension for ingesting, organising, and exporting numbered story summaries with arc grouping, gap detection, causal linking, content editing, and visual timeline/location tools.

![Version](https://img.shields.io/github/v/release/Alphonsos88k/ste_summary_editor?label=version)
![CI](https://github.com/Alphonsos88k/ste_summary_editor/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/badge/license-AGPL--3.0-blue)
![Platform](https://img.shields.io/badge/platform-SillyTavern-purple)

---

## Highlights

- **Ingest** multiple summary files (`.txt` / `.json` / `.yaml`) with 4 parse modes and smart gap detection
- **Review table** with custom date/time pickers, inline editing, arc assignment, merge, split, causal links
- **AI pipeline** — conflict detection, bulk refine, gap suggest, timeline analysis, and a two-pass chat file analyser
- **Chat Files panel** — browse JSONL chat files, build a node canvas, run LLM analysis against summary entries
- **Export** to `.txt` / `.json` / `.yaml`; scoped by arc or selection; databank inject; auto-inject on export
- **Visual tools** — timeline diagram, location bubble chart, story index, output planner

<details>
<summary><strong>Full feature table</strong></summary>

| Feature | Description |
|---------|-------------|
| **4-Tab Workflow** | Ingest → Review → Edit → Export — each tab shows an item count badge |
| **Multi-format Ingest** | `.txt`, `.json`, `.yaml` + Part-based sections + rich bracket re-import format |
| **Review Table** | Custom date/time pickers, inline location/notes, stats bar, conflict detection |
| **Content Editor** | Click any content cell to open a draggable editor — edit, send to API, re-check conflicts |
| **Simple Merge** | Select 2+ entries → merge into one combined entry (earliest act wins) |
| **Split Entry** | Select 1 entry → highlight segments with distinct colours → split into N entries |
| **Act/Arc Management** | Create, color, rename, delete acts; minimap grid; two-view timeline panel |
| **Causal Links** | Link entries by range; chain pills; Link Merge chains irreversibly |
| **Timeline Diagram** | Monthly-grouped top/bottom alternating layout; dated entries grouped by month |
| **Location Bubbles** | Physics-based bubble cluster chart — bubble size ∝ location visit frequency |
| **Export** | `.txt` / `.json` / `.yaml`; scoped; re-export to source; zip; databank inject; per-arc inject |
| **File-Range System** | Maps source files to export chunks; stats bar segments; golden-angle colors; Output Planner panel |
| **Output Planner** | Utils → 📂 Output Planner: estimated export sizes, size bars, split/merge/auto-balance ranges |
| **Token Counts** | Per-entry badge, live counter in Content Editor, per-arc total in Edit tab, running total in Export |
| **Story Context** | Auto-generated narrative summary after conflict check; editable; sent with every API call |
| **Named Entities** | Heuristic entity sidebar — recurring capitalised names/places with entry-count badges; click to filter |
| **Timeline Analysis** | LLM-powered timeline consistency check against reference files; Relaxed/Medium/Thorough strictness |
| **System Prompts Hub** | Central panel to view/edit all LLM prompts; location metadata; passive-background badge |
| **Broad Undo** | Covers file load, clear all, new entry, merge, split, move, swap, act operations, links, field edits |
| **Fuzzy Search** | Find & Replace has an optional fuzzy mode (Fuse.js) with an adjustable threshold slider and inline examples |
| **AI Diff View** | Content Editor, Bulk Refine, and Gap Suggest show a side-by-side diff (red original / green editable) before accepting AI output |
| **Bulk Refine** | Select multiple entries → run LLM revision on all sequentially; accept or discard each result individually |
| **Chat File Analysis** | Browse JSONL chat files in a multi-tab node canvas; connect a file to summary entries; run a two-pass LLM pipeline (Pass 1: structured digest; Pass 2: per-entry REWRITE / SPLIT / MERGE / SWAP / NO_CHANGE recommendations); changes staged and undo-safe |
| **Chat File Content Search** | Searches message content across all chat files (debounced, cached); floating find bar with ‹ › prev/next; works across JSONL, Plain, YAML, and Form views |
| **Branch Family Colours** | Reads `chat_metadata.main_chat` from each chat file header to detect ST branch/checkpoint relationships; assigns a unique colour per family — parent gets full-opacity left border, branch children get 65% alpha border + indent; standalone/orphaned files get a grey border; Date/Groups sort toggle clusters families together |

</details>

---

## Installation

### Option 1: SillyTavern extension installer

In ST: Extensions → Manage Extensions → Install from URL:
```
https://github.com/Alphonsos88k/ste_summary_editor
```

### Option 2: Manual

1. Clone or download this repo
2. Copy the folder into:
   ```
   SillyTavern/public/scripts/extensions/third-party/summary-editor/
   ```
3. Restart SillyTavern → enable **Summary Editor** in the Extensions panel

### Option 3: Deploy script

```powershell
# PowerShell
powershell -ExecutionPolicy Bypass -File scripts/deploy.ps1 -clean
```
```bash
# Bash / WSL / Git Bash
bash scripts/deploy.sh --clean
```

---

## Usage

1. Open SillyTavern → **Extensions** → **Open Summary Editor**
2. **Ingest** — drop your summary `.txt` / `.json` / `.yaml` files
3. **Review** — edit metadata, assign arcs, check conflicts, edit content, merge/split entries
4. **Edit** — manage arc names/colours/notes; use the minimap + timeline/bubble views
5. **Export** — choose format and scope, preview, then download or inject into databank

**Re-importing:** Export as `.txt` — the `#N. (Act|date:...) content` format re-ingests with all metadata preserved.

---

## Tab Reference

<details>
<summary><strong>Tab 1: Ingest</strong></summary>

- Drop or browse multiple `.txt`, `.json`, or `.yaml` files
- **Parsing modes:** numbered entries, Part-based sections, rich bracket re-import format
- Click the **Ingested Files** header to open the assignment panel — toggle any file as a Timeline reference
- File list drawer with entry counts, status icons, and per-file removal
- Each ingested file becomes a **file range** — a named export chunk with a golden-angle color

</details>

<details>
<summary><strong>Tab 2: Review</strong></summary>

**Table columns:** Checkbox | # | Arc | Content | Date | Time | Location | Notes

- **Content cell** → opens the draggable Content Editor (edit, API revise with diff view, re-check conflicts)
- **Date** → custom calendar picker; **Time** → custom clock picker
- Selection bar: Assign act, Create act, Move Before, Swap, New Entry, Merge, Split
- Shift+click to select a contiguous range
- Live search, sort by any column, filter by arc / gaps / unassigned
- **Conflict Detection** — LLM analysis with severity chips (Error / Warning / Info); per-entry re-check
- **Named Entities sidebar** — recurring capitalised names/places; click to filter table
- **Timeline Analysis** — check entries against reference timeline files
- **Stats bar** — shows file-range segments when ranges are loaded (click a segment to recolor)

</details>

<details>
<summary><strong>Tab 3: Edit (Arcs)</strong></summary>

- Arc list + detail view (entry list, notes, range)
- Color picker (iro.js wheel), rename inline, arc notes, delete; click the color swatch to edit
- **Minimap** — colour-coded grid of all entries; click any cell for a content popover
- **Timeline view** — monthly-grouped, alternating above/below axis, causality arrows
- **Location Bubbles** — physics-based bubble cluster chart by visit frequency
- **Utils panel** — Find & Replace (with fuzzy mode + threshold slider), Story Index, Tag Browser, Causal Links, Range Colors, **Output Planner**, **Bulk Refine**
- **Output Planner** — view estimated export sizes per file range; split at entry boundary, merge, or auto-balance
- **System Prompts Hub** — view and edit all LLM prompts; shows which feature each prompt belongs to

</details>

<details>
<summary><strong>Tab 4: Export</strong></summary>

- Formats: `.txt`, `.json`, `.yaml`
- Scope: all / current arc / selected entries
- Destinations: source folder, browser download, custom path, zip
- Databank inject (ST attachment API); per-arc inject; auto-inject on export
- Live and full preview; copy to clipboard

</details>

---

## Project Structure

<details>
<summary><strong>Expand directory tree</strong></summary>

```
summary-editor/
├── manifest.json              ST extension manifest
├── index.js                   Entry point — panel bootstrap and top-level event wiring
├── style.css                  Root stylesheet (imports configs/styles/*)
├── settings.html              ST Extensions panel drawer
│
├── scripts/
│   ├── deploy.ps1 / deploy.sh  Deploy to local ST installation (-clean flag)
│   └── dev.ps1 / dev.sh        Interactive dev toolkit (see notes/DEV.md)
│
├── configs/
│   ├── styles/                 Per-section CSS files imported by style.css
│   └── prompts/                Default system prompt text files
│
├── lib/
│   ├── tailwind-config.js      Tailwind CDN configuration (se- prefix)
│   ├── litegraph.min.js        LiteGraph.js node canvas (Analyse tab)
│   ├── iro.min.js              iro.js v5.5.2 color picker (MPL 2.0)
│   ├── fuse.min.js             Fuse.js v7.0.0 fuzzy search
│   ├── diff.min.js             jsdiff v7.0.0 line diff
│   └── localforage.min.js      localForage async storage
│
├── src/
│   ├── core/
│   │   ├── constants.js        TEMPLATES keys, TABLE_COLS, colour palettes, app constants
│   │   ├── state.js            Shared mutable app state + persist/restore helpers
│   │   ├── utils.js            DOM helpers, escHtml, makeDraggable, date utils
│   │   ├── dialogs.js          showDialog() — alert/confirm/prompt with custom styles
│   │   ├── keyboard.js         Global keyboard shortcut bindings
│   │   ├── system-prompts.js   registerPrompt() registry; Prompts Hub panel
│   │   └── template-loader.js  loadTemplate() / fillTemplate() fetch-based loader
│   │
│   ├── ingest/
│   │   ├── ingestion.js        File drop/browse handlers, 4 parse modes, rejection logic
│   │   ├── files-panel.js      Ingested Files drawer, file assignment (Default/Timeline/Supplementary)
│   │   ├── file-ranges.js      fileRanges state helpers and range colour assignment
│   │   ├── file-range-manager.js  Output Planner panel — split, merge, auto-balance
│   │   ├── gap-detection.js    Detects missing entry numbers in sequence
│   │   └── ingest-split.js     Ingest-time split panel UI and logic
│   │
│   ├── table/
│   │   ├── table.js            renderTable(), row click/select, search, sort, filter
│   │   ├── reorder.js          Drag-to-reorder rows; shiftEntriesUp (atomic state shift)
│   │   ├── tags.js             Tag Browser panel — date/time/location bulk fill
│   │   ├── entity-sidebar.js   Story Index panel — names, AI-generated topic sections
│   │   └── tooltip.js          Shared tooltip positioning utility
│   │
│   ├── arcs/
│   │   ├── arcs.js             Arc list/detail panel, color swatch, minimap grid
│   │   ├── color-picker.js     iro.js wrapper — Box+Hue layout, HEX/HSL/RGB dropdown
│   │   └── location-bubbles.js Physics bubble chart — gravity + repulsion simulation
│   │
│   ├── editor/
│   │   ├── content-editor.js   Draggable content editor dialog — edit, API revise, diff, prev version
│   │   ├── split-entry.js      Segment-highlight split UI, colour picker integration
│   │   ├── causality.js        Causal link dialog, chain pills, Link Merge
│   │   ├── diff-view.js        Shared showDiffView() — red/green side-by-side diff panel
│   │   └── bulk-refine.js      Bulk LLM revision panel — sequential per-entry with diff accept
│   │
│   ├── export/
│   │   ├── export.js           Format/scope selector, preview, download, zip, databank
│   │   └── databank.js         ST attachment API inject — per-arc and full; auto-inject
│   │
│   ├── analysis/
│   │   ├── conflict-detection.js  LLM conflict check, severity chips, story context generation
│   │   ├── conflict-review.js     Conflict results panel and per-entry re-check UI
│   │   ├── timeline-analysis.js   Timeline consistency check against reference files
│   │   ├── timeline-editor.js     Timeline diagram — monthly alternating SVG layout
│   │   └── entry-analytics.js     Story consistency score — 0-100 bubble with summary
│   │
│   └── integration/
│       ├── char-select.js         Character selector — opens Chat Files Manager for chosen character
│       ├── blacklist.js           Character + tag blacklist settings panel
│       ├── magic-wand.js          ST magic wand integration (wand button in chat)
│       ├── rag-reword.js          RAG reword integration shim
│       ├── chat-files-manager.js  Chat Files panel orchestrator — tabs, toolbar, file list, init
│       ├── chat-files-editor.js   File editor within Chat Files — syntax highlight, find bar, views
│       └── chat-files-analyser.js LiteGraph canvas — node types, sidebar, run pipeline, dialogs
│
├── templates/                  HTML templates loaded at runtime via fetch
│   ├── modal.html              Main panel shell (tabs, Review table container)
│   ├── entry-row.html          Single table row
│   ├── gap-row.html            Gap placeholder row
│   ├── act-item.html           Arc list item
│   ├── export-panel.html       Export tab panel
│   └── partials/               Feature-specific partial templates (dialogs, panels, cards)
│
├── notes/                      Internal dev notes (gitignored)
│   ├── WISHLIST.md             Active feature backlog
│   ├── FEATURES_ARCHIVE.md     Completed feature history (wiki seed content)
│   ├── SILLYTAVERN_NOTES.md    ST API patterns, import rules, gotchas
│   ├── DEV.md                  Dev toolkit usage guide
│   ├── WORKFLOW.md             Git / CI / CD workflow reference
│   └── INFO.md                 Misc project notes
│
└── .github/
    ├── workflows/              ci.yml, release.yml
    └── PULL_REQUEST_TEMPLATE.md
```

</details>

---

## Tech Stack

| Component | Choice |
|-----------|--------|
| Language | Vanilla JS (ES Modules) — no build step |
| UI | jQuery (ST-native global) |
| Styling | Tailwind Play CDN + custom CSS (`se-` prefix) |
| Color theme | Monokai Dark (`#272822` bg, `#a6e22e` green, `#f92672` pink) |
| State | `localStorage` + `localForage` (async fallback) |
| Templates | HTML files loaded via `fetch` at runtime |
| Node canvas | LiteGraph.js (Analyse tab) |
| Fuzzy search | Fuse.js v7.0.0 |
| Diff rendering | jsdiff v7.0.0 |
| Linting | ESLint 9 |
| Versioning | semantic-release + conventional commits |

---

## License

[GNU Affero General Public License v3.0](LICENSE) — see LICENSE for full text.
