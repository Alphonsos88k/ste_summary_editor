# Summary Editor — Project Context

> **REQUIRED READING:** Always read the `configs/` folder before starting work:
> - [`configs/SILLYTAVERN_NOTES.md`](configs/SILLYTAVERN_NOTES.md) — ST-specific environment details: API patterns, import rules, wand menu structure, databank integration, gotchas. **Must** consult before touching any ST integration code.
> - [`configs/WISHLIST.md`](configs/WISHLIST.md) — Future feature ideas and expansion plans. Check before proposing new features to avoid duplicates or conflicts with planned direction.

## What This Is
A **SillyTavern third-party extension** (`/public/scripts/extensions/third-party/`) called **Summary Editor**.
It ingests numbered story summary files, presents them in a timeline table with act grouping, gap detection, content editing, split/merge tools, and exports structured timelines. Includes databank auto-inject, experimental RAG reword via ST's API, and visual tools (timeline diagram, location bubble cluster).

## Extension ID & Naming
- **Extension ID:** `summary-editor`
- **Display Name:** Summary Editor
- **Version:** semver in `manifest.json` (currently 0.3.0), git tags planned for later

## Tech Stack
- Vanilla JS + jQuery (ST-native, no build step)
- Tailwind Play CDN with `se-` prefix (avoids ST style conflicts, preflight disabled)
- Monokai/dark palette: `#272822` bg, `#a6e22e` green, `#66d9e8` cyan, `#f92672` pink/warning, `#fd971f` orange, `#ae81ff` purple
- ST CSS variables used where available
- `localStorage` for persistence (acts, dates, locations, causal links, modified set)
- HTML templates loaded via fetch from `templates/` folder (no inline HTML in JS)

## File Structure
```
manifest.json              — ST extension manifest
index.js                   — Entry point (thin orchestrator, wires modules together)
style.css                  — All styles (Tailwind overrides + monokai custom)
settings.html              — ST Extensions tab drawer (just an "Open" button)
deploy.sh                  — Bash deploy/clean helper script
deploy.ps1                 — PowerShell deploy/clean helper script
README.md                  — Professional documentation
CLAUDE.md                  — This file (project context for AI resume)
configs/
  SILLYTAVERN_NOTES.md     — ST environment notes (APIs, imports, gotchas)
  WISHLIST.md              — Future feature ideas and expansion plans
lib/
  tailwind-config.js       — Tailwind CDN config (prefix, colors, fonts)
  iro.min.js               — iro.js v5.5.2 color picker library (MPL 2.0)
src/
  constants.js             — Shared constants (extension ID, colors, regex patterns)
  utils.js                 — Pure utility functions (escHtml, escAttr, debounce, buildBracket, makeDraggable)
  state.js                 — Centralized state object + localStorage persistence
  template-loader.js       — Loads HTML templates via fetch, placeholder replacement
  ingestion.js             — File picker, dual-mode parsing (numbered + Part-based), merge, dedup
  ingest-split.js          — Overlay panel for manual splitting of problematic files on Ingest tab
  gap-detection.js         — Missing integer scan across entry pool
  table.js                 — Timeline table rendering, custom date/time pickers, pagination, filtering, sorting
  arcs.js                  — Act CRUD, minimap, timeline diagram (monthly top/bottom), setTimelineRenderer hook
  location-bubbles.js      — Physics bubble cluster chart (location frequency visualization)
  color-picker.js          — Shared floating iro.js color picker for act badges
  reorder.js               — Entry reorder: move-to-position, swap, shiftEntriesUp (for split)
  tags.js                  — Chip/pill tag autocomplete for date, time, location fields
  conflict-detection.js    — LLM conflict check, reCheckEntry, feedback column, detail dialog, log
  content-editor.js        — Per-entry draggable content editor (edit, API revise, re-check conflicts)
  split-entry.js           — Split dialog: segment marking with distinct colors, doSplit operation
  export.js                — Export builder (.txt/.json/.yaml), download, preview
  databank.js              — ST databank injection via /api/files/upload
  rag-reword.js            — Experimental per-entry RAG rewrite via ST API
  magic-wand.js            — Injects "Summary Editor" into ST's wand dropdown
  blacklist.js             — Character/tag blacklist (hides editor + wand for blocked characters)
  keyboard.js              — Keyboard shortcut handler (Esc, Space, A)
  system-prompts.js        — Self-registering prompt registry; hub panel; per-prompt edit popup
  tooltip.js               — Hover tooltip for truncated content cells
templates/
  modal.html               — Main editor modal shell (header, toolbar, table, pagination, minimap)
  export-panel.html        — Export panel (format, destination, RAG toggles, actions)
  entry-row.html           — Table row template for entries ({{placeholder}} syntax)
  gap-row.html             — Table row template for missing entries
  act-item.html            — Act panel item template (badge, rename, range, notes, delete)
```

