/* ============================================================
   Summary Editor — Mockup JS (v4)
   All logic: data-driven table, click-to-edit, conflict
   detection via API, pagination, selection, stats bar.
   ============================================================ */

/* ══════════════════════════════════════════════════
   MOCK DATA
   ══════════════════════════════════════════════════ */
const ENTRIES = {
  1:  { content: 'Sarah arrived at the old farmhouse at dawn, dust coating every surface. The letter from her grandmother mentioned a hidden room beneath the kitchen floor. She could hear the wind howling through gaps in the walls and the faint scratching of mice behind the plaster.',
        arc: 'Act One', arcColor: '#a6e22e', date: 'Day 1', time: 'Dawn', location: 'Farmhouse', notes: '' },
  2:  { content: 'The letter was found under the third floorboard from the east wall. It contained a map with three marked locations and a key taped to the back.',
        arc: 'Act One', arcColor: '#a6e22e', date: 'Day 1', time: 'Noon', location: 'Farmhouse', notes: '' },
  3:  { content: 'Marcus confronted the town elder about the missing deed. The elder claimed ignorance but his hands trembled as he poured the tea.',
        arc: 'Act One', arcColor: '#a6e22e', date: 'Day 2', time: 'Evening', location: 'Tavern', notes: 'Key scene' },
  5:  { content: 'The cave entrance was hidden behind the waterfall. Inside, bioluminescent fungi cast an eerie blue-green light across ancient stone carvings.',
        arc: 'Journey', arcColor: '#b0d4db', date: 'Day 3', time: 'Morning', location: 'Cliffs', notes: '' },
  6:  { content: 'They crossed the river at the narrow point where two boulders formed a natural bridge. Elara nearly slipped but caught the rope in time.',
        arc: 'Journey', arcColor: '#b0d4db', date: 'Day 3', time: 'Midday', location: 'River', notes: '' },
  7:  { content: 'An unassigned entry that hasn\'t been grouped into any arc yet. This content sits in the timeline waiting for organization.',
        arc: null, arcColor: null, date: '', time: '', location: '', notes: '' },
  8:  { content: 'The betrayal was revealed at midnight. Commander Voss had been feeding intelligence to the enemy through coded messages hidden in trade manifests.',
        arc: 'Conflict', arcColor: '#f44747', date: 'Day 5', time: 'Midnight', location: 'Camp', notes: 'Twist' },
  9:  { content: 'Sarah rallied the remaining loyalists in the barn. They had twelve hours before Voss\'s reinforcements would arrive from the eastern pass.',
        arc: 'Conflict', arcColor: '#f44747', date: 'Day 5', time: '1 AM', location: 'Barn', notes: '' },
  10: { content: 'The trial concluded at sunset. Voss was exiled rather than executed — Sarah argued mercy would prove their cause more just than revenge.',
        arc: 'Resolution', arcColor: '#ae81ff', date: 'Day 8', time: 'Sunset', location: 'Town Hall', notes: '' },
  11: { content: 'The rebuilding began the next morning. Timber was hauled from the northern forest while Marcus drafted the new charter.',
        arc: 'Conflict', arcColor: '#f44747', date: 'Day 9', time: 'Morning', location: 'Town Square', notes: '' },
  12: { content: 'Captain Voss was spotted near the border crossing. Whether he intended to return or merely linger remained unclear.',
        arc: 'Conflict', arcColor: '#f44747', date: 'Day 10', time: '', location: 'Border', notes: '' },
  13: { content: 'The harvest festival proceeded despite the turmoil. Elara sang the old ballad that no one had heard in twenty years.',
        arc: 'Conflict', arcColor: '#f44747', date: 'Day 11', time: 'Evening', location: 'Village', notes: '' },
  14: { content: 'A new threat emerged from the marshlands to the south. Strange lights had been seen moving through the fog each night.',
        arc: 'Conflict', arcColor: '#f44747', date: 'Day 12', time: 'Night', location: 'Marshlands', notes: '' },
  15: { content: 'Returning to the farmhouse, Sarah noticed the door had been forced open. Muddy boot prints led to the hidden room.',
        arc: 'Act One', arcColor: '#a6e22e', date: '', time: '', location: 'Farmhouse', notes: '' },
  16: { content: 'The hidden room contained journals dating back three generations. Each one referenced the same location in the mountains.',
        arc: 'Act One', arcColor: '#a6e22e', date: '', time: '', location: '', notes: '' },
  18: { content: 'A visitor arrived at dusk claiming to be a distant cousin. His accent didn\'t match any region Sarah knew.',
        arc: 'Act One', arcColor: '#a6e22e', date: 'Day 4', time: 'Dusk', location: 'Farmhouse', notes: '' },
  19: { content: 'The visitor\'s story didn\'t add up — Sarah caught him examining the floorboards after everyone had gone to sleep.',
        arc: 'Act One', arcColor: '#a6e22e', date: 'Day 4', time: 'Night', location: 'Farmhouse', notes: '' },
  20: { content: 'By morning the visitor had vanished, along with the oldest of the three journals. Marcus found tracks heading west.',
        arc: 'Act One', arcColor: '#a6e22e', date: 'Day 5', time: 'Morning', location: 'Farmhouse', notes: '' },
  21: { content: 'The western trail led through a dense pine forest. They found a torn page from the journal pinned to a tree.',
        arc: 'Journey', arcColor: '#b0d4db', date: 'Day 5', time: 'Afternoon', location: 'Forest', notes: '' },
  22: { content: 'A mountain pass revealed itself after three hours of climbing. The air was thin and cold.',
        arc: 'Journey', arcColor: '#b0d4db', date: 'Day 6', time: 'Morning', location: 'Mountain', notes: '' },
  23: { content: 'They discovered an abandoned outpost at the summit. Inside, maps of the entire region covered every wall.',
        arc: 'Journey', arcColor: '#b0d4db', date: 'Day 6', time: 'Noon', location: 'Mountain', notes: '' },
  24: { content: 'One map showed a path to a lake that no current chart included. Elara recognized the symbol marking it.',
        arc: 'Journey', arcColor: '#b0d4db', date: 'Day 6', time: '', location: 'Mountain', notes: '' },
  25: { content: 'The lake was real. Its waters were impossibly clear, revealing ruins on the lakebed.',
        arc: 'Journey', arcColor: '#b0d4db', date: 'Day 7', time: 'Dawn', location: 'Hidden Lake', notes: '' },
  26: { content: 'They camped by the lake. Marcus sketched the ruins from above while Sarah examined the shore for entry points.',
        arc: null, arcColor: null, date: 'Day 7', time: 'Evening', location: 'Hidden Lake', notes: '' },
  27: { content: 'Elara found a submerged staircase leading down. The group debated whether to descend before morning.',
        arc: null, arcColor: null, date: 'Day 7', time: 'Night', location: '', notes: '' },
  28: { content: 'The underwater ruins held a sealed chamber with a carved warning in an old dialect. Marcus translated slowly.',
        arc: 'Resolution', arcColor: '#ae81ff', date: 'Day 8', time: 'Morning', location: 'Ruins', notes: '' },
  29: { content: 'Inside the chamber lay a complete genealogical record linking Sarah\'s family to the region\'s founders.',
        arc: 'Resolution', arcColor: '#ae81ff', date: 'Day 8', time: 'Midday', location: 'Ruins', notes: '' },
  30: { content: 'The record confirmed the deed was authentic. Sarah now had irrefutable proof of her family\'s claim.',
        arc: 'Resolution', arcColor: '#ae81ff', date: 'Day 8', time: 'Afternoon', location: 'Ruins', notes: '' },
  31: { content: 'They returned to the village to present the evidence. The council convened an emergency session.',
        arc: 'Resolution', arcColor: '#ae81ff', date: 'Day 8', time: 'Evening', location: 'Village', notes: '' },
  32: { content: 'The council voted unanimously to restore the land rights. The elder abstained, staring at the floor.',
        arc: 'Resolution', arcColor: '#ae81ff', date: 'Day 8', time: 'Night', location: 'Town Hall', notes: '' },
  33: { content: 'Sarah stood on the farmhouse porch at sunrise. For the first time, she felt it truly belonged to her.',
        arc: null, arcColor: null, date: 'Day 9', time: 'Sunrise', location: 'Farmhouse', notes: '' },
  34: { content: 'Marcus packed his notes into a leather satchel. He planned to publish the findings at the university.',
        arc: null, arcColor: null, date: 'Day 9', time: 'Morning', location: '', notes: '' },
  35: { content: 'Elara left a pressed flower between the pages of the remaining journal. She never explained why.',
        arc: null, arcColor: null, date: '', time: '', location: '', notes: '' },
  36: { content: 'The visitor reappeared at the market two weeks later, selling the stolen journal pages as antiques.',
        arc: null, arcColor: null, date: 'Day 23', time: 'Afternoon', location: 'Market', notes: '' },
  37: { content: 'Sarah confronted him calmly. He returned the pages without a fight and disappeared again.',
        arc: 'Conflict', arcColor: '#f44747', date: 'Day 23', time: '', location: 'Market', notes: '' },
  38: { content: 'The journal pages revealed one final secret — coordinates to a second hidden chamber beneath the lake.',
        arc: 'Conflict', arcColor: '#f44747', date: 'Day 24', time: '', location: 'Farmhouse', notes: '' },
  39: { content: 'Marcus argued against another expedition so soon. Sarah agreed to wait until spring.',
        arc: null, arcColor: null, date: 'Day 25', time: '', location: '', notes: '' },
  40: { content: 'Winter came early that year. The farmhouse held firm against the storms.',
        arc: null, arcColor: null, date: '', time: '', location: 'Farmhouse', notes: '' },
  41: { content: 'A letter arrived from the university. Marcus\'s paper had been accepted for publication.',
        arc: null, arcColor: null, date: '', time: '', location: '', notes: '' },
  42: { content: 'Sarah read it by the fire, smiling. The story was far from over, but this chapter had closed.',
        arc: null, arcColor: null, date: '', time: '', location: 'Farmhouse', notes: '' }
};

