/**
 * Link picker keyboard / highlight policy (Bill Vendor/Terms/Item/Project).
 * Pure — no DOM. bill-form-page / doc-form-page must call these so Tab/Enter behavior stays tested.
 */

/** Default Bill (and Item Receipt) editable cell order for Tab / Excel nav. */
export const DEFAULT_ITEM_NAV_FIELDS = Object.freeze([
  "item_code",
  "description",
  "qty",
  "rate",
  "project",
]);

/**
 * Editable item-column fields in paint order (skips display-only / read-only).
 * @param {Array<{ field?: string|null, displayOnly?: boolean, readOnly?: boolean, scratch?: boolean }>|null|undefined} cols
 * @returns {string[]}
 */
export function itemNavFieldsFromCols(cols) {
  if (!Array.isArray(cols)) return [...DEFAULT_ITEM_NAV_FIELDS];
  /** @type {string[]} */
  const out = [];
  for (const c of cols) {
    if (!c || typeof c !== "object") continue;
    if (!c.field || c.displayOnly || c.readOnly || c.scratch) continue;
    out.push(String(c.field));
  }
  return out.length ? out : [...DEFAULT_ITEM_NAV_FIELDS];
}

/**
 * Keep the active link-dropdown option in view while ↑/↓ (shared Bill / PO / IR).
 * @param {Element|null|undefined} el
 * @returns {boolean}
 */
export function scrollLinkOptionIntoView(el) {
  if (!el || typeof /** @type {{ scrollIntoView?: Function }} */ (el).scrollIntoView !== "function") {
    return false;
  }
  try {
    /** @type {{ scrollIntoView: Function }} */ (el).scrollIntoView({ block: "nearest" });
    return true;
  } catch {
    return false;
  }
}

/**
 * After search results render: always highlight first row so Tab/Enter work without ↑↓.
 * @param {number} optionCount
 * @returns {number} highlight index (-1 if none)
 */
export function initialLinkHighlightIndex(optionCount) {
  const n = Number(optionCount) || 0;
  return n > 0 ? 0 : -1;
}

/**
 * @param {number} hi current highlight (-1 = none)
 * @param {number} optionCount
 * @param {"up"|"down"} dir
 * @returns {number}
 */
export function nextLinkHighlightIndex(hi, optionCount, dir) {
  const n = Number(optionCount) || 0;
  if (n <= 0) return -1;
  if (dir === "down") {
    if (hi < 0) return 0;
    return Math.min(hi + 1, n - 1);
  }
  if (dir === "up") {
    if (hi <= 0) return 0;
    return hi - 1;
  }
  return hi;
}

/**
 * Resolve which option index to commit on Tab/Enter.
 * @param {number} hi
 * @param {number} optionCount
 * @returns {number} index or -1
 */
export function resolveLinkPickIndex(hi, optionCount) {
  const n = Number(optionCount) || 0;
  if (n <= 0) return -1;
  if (hi >= 0 && hi < n) return hi;
  return 0;
}

/**
 * @param {string} key
 * @param {{ dropdownOpen: boolean, optionCount: number }} state
 * @returns {"pick"|"close"|"search"|"move_down"|"move_up"|"none"}
 */
export function linkPickerKeyAction(key, state) {
  const open = !!(state && state.dropdownOpen);
  const n = Number(state && state.optionCount) || 0;
  if (key === "Escape") return open ? "close" : "none";
  if (key === "ArrowDown") {
    if (!open || n === 0) return "search";
    return "move_down";
  }
  if (key === "ArrowUp") {
    if (!open || n === 0) return "none";
    return "move_up";
  }
  if (key === "Tab" || key === "Enter") {
    if (!open || n === 0) return "none";
    return "pick";
  }
  return "none";
}

/**
 * Tab / Enter on an open dropdown: pick from the list on screen, or hold the key until the list
 * for the typed text is in (review 10-19 R5b-1).
 *
 * 🔴 The list on screen can be from an earlier search: it stays during the typing pause and while
 * the next search runs. Picking its highlighted option once committed `ABC-1` for a typed `ABC-12`.
 * Rules, as 5zorro read them back (2026-10-21):
 * - the list was fetched for exactly the text in the box → pick its highlighted option, as before;
 * - else the typed text names one of its options (case aside) → pick that one at once — his fast
 *   Tab on a number he knows has one match must not wait for the network;
 * - else hold the key and search now. The answer replays the key, so a held Tab does what a slow
 *   Tab would have done (pick the first match, choice "a"). Typing or leaving the box cancels it.
 * Never pick from a list fetched for other text.
 *
 * @param {{ typed: string, listFor: string|null, values: Array<string|null>, hi: number }} state
 *   `listFor` = the text in the box when the list's search started (null: no list yet);
 *   `values` = the options' values in order, null for a "Create…" row
 * @returns {{ kind: "pick", index: number } | { kind: "hold" } | { kind: "none" }}
 */