## Architecture Overview
`index.js` is a thin orchestrator that:
1. Loads Tailwind CDN and HTML templates in parallel
2. Initializes template-dependent modules (table, arcs)
3. Injects the modal shell and export panel into the DOM
4. Restores persisted state from localStorage
5. Binds all event handlers by delegating to feature modules
6. Injects the magic wand option into ST's dropdown

All logic lives in `src/` as focused ES modules. HTML lives in `templates/` loaded at runtime via fetch.

## Key Design Decisions
- **No build step**: vanilla JS + jQuery per ST convention
- **`se-` Tailwind prefix**: prevents all class collisions with ST
- **Strict separation of concerns**: HTML in `.html` files, CSS in `.css`, logic in `.js`
- **No inline HTML in JavaScript**: templates loaded via fetch, placeholders filled with `fillTemplate()`
- **Modular architecture**: each feature in its own `src/` file (<200 lines target)
- **JSDoc on every exported function**: beginner-friendly, self-documenting
- **Notes field never exported**: UI-only annotation
- **Act names never exported**: UI metadata only (except .json format includes act metadata)
- **Last-file-wins for duplicate entry numbers**: user warned
- **Databank inject**: uses ST's file attachment API (`/api/files/upload`) in export panel
- **Draggable non-modal panels (project-wide rule)**: Every dialog, panel, or pop-out UI element — Content Editor, Split dialog, color picker, causal links panel, conflict log, and any future pop-out — must NOT darken the background, must be draggable by its header, and must allow full interaction with the rest of the UI while open. Use `makeDraggable(el, handle)` from utils.js.
- **setContentCellClickHandler pattern**: content cell clicks fire a registered callback *inside* `bindRowClickEvents` before `renderTable()` tears down the DOM — avoids event timing issues
- **Self-registering / organic-growth pattern**: features that contribute to shared aggregating UI (system prompts, future plugin-style panels) register themselves via a small registry call (e.g. `registerPrompt(key, label, default)`) rather than requiring edits to the hub/aggregator; the aggregator iterates the registry and renders dynamically; adding a new feature never requires touching the hub code
- **System prompts live in `state.systemPrompts`**: all LLM-calling functions read their prompt from `state.systemPrompts[key]`, seeded from hardcoded defaults on first load; individual function UIs and the central Manage System Prompts hub both read/write the same key — bidirectional sync, neither is authoritative

## Deploy Scripts
`deploy.ps1` / `deploy.sh` have a `ST_EXTENSIONS_DIR` variable at the top.
User sets this once to their ST third-party extensions path.
Flags: `--copy` (default), `--clean` (delete + copy), `--delete` (remove only).
**Always use `--clean`** when deploying.

## Important Patterns

### State Object
- `window.SummaryEditor.state` holds entries, acts, metadata
- Entry format: `{ num, content, date, time, location, notes, actId, source }`
- Act format: `{ id, name, color, entryNums: Set<num>, notes }`
- `state.modified` — `Set<num>` of entry numbers edited via Content Editor (persisted as array)
- `state.causality` — `{ [effectNum]: [causeNum, ...] }` plain object

