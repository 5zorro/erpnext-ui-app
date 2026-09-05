/**
 * Item-table keyboard nav — Excel-like edit vs navigate (Bill / Doc line grids).
 *
 * edit: arrows move the caret inside the cell.
 * nav:  arrows move between cells; typing enters edit (cell usually select-all).
 *
 * Leave edit → nav when: Shift+Tab, ArrowLeft at start, ArrowRight at end,
 * ArrowUp at start, ArrowDown at end (covers “Up twice” after caret hits start).
 */

import { DEFAULT_ITEM_NAV_FIELDS } from "./link-picker-policy.js";

export const CELL_MODE_EDIT = "edit";
export const CELL_MODE_NAV = "nav";

/** Editable columns in Tab / arrow order (SSoT with link-picker-policy). */
export const ITEM_TABLE_NAV_FIELDS = DEFAULT_ITEM_NAV_FIELDS;

/**
 * @param {string} key
 * @param {{ ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean }} [mods]
 */
export function isPrintableInputKey(key, mods = {}) {
  if (mods.ctrlKey || mods.metaKey || mods.altKey) return false;
  if (typeof key !== "string" || key.length !== 1) return false;
  // Exclude space-only? Space is a printable edit char — allow.
  return true;
}

/**
 * @param {number|null|undefined} selectionStart
 * @param {number|null|undefined} selectionEnd
 * @param {number|null|undefined} valueLength
 */
export function caretAtCellStart(selectionStart, selectionEnd, valueLength) {
  const start = Number(selectionStart);
  if (!Number.isFinite(start)) return true;
  return start <= 0;
}

/**
 * @param {number|null|undefined} selectionStart
 * @param {number|null|undefined} selectionEnd
 * @param {number|null|undefined} valueLength
 */
export function caretAtCellEnd(selectionStart, selectionEnd, valueLength) {
  const end = Number(selectionEnd);
  const len = Number(valueLength);
  if (!Number.isFinite(len)) return true;
  if (!Number.isFinite(end)) return true;
  return end >= len;
}

/**
 * @param {string} field
 * @param {number} rowIndex
 * @param {number} rowCount
 * @param {"up"|"down"|"left"|"right"} direction
 * @param {readonly string[]} [fields]
 * @returns {{ rowIndex: number, field: string }|null}
 */
export function neighborItemCell(field, rowIndex, rowCount, direction, fields = ITEM_TABLE_NAV_FIELDS) {
  const cols = fields && fields.length ? fields : ITEM_TABLE_NAV_FIELDS;
  const fi = cols.indexOf(field);
  if (fi < 0) return null;
  const ri = Number(rowIndex) || 0;
  const n = Math.max(0, Number(rowCount) || 0);
  if (direction === "up") {
    if (ri <= 0) return null;
    return { rowIndex: ri - 1, field };
  }
  if (direction === "down") {
    if (n <= 0 || ri >= n - 1) return null;
    return { rowIndex: ri + 1, field };
  }
  if (direction === "left") {
    if (fi > 0) return { rowIndex: ri, field: cols[fi - 1] };
    if (ri > 0) return { rowIndex: ri - 1, field: cols[cols.length - 1] };
    return null;
  }
  if (direction === "right") {
    if (fi < cols.length - 1) return { rowIndex: ri, field: cols[fi + 1] };
    if (n > 0 && ri < n - 1) return { rowIndex: ri + 1, field: cols[0] };
    return null;
  }
  return null;
}

/**
 * Shift+Tab / ← / ↑ from the origin cell has no neighbor — leave the grid
 * (Bill / PO / IR shared). Forward Tab at the end uses addRow instead.
 * @param {{ rowIndex: number, field: string }|null|undefined} dest
 * @param {"up"|"down"|"left"|"right"|undefined} direction
 * @returns {boolean}
 */
export function shouldLeaveItemTableBackward(dest, direction) {
  if (dest) return false;
  return direction === "left" || direction === "up";
}

/**
 * @typedef {{
 *   action:
 *     | "passthrough"
 *     | "move"
 *     | "leave_edit_move"
 *     | "leave_edit"
 *     | "enter_edit"
 *     | "tab",
 *   mode: "edit"|"nav",
 *   direction?: "up"|"down"|"left"|"right",
 *   preventDefault?: boolean,
 *   selectAll?: boolean,
 * }} ItemTableKeyDecision
 */

