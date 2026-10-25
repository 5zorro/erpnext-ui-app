/**
 * The lines table's keys, written once for every Doc form page (plan 2026-10-25, step 0a):
 * Excel-like edit / nav mode, Tab / Shift+Tab / arrows between cells, adding a line past the last
 * one, and putting focus back on a cell after a repaint. The Bill and doc-form pages both call
 * this; what differs between them comes in through `deps` and each cell's `wireCell` options.
 *
 * 🔴 Shared modules in plan 10-25 talk about *lines*, not items: the doc-form page runs six forms,
 * and Receive Payment's lines are `references`. `deps.lines` / `deps.lineKey` say what a line is.
 * Today both pages pass `doc.items` / `item_code` (behaviour unchanged in 0a); plan 10-25 step 0
 * records why that is wrong for Receive Payment, to be proven before it is fixed.
 */

import { nextItemFocusAfterEdit } from "./link-picker-policy.js";
import {
  CELL_MODE_EDIT,
  CELL_MODE_NAV,
  itemTableKeyDecision,
  neighborItemCell,
  shouldLeaveItemTableBackward,
} from "./item-table-nav.js";
import { valuesMeaningfullyEqual, dirtyCompareKindForField } from "./dirty-gate.js";

/**
 * @typedef {{
 *   table: () => HTMLElement|null|undefined,
 *   editable: () => boolean,
 *   painting: () => boolean,
 *   calcActiveOn: (inp: HTMLInputElement) => boolean,
 *   lastDoc: () => object|null|undefined,
 *   lines: (doc: object|null|undefined) => object[],
 *   lineKey: (line: object|null|undefined) => string|number|null|undefined,
 *   leaveBackward: () => void,
 *   log?: (event: string, detail: string) => void,
 * }} ItemTableKeysDeps
 *
 * `table`: the lines table's body (`el.items`). `lines` / `lineKey`: the doc's lines and the
 * value that makes a line real (empty = a blank line). `leaveBackward`: Shift+Tab / ← out of the
 * first box of the first line — each page knows what sits before its table. `log`: the page's
 * focus log (`focus-debug.log`).
 */

/**
 * @typedef {{
 *   field: string,
 *   rowIndex: number,
 *   navFields?: readonly string[],
 *   readValue: () => string,
 *   apply: (value: string, opts?: { stay?: boolean, focus?: { rowIndex: number, field: string, mode: string } }) => Promise<void>,
 *   afterEdit: (docAfter: object|null|undefined, cellValue: string) => Promise<void>,
 * }} ItemCellKeys
 *
 * `navFields`: the editable columns in order; left out, the default columns are used.
 * `apply`: write the cell's value (and repaint). `afterEdit`: where focus goes after an edit
 * (next box, next line, a new line, or out of the table).
 */

/**
 * @param {ItemTableKeysDeps} deps
 */
