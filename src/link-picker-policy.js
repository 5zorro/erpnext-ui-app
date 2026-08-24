/**
 * Link picker keyboard / highlight policy (Bill Vendor/Terms/Item/Project).
 * Pure — no DOM. bill.html / doc-form-page must call these so Tab/Enter behavior stays tested.
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
 * Focus target after editing a Bill/PO/IR item cell (includes wrap to next row / add row /
 * leave+delete empty Item row).
 * @param {string} field
 * @param {number} rowIndex
 * @param {number} rowCount
 * @param {{ cellValue?: string|number|null, fields?: readonly string[] }} [opts] pass current cell value (Item empty → exit)
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
  // Empty Item = invalid row identity — Tab leaves the table and drops the row.
  if (field === "item_code") {
    const raw = opts.cellValue != null ? String(opts.cellValue).trim() : null;
    if (raw === "") {
      return {
        rowIndex: ri,
        field: null,
        addRow: false,
        deleteRow: true,
        leaveTable: true,
      };
    }
  }
  const nextField = nextItemFieldAfterEdit(field, opts.fields);
  if (nextField) {
    return { rowIndex: ri, field: nextField, addRow: false, deleteRow: false, leaveTable: false };
  }
  if (n > 0 && ri < n - 1) {
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