/**
 * @param {{
 *   mode: "edit"|"nav",
 *   key: string,
 *   shiftKey?: boolean,
 *   ctrlKey?: boolean,
 *   metaKey?: boolean,
 *   altKey?: boolean,
 *   selectionStart?: number|null,
 *   selectionEnd?: number|null,
 *   valueLength?: number|null,
 *   linkDropdownOpen?: boolean,
 *   calcActive?: boolean,
 *   verticalArrowsAlwaysNav?: boolean,
 * }} state
 * @returns {ItemTableKeyDecision}
 */
export function itemTableKeyDecision(state) {
  const mode = state.mode === CELL_MODE_NAV ? CELL_MODE_NAV : CELL_MODE_EDIT;
  const key = state.key || "";

  if (state.calcActive) {
    return { action: "passthrough", mode };
  }
  // Link picker owns arrows / Enter while open.
  if (state.linkDropdownOpen) {
    return { action: "passthrough", mode };
  }
  if (state.ctrlKey || state.metaKey || state.altKey) {
    return { action: "passthrough", mode };
  }

  if (key === "Tab") {
    return {
      action: "tab",
      mode: CELL_MODE_NAV,
      direction: state.shiftKey ? "left" : "right",
      preventDefault: true,
      selectAll: true,
    };
  }

  // Qty: no native spinner; ↑/↓ are navigation only (type exact qty on the 10-key).
  if (state.verticalArrowsAlwaysNav && (key === "ArrowUp" || key === "ArrowDown")) {
    return {
      action: mode === CELL_MODE_EDIT ? "leave_edit_move" : "move",
      mode: CELL_MODE_NAV,
      direction: key === "ArrowUp" ? "up" : "down",
      preventDefault: true,
      selectAll: true,
    };
  }

  if (mode === CELL_MODE_NAV) {
    if (key === "ArrowUp") {
      return { action: "move", mode: CELL_MODE_NAV, direction: "up", preventDefault: true, selectAll: true };
    }
    if (key === "ArrowDown") {
      return { action: "move", mode: CELL_MODE_NAV, direction: "down", preventDefault: true, selectAll: true };
    }
    if (key === "ArrowLeft") {
      return { action: "move", mode: CELL_MODE_NAV, direction: "left", preventDefault: true, selectAll: true };
    }
    if (key === "ArrowRight") {
      return { action: "move", mode: CELL_MODE_NAV, direction: "right", preventDefault: true, selectAll: true };
    }
    if (key === "F2") {
      return { action: "enter_edit", mode: CELL_MODE_EDIT, preventDefault: true };
    }
    if (key === "Enter") {
      // Excel-ish: Enter in nav moves down; stay in nav.
      return { action: "move", mode: CELL_MODE_NAV, direction: "down", preventDefault: true, selectAll: true };
    }
    if (isPrintableInputKey(key, state)) {
      // Caller should have select-all in nav so this key replaces; stay in edit after.
      return { action: "enter_edit", mode: CELL_MODE_EDIT, preventDefault: false };
    }
    return { action: "passthrough", mode: CELL_MODE_NAV };
  }

  // —— edit mode ——
  if (key === "Escape") {
    return {
      action: "leave_edit",
      mode: CELL_MODE_NAV,
      preventDefault: true,
      selectAll: true,
    };
  }

  const atStart = caretAtCellStart(state.selectionStart, state.selectionEnd, state.valueLength);
  const atEnd = caretAtCellEnd(state.selectionStart, state.selectionEnd, state.valueLength);

  if (key === "ArrowLeft" && atStart) {
    return {
      action: "leave_edit_move",
      mode: CELL_MODE_NAV,
      direction: "left",
      preventDefault: true,
      selectAll: true,
    };
  }
  if (key === "ArrowRight" && atEnd) {
    return {
      action: "leave_edit_move",
      mode: CELL_MODE_NAV,
      direction: "right",
      preventDefault: true,
      selectAll: true,
    };
  }
  if (key === "ArrowUp" && atStart) {
    return {
      action: "leave_edit_move",
      mode: CELL_MODE_NAV,
      direction: "up",
      preventDefault: true,
      selectAll: true,
    };
  }
  if (key === "ArrowDown" && atEnd) {
    return {
      action: "leave_edit_move",
      mode: CELL_MODE_NAV,
      direction: "down",
      preventDefault: true,
      selectAll: true,
    };
  }

  return { action: "passthrough", mode: CELL_MODE_EDIT };
}