const GAPS = new Set([4, 17]);
const ROWS_PER_PAGE = 10;

/* ══════════════════════════════════════════════════
   STATE
   ══════════════════════════════════════════════════ */
const state = {
  selected: new Set(),
  currentPage: 1,
  sortBy: 'num',
  filterBy: 'all',
  searchQuery: '',
  conflicts: {},        // { entryNum: [{ text, reason, severity }] }
  conflictRunning: false,
  lastAction: null,     // { description, undo: function }
  apiConnected: false,
  apiModel: '',
};

/* ══════════════════════════════════════════════════
   UTILITY
   ══════════════════════════════════════════════════ */
function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/** Get sorted+filtered entry numbers including gaps */
function getVisibleEntries() {
  // Build full sequence 1..max including gaps
  const allNums = Object.keys(ENTRIES).map(Number);
  const maxNum = Math.max(...allNums, ...GAPS);
  const seq = [];
  for (let i = 1; i <= maxNum; i++) {
    if (ENTRIES[i] || GAPS.has(i)) seq.push(i);
  }

  // Filter
  let filtered = seq;
  if (state.filterBy === 'unassigned') {
    filtered = seq.filter(n => ENTRIES[n] && !ENTRIES[n].arc);
  } else if (state.filterBy === 'gaps') {
    filtered = seq.filter(n => GAPS.has(n));
  }

  // Search
  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase();
    filtered = filtered.filter(n => {
      if (GAPS.has(n)) return false;
      return ENTRIES[n].content.toLowerCase().includes(q);
    });
  }

  // Sort
  if (state.sortBy === 'arc') {
    filtered.sort((a, b) => {
      const arcA = (ENTRIES[a] && ENTRIES[a].arc) || 'zzz';
      const arcB = (ENTRIES[b] && ENTRIES[b].arc) || 'zzz';
      return arcA.localeCompare(arcB) || a - b;
    });
  }
  // default: by num (already in order)

  return filtered;
}