export function linkPickerCommitPlan(state) {
  const typed = String((state && state.typed) ?? "");
  const values = Array.isArray(state && state.values) ? state.values : [];
  if (state && state.listFor != null && String(state.listFor) === typed) {
    const index = resolveLinkPickIndex(state.hi, values.length);
    return index >= 0 ? { kind: "pick", index } : { kind: "none" };
  }
  const want = typed.trim().toLowerCase();
  if (want) {
    const index = values.findIndex((v) => v != null && String(v).trim().toLowerCase() === want);
    if (index >= 0) return { kind: "pick", index };
  }
  return { kind: "hold" };
}

/**
 * What to search for when the clerk **opens** the dropdown, as opposed to typing in it.
 *
 * 🔴 Opening a picker on a field that already holds a value used to search for that value, so the
 * only option offered was the one already selected — the field could never be changed from its own
 * dropdown. 5zorro found it on a Bill's payment terms (2026-09-22): *"the dropdown picker only
 * found the current terms, there were no other terms available"*, with eight other templates
 * sitting in the ERP. It applies to every Link field that already has a value, which on a submitted
 * or amended document is most of them.
 *
 * The chevron means "show me the choices", so a committed value is not a filter: it searches for
 * everything. Text the clerk has typed since the last commit *is* a filter and is kept, so typing
 * `NET` and then clicking the chevron still narrows to `NET`.
 *
 * @param {string|null|undefined} value what is in the input now
 * @param {string|null|undefined} committed the value last picked/committed, if any
 * @returns {string} the query to search with
 */
export function linkPickerOpenQuery(value, committed) {
  const v = value == null ? "" : String(value);
  const c = committed == null ? "" : String(committed);
  return v === c ? "" : v;
}

/**
 * After a line-cell commit (Link pick or qty/rate/etc.), where should focus go?
 * Paint rebuilds the row; without this, focus jumps to the table start.
 * @param {string} field
 * @param {readonly string[]} [fields]
 * @returns {string|null}
 */
export function nextItemFieldAfterEdit(field, fields) {
  const order = fields && fields.length ? fields : DEFAULT_ITEM_NAV_FIELDS;
  const i = order.indexOf(field);
  if (i < 0 || i >= order.length - 1) return null;
  return order[i + 1];
}

/**
 * Resolved Item code for Tab/focus policy (current cell when editing item_code).
 * @param {string} field
 * @param {{ cellValue?: string|number|null, rowItemCode?: string|number|null }} opts
 * @returns {string|null} trimmed code, "" when known-empty, null when unknown
 */
export function effectiveRowItemCode(field, opts = {}) {
  if (field === "item_code" && opts.cellValue != null) {
    return String(opts.cellValue).trim();
  }
  if (opts.rowItemCode != null) {
    return String(opts.rowItemCode).trim();
  }
  return null;
}

/**
 * Focus target after editing a Bill/PO/IR item cell (includes wrap to next row / add row /
 * leave+delete empty Item row).
 * @param {string} field
 * @param {number} rowIndex
 * @param {number} rowCount
 * @param {{ cellValue?: string|number|null, rowItemCode?: string|number|null, nextRowItemCode?: string|number|null, fields?: readonly string[] }} [opts] pass current cell value (Item empty → exit)
 * @returns {{
 *   rowIndex: number,
 *   field: string|null,
 *   addRow: boolean,
 *   deleteRow: boolean,
 *   leaveTable: boolean,
 * }}
 */
export function nextItemFocusAfterEdit(field, rowIndex, rowCount, opts = {}) {
  const ri = Number(rowIndex) || 0;
  const n = Math.max(0, Number(rowCount) || 0);
  const itemCode = effectiveRowItemCode(field, opts);
  // Empty Item = invalid row — Tab from any cell on that row exits (not only item_code).
  if (itemCode === "") {
    return {
      rowIndex: ri,
      field: null,
      addRow: false,
      deleteRow: true,
      leaveTable: true,
    };
  }
  const nextField = nextItemFieldAfterEdit(field, opts.fields);
  if (nextField) {
    return { rowIndex: ri, field: nextField, addRow: false, deleteRow: false, leaveTable: false };
  }
  if (n > 0 && ri < n - 1) {
    const nextRowCode =
      opts.nextRowItemCode != null ? String(opts.nextRowItemCode).trim() : null;
    // Trailing blank line — skip focusing it; delete and leave the grid in one Tab.
    if (nextRowCode === "" && ri + 1 === n - 1) {
      return {
        rowIndex: ri + 1,
        field: null,
        addRow: false,
        deleteRow: true,
        leaveTable: true,
      };
    }
    return {
      rowIndex: ri + 1,
      field: "item_code",
      addRow: false,
      deleteRow: false,
      leaveTable: false,
    };
  }
  return { rowIndex: ri, field: null, addRow: true, deleteRow: false, leaveTable: false };
}

/**
 * @deprecated use nextItemFieldAfterEdit — kept for callers/tests
 * @param {string} field
 * @param {readonly string[]} [fields]
 * @returns {string|null}
 */
export function nextFieldAfterLinkPick(field, fields) {
  return nextItemFieldAfterEdit(field, fields);
}
