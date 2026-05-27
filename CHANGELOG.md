# [1.19.0](https://github.com/Alphonsos88k/ste_summary_editor/compare/v1.18.0...v1.19.0) (2026-05-27)


### Features

* persistent response token override button in analyser toolbar ([f13a699](https://github.com/Alphonsos88k/ste_summary_editor/commit/f13a699f951943cef2d43e4ca17221d87534f986))

# [1.18.0](https://github.com/Alphonsos88k/ste_summary_editor/compare/v1.17.1...v1.18.0) (2026-05-27)


### Bug Fixes

* all structural actions now enforce chronological content integrity after apply ([972dc0f](https://github.com/Alphonsos88k/ste_summary_editor/commit/972dc0f67b240ac3b9377e43ad3a3d0891baedeb))
* chronological grounding in entry-analysis — structural actions require digest-backed justification ([5066984](https://github.com/Alphonsos88k/ste_summary_editor/commit/5066984a5fa36fd782a669d97d1f366b3560e49b))
* chronological grounding rules to prevent location/event misattribution in digest ([a46af69](https://github.com/Alphonsos88k/ste_summary_editor/commit/a46af696ca6f7190644e3cca08639eb624c651de))
* MOVE applies proposed rewrite for chronological fit; digest-refine grounding rules ([4952f3f](https://github.com/Alphonsos88k/ste_summary_editor/commit/4952f3fabbff8f28994224be6ad2dd6c543fcfcd))


### Features

* redesign token estimate and output-length override UX ([305ff71](https://github.com/Alphonsos88k/ste_summary_editor/commit/305ff71e07507738a61dfcd0c6ebbe1b063ae6cf))
* token estimate in run dialog, spinning ⟳ on all running states ([7a6beb0](https://github.com/Alphonsos88k/ste_summary_editor/commit/7a6beb033472a70d1e15381646de5ab2526a1d7f))
* token estimate on file add, max-tokens override in run dialog, digest length target ([839c33d](https://github.com/Alphonsos88k/ste_summary_editor/commit/839c33d089fd9eb3563eeb9469c7642b5159f010))

## [1.17.1](https://github.com/Alphonsos88k/ste_summary_editor/compare/v1.17.0...v1.17.1) (2026-05-26)


### Bug Fixes

* strengthen content fidelity guidance in chat-digest prompt ([1ee8623](https://github.com/Alphonsos88k/ste_summary_editor/commit/1ee862331809687f6489b5a45bf37d926b87d693))

# [1.17.0](https://github.com/Alphonsos88k/ste_summary_editor/compare/v1.16.0...v1.17.0) (2026-05-26)


### Bug Fixes

* replace deprecated getallchatsofcharacter with /api/characters/chats ([4df0c1a](https://github.com/Alphonsos88k/ste_summary_editor/commit/4df0c1a975f38195263d36b7b8b21490a0a22c7d))


### Features

* analyser MOVE action, prompt rewrites, UX bug fixes ([3a6b899](https://github.com/Alphonsos88k/ste_summary_editor/commit/3a6b899c8fbe4ccab73beddbd6e4693a8eab174e))

# [1.16.0](https://github.com/Alphonsos88k/ste_summary_editor/compare/v1.15.0...v1.16.0) (2026-05-26)


### Features

* analyse UX — real-time card re-render, bundled LiteGraph, externalized prompts, Analyze spelling ([df76af6](https://github.com/Alphonsos88k/ste_summary_editor/commit/df76af690cfdbd11aa50a5f77313c8ad3cfb8a77))
* Snake and Line canvas layouts, toolbar view/arrange grouping ([14383ff](https://github.com/Alphonsos88k/ste_summary_editor/commit/14383ff736466e38fc514386f763f77b6123c006))

# [1.15.0](https://github.com/Alphonsos88k/ste_summary_editor/compare/v1.14.0...v1.15.0) (2026-05-26)


### Features

* analyse UX improvements — task list panel, structural apply in detail, sidebar polish ([78e337c](https://github.com/Alphonsos88k/ste_summary_editor/commit/78e337c727f8d0932d6bd670d8e63310bf23baef))

# [1.14.0](https://github.com/Alphonsos88k/ste_summary_editor/compare/v1.13.0...v1.14.0) (2026-05-26)


### Bug Fixes

* drop LiteGraph CSS, add toolbar button styles, scope Analyse prompts dialog ([07b2207](https://github.com/Alphonsos88k/ste_summary_editor/commit/07b22078b3224c4d4c2121432bcf70b3acf17104))
* give analyse sidebar sections equal flex halves with overflow-y scroll ([233e8a6](https://github.com/Alphonsos88k/ste_summary_editor/commit/233e8a67870a98b0639139a7e1b34c2202fbcede))
* include all entries in LLM context for entry analysis ([bff4233](https://github.com/Alphonsos88k/ste_summary_editor/commit/bff42338d495c742a75ea850c5364c395e80db17))
* overlays render below toolbar, mutual exclusion, entries sync on delete/split ([b708245](https://github.com/Alphonsos88k/ste_summary_editor/commit/b7082459f2015a74ff23c532c62b1fd4c8c4af09))
* remove branch grouping from chat files list — flat sort by last modified ([decc7b8](https://github.com/Alphonsos88k/ste_summary_editor/commit/decc7b8aadadee52cb260a8288b3aa9f00ec2f4d))
* scope entry context to connected nodes only ([11be383](https://github.com/Alphonsos88k/ste_summary_editor/commit/11be3838bfc206945bc16c723d90a31be9e5c34a))
* use exit-fullscreen icon (⤢) for both minimap and chat files fullscreen toggle ([83e1d3f](https://github.com/Alphonsos88k/ste_summary_editor/commit/83e1d3fcd9f7bcfbeb1e56711d7f5a76ab36d633))


### Features

* add Analyse tab with Cytoscape node canvas and character card portrait ([7d76890](https://github.com/Alphonsos88k/ste_summary_editor/commit/7d768909646a6a282daf9aaf948f8bddaf708966))
* add fullscreen toggle button to Act Map overlay header ([270eca4](https://github.com/Alphonsos88k/ste_summary_editor/commit/270eca4b00d798c7b0fc6b00fc99def35971ac6a))
* content-fidelity prompts — preserve visceral, explicit, and character-specific detail ([1963db3](https://github.com/Alphonsos88k/ste_summary_editor/commit/1963db3ba035aa10942d755ec8289aef07d7f2c4))
* entry browser and proposed/original toggle in detail pop-out ([c768e82](https://github.com/Alphonsos88k/ste_summary_editor/commit/c768e829bc78222818f351884c5ad1538994a1ae)), closes [#7](https://github.com/Alphonsos88k/ste_summary_editor/issues/7) [#N](https://github.com/Alphonsos88k/ste_summary_editor/issues/N)
* interactive digest review, card-based results, and sidebar two-column layout ([cf7238b](https://github.com/Alphonsos88k/ste_summary_editor/commit/cf7238b2a5abc71b5b793c7edd1dde1dc394624a))
* node editor help booklet, canvas polish, and toolbar fixes ([7de5ace](https://github.com/Alphonsos88k/ste_summary_editor/commit/7de5ace831ed8742e0b5f1001f1499f263168bd7))
* node editor toolbar polish, zoom label fix, DPR canvas fix, help booklet, draggable prompts dialog ([2a4af22](https://github.com/Alphonsos88k/ste_summary_editor/commit/2a4af22b410344db8e2d60df6cfee987cc38b5b8))
* paginated results, per-entry pop-out detail, action badges, shift banner, and refine tooltip ([6e7309b](https://github.com/Alphonsos88k/ste_summary_editor/commit/6e7309b76abaf14b57f00fbda0b4242fd28d6b2f))
* redesign chat files panel as inline overlay with syntax highlighting ([dd29c1a](https://github.com/Alphonsos88k/ste_summary_editor/commit/dd29c1a895ae5b48432bedbe5dcbb5bff7263ce2))
* replace Cytoscape with LiteGraph for ComfyUI-style node canvas ([5d3372f](https://github.com/Alphonsos88k/ste_summary_editor/commit/5d3372fb2c70fdbcbab361a2af2bf82487557642))
* Run Analysis button with 3-prompt pipeline, tooltips, and help docs ([f03d474](https://github.com/Alphonsos88k/ste_summary_editor/commit/f03d47466182e037871a0b885517ae2519b43489))
* staged structural apply (SWAP/MERGE/SPLIT) with Commit/Cancel ([62f1fb2](https://github.com/Alphonsos88k/ste_summary_editor/commit/62f1fb2135f0f41eaf1edb59a9c30bd14bf3071f))
* XY coords overlay, entry chaining, and updated connection docs ([3cd49a5](https://github.com/Alphonsos88k/ste_summary_editor/commit/3cd49a5df72995502b8c349200f5319091b52145))

# [1.13.0](https://github.com/Alphonsos88k/ste_summary_editor/compare/v1.12.3...v1.13.0) (2026-05-25)


### Bug Fixes

* append panel to overlay before spawnPanel (was never added to DOM) ([1b45e63](https://github.com/Alphonsos88k/ste_summary_editor/commit/1b45e63d4e7922c2ce250ba0cda098a67e79d43b))
* Chat Files click binding, toolbar grouping, move Folder into panel ([cd36173](https://github.com/Alphonsos88k/ste_summary_editor/commit/cd36173399ed452625f8ce7296723c3c744ded47))
* fire se:character-changed on initCharSelect so Chat Files button syncs on open ([d318a28](https://github.com/Alphonsos88k/ste_summary_editor/commit/d318a281a1c51fe072aa2de82fa7dd4ee226c91b))
* folder copy as icon-only button with brief toast confirmation ([8a5c282](https://github.com/Alphonsos88k/ste_summary_editor/commit/8a5c28246b6d1ae78216ea15980c323bb4a369d6))
* folder path as input+copy button group, rename to Copy folder path ([9cc5da0](https://github.com/Alphonsos88k/ste_summary_editor/commit/9cc5da000706e47d0fb130ddbe5b1027c34db2d8))
* scope getElementById to _panel.querySelector to prevent null crash on open ([3a84922](https://github.com/Alphonsos88k/ste_summary_editor/commit/3a849222e95704c45468d42b169a5e51313610ea))


### Features

* character card association strip + Chat Files button placeholder ([fbd9fdb](https://github.com/Alphonsos88k/ste_summary_editor/commit/fbd9fdbb6054149f4015cb2b0c4687dc276c5170))
* Chat Files Manager panel with JSONL/Plain/YAML/Form views ([3dfb058](https://github.com/Alphonsos88k/ste_summary_editor/commit/3dfb05857e37078b98e2420fd5a5b521a972095e))

## [1.12.3](https://github.com/Alphonsos88k/ste_summary_editor/compare/v1.12.2...v1.12.3) (2026-05-25)


### Bug Fixes

* split urgency indicators into two distinct styles ([e58fa6a](https://github.com/Alphonsos88k/ste_summary_editor/commit/e58fa6ac64fc1d3cb4ea7fb9d744d642b2f0f8c2))

## [1.12.2](https://github.com/Alphonsos88k/ste_summary_editor/compare/v1.12.1...v1.12.2) (2026-05-25)


### Bug Fixes

* attn badge always visible + oval outline style ([27505bf](https://github.com/Alphonsos88k/ste_summary_editor/commit/27505bfb03702b8480441ef96200f45a634a6b49))

## [1.12.1](https://github.com/Alphonsos88k/ste_summary_editor/compare/v1.12.0...v1.12.1) (2026-05-25)


### Bug Fixes

* remove popup header ! badge, add se-attn-circle to sidebar rows ([2101c86](https://github.com/Alphonsos88k/ste_summary_editor/commit/2101c86e99e52fee7e94c46e53a4c2757d1698a9))
* replace ⓘ + duplicate orange badge with single orange ! in sidebar row ([8bd31d4](https://github.com/Alphonsos88k/ste_summary_editor/commit/8bd31d4e94f073c97519a0b1ec23ff11784531f9))

# [1.12.0](https://github.com/Alphonsos88k/ste_summary_editor/compare/v1.11.1...v1.12.0) (2026-05-25)


### Bug Fixes

* move attention badge to sidebar drawer, shared se-attn-circle style ([6071557](https://github.com/Alphonsos88k/ste_summary_editor/commit/6071557ebae308a867f8af67d6c6871ee55e5b3b)), closes [#se-file-drawer-attn](https://github.com/Alphonsos88k/ste_summary_editor/issues/se-file-drawer-attn) [#se-fp-attention-btn](https://github.com/Alphonsos88k/ste_summary_editor/issues/se-fp-attention-btn)


### Features

* file categorization v2 — folder auto-assign, empty badge, unified select, attention dialog ([3d97782](https://github.com/Alphonsos88k/ste_summary_editor/commit/3d97782cc13bf511b484e6b04ed12912839c76e9))

## [1.11.1](https://github.com/Alphonsos88k/ste_summary_editor/compare/v1.11.0...v1.11.1) (2026-05-25)


### Bug Fixes

* phase 2 shift only to next sequential file to preserve cross-file entry order ([97ca342](https://github.com/Alphonsos88k/ste_summary_editor/commit/97ca342f226687a56d5e0b43ea0fba6d54656ca2))

# [1.11.0](https://github.com/Alphonsos88k/ste_summary_editor/compare/v1.10.0...v1.11.0) (2026-05-25)


### Features

* auto-balance v2 — phase 2 size shifting, phase 3 new file prompt, orphan detection, ? tooltip ([14f9747](https://github.com/Alphonsos88k/ste_summary_editor/commit/14f9747f0fb7dcb2dafc3d1d36e075d51533a803))
* entry [#1](https://github.com/Alphonsos88k/ste_summary_editor/issues/1) prelude context — supplementary files + leniency prompt injected when entry 1 in conflict check scope ([a83bf46](https://github.com/Alphonsos88k/ste_summary_editor/commit/a83bf462a4118e7712d06aaaefbd768be9c81501))

# [1.10.0](https://github.com/Alphonsos88k/ste_summary_editor/compare/v1.9.0...v1.10.0) (2026-04-28)


### Bug Fixes

* move gaps panel info icon next to title ([5cfd597](https://github.com/Alphonsos88k/ste_summary_editor/commit/5cfd5975a99d53c6f47077b5718d8d2cde60360d))


### Features

* gaps panel, gap suggest story context injection, deploy guard clause ([fab887e](https://github.com/Alphonsos88k/ste_summary_editor/commit/fab887eaaa6164c7941a60d1077d87f9bb20a28f))

# [1.9.0](https://github.com/Alphonsos88k/ste_summary_editor/compare/v1.8.0...v1.9.0) (2026-04-28)


### Bug Fixes

* remove position:relative from story-ctx-panel that broke fixed float, shrink to 480px ([8ba0499](https://github.com/Alphonsos88k/ste_summary_editor/commit/8ba04993709af59b0c1bb2fd589ec7f85ef76370))


### Features

* consistency score UI — side layout, circle, sleek button, validation toast, info popup ([1eb1eca](https://github.com/Alphonsos88k/ste_summary_editor/commit/1eb1eca32cc5fa7aa83b499f52ec6b767e6ae57e))

# [1.8.0](https://github.com/Alphonsos88k/ste_summary_editor/compare/v1.7.0...v1.8.0) (2026-04-27)


### Bug Fixes

* deploy.ps1 workspace parse uses regex instead of ConvertFrom-Json (handles JSONC comments) ([aa32c67](https://github.com/Alphonsos88k/ste_summary_editor/commit/aa32c67b68f337ce1a1352bc765515a52eefb5a9))


### Features

* undo coverage, collapse/expand, version history, TS typecheck ([b308c8d](https://github.com/Alphonsos88k/ste_summary_editor/commit/b308c8d9b2bce3d27f08548f04336fb885cf3534))

# [1.7.0](https://github.com/Alphonsos88k/ste_summary_editor/compare/v1.6.0...v1.7.0) (2026-04-26)


### Features

* localForage for large-entry intra-session storage; remove dead loadPersistedState ([5ae12ea](https://github.com/Alphonsos88k/ste_summary_editor/commit/5ae12ea83286e073572a18b9a7d26cfe215f7816))
* Stage 2+3 — Fuse.js fuzzy search + jsdiff diff view ([d05aa57](https://github.com/Alphonsos88k/ste_summary_editor/commit/d05aa57d187bbefeee73e8959705e1deb456e200))

# [1.6.0](https://github.com/Alphonsos88k/ste_summary_editor/compare/v1.5.0...v1.6.0) (2026-04-26)


### Bug Fixes

* + New Act works with 0 selected entries; suggests next name from user's naming convention ([b0c86d0](https://github.com/Alphonsos88k/ste_summary_editor/commit/b0c86d0e5473fa071c088d6d80504799ea9bdc0f))
* act table panel scrolls after ~6 rows ([dd1b784](https://github.com/Alphonsos88k/ste_summary_editor/commit/dd1b784c689f839d789d624b2b744037326baac3))
* cap per-act summary list at ~3 rows with overflow-y scroll ([e8601d7](https://github.com/Alphonsos88k/ste_summary_editor/commit/e8601d78653aaf512d249d0e23e54d99de97960c))
* group New File next to Auto-balance; fix overflow-y scroll in Output Planner ([9c18a8a](https://github.com/Alphonsos88k/ste_summary_editor/commit/9c18a8a3ebbbed564a991a47b1d0a1199b2ddc08))
* use double-class selector to override float-panel max-height for Output Planner ([4f73dc2](https://github.com/Alphonsos88k/ste_summary_editor/commit/4f73dc207487c8c2ca5cd2114d4346f5ecd63df6))


### Features

* add act coverage to analytics metadata section and per-act completion mini-bars ([c279817](https://github.com/Alphonsos88k/ste_summary_editor/commit/c279817d3d9747263c35a4fd5aab1ff49ba1575d))
* expand button opens sleek per-act table panel with sort/dir controls and Esc to close ([b86a18b](https://github.com/Alphonsos88k/ste_summary_editor/commit/b86a18b2ba72ef44980ef89c82b01370c4755afd))
* Output Planner v2 — New File, Delete, empty-row state, alphanumeric sort ([b761393](https://github.com/Alphonsos88k/ste_summary_editor/commit/b7613936df11af3aa4e80b1c169ded3ec83d3959))
* per-act summary sort/direction dropdowns (A-Z, word count, entry count · asc/desc) ([9ae686f](https://github.com/Alphonsos88k/ste_summary_editor/commit/9ae686f6f1bd98897382152f6a34cbcef8b37315))

# [1.5.0](https://github.com/Alphonsos88k/ste_summary_editor/compare/v1.4.0...v1.5.0) (2026-04-26)


### Bug Fixes

* table.js SonarQube warnings and let→const ([e014a7b](https://github.com/Alphonsos88k/ste_summary_editor/commit/e014a7b1d17dbdb4f97433b74ba9146744d604fd))


### Features

* Output Planner, file-range ops, cogwheel buttons, system prompt UI, golden-angle range colors ([9176d28](https://github.com/Alphonsos88k/ste_summary_editor/commit/9176d286ea434ef15c279f555cffb75a44473fee))
* step 6 acts changes — Unassigned label, confirm on reassign, remove acts registry from JSON ([0b9ded7](https://github.com/Alphonsos88k/ste_summary_editor/commit/0b9ded7dac49792c376ec5e0f61ca3427ccaf2d5))

# [1.5.0] (Unreleased) — feat/file-range-system

### Features

* **Output Planner** — draggable panel (Utils → 📂 Output Planner) listing file ranges with estimated export sizes, size bars, over-limit warnings, inline label rename, split at entry boundary with live preview, merge-with-next, and auto-balance
* **File-range integrity** — `shiftEntriesUp` updates `fileRanges.entryNums`; split-entry and new-entry operations inherit range from neighbor via `inheritRangeFromNeighbor`
* **Golden-angle range colors** — unlimited non-repeating vibrant hex colors with random hue offset per install
* **System Prompts hub** — location metadata, passive-background badge on each prompt card; cogwheel split-button groups on all LLM-trigger buttons
* **Range Colors** dialog renamed to "🎨 File Range Colors"; stats bar segment click opens it; color wheel correctly updates when switching ranges

### Bug Fixes

* Cell popover (Edit tab act pill) no longer dismisses on select/input interaction — closes on mouseleave instead
* Extension panel no longer closes when releasing mouse after dragging the iro.js color wheel (`_backdropPressed` guard)
* Ingest tooltip fades out in 0.5 s immediately on mouseleave (was 2 s delay)
* Removed dead code: `removeEmptyActs` (arcs.js), `_DEFAULT_GENERATE` (timeline-editor.js), unused imports across several modules

---

# [1.4.0](https://github.com/Alphonsos88k/ste_summary_editor/compare/v1.3.0...v1.4.0) (2026-04-23)


### Bug Fixes

* Esc closes content editor first, then panel; move ? button before API status ([5e0f15f](https://github.com/Alphonsos88k/ste_summary_editor/commit/5e0f15f9e0ca0e3d977c101539ed63867bcd7653))


### Features

* keyboard shortcut discovery panel and act color swatch in assign dropdown ([95a51c4](https://github.com/Alphonsos88k/ste_summary_editor/commit/95a51c42ada0df284302ca4b988cc5abf4519b19))

# [1.3.0](https://github.com/Alphonsos88k/ste_summary_editor/compare/v1.2.0...v1.3.0) (2026-04-22)


### Features

* add Story Context, Entry Analytics, and Conflict Review panels to Edit tab ([5be1145](https://github.com/Alphonsos88k/ste_summary_editor/commit/5be11455bc3daa64dbf8dca8ca6ddac3c9ff4ea1))
* export tab step-by-step form flow redesign and Edit tab panel improvements ([8980d9f](https://github.com/Alphonsos88k/ste_summary_editor/commit/8980d9f20eb9cf559ad0b9a6e92ff1fb6dd7cf50))

# [1.2.0](https://github.com/Alphonsos88k/ste_summary_editor/compare/v1.1.0...v1.2.0) (2026-04-19)


### Bug Fixes

* act assignment entryNums sync, no auto-delete, Unassign All + Clear Acts buttons ([f1e1434](https://github.com/Alphonsos88k/ste_summary_editor/commit/f1e1434eb63e8e88d5b9d4bed93373c5dcda076d))
* replace remaining native browser dialogs in index.js ([4a79ee6](https://github.com/Alphonsos88k/ste_summary_editor/commit/4a79ee63a52486fbba6214f2253d15cb3988722d))
* story index search, ingested files count pill, unassigned act map styling ([12f2c8e](https://github.com/Alphonsos88k/ste_summary_editor/commit/12f2c8ebe5aa1f3c976cf0eba7690834a2b08bb1)), closes [#555](https://github.com/Alphonsos88k/ste_summary_editor/issues/555)


### Features

* replace all native browser dialogs with styled panel replacements ([fefa2ad](https://github.com/Alphonsos88k/ste_summary_editor/commit/fefa2ad730f51b9211b9c54f0d5637d45a2b6057))

## [1.1.1](https://github.com/Alphonsos88k/ste_summary_editor/compare/v1.1.0...v1.1.1) (2026-04-19)


### Bug Fixes

* act assignment entryNums sync, no auto-delete, Unassign All + Clear Acts buttons ([f1e1434](https://github.com/Alphonsos88k/ste_summary_editor/commit/f1e1434eb63e8e88d5b9d4bed93373c5dcda076d))
* story index search, ingested files count pill, unassigned act map styling ([12f2c8e](https://github.com/Alphonsos88k/ste_summary_editor/commit/12f2c8ebe5aa1f3c976cf0eba7690834a2b08bb1)), closes [#555](https://github.com/Alphonsos88k/ste_summary_editor/issues/555)

## [1.1.1](https://github.com/Alphonsos88k/ste_summary_editor/compare/v1.1.0...v1.1.1) (2026-04-19)


### Bug Fixes

* story index search, ingested files count pill, unassigned act map styling ([12f2c8e](https://github.com/Alphonsos88k/ste_summary_editor/commit/12f2c8ebe5aa1f3c976cf0eba7690834a2b08bb1)), closes [#555](https://github.com/Alphonsos88k/ste_summary_editor/issues/555)

# [1.1.0](https://github.com/Alphonsos88k/ste_summary_editor/compare/v1.0.1...v1.1.0) (2026-04-18)


### Bug Fixes

* summary files header now appears on page 1 regardless of page count ([ed84634](https://github.com/Alphonsos88k/ste_summary_editor/commit/ed8463452e75efb8b699accb5c85ec37ac91a04d))
* supp rows on last page only, summary header on first page, live ingest preview refresh ([ac2a989](https://github.com/Alphonsos88k/ste_summary_editor/commit/ac2a989567d0f735a1eb78f4e2442de69b422541))


### Features

* supplementary files, timeline editor, entity heuristics, live ingest preview ([efb442c](https://github.com/Alphonsos88k/ste_summary_editor/commit/efb442ce0080ff010146a14bc735c0677dba979d))
* themed subheader rows, Summary filter option, fix checked/unchecked preserved ([e59365d](https://github.com/Alphonsos88k/ste_summary_editor/commit/e59365de7bd6cecdb670f86fcb7116988521e2b6)), closes [#a6e22e](https://github.com/Alphonsos88k/ste_summary_editor/issues/a6e22e) [#66d9e8](https://github.com/Alphonsos88k/ste_summary_editor/issues/66d9e8)


## [1.0.2](https://github.com/Alphonsos88k/ste_summary_editor/compare/v1.0.1...v1.0.2) (2026-04-18)


### Features

* **Bulk Refine** — new Utils panel tool; batch AI-rewrite for all entries or current selection with configurable system prompt; progress bar with per-entry streaming updates; cancel mid-run support
* **Supplementary Files** — non-summary files can now be assigned a category (Character Notes, Personalities, World Details, Timeline Notes, Others); appear as dedicated rows in the Review table with full editable date/time/location/notes columns; survive state persistence
* **Story Index / Entity Panel** — AI-powered multi-section panel extracting Sentient Beings, Locations, Items, Events, and Relationships from entries; regenerate per section or all; editable results; registered system prompt with JSON-return warning
* **Folder Ingestion** — directory picker ingests all valid summary files from a folder recursively; same validation and dedup pipeline as single-file ingest
* **Timeline Editor** — new draggable panel opened by the Timeline toolbar button; detects whether the assigned timeline-notes file is empty (Generate mode) or has content (Refine mode); sends entries + story context to LLM; shows AI suggestion in a review area before accepting; registered system prompt
* **Destructive Export** — "Overwrite Source Files" button in Export panel; double-confirm flow with backup ZIP download before individual file overwrites; staggered downloads 300 ms apart


### Quality of Life

* Supplementary file rows in Review table show live editable date/time/location/notes with "(no export effect)" label — same popover UX as regular entry rows
* Filter dropdown gains **Summary: All** option (shows only entry rows, hides supp section) and per-category **Supplementary** options
* **Summary Files** subheader appears above entry rows on page 1 of the Review table when supplementary files are also present
* **Supplementary Files** subheader appears on the last paginator page only — no longer bleeds into every page
* Ingest preview pill refreshes in real time when a category is assigned or changed — no longer requires closing and reopening the panel
* `updateFilterDropdown` now preserves `checked` / `unchecked` static options on every rebuild (previously stripped on first call)
* Utils panel body gains `max-height` + overflow scroll so 5+ functions don't overflow the panel


### Bug Fixes

* Supplementary radio button did nothing on click — `state.supplementaryFiles` entry was never initialized when Supplementary was selected, so `isSupp` was always false and the category dropdown never appeared
* Entity generation system prompt was blank in the hub even after a default was registered — `seedDefaultPrompts` preserved an empty string from localStorage instead of falling back to the newly-added default; fixed by only keeping saved values that are non-empty after trim
* Timeline toolbar button stayed disabled after assigning a Timeline Notes category — `hasTimelineFiles()` required `f.valid` which supplementary candidate files never have; now checks `state.supplementaryFiles` directly for the `timeline-notes` category
* Ingest preview right panel showed "(no entries)" for non-summary files — supp files matched the valid-file click handler after their class was renamed; `openIngestPreview` now detects supplementary files and shows raw content with a status pill instead of parsed entries
* Teal "assigned" badge not showing in file drawer — class list included both `invalid` and `supp-assigned`; cleaned to `supp-assigned` only
* Review table showed empty state when only supplementary files were loaded and no regular entries existed — table is now kept visible when any supplementary file has a category assigned
* `_buildSuppRadio` received an unused `file` argument causing a linter warning — signature reduced to `(radioName, isSupp)`; negated condition `!isSupp ? 'checked' : ''` corrected to `isSupp ? '' : 'checked'`
* Summary Files subheader failed to appear on page 1 when there were multiple paginator pages — the last-page early-return guard fired before the prepend; summary header logic now runs before the last-page check


### Adjustments

* Timeline radio button removed from Files panel — timeline status is now derived automatically from the Supplementary → Timeline Notes category assignment
* `hasTimelineFiles()` checks `state.supplementaryFiles` for `timeline-notes` category in addition to the legacy `state.timelineFiles` set
* `seedDefaultPrompts` skips saved values that are empty/whitespace so new defaults always populate on first load after a default is added
* Entity extraction heuristics extended with `NON_BEING_WORDS` (days, months, planets, deity titles, honorifics) and a "the"-context ratio check (>50% → classified as place or thing, not a being) — prevents Earth, Sunday, God, King, etc. from appearing in Sentient Beings
* `_buildEntriesContext` in timeline-editor now includes date/time/location metadata per entry for richer LLM context
* `_isEffectivelyEmpty` in timeline-editor treats files whose content is only a header before the first colon (e.g. "Timeline Notes:") as empty, triggering Generate mode


### UI / CSS

* Section subheader rows are non-interactive: `pointer-events: none` + explicit hover override so they never highlight like entry rows
* **Summary Files** subheader — green diagonal-stripe background (`rgba(166,226,46,…)`), `#a6e22e` label text
* **Supplementary Files** subheader — cyan radial dot-grid background (`rgba(102,217,232,…)`), `#66d9e8` label text
* Supplementary file badge in Files panel drawer: orange pill when unassigned ("choose category"), teal pill when assigned ("Supplementary · Category Name")
* `.se-fp-file-row.se-fp-supp-pending` — orange left-border tint for unassigned supplementary candidates
* `.se-fp-supplementary` — teal left-border tint for assigned supplementary files
* `.se-btn-destructive` — pink (`#f92672`) button variant for the Overwrite Source Files action
* `.se-timeline-editor` full CSS block — header, toolbar, body textarea, result review area, footer save/revert row
* `.se-ipp-supp-assigned` + `.se-ipp-supp-pill` — teal background block and badge for the ingest preview panel when a supplementary file has a category
* `.se-utils-body` gains `max-height: 320px; overflow-y: auto` so the Utils panel scrolls when more than 5 tools are listed


## [1.0.1](https://github.com/Alphonsos88k/ste_summary_editor/compare/v1.0.0...v1.0.1) (2026-04-15)


### Bug Fixes

* copy to clipboard mirrors live preview selection ([d9ffbb9](https://github.com/Alphonsos88k/ste_summary_editor/commit/d9ffbb9a1c566c844d55e46ff7fa8b7f3e9c7ed2))
* copy to clipboard now uses scoped entries matching the full preview ([5fa3f70](https://github.com/Alphonsos88k/ste_summary_editor/commit/5fa3f70db0dee532785776eeb563b18132f87d26))


# 1.0.0

### Bug Fixes

* summary files header now appears on page 1 regardless of page count ([ed84634](https://github.com/Alphonsos88k/ste_summary_editor/commit/ed8463452e75efb8b699accb5c85ec37ac91a04d))
* supp rows on last page only, summary header on first page, live ingest preview refresh ([ac2a989](https://github.com/Alphonsos88k/ste_summary_editor/commit/ac2a989567d0f735a1eb78f4e2442de69b422541))
* add iro and mermaid to ESLint globals ([0ed1939](https://github.com/Alphonsos88k/ste_summary_editor/commit/0ed19392c2e8f7e7a279f65481b42fef2192ccca))
* artifact name slash, clean up all lint warnings ([4ef305b](https://github.com/Alphonsos88k/ste_summary_editor/commit/4ef305b9b5654d00265cb74c4676f46271c8fcfc))
* use KEY_PAT for semantic-release and update CI job names for bra… ([#9](https://github.com/Alphonsos88k/ste_summary_editor/issues/9)) ([fbf838a](https://github.com/Alphonsos88k/ste_summary_editor/commit/fbf838a7950365fc304a2c93ebe3f8d3f974f239))
* use KEY_PAT for semantic-release and update CI job names for branch protection ([1304129](https://github.com/Alphonsos88k/ste_summary_editor/commit/1304129f0e9c66395a246e61cc35c6a677b0f301))

### Features

* supplementary files, timeline editor, entity heuristics, live ingest preview ([efb442c](https://github.com/Alphonsos88k/ste_summary_editor/commit/efb442ce0080ff010146a14bc735c0677dba979d))
* themed subheader rows, Summary filter option, fix checked/unchecked preserved ([e59365d](https://github.com/Alphonsos88k/ste_summary_editor/commit/e59365de7bd6cecdb670f86fcb7116988521e2b6)), closes [#a6e22e](https://github.com/Alphonsos88k/ste_summary_editor/issues/a6e22e) [#66d9e8](https://github.com/Alphonsos88k/ste_summary_editor/issues/66d9e8)
* add -Action flag to dev scripts for non-interactive use ([4b28d56](https://github.com/Alphonsos88k/ste_summary_editor/commit/4b28d5662993ebdaf325477c8858f4e3b53a8dec))