/* ══════════════════════════════════════════════════
   STATS BAR (rendered from data)
   ══════════════════════════════════════════════════ */
function renderStatsBar() {
  const bar = document.getElementById('se-stats-bar');
  if (!bar) return;
  bar.innerHTML = '';

  const allNums = Object.keys(ENTRIES).map(Number);
  const total = allNums.length + GAPS.size;

  // Count per arc
  const arcCounts = {};
  let unassigned = 0;
  allNums.forEach(n => {
    const e = ENTRIES[n];
    if (e.arc) {
      const key = e.arc;
      if (!arcCounts[key]) arcCounts[key] = { count: 0, color: e.arcColor };
      arcCounts[key].count++;
    } else {
      unassigned++;
    }
  });

  // Render segments
  Object.entries(arcCounts).forEach(([name, { count, color }]) => {
    const pct = (count / total * 100).toFixed(1);
    const seg = document.createElement('div');
    seg.className = 'stats-seg';
    seg.style.background = color;
    seg.style.width = pct + '%';
    seg.innerHTML = '<span class="seg-tip">' + escHtml(name) + ' — ' + count + ' entries</span>';
    bar.appendChild(seg);
  });

  // Unassigned
  if (unassigned > 0) {
    const pct = (unassigned / total * 100).toFixed(1);
    const seg = document.createElement('div');
    seg.className = 'stats-seg';
    seg.style.background = '#555';
    seg.style.width = pct + '%';
    seg.innerHTML = '<span class="seg-tip">Unassigned — ' + unassigned + ' entries</span>';
    bar.appendChild(seg);
  }

  // Gaps
  if (GAPS.size > 0) {
    const pct = (GAPS.size / total * 100).toFixed(1);
    const seg = document.createElement('div');
    seg.className = 'stats-seg';
    seg.style.background = 'repeating-linear-gradient(45deg,#fd971f,#fd971f 3px,transparent 3px,transparent 6px)';
    seg.style.width = pct + '%';
    seg.innerHTML = '<span class="seg-tip">Gaps — ' + GAPS.size + ' missing</span>';
    bar.appendChild(seg);
  }
}

/* ══════════════════════════════════════════════════
   WARNING BANNER (rendered from data)
   ══════════════════════════════════════════════════ */
function renderWarningBanner() {
  const banner = document.getElementById('se-warning-banner');
  if (!banner) return;
  if (GAPS.size === 0) {
    banner.style.display = 'none';
    return;
  }
  const gapList = [...GAPS].sort((a, b) => a - b).map(n => '#' + n).join(', ');
  banner.style.display = 'flex';
  banner.querySelector('.warning-text').textContent =
    '\u26A0 Gaps detected: entries ' + gapList + ' are missing from the sequence';
}

/* ══════════════════════════════════════════════════
   SELECTION BAR
   ══════════════════════════════════════════════════ */