### Ingestion Rules (ingestion.js)
- **Filename gating**: file must contain `sum` AND at least one digit (case-insensitive) — e.g. `summary_1.txt`, `sum2.txt`
- **Supported extensions**: `.txt`, `.json`, `.yaml`, `.yml`
- **4 valid modes**: (1) numbered `1. content`, (2) Part-based (line has `\bpart\b` + colon), (3) JSON/YAML structured, (4) re-import bracket format
- **5 rejection reasons** stored per invalid file: unsupported extension, empty file, filename not recognized, no valid structure, malformed data
- **Part detection**: flexible — any line containing the word "part" (with or without markdown `*`/`**`) plus a `:` on the same line
- **File drawer**: per-file remove button (×), OK files clickable for preview, invalid files show orange ℹ + rejection reason
- **Ingest split**: position-based insertion at placeholder location, header prefix auto-trimming, single-piece confirm allowed

### Custom Date/Time Pickers (table.js)
- **Date:** month/year `<select>` dropdowns + 7-column CSS grid day grid; click day → auto-saves (no OK button); Clear button
- **Time:** hour/minute selects + AM/PM toggle pair; OK button to save
- These replaced native `<input type="date/time">` which reset on year/month navigation

### Content Cell Click (table.js + index.js)
- `contentCellClickHandler` module-level var; `setContentCellClickHandler(fn)` export
- Fires inside `bindRowClickEvents` BEFORE `renderTable()` — avoids DOM detach race
- `openContentEditor(num)` appended to `#se-modal-overlay`, not `#se-table-body`

### shiftEntriesUp (reorder.js)
- Called by Split and New Entry operations
- Shifts all entries with key > `aboveNum` upward by `count` (descending to avoid collisions)
- Also updates: act.entryNums, causality keys+values, state.gaps, state.selected, state.modified

### reCheckEntry (conflict-detection.js)
- Re-runs conflict API with ±5 context entries around the target entry
- Accepts `contentOverride` so unsaved edits can be checked
- Updates `state.conflicts` for all returned entries

### Timeline Diagram (arcs.js)
- Entries grouped by **calendar month** (YYYY-MM), not exact date
- Within a month: sorted date → time ascending
- Undated entries: always above axis, grouped by act
- Dated month groups: alternate above/below axis (1st below, 2nd above, 3rd below…)
- Canvas height dynamically computed from max top-stack and bottom-stack heights
- `setTimelineRenderer(fn)` allows index.js to swap in the bubble chart renderer
- `buildMinimapOverlay()` checks `_timelineRenderer` — if set, calls it; else calls `buildTimelineDiagram()`

### Location Bubbles (location-bubbles.js)
- Counts locations case-insensitively across all entries
- Radius = `MIN_R + (MAX_R - MIN_R) * sqrt(count / maxCount)` — area ∝ count
- 260-iteration physics sim: gravity toward centre + bubble-bubble repulsion with damping
- SVG padded to at least viewport size; cluster centred via `<g transform="translate(...)">` so there's no edge-snapping
- Scroll-to-centre in `requestAnimationFrame` after DOM paint

### Timeline Panel Layout (modal.html + style.css)
- `.se-minimap-bottom` is `position: relative` — anchor for absolutely positioned bars
- `.se-timeline-viewport` is `position: absolute; inset: 0` — fills the full panel
- Viewport `padding: 44px 16px 16px 52px` keeps canvas content from starting under the bars
- **Horizontal toolbar** (`position: absolute; top: 0; left: 0; right: 0; height: 38px`): view toggles + label
- **Vertical sidebar** (`position: absolute; top: 38px; left: 0; bottom: 0; width: 42px`): zoom + expand
- Both bars: `background: rgba(30,31,26,0.18); backdrop-filter: blur(14px)` — true frosted glass, works in both normal and fullscreen expanded mode

## Export bracket format
`[Date, Time | Location] content` — omitted if all fields empty.
In re-import format: `#N. (ActName|date:val|time:val|location:val) content`

## What NOT to Change
- Do not use ST's built-in RAG extension — this is a standalone alternative
- Do not add a build step or bundler
- Do not remove the `se-` prefix from Tailwind config
- Do not put inline HTML strings in JavaScript — use `templates/` folder
- Do not merge modules back into a monolithic file — keep them focused and short
- Do not use native `<input type="date">` or `<input type="time">` — use the custom pickers in table.js
