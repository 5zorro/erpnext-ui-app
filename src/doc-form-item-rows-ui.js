/**
 * The lines table's rows, written once for every Doc form page (plan 2026-10-25, R6a-1 step 3 with
 * R6a-2): each line's cells (Line, Amount and its back-in button, Rate / money, a checkbox, a date,
 * Qty, text), and every cell's wiring — the resting text, reading the typed value, the write to
 * ERPNext and the focus after it (Tab past the last box adds a line; Tab out of an empty Item
 * removes it), the link pick lists, the tape on Qty / Rate, the date filter, and the × and Amount
 * buttons.
 *
 * The Bill and doc-form pages both call this; what differs comes in through `deps`: the page's own
 * cells come first (`cellHtml`: the Bill's Rec'd, Assign and order peeks; doc-form's sources),
 * then the shared ones. A page wires its own buttons after `paint` returns.
 */

import { formatGroupedNumber, formatUsdAmountHtml, parseMoney } from "./money.js";
import { CELL_MODE_EDIT, CELL_MODE_NAV } from "./item-table-nav.js";
import { isEmptyItemCode, shouldBlockDeleteLastItemRow } from "./bill-item-guard.js";
import { valuesMeaningfullyEqual, dirtyCompareKindForField, normalizeEditableText } from "./dirty-gate.js";
import { filterDateInputValue, parseDocDate, formatDocDateDisplay } from "./doc-date.js";
import { shouldForceCapsOnElement, applyDocCapsValue } from "./doc-caps.js";
import { wireDateField } from "./doc-form-date-field-ui.js";

function escapeHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @typedef {{ label?: string, field?: string|null, displayOnly?: boolean, sortKey?: string,
 *   type?: string, money?: boolean }} LineCol
 *
 * @typedef {{ ok?: boolean, doc?: any, scratch?: any, reason?: string, blockedLastRow?: boolean,
 *   clearedLastRow?: boolean }} LineWriteResult
 *
 * @typedef {{
 *   table: () => HTMLElement | null | undefined,
 *   api: () => { setItem: Function, addItem: Function } | null | undefined,
 *   lastDoc: () => any,
 *   painting: () => boolean,
 *   editable: () => boolean,
 *   lines: (doc: any) => any[],
 *   keyField: string,
 *   itemKeys: ReturnType<typeof import("./item-table-keys-ui.js").createItemTableKeys>,
 *   calcActiveOn: (inp: HTMLElement) => boolean,
 *   testIdPrefix: string,
 *   rateLabel: string,
 *   lineNoTitle?: () => string,
 *   cellsOf: (model: any) => any[],
 *   cellHtml?: (col: LineCol, val: any, model: any, canEdit: boolean, doc: any) => string | null,
 *   rowAttrs?: (model: any) => string,
 *   canDeleteLines: () => boolean,
 *   deleteSkipsTab: boolean,
 *   afterRows: (doc: any) => void,
 *   navFields: () => readonly string[],
 *   isMoneyField: (field: string) => boolean,
 *   capsOn?: () => boolean,
 *   linkDoctype: (field: string) => string | null | undefined,
 *   mountLinkPicker: (inp: HTMLInputElement, doctype: string, apply: Function) => void,
 *   attachCalc: (inp: HTMLInputElement, opts: { kind: string, onCommit: (value: string) => Promise<void> }) => void,
 *   beforeCalcCommit?: (field: string, ri: number, value: string) => Promise<boolean>,
 *   afterRefused?: (field: string, ri: number, value: any, reason: string) => Promise<boolean>,
 *   deleteLine: (ri: number) => Promise<LineWriteResult>,
 *   repaint: (res: LineWriteResult) => void,
 *   repaintCleared?: (res: LineWriteResult, ri: number) => void,
 *   lastRowToast: () => string,
 *   showToast: (text: string) => void,
 *   setStatus: (text: string, cls?: string) => void,
 *   noteUserEdit: () => void,
 *   setItemCellMode: (mode: "edit"|"nav") => void,
 *   focusItemCell: (ri: number, field: string, opts?: { mode?: string }) => void,
 *   focusAfterLeaving: () => void,
 *   userMoves: { mark: () => any, movedSince: (mark: any) => boolean },
 *   logFocus: (event: string, detail?: string) => void,
 *   refresh: () => Promise<void>,
 *   cleanupEmptyLine: (ri: number, code: string) => Promise<void>,
 *   beginAmountBackIn: (btn: HTMLElement, ri: number) => void,
 * }} ItemRowsDeps
 *
 * `keyField`: the field that names a line ("item_code"); a new line is focused there, and leaving
 * it empty removes the line. `testIdPrefix`: "bill" or "doc". `rateLabel`: what the Amount
 * button's title calls the rate ("Cost" on the Bill). `deleteSkipsTab`: × is out of the Tab order
 * (doc-form; the Bill's × is not — kept as found). `repaintCleared`: the repaint after × cleared
 * the only line (the Bill also drops that line's assignment); default `repaint`.
 * `beforeCalcCommit` / `afterRefused`: a page's chance to take a tape commit or a refused write
 * itself (the Bill splits a Qty over the PO's), returning true when it did.
 */

/** @param {ItemRowsDeps} deps */
export function createItemRows(deps) {
  /** The write in flight from a cell, so Save can wait for it. */
  let inFlight = null;
  const p = deps.testIdPrefix;

  /** The cells every form shares; null for a column the page's `cellHtml` already painted. */
  function sharedCellHtml(col, val, ri, canEdit) {
    if (col.displayOnly || col.field == null) {
      const isLine = col.sortKey === "lineNo" || col.field === "__line_no";
      const isAmount = /^amount$/i.test(col.label || "");
      const html = isAmount || col.money || /rec'd|received/i.test(col.label || "")
        ? formatUsdAmountHtml(val)
        : "";
      if (isLine) {
        const title = deps.lineNoTitle ? ` title="${escapeHtml(deps.lineNoTitle())}"` : "";
        return `<td class="num line-meta"><span class="ro"${title}>${escapeHtml(val) || "—"}</span></td>`;
      }
      if (col.type === "date") {
        return `<td><span class="ro">${escapeHtml(formatDocDateDisplay(val) || val || "")}</span></td>`;
      }
      if (isAmount && canEdit) {
        return `<td class="num"><button type="button" class="amount-back-in money-amt" data-back-in="${ri}" title="Back into unit cost from this amount (Amount ÷ Qty → ${escapeHtml(deps.rateLabel)})" data-testid="${p}-amt-${ri}">${html || escapeHtml(val) || "—"}</button></td>`;
      }
      return `<td class="num"><span class="ro money-amt" data-testid="${p}-amt-${ri}">${html || escapeHtml(val)}</span></td>`;
    }
    if (col.field === "rate" || col.money) {
      const shown = val === "" || val == null ? "" : formatGroupedNumber(val);
      if (!canEdit) {
        return `<td class="num"><span class="ro money-cost">${escapeHtml(shown)}</span></td>`;
      }
      return `<td class="num"><input type="text" inputmode="decimal" class="money-cost" data-row="${ri}" data-field="${col.field}" value="${escapeHtml(shown)}" data-testid="${p}-cell-${ri}-${col.field}" /></td>`;
    }
    if (col.type === "checkbox") {
      const checked = val === 1 || val === true || val === "1";
      if (!canEdit) {
        return `<td class="num"><span class="ro">${checked ? "Yes" : "—"}</span></td>`;
      }
      return `<td class="num"><input type="checkbox" data-row="${ri}" data-field="${col.field}" data-check="1" ${checked ? "checked" : ""} data-testid="${p}-cell-${ri}-${col.field}" title="Vendor delivers direct to customer" /></td>`;
    }
    if (col.type === "date" || col.field === "schedule_date") {
      const shown = formatDocDateDisplay(val) || val || "";
      if (!canEdit) {
        return `<td><span class="ro">${escapeHtml(shown)}</span></td>`;
      }
      return `<td><input type="text" inputmode="numeric" placeholder="MM/DD/YYYY" data-row="${ri}" data-field="${col.field}" data-date="1" value="${escapeHtml(shown)}" data-testid="${p}-cell-${ri}-${col.field}" autocomplete="off" /></td>`;
    }
    if (!canEdit) {
      return `<td class="cell-wrap"><span class="cell-text ro">${escapeHtml(val)}</span></td>`;
    }
    // Qty: text + decimal keypad — no spinner; ↑/↓ navigate rows only.
    if (col.field === "qty") {
      return `<td class="num"><input type="text" inputmode="decimal" data-row="${ri}" data-field="qty" value="${escapeHtml(val)}" data-testid="${p}-cell-${ri}-qty" /></td>`;
    }
    return `<td class="cell-wrap"><span class="cell-text">${escapeHtml(val)}</span><input type="text" data-row="${ri}" data-field="${col.field}" value="${escapeHtml(val)}" data-testid="${p}-cell-${ri}-${col.field}" /></td>`;
  }

  /**
   * @param {any} doc
   * @param {any[]} models the lines in the order to paint (`itemKeys.orderForPaint`)
   * @param {readonly LineCol[]} cols
   * @returns {string}
   */
  function rowsHtml(doc, models, cols) {
    const canEdit = deps.editable();
    return models
      .map((model) => {
        const ri = model.rowIndex;
        const r = deps.cellsOf(model);
        const cells = cols
          .map((col, ci) => {
            const val = r[ci] ?? "";
            const own = deps.cellHtml ? deps.cellHtml(col, val, model, canEdit, doc) : null;
            return own != null ? own : sharedCellHtml(col, val, ri, canEdit);
          })
          .join("");
        const skipTab = deps.deleteSkipsTab ? ` tabindex="-1"` : "";
        const del = canEdit && deps.canDeleteLines()
          ? `<td><button type="button" class="del" data-del="${ri}" title="Remove line"${skipTab} data-testid="${p}-del-${ri}">×</button></td>`
          : `<td></td>`;
        const attrs = deps.rowAttrs ? deps.rowAttrs(model) : "";
        return `<tr data-rowidx="${ri}"${attrs}>${cells}${del}</tr>`;
      })
      .join("");
  }

  /** The line's value of `field` in the document last painted. */
  function lastValue(ri, field) {
    const line = deps.lines(deps.lastDoc())[ri];
    return (line && line[field]) ?? "";
  }

  /** @param {HTMLInputElement} inp */
  function wireCell(inp) {
    const api = deps.api;
    const { itemKeys } = deps;
    // Keep the resting text layer in step with the editor. The text is hidden
    // while the input has focus, so this is not load-bearing for correctness
    // mid-edit -- it is here so a cell reads right the instant you leave it,
    // without waiting for a repaint that may never come.
    const cellText = inp.closest("td.cell-wrap")?.querySelector(".cell-text");
    if (cellText) {
      const syncCellText = () => {
        cellText.textContent = inp.value;
      };
      inp.addEventListener("input", syncCellText);
      inp.addEventListener("change", syncCellText);
    }
    const field = inp.getAttribute("data-field") || "";
    const ri = Number(inp.getAttribute("data-row"));
    const navFields = deps.navFields();
    const linkDt = deps.linkDoctype(field);
    const readCellValue = () => {
      const kind = dirtyCompareKindForField(field);
      let next = kind === "number" ? inp.value : normalizeEditableText(inp.value);
      if (inp.type === "checkbox" || inp.dataset.check === "1") {
        return inp.checked ? 1 : 0;
      }
      if (deps.isMoneyField(field)) {
        const n = parseMoney(inp.value);
        next = n == null ? "" : String(n);
      }
      if (inp.dataset.date === "1") {
        const raw = filterDateInputValue(inp.value).trim();
        if (!raw) return "";
        const parsed = parseDocDate(raw);
        if (parsed.ok) return parsed.iso;
      }
      if (deps.capsOn && shouldForceCapsOnElement(deps.capsOn(), inp) && kind !== "number") {
        next = applyDocCapsValue(next, deps.capsOn());
      }
      return next;
    };
    const focusAfterItemEdit = async (docAfter, cellValue) => {
      const dest = itemKeys.nextAfterEdit(field, ri, docAfter, { cellValue, fields: navFields });
      if (dest.deleteRow && dest.leaveTable) {
        if (!api() || !deps.editable()) return;
        const rowCountNow = deps.lines(deps.lastDoc()).length;
        const deleteRi = dest.rowIndex != null ? dest.rowIndex : ri;
        if (shouldBlockDeleteLastItemRow(rowCountNow)) {
          deps.showToast(deps.lastRowToast());
          deps.focusAfterLeaving();
          return;
        }
        deps.setStatus("Removing empty line…");
        const removed = await deps.deleteLine(deleteRi);
        if (removed && removed.ok) {
          deps.noteUserEdit();
          deps.repaint(removed);
          deps.setStatus("Left items table.");
          deps.focusAfterLeaving();
        } else if (removed && removed.blockedLastRow) {
          deps.showToast(removed.reason || deps.lastRowToast());
        } else {
          deps.setStatus((removed && removed.reason) || "Could not remove empty line.", "err");
        }
        return;
      }
      if (dest.field) {
        deps.focusItemCell(dest.rowIndex, dest.field, { mode: CELL_MODE_NAV });
        return;
      }
      if (!dest.addRow || !api() || !deps.editable()) return;
      deps.setStatus("Adding line…");
      const added = await api().addItem();
      if (added && added.ok) {
        deps.noteUserEdit();
        deps.repaint(added);
        const newRi = added.doc ? deps.lines(added.doc).length - 1 : ri + 1;
        deps.focusItemCell(Math.max(0, newRi), deps.keyField, { mode: CELL_MODE_NAV });
        deps.setStatus("Line added.");
      } else {
        deps.setStatus((added && added.reason) || "Add line failed.", "err");
      }
    };
    const apply = async (value, opts = {}) => {
      if (!api() || deps.painting()) return;
      const run = async () => {
        deps.setStatus(`Updating ${field}…`);
        const moveMark = deps.userMoves.mark();
        const res = await api().setItem(ri, field, value);
        if (res && res.ok) {
          deps.noteUserEdit();
          deps.repaint(res);
          deps.setStatus("Line updated.");
          if (deps.userMoves.movedSince(moveMark)) {
            // The clerk moved on while ERPNext answered: leave focus where they put it.
            deps.logFocus("focus-after-edit-skipped", field);
          } else if (opts.focus && opts.focus.field) {
            deps.focusItemCell(opts.focus.rowIndex, opts.focus.field, {
              mode: opts.focus.mode === CELL_MODE_EDIT ? CELL_MODE_EDIT : CELL_MODE_NAV,
            });
          } else if (!opts.stay) {
            await focusAfterItemEdit(res.doc, value);
          }
        } else {
          const reason = (res && res.reason) || "";
          if (deps.afterRefused && (await deps.afterRefused(field, ri, value, reason))) return;
          deps.setStatus(reason || "Line update failed.", "err");
          await deps.refresh();
        }
      };
      inFlight = run();
      try {
        await inFlight;
      } finally {
        inFlight = null;
      }
    };
    if (linkDt) {
      deps.mountLinkPicker(inp, linkDt, apply);
    }
    if (inp.dataset.date === "1") {
      wireDateField(inp);
    }
    inp.addEventListener("focus", () => {
      if (inp.dataset.navFocus === "1") {
        deps.setItemCellMode(CELL_MODE_NAV);
        delete inp.dataset.navFocus;
      } else {
        deps.setItemCellMode(CELL_MODE_EDIT);
      }
    });
    if (field === deps.keyField) {
      inp.addEventListener("blur", () => {
        // Click-away from Item picker / leave cell without Tab — drop blank extras.
        window.setTimeout(() => {
          if (!deps.editable() || deps.painting() || itemKeys.busy()) return;
          const wrap = inp.closest(".link-wrap");
          if (wrap && wrap.contains(document.activeElement)) return;
          const code = normalizeEditableText(inp.value);
          if (!isEmptyItemCode(code)) return;
          void deps.cleanupEmptyLine(ri, code);
        }, 180);
      });
    }
    if (field === "rate") {
      inp.addEventListener("focus", () => {
        const n = parseMoney(inp.value);
        if (n != null) inp.value = String(n);
      });
      inp.addEventListener("blur", () => {
        if (deps.calcActiveOn(inp)) return;
        const n = parseMoney(inp.value);
        if (n != null) inp.value = formatGroupedNumber(n);
        else if (normalizeEditableText(inp.value) === "") inp.value = "";
      });
    }
    if (field === "qty" || field === "rate") {
      deps.attachCalc(inp, {
        kind: field,
        onCommit: async (value) => {
          let next = value;
          if (field === "rate") {
            const n = parseMoney(value);
            next = n == null ? "" : String(n);
            if (n != null) inp.value = formatGroupedNumber(n);
          }
          if (deps.beforeCalcCommit && (await deps.beforeCalcCommit(field, ri, next))) return;
          await apply(next);
        },
      });
    }
    itemKeys.wireCell(inp, {
      field,
      rowIndex: ri,
      navFields,
      readValue: readCellValue,
      apply,
      afterEdit: focusAfterItemEdit,
    });
    inp.addEventListener("change", async () => {
      if (!api() || deps.painting() || itemKeys.busy()) return;
      if (deps.calcActiveOn(inp)) return;
      let next = readCellValue();
      if (field === "rate") {
        const n = parseMoney(inp.value);
        if (n != null) inp.value = formatGroupedNumber(n);
      }
      if (inp.dataset.date === "1") {
        const raw = filterDateInputValue(inp.value).trim();
        if (!raw) {
          inp.value = formatDocDateDisplay(lastValue(ri, field));
          return;
        }
        const parsed = parseDocDate(raw);
        if (!parsed.ok) {
          deps.setStatus(parsed.reason || "Invalid date — use MM/DD/YYYY", "warn");
          inp.value = formatDocDateDisplay(lastValue(ri, field));
          return;
        }
        next = parsed.iso;
        inp.value = parsed.display;
      }
      const prev = lastValue(ri, field);
      const kind = dirtyCompareKindForField(field);
      if (valuesMeaningfullyEqual(prev, next, { kind })) {
        if (field === "rate" && parseMoney(prev) != null) {
          inp.value = formatGroupedNumber(prev);
        } else if (inp.dataset.date === "1") {
          inp.value = formatDocDateDisplay(prev) || "";
        } else if (kind !== "number") {
          inp.value = normalizeEditableText(String(prev ?? ""));
        }
        return;
      }
      await apply(next);
    });
  }

  /** @param {HTMLElement} btn */
  function wireDelete(btn) {
    btn.addEventListener("click", async () => {
      if (!deps.api()) return;
      const ri = Number(btn.getAttribute("data-del"));
      deps.setStatus("Removing line…");
      const res = await deps.deleteLine(ri);
      if (res && res.ok && res.clearedLastRow) {
        deps.noteUserEdit();
        (deps.repaintCleared || deps.repaint)(res, ri);
        deps.showToast(res.reason || deps.lastRowToast());
        deps.setStatus("Last line cleared.");
      } else if (res && res.ok) {
        deps.noteUserEdit();
        deps.repaint(res);
        deps.setStatus("Line removed.");
      } else if (res && res.blockedLastRow) {
        deps.showToast(res.reason || deps.lastRowToast());
      } else {
        deps.setStatus((res && res.reason) || "Delete failed.", "err");
      }
    });
  }

  /**
   * Paint the lines into the table and wire every cell. The page wires its own buttons after.
   * @param {any} doc
   * @param {any[]} models
   * @param {readonly LineCol[]} cols
   */
  function paint(doc, models, cols) {
    const table = deps.table();
    if (!table) return;
    table.innerHTML = rowsHtml(doc, models, cols);
    deps.afterRows(doc);
    table.querySelectorAll("input[data-row]").forEach((inp) => wireCell(/** @type {HTMLInputElement} */ (inp)));
    table.querySelectorAll("button[data-del]").forEach((btn) => wireDelete(/** @type {HTMLElement} */ (btn)));
    table.querySelectorAll("button[data-back-in]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!deps.editable() || deps.painting()) return;
        deps.beginAmountBackIn(/** @type {HTMLElement} */ (btn), Number(btn.getAttribute("data-back-in")));
      });
    });
  }

  return {
    paint,
    rowsHtml,
    /** The cell write still in flight, or null. */
    applyInFlight: () => inFlight,
  };
}