function renderSelectionBar() {
  const bar = document.getElementById('se-selection-bar');
  if (!bar) return;
  if (state.selected.size === 0) {
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'flex';
  bar.querySelector('.sel-count').textContent = state.selected.size + ' selected';
}

/* ══════════════════════════════════════════════════
   TABLE RENDERING (data-driven)
   ══════════════════════════════════════════════════ */
function renderTable() {
  const tbody = document.getElementById('se-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const visible = getVisibleEntries();
  const totalPages = Math.max(1, Math.ceil(visible.length / ROWS_PER_PAGE));
  if (state.currentPage > totalPages) state.currentPage = totalPages;

  const start = (state.currentPage - 1) * ROWS_PER_PAGE;
  const pageEntries = visible.slice(start, start + ROWS_PER_PAGE);

  pageEntries.forEach(num => {
    if (GAPS.has(num)) {
      // Gap row
      const tr = document.createElement('tr');
      tr.className = 'gap-row';
      tr.dataset.num = num;
      tr.innerHTML =
        '<td class="col-check"></td>' +
        '<td class="col-num">' + num + '</td>' +
        '<td class="col-arc" style="color:#fd971f;">\u26A0</td>' +
        '<td class="col-content" colspan="5" style="color:#fd971f;">Missing entry #' + num + '</td>';
      tbody.appendChild(tr);
      return;
    }

    const entry = ENTRIES[num];
    if (!entry) return;

    const isSelected = state.selected.has(num);
    const tr = document.createElement('tr');
    if (isSelected) tr.className = 'selected';
    tr.dataset.num = num;

    // Checkbox
    const tdCheck = document.createElement('td');
    tdCheck.className = 'col-check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = isSelected;
    cb.addEventListener('change', (e) => handleCheckbox(num, e));
    tdCheck.appendChild(cb);

    // Number
    const tdNum = document.createElement('td');
    tdNum.className = 'col-num';
    tdNum.textContent = num;

    // Arc badge
    const tdArc = document.createElement('td');
    tdArc.className = 'col-arc';
    if (entry.arc) {
      const badge = document.createElement('span');
      badge.className = 'arc-badge';
      badge.style.background = entry.arcColor;
      badge.style.color = (entry.arcColor === '#f44747' || entry.arcColor === '#f92672') ? '#fff' : '#272822';
      badge.textContent = entry.arc;
      tdArc.appendChild(badge);
    }

    // Content (with optional conflict highlights)
    const tdContent = document.createElement('td');
    tdContent.className = 'col-content';
    const span = document.createElement('span');
    span.className = 'content-text';

    const conflicts = state.conflicts[num];
    if (conflicts && conflicts.length > 0) {
      span.innerHTML = applyConflictHighlights(entry.content, conflicts);
    } else {
      span.textContent = entry.content;
    }

    // Tooltip on hover
    span.addEventListener('mouseenter', (e) => showTip(e, entry.content));
    span.addEventListener('mouseleave', hideTip);
    tdContent.appendChild(span);

    // Editable cells: date, time, location, notes
    const tdDate = createEditableCell(num, 'date', entry.date, 'Date');
    const tdTime = createEditableCell(num, 'time', entry.time, 'Time');
    const tdLoc  = createEditableCell(num, 'location', entry.location, 'Location');
    const tdNote = createEditableCell(num, 'notes', entry.notes, 'Notes');

    tr.append(tdCheck, tdNum, tdArc, tdContent, tdDate, tdTime, tdLoc, tdNote);
    tbody.appendChild(tr);
  });

  // Update pagination
  renderPagination(visible.length, totalPages);
  // Update toolbar count
  const countEl = document.getElementById('se-entry-count');
  if (countEl) {
    countEl.textContent = Object.keys(ENTRIES).length + ' entries \u2022 ' + GAPS.size + ' gaps';
  }
}

/* ══════════════════════════════════════════════════
   CLICK-TO-EDIT CELLS (floating popover)
   Click a cell → speech-bubble popover appears anchored
   to the cell. OK saves, Cancel dismisses. No layout shift.
   ══════════════════════════════════════════════════ */
let activeEditPopover = null;

function closeEditPopover() {
  if (activeEditPopover) {
    activeEditPopover.remove();
    activeEditPopover = null;
  }
}

function createEditableCell(num, field, value, placeholder) {
  const td = document.createElement('td');
  td.className = 'editable-cell';

  const display = document.createElement('span');
  display.className = 'cell-display' + (value ? '' : ' cell-empty');
  display.textContent = value || placeholder;
  display.title = field === 'notes' ? 'Author notes only \u2014 not saved to export file' : 'Click to edit';

  display.addEventListener('click', (e) => {
    e.stopPropagation();
    closeEditPopover();

    const rect = td.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.className = 'edit-popover';

    const label = field.charAt(0).toUpperCase() + field.slice(1);

    pop.innerHTML =
      '<div class="edit-popover-label">' + label + (field === 'notes' ? ' (not exported)' : '') + '</div>' +
      '<input type="text" id="ep-input" value="' + escHtml(value || '') + '" placeholder="' + placeholder + '" />' +
      '<div class="edit-popover-actions">' +
        '<button class="btn btn-sm" id="ep-cancel">Cancel</button>' +
        '<button class="btn btn-primary btn-sm" id="ep-ok">OK</button>' +
      '</div>';

    // Position below the cell, clamped to viewport
    let left = rect.left;
    let top = rect.bottom + 6;
    if (left + 300 > window.innerWidth) left = window.innerWidth - 310;
    if (left < 4) left = 4;
    if (top + 120 > window.innerHeight) top = rect.top - 120;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';

    // Adjust arrow if popover is above the cell
    if (top < rect.top) {
      pop.style.setProperty('--arrow-flip', 'true');
      pop.classList.add('edit-popover-above');
    }

    document.body.appendChild(pop);
    activeEditPopover = pop;

    const input = pop.querySelector('#ep-input');
    input.focus();
    input.select();

    const doSave = () => {
      const newVal = input.value.trim();
      const oldVal = ENTRIES[num][field];
      ENTRIES[num][field] = newVal;
      value = newVal;

      setLastAction('Edit #' + num + ' ' + field + ': "' + oldVal + '" \u2192 "' + newVal + '"', () => {
        ENTRIES[num][field] = oldVal;
        renderTable();
      });

      display.textContent = newVal || placeholder;
      display.className = 'cell-display' + (newVal ? '' : ' cell-empty');
      closeEditPopover();
    };

    const doCancel = () => {
      closeEditPopover();
    };

    pop.querySelector('#ep-ok').addEventListener('click', doSave);
    pop.querySelector('#ep-cancel').addEventListener('click', doCancel);

    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); doSave(); }
      if (ev.key === 'Escape') { ev.preventDefault(); doCancel(); }
    });
  });

  td.appendChild(display);
  return td;
}