export function createItemTableKeys(deps) {
  /** Excel-like: edit (caret in cell) vs nav (arrows move cells). */
  let itemCellMode = CELL_MODE_EDIT;
  /** Set while a Tab / arrow commits a cell: the cell's `change` and `blur` handlers stand down. */
  let itemTabGuard = false;

  /**
   * Mirror the cell mode onto the DOM so CSS can show which mode you are in.
   * `data-nav-focus` cannot serve here: it is deleted the moment focus lands
   * (it is a one-shot handoff to the focus handler), so nothing survives for a
   * stylesheet to match on.
   * @param {"edit"|"nav"} mode
   */
  function setItemCellMode(mode) {
    itemCellMode = mode === CELL_MODE_NAV ? CELL_MODE_NAV : CELL_MODE_EDIT;
    try {
      const table = deps.table();
      if (table) table.dataset.cellMode = itemCellMode;
    } catch {
      /* mode mirroring is cosmetic; never let it break navigation */
    }
  }

  /**
   * @param {number} rowIndex
   * @param {string} field
   * @param {{ mode?: string, selectAll?: boolean }} [opts]
   */
  function focusItemCell(rowIndex, field, opts = {}) {
    const mode = opts.mode === CELL_MODE_NAV ? CELL_MODE_NAV : CELL_MODE_EDIT;
    setItemCellMode(mode);
    const wantSelect =
      opts.selectAll === true || (opts.selectAll !== false && mode === CELL_MODE_NAV);
    const tryFocus = () => {
      const table = deps.table();
      const inp = table
        ? table.querySelector(`input[data-row="${rowIndex}"][data-field="${field}"]`)
        : null;
      if (!inp) return false;
      try {
        if (mode === CELL_MODE_NAV) inp.dataset.navFocus = "1";
        inp.focus({ preventScroll: false });
        if (wantSelect && typeof inp.select === "function") inp.select();
      } catch {
        try {
          inp.focus();
        } catch {
          /* ignore */
        }
      }
      return true;
    };
    if (tryFocus()) return;
    requestAnimationFrame(() => {
      tryFocus();
      setTimeout(tryFocus, 50);
    });
  }

  /** @param {HTMLInputElement} inp */
  function isItemLinkDropdownOpen(inp) {
    const wrap = inp && inp.closest ? inp.closest(".link-wrap") : null;
    if (!wrap) return false;
    const dd = wrap.querySelector(".link-dd");
    return !!(dd && !dd.hidden);
  }

  /**
   * The line's key value at `rowIndex`, trimmed; "" when the line is missing or blank.
   * @param {object|null|undefined} doc
   * @param {number} rowIndex
   */
  function lineKeyAt(doc, rowIndex) {
    const line = deps.lines(doc)[rowIndex];
    const key = line ? deps.lineKey(line) : null;
    return key != null ? String(key).trim() : "";
  }

  /** @param {object|null|undefined} doc */
  function lineCount(doc) {
    return deps.lines(doc).length;
  }

  /**
   * T-2 (DF-03): the line indexes in the order they are painted. In a sorted table that is not
   * ERPNext's order, and the clerk moves by what they see (5zorro: "it needs to match what the
   * user expects"). Lines not painted (yet) follow, in ERPNext's order.
   * @param {number} count
   * @returns {number[]}
   */
  function screenOrder(count) {
    /** @type {number[]} */
    const order = [];
    const table = deps.table();
    if (table && typeof table.querySelectorAll === "function") {
      for (const inp of table.querySelectorAll("input[data-row]")) {
        const r = Number(inp.dataset.row);
        if (Number.isInteger(r) && r >= 0 && r < count && !order.includes(r)) order.push(r);
      }
    }
    for (let r = 0; r < count; r++) if (!order.includes(r)) order.push(r);
    return order;
  }

  /**
   * The cell an arrow / Shift+Tab moves to, stepping through the lines on screen.
   * @param {string} field
   * @param {number} ri
   * @param {"up"|"down"|"left"|"right"} direction
   * @param {readonly string[]|undefined} navFields
   */
  function neighborOnScreen(field, ri, direction, navFields) {
    const order = screenOrder(lineCount(deps.lastDoc()));
    const step = neighborItemCell(field, order.indexOf(ri), order.length, direction, navFields);
    return step && { rowIndex: order[step.rowIndex], field: step.field };
  }

  /**
   * Where focus goes after a cell is done (Tab, or a write that moves on): the next box, the next
   * line **on screen**, a new line past the last line on screen, or out of the table — deleting
   * a blank line that is last on screen instead of focusing it. `nextItemFocusAfterEdit` works in
   * screen positions here; its row comes back as a line index.
   * @param {string} field
   * @param {number} ri
   * @param {object|null|undefined} doc
   * @param {{ cellValue?: string|null, fields?: readonly string[], rowItemCode?: string|number|null }} [opts]
   *   `rowItemCode`: the line's key as the page knows it; left out, read from `doc`
   */
  function nextAfterEdit(field, ri, doc, opts = {}) {
    const order = screenOrder(lineCount(doc));
    const pos = order.indexOf(ri);
    const p = pos < 0 ? ri : pos;
    const at = (q) => (pos < 0 ? q : order[q]);
    const dest = nextItemFocusAfterEdit(field, p, order.length, {
      cellValue: opts.cellValue,
      fields: opts.fields,
      rowItemCode: opts.rowItemCode ?? lineKeyAt(doc, ri),
      nextRowItemCode: p + 1 < order.length ? lineKeyAt(doc, at(p + 1)) : "",
    });
    return { ...dest, rowIndex: dest.rowIndex < order.length ? at(dest.rowIndex) : dest.rowIndex };
  }

  /**
   * @param {string} field
   * @param {number} ri
   * @param {string} next
   */
  function cellIsDirty(field, ri, next) {
    const line = deps.lines(deps.lastDoc())[ri];
    const prev = (line && line[field]) ?? "";
    const kind = dirtyCompareKindForField(field);
    return !valuesMeaningfullyEqual(prev, next, { kind });
  }

  /**
   * The cell's keydown: mode switches, moves, and Tab past the last box.
   * @param {HTMLInputElement} inp
   * @param {ItemCellKeys} cell
   */
  function wireCell(inp, cell) {
    const { field, rowIndex: ri, navFields, readValue, apply, afterEdit } = cell;
    inp.addEventListener("keydown", (ev) => {
      if (!deps.editable() || deps.painting()) return;
      const calcActive = deps.calcActiveOn(inp);
      const decision = itemTableKeyDecision({
        mode: itemCellMode,
        key: ev.key,
        shiftKey: !!ev.shiftKey,
        ctrlKey: !!ev.ctrlKey,
        metaKey: !!ev.metaKey,
        altKey: !!ev.altKey,
        selectionStart: inp.selectionStart,
        selectionEnd: inp.selectionEnd,
        valueLength: String(inp.value ?? "").length,
        linkDropdownOpen: isItemLinkDropdownOpen(inp),
        calcActive,
        verticalArrowsAlwaysNav: field === "qty",
      });

      if (decision.action === "leave_edit") {
        if (decision.preventDefault) ev.preventDefault();
        setItemCellMode(CELL_MODE_NAV);
        try {
          if (typeof inp.select === "function") inp.select();
        } catch {
          /* ignore */
        }
        return;
      }

      if (decision.action === "enter_edit") {
        setItemCellMode(CELL_MODE_EDIT);
        if (ev.key === "F2") {
          ev.preventDefault();
          try {
            const len = String(inp.value ?? "").length;
            inp.setSelectionRange(len, len);
          } catch {
            /* ignore */
          }
        }
        return;
      }

      // T-3 (DF-03): a Tab or move while an earlier one is still writing the cell or adding a line
      // is dropped, not queued. Adding a line takes a while on a slow server (museum OI-187), and a
      // second Tab in that wait ran from the old box and left the table. The clerk pressed it
      // because nothing showed yet; replaying it would skip the new line's Item box (plan 10-25).
      const isMove =
        decision.action === "move" ||
        decision.action === "leave_edit_move" ||
        decision.action === "tab" ||
        (decision.action === "passthrough" && ev.key === "Tab" && !ev.shiftKey && !calcActive);
      if (itemTabGuard && isMove) {
        if (decision.action !== "passthrough") ev.preventDefault();
        if (deps.log) deps.log("item-key-dropped", `${ev.shiftKey ? "Shift+" : ""}${ev.key} on line ${ri + 1} ${field}: the last move is still working`);
        return;
      }

      if (decision.action === "passthrough") {
        if (ev.key !== "Tab" || ev.shiftKey) return;
      } else if (decision.preventDefault) {
        ev.preventDefault();
      }

      if (
        decision.action === "move" ||
        decision.action === "leave_edit_move" ||
        (decision.action === "tab" && decision.direction === "left")
      ) {
        setItemCellMode(CELL_MODE_NAV);
        itemTabGuard = true;
        void (async () => {
          try {
            const next = readValue();
            const dest = neighborOnScreen(field, ri, decision.direction || "left", navFields);
            const dirty = cellIsDirty(field, ri, next);
            if (!dest) {
              if (dirty) await apply(next, { stay: true });
              if (shouldLeaveItemTableBackward(dest, decision.direction)) {
                deps.leaveBackward();
              }
              return;
            }
            if (dirty) {
              await apply(next, {
                focus: {
                  rowIndex: dest.rowIndex,
                  field: dest.field,
                  mode: CELL_MODE_NAV,
                },
              });
            } else {
              focusItemCell(dest.rowIndex, dest.field, { mode: CELL_MODE_NAV });
            }
          } finally {
            itemTabGuard = false;
          }
        })();
        return;
      }

      if (ev.key !== "Tab" || ev.shiftKey || calcActive) return;
      ev.preventDefault();
      setItemCellMode(CELL_MODE_NAV);
      itemTabGuard = true;
      void (async () => {
        try {
          const next = readValue();
          const doc = deps.lastDoc();
          const dest = nextAfterEdit(field, ri, doc, { cellValue: next, fields: navFields });
          if (dest.deleteRow && dest.leaveTable) {
            await afterEdit(doc, next);
            return;
          }
          if (cellIsDirty(field, ri, next)) {
            await apply(next);
          } else if (dest.field) {
            focusItemCell(dest.rowIndex, dest.field, { mode: CELL_MODE_NAV });
          } else if (dest.addRow) {
            await afterEdit(doc, next);
          }
        } finally {
          itemTabGuard = false;
        }
      })();
    });
  }

  return {
    /** @returns {"edit"|"nav"} */
    mode: () => itemCellMode,
    setMode: setItemCellMode,
    /** A Tab / arrow is committing a cell right now. */
    busy: () => itemTabGuard,
    focusCell: focusItemCell,
    lineKeyAt,
    nextAfterEdit,
    wireCell,
  };
}