/* ══════════════════════════════════════════════════
   CHECKBOX / SELECTION
   ══════════════════════════════════════════════════ */
let lastCheckedNum = null;

function handleCheckbox(num, e) {
  // Shift+click range select
  if (e.shiftKey && lastCheckedNum !== null) {
    const visible = getVisibleEntries().filter(n => !GAPS.has(n));
    const idxA = visible.indexOf(lastCheckedNum);
    const idxB = visible.indexOf(num);
    if (idxA >= 0 && idxB >= 0) {
      const [lo, hi] = idxA < idxB ? [idxA, idxB] : [idxB, idxA];
      for (let i = lo; i <= hi; i++) {
        state.selected.add(visible[i]);
      }
    }
  } else {
    if (state.selected.has(num)) state.selected.delete(num);
    else state.selected.add(num);
  }
  lastCheckedNum = num;
  renderTable();
  renderSelectionBar();
}

/* ══════════════════════════════════════════════════
   PAGINATION
   ══════════════════════════════════════════════════ */
function renderPagination(totalItems, totalPages) {
  const info = document.getElementById('se-page-info');
  const prev = document.getElementById('se-page-prev');
  const next = document.getElementById('se-page-next');
  if (!info) return;

  info.textContent = 'Page ' + state.currentPage + ' / ' + totalPages;
  prev.disabled = state.currentPage <= 1;
  next.disabled = state.currentPage >= totalPages;
}

/* ══════════════════════════════════════════════════
   UNDO (single level)
   ══════════════════════════════════════════════════ */
function setLastAction(description, undoFn) {
  state.lastAction = { description, undo: undoFn };
  const hint = document.querySelector('.undo-hint');
  if (hint) hint.textContent = 'Last: ' + description;
  const btn = document.getElementById('se-undo-btn');
  if (btn) btn.disabled = false;
}

function doUndo() {
  if (!state.lastAction) return;
  state.lastAction.undo();
  const btn = document.getElementById('se-undo-btn');
  if (btn) btn.disabled = true;
  const hint = document.querySelector('.undo-hint');
  if (hint) hint.textContent = 'Nothing to undo';
  state.lastAction = null;
}

/* ══════════════════════════════════════════════════
   TOOLTIP
   ══════════════════════════════════════════════════ */
function showTip(e, text) {
  const tip = document.getElementById('hover-tooltip');
  if (!tip) return;
  if (text.length > 500) text = text.slice(0, 500) + '...';
  tip.textContent = text;
  tip.style.display = 'block';
  tip.style.left = Math.min(e.clientX + 12, window.innerWidth - 520) + 'px';
  tip.style.top = (e.clientY + 16) + 'px';
}

function hideTip() {
  const tip = document.getElementById('hover-tooltip');
  if (tip) tip.style.display = 'none';
}

/* ══════════════════════════════════════════════════
   CONFLICT DETECTION VIA API
   ══════════════════════════════════════════════════

   In the real extension this calls SillyTavern's
   connected API: /api/backends/chat/completions
   using whatever model is currently connected.

   The system prompt is hidden from the user and
   instructs the model to find inconsistencies.

   For the mockup we simulate with setTimeout.
   ══════════════════════════════════════════════════ */

/** The hidden system prompt sent to the LLM */
const CONFLICT_SYSTEM_PROMPT = `You are a story consistency analyzer. You will receive a series of numbered story summary entries. Your job is to find inconsistencies, contradictions, and logical errors in the narrative flow. Look for:

1. LOCATION CONFLICTS: A character is in one place but the next entry has them somewhere impossible without explanation (e.g. at home then suddenly in a sports arena)
2. TEMPORAL CONFLICTS: Time doesn't flow logically (e.g. it's dawn, then midnight, then noon in sequential entries on the same day)
3. ENTITY CONFLICTS: A character's title, name, or attribute changes unexpectedly (e.g. "Commander Voss" becomes "Captain Voss")
4. FACTUAL CONFLICTS: Details contradict between entries (e.g. one says "a key" another says "a deed")
5. NARRATIVE FLOW: Events that don't make sense in sequence (e.g. a character is exiled then appears freely in town)
6. DUPLICATE CONTENT: Entries that say essentially the same thing

Respond ONLY with valid JSON array. Each item:
{"entry": <number>, "text": "<the conflicting phrase>", "reason": "<brief explanation referencing the other entry number>", "severity": "error"|"warning"|"info"}

If no conflicts found, respond with an empty array: []
Do not include any other text outside the JSON.`;

/** Mock API connection state — simulates ST's connection panel */
const MOCK_API = {
  connected: true,
  model: 'claude-sonnet-4-20250514',
  endpoint: 'https://api.anthropic.com/v1',
  tokenWarning: 'This will send all entry content to the connected model. Estimated ~4,200 tokens.'
};

/** Mock conflict response (simulates what the LLM would return) */
const MOCK_CONFLICT_RESPONSE = [
  { entry: 2, text: 'key', reason: 'Entry #3 references a "missing deed" but this entry says a "key" — which object was found?', severity: 'error' },
  { entry: 3, text: 'missing deed', reason: 'Entry #2 says a "key" was found, not a deed. Conflicting objects.', severity: 'error' },
  { entry: 3, text: 'claimed ignorance', reason: 'Entry #19 implies the elder was later caught or confessed — contradicts claimed ignorance.', severity: 'warning' },
  { entry: 8, text: 'Commander Voss', reason: 'Entry #12 calls him "Captain Voss" — title inconsistency.', severity: 'error' },
  { entry: 8, text: 'midnight', reason: 'Entry #9 says "1 AM" on the same day. Sarah rallies people after the betrayal but the timeline is very tight.', severity: 'info' },
  { entry: 10, text: 'Voss was exiled', reason: 'Entry #12 says Voss was "spotted near the border" just 2 days later — exile seems unenforced.', severity: 'warning' },
  { entry: 12, text: 'Captain Voss', reason: 'Entry #8 calls him "Commander Voss" — rank changed without explanation.', severity: 'error' },
  { entry: 15, text: 'Returning to the farmhouse', reason: 'No date/time set — unclear when this happens relative to entries #3 and #18.', severity: 'info' },
  { entry: 16, text: 'journals dating back three generations', reason: 'No date or time. Hard to place in the timeline — floating entry.', severity: 'info' }
];

function getApiStatus() {
  return MOCK_API;
}

function renderApiStatus() {
  const el = document.getElementById('se-api-status');
  if (!el) return;
  const api = getApiStatus();
  if (api.connected) {
    el.innerHTML =
      '<span class="api-dot connected"></span>' +
      '<span class="api-model">' + escHtml(api.model) + '</span>';
  } else {
    el.innerHTML =
      '<span class="api-dot disconnected"></span>' +
      '<span class="api-model">No API connected</span>';
  }
}

function runConflictCheck() {
  const api = getApiStatus();

  if (!api.connected) {
    alert('No API connected. Connect a model in SillyTavern\'s API panel first.');
    return;
  }

  if (state.conflictRunning) return;

  // Confirm token usage
  if (!confirm(api.tokenWarning + '\n\nModel: ' + api.model + '\n\nProceed?')) return;

  state.conflictRunning = true;
  state.conflicts = {};
  renderTable(); // clear old highlights

  const btn = document.getElementById('se-conflict-btn');
  const progress = document.getElementById('se-conflict-progress');
  if (btn) { btn.disabled = true; btn.textContent = 'Checking...'; }
  if (progress) { progress.style.display = 'block'; }

  // In real extension: build prompt from ENTRIES, call ST API
  // Here we simulate with a delay
  const fill = document.getElementById('se-conflict-progress-fill');
  let pct = 0;
  const interval = setInterval(() => {
    pct += 8;
    if (fill) fill.style.width = Math.min(pct, 95) + '%';
  }, 150);

  setTimeout(() => {
    clearInterval(interval);
    if (fill) fill.style.width = '100%';

    // Process response (in real extension: parse JSON from LLM response)
    try {
      processConflictResponse(MOCK_CONFLICT_RESPONSE);
    } catch (err) {
      alert('Model did not return a valid response for conflict analysis. The response may have been empty or filtered.');
      console.error('Conflict parse error:', err);
    }

    state.conflictRunning = false;
    if (btn) { btn.disabled = false; btn.textContent = '\u26A0 Check Conflicts'; }
    setTimeout(() => {
      if (progress) progress.style.display = 'none';
      if (fill) fill.style.width = '0%';
    }, 800);
  }, 2000);
}

function processConflictResponse(results) {
  if (!Array.isArray(results)) throw new Error('Response is not an array');

  state.conflicts = {};
  results.forEach(item => {
    if (!item.entry || !item.text || !item.reason) return;
    if (!state.conflicts[item.entry]) state.conflicts[item.entry] = [];
    state.conflicts[item.entry].push({
      text: item.text,
      reason: item.reason,
      severity: item.severity || 'warning'
    });
  });

  renderTable();

  // Show summary
  const total = results.length;
  const errors = results.filter(r => r.severity === 'error').length;
  const warns = results.filter(r => r.severity === 'warning').length;
  const infos = results.filter(r => r.severity === 'info').length;
  const summary = document.getElementById('se-conflict-summary');
  if (summary) {
    summary.style.display = 'block';
    summary.innerHTML =
      '<span style="color:#f92672;">' + errors + ' errors</span> · ' +
      '<span style="color:#fd971f;">' + warns + ' warnings</span> · ' +
      '<span style="color:#ae81ff;">' + infos + ' info</span> — ' +
      total + ' issues found across ' + Object.keys(state.conflicts).length + ' entries';
  }
}

/** Apply conflict highlight spans to content text */
function applyConflictHighlights(content, conflicts) {
  let html = escHtml(content);
  // Sort by text length descending to avoid partial replacements
  const sorted = [...conflicts].sort((a, b) => b.text.length - a.text.length);
  sorted.forEach(c => {
    const cls = c.severity === 'error' ? 'conflict-mark'
              : c.severity === 'warning' ? 'conflict-mark-warn'
              : 'conflict-mark-info';
    const escaped = escHtml(c.text);
    // Only replace first occurrence
    const idx = html.indexOf(escaped);
    if (idx >= 0) {
      html = html.slice(0, idx) +
        '<span class="' + cls + '" title="' + escHtml(c.reason) + '">' + escaped + '</span>' +
        html.slice(idx + escaped.length);
    }
  });
  return html;
}

function clearConflicts() {
  state.conflicts = {};
  const summary = document.getElementById('se-conflict-summary');
  if (summary) summary.style.display = 'none';
  renderTable();
}

/* ══════════════════════════════════════════════════
   COLOR PICKER
   ══════════════════════════════════════════════════ */
function toggleColorPicker(e, id) {
  e.stopPropagation();
  document.getElementById(id).classList.toggle('open');
}

/* ══════════════════════════════════════════════════
   MINIMAP OVERLAY + CELL/GAP POPOVERS
   ══════════════════════════════════════════════════ */
function toggleMinimap() {
  document.getElementById('minimap-overlay').classList.toggle('open');
  closeAllPopovers();
}

function closeAllPopovers() {
  document.getElementById('cell-popover').style.display = 'none';
  document.getElementById('gap-popover').style.display = 'none';
}

function buildMinimap() {
  const grid = document.getElementById('minimap-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const allNums = Object.keys(ENTRIES).map(Number);
  const maxNum = Math.max(...allNums, ...GAPS);

  for (let i = 1; i <= maxNum; i++) {
    const cell = document.createElement('div');
    cell.className = 'minimap-cell';
    cell.textContent = i;

    if (GAPS.has(i)) {
      cell.className += ' gap-cell';
      cell.textContent = '?';
      cell.addEventListener('click', (e) => showGapPopover(e, i));
    } else if (ENTRIES[i]) {
      if (ENTRIES[i].arcColor) {
        cell.style.background = ENTRIES[i].arcColor;
      } else {
        cell.className += ' unassigned';
      }
      cell.addEventListener('click', (e) => showCellPopover(e, i));
    }

    grid.appendChild(cell);
  }
}

function showCellPopover(e, num) {
  e.stopPropagation();
  closeAllPopovers();

  const entry = ENTRIES[num];
  if (!entry) return;

  const pop = document.getElementById('cell-popover');
  const chips = ['date', 'time', 'location'].map(field => {
    const val = entry[field];
    const filled = val && val.trim() !== '';
    const cls = filled ? 'meta-chip filled' : 'meta-chip missing';
    const icon = filled ? '&#10003;' : '&#10007;';
    const label = field.charAt(0).toUpperCase() + field.slice(1);
    const text = filled ? (label + ': ' + escHtml(val)) : ('Needs ' + label);
    return '<span class="' + cls + '">' + icon + ' ' + text + '</span>';
  }).join('');

  const arcHtml = entry.arc
    ? '<span class="arc-badge cell-popover-arc" style="background:' + entry.arcColor + ';color:' + (entry.arcColor === '#f44747' || entry.arcColor === '#f92672' ? '#fff' : '#272822') + ';">' + escHtml(entry.arc) + '</span>'
    : '<span style="color:#555; font-size:0.75em;">Unassigned</span>';

  let content = entry.content;
  if (content.length > 500) content = content.slice(0, 500) + '...';

  pop.innerHTML =
    '<div class="cell-popover-header">' +
      '<span class="cell-popover-num">#' + num + '</span>' +
      arcHtml +
      '<button class="cell-popover-close" onclick="closeAllPopovers()">&times;</button>' +
    '</div>' +
    '<div class="cell-popover-content">' + escHtml(content) + '</div>' +
    '<div class="cell-popover-tags">' + chips + '</div>';

  const x = Math.min(e.clientX + 8, window.innerWidth - 400);
  const y = Math.min(e.clientY + 8, window.innerHeight - 300);
  pop.style.left = x + 'px';
  pop.style.top = y + 'px';
  pop.style.display = 'block';
}

function showGapPopover(e, num) {
  e.stopPropagation();
  closeAllPopovers();

  const pop = document.getElementById('gap-popover');
  pop.innerHTML =
    '<button class="gap-popover-close" onclick="closeAllPopovers()">&times;</button>' +
    '<div class="gap-popover-title">\u26A0 Missing Entry #' + num + '</div>' +
    '<div class="gap-popover-actions">' +
      '<textarea class="gap-popover-input" id="gap-input-' + num + '" placeholder="Type or paste content for entry #' + num + '..."></textarea>' +
      '<button class="btn btn-primary btn-sm" onclick="addGapEntry(' + num + ')">Add Entry</button>' +
      '<div class="gap-popover-or">\u2014 or \u2014</div>' +
      '<button class="btn btn-sm" onclick="alert(\'File picker opened for #' + num + '\'); closeAllPopovers();">\uD83D\uDCC2 Browse File for #' + num + '</button>' +
    '</div>';

  const x = Math.min(e.clientX + 8, window.innerWidth - 340);
  const y = Math.min(e.clientY + 8, window.innerHeight - 260);
  pop.style.left = x + 'px';
  pop.style.top = y + 'px';
  pop.style.display = 'block';
}

function addGapEntry(num) {
  const textarea = document.getElementById('gap-input-' + num);
  const content = textarea ? textarea.value.trim() : '';
  if (!content) { alert('Please enter content for entry #' + num); return; }

  // Add to data
  ENTRIES[num] = {
    content, arc: null, arcColor: null,
    date: '', time: '', location: '', notes: ''
  };
  GAPS.delete(num);

  setLastAction('Added missing entry #' + num, () => {
    delete ENTRIES[num];
    GAPS.add(num);
    renderAll();
  });

  closeAllPopovers();
  renderAll();
}

/* ══════════════════════════════════════════════════
   LIVE PREVIEW (export tab)
   ══════════════════════════════════════════════════ */
function updateLivePreview() {
  const fmt = document.getElementById('export-fmt');
  const pre = document.getElementById('live-preview');
  if (!fmt || !pre) return;

  // Use first entry as sample
  const firstNum = Object.keys(ENTRIES).map(Number).sort((a, b) => a - b)[0];
  const e = ENTRIES[firstNum];
  if (!e) return;

  const bracket = buildBracket(e);
  const val = fmt.value;

  if (val === 'txt') {
    pre.textContent = firstNum + '. ' + bracket + e.content;
  } else if (val === 'json') {
    const obj = { num: firstNum, content: e.content, date: e.date, time: e.time, location: e.location };
    if (e.arc) obj.arc = e.arc;
    pre.textContent = JSON.stringify(obj, null, 2);
  } else if (val === 'md') {
    pre.textContent = '### Entry ' + firstNum + '\n' +
      (bracket ? '**' + bracket.trim().slice(1, -2) + '**\n' : '') +
      e.content;
  }
}

function buildBracket(entry) {
  const parts = [];
  if (entry.date) parts.push(entry.date);
  if (entry.time) parts.push(entry.time);
  const timeStr = parts.join(', ');
  if (!timeStr && !entry.location) return '';
  if (entry.location) return '[' + timeStr + (timeStr ? ' | ' : '') + entry.location + '] ';
  return '[' + timeStr + '] ';
}

/* ══════════════════════════════════════════════════
   FULL PREVIEW (export tab)
   ══════════════════════════════════════════════════ */
function renderFullPreview() {
  const pre = document.getElementById('se-full-preview');
  if (!pre) return;

  const nums = Object.keys(ENTRIES).map(Number).sort((a, b) => a - b);
  const lines = nums.map(num => {
    const e = ENTRIES[num];
    const bracket = buildBracket(e);
    return '<span class="entry-num">' + num + '.</span> ' +
           (bracket ? '<span class="bracket">' + escHtml(bracket) + '</span>' : '') +
           escHtml(e.content);
  });
  pre.innerHTML = lines.join('\n\n');
}

/* ══════════════════════════════════════════════════
   TAB SWITCHING
   ══════════════════════════════════════════════════ */
function switchTab(idx) {
  document.querySelectorAll('.tab').forEach((t, i) => {
    t.classList.remove('active');
    if (i < idx) t.classList.add('done');
    else t.classList.remove('done');
    if (i === idx) t.classList.add('active');
  });
  document.querySelectorAll('.tab-panel').forEach((p, i) => {
    p.classList.toggle('active', i === idx);
  });
  closeAllPopovers();

  // Refresh relevant tab content
  if (idx === 1) renderTable();
  if (idx === 3) { updateLivePreview(); renderFullPreview(); }
}

/* ══════════════════════════════════════════════════
   RENDER ALL
   ══════════════════════════════════════════════════ */
function renderAll() {
  renderStatsBar();
  renderWarningBanner();
  renderSelectionBar();
  renderTable();
  renderApiStatus();
  buildMinimap();
}

/* ══════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  renderAll();
  updateLivePreview();

  // Toolbar events
  const search = document.getElementById('se-search');
  if (search) search.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    state.currentPage = 1;
    renderTable();
  });

  const sort = document.getElementById('se-sort');
  if (sort) sort.addEventListener('change', (e) => {
    state.sortBy = e.target.value;
    state.currentPage = 1;
    renderTable();
  });

  const filter = document.getElementById('se-filter');
  if (filter) filter.addEventListener('change', (e) => {
    state.filterBy = e.target.value;
    state.currentPage = 1;
    renderTable();
  });

  // Pagination
  document.getElementById('se-page-prev')?.addEventListener('click', () => {
    if (state.currentPage > 1) { state.currentPage--; renderTable(); }
  });
  document.getElementById('se-page-next')?.addEventListener('click', () => {
    state.currentPage++;
    renderTable();
  });

  // Select all checkbox
  document.getElementById('se-select-all')?.addEventListener('change', (e) => {
    const visible = getVisibleEntries().filter(n => !GAPS.has(n));
    if (e.target.checked) visible.forEach(n => state.selected.add(n));
    else visible.forEach(n => state.selected.delete(n));
    renderTable();
    renderSelectionBar();
  });

  // Undo
  document.getElementById('se-undo-btn')?.addEventListener('click', doUndo);

  // Conflict check
  document.getElementById('se-conflict-btn')?.addEventListener('click', runConflictCheck);
  document.getElementById('se-conflict-clear')?.addEventListener('click', clearConflicts);

  // Close popovers on outside click
  document.addEventListener('click', (e) => {
    // Minimap popovers
    if (!e.target.closest('.cell-popover') && !e.target.closest('.gap-popover') && !e.target.closest('.minimap-cell')) {
      closeAllPopovers();
    }
    // Color picker
    if (!e.target.closest('.color-picker-popover') && !e.target.closest('[onclick*="toggleColorPicker"]')) {
      document.querySelectorAll('.color-picker-popover').forEach(p => p.classList.remove('open'));
    }
    // Edit popover — close if clicking outside it and outside editable cells
    if (activeEditPopover && !e.target.closest('.edit-popover') && !e.target.closest('.cell-display')) {
      closeEditPopover();
    }
  });

  // Warning banner dismiss
  document.querySelector('.warning-banner .dismiss')?.addEventListener('click', () => {
    document.getElementById('se-warning-banner').style.display = 'none';
  });

  // Export format change
  document.getElementById('export-fmt')?.addEventListener('change', updateLivePreview);
});
