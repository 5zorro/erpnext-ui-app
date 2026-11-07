/**
 * The lines and taxes, written once for every Doc form page (plan 2026-10-25 closeout, item 4):
 * the rows (src/doc-form-item-rows-ui.js), and what both pages did the same around them — the
 * Amount button's "back into the rate", one empty line on a new form, an empty line removed when
 * the clerk leaves it, the way back from a "create …" peek opened from a line, Remove all taxes,
 * the money stack under the taxes, the line totals, and the column sizing.
 *
 * Each page hands over one `page` object (`DocPage`, below): how to read its state and how to
 * repaint. What only one form does comes in as an option with a default that does nothing: the
 * Bill's Allocate lock on the taxes, its line delete that keeps Rec'd; doc-form's forms with no
 * taxes, no line totals, or lines the clerk cannot add (a payment's).
 */

import { formatUsdAmountHtml, parseMoney } from "./money.js";
import { billMoneyStack } from "./bill-map.js";
import { emptyItemRowCleanupAction } from "./bill-item-guard.js";
import { autoSizeItemColumns, mountColResize, mountDensityControl } from "./item-col-resize.js";
import { rateFromBackedInAmount } from "./calc/back-in-amount.js";
import { createItemRows } from "./doc-form-item-rows-ui.js";
import { CELL_MODE_EDIT, CELL_MODE_NAV } from "./item-table-nav.js";
import { peekReturnTarget, peekReturnPlan, peekErrandHoldsRow } from "./peek-return-focus.js";

/**
 * What a Doc form page tells the shared code. Getters, because the page's state changes under it.
 *
 * @typedef {{
 *   title: () => string,
 *   testIdPrefix: "bill" | "doc",
 *   rateLabel: string,
 *   el: () => any,
 *   api: () => any,
 *   lastDoc: () => any,
 *   painting: () => boolean,
 *   editable: () => boolean,
 *   repaint: (res: { doc: any, scratch?: any }) => void,
 *   refresh: () => Promise<void>,
 *   setStatus: (text: string, cls?: string) => void,
 *   noteUserEdit: () => void,
 *   showToast: (text: string) => void,
 *   logFocus: (event: string, detail?: string) => void,
 *   userMoves: { mark: () => any, movedSince: (mark: any) => boolean, bump?: () => void },
 *   calcUi: { getState: () => { mode: string }, getInput: () => any, clear: (prior?: string) => void },
 *   attachCalc: (inp: HTMLInputElement, opts: { kind: string, commitOnIdleBlur?: boolean, onCommit: (value: string) => Promise<void> }) => void,
 *   itemKeys: ReturnType<typeof import("./item-table-keys-ui.js").createItemTableKeys>,
 * }} DocPage
 *
 * @typedef {{
 *   tableKey: (table: "items" | "taxes") => string,
 *   lastRowToast: () => string,
 *   focusAfterLeaving: () => void,
 *   focusHeaderField?: (field: string) => void,
 *   taxNotes: { removedOn: Set<string> },
 *   deleteLine?: (ri: number) => Promise<any>,
 *   canAddLines?: () => boolean,
 *   showsTaxes?: () => boolean,
 *   taxesLocked?: () => string,
 *   lineSums?: () => { sumQty: (doc: any) => number, sumAmt: (doc: any) => number, formatTotal: (n: number) => string } | null,
 *   rows: Partial<import("./doc-form-item-rows-ui.js").ItemRowsDeps>,
 * }} DocLinesOpts
 *
 * `focusHeaderField`: back from a create peek opened from a header box (the Sales Order's
 * Customer); a page with none (the Bill: its Vendor box goes to Vendor add) leaves it out.
 * `tableKey`: where each table's column widths are kept. `taxesLocked`: a reason the taxes cannot
 * be removed now (the Bill: Allocate is open), or "". `lineSums`: null hides the line totals.
 * `rows`: the rows module's settings only this page has (its own cells, the Bill's Qty split).
 */

/**
 * @param {DocPage} page
 * @param {DocLinesOpts} opts
 */
export function createDocLines(page, opts) {
  let removingTaxes = false;
  /** The cell a "create …" peek was opened from (DF-02). */
  let peekReturn = null;
  /** The line a create peek came back to; held from the empty-line cleanup until the clerk moves. */
  let peekHold = null;
  const p = page.testIdPrefix;
  const deleteLine = opts.deleteLine || ((ri) => page.api().deleteItem(ri));
  const canAddLines = opts.canAddLines || (() => true);
  const lines = (doc) => (doc && Array.isArray(doc.items) ? doc.items : []);

  function setItemCellMode(mode) {
    page.itemKeys.setMode(mode);
  }

  function focusItemCell(rowIndex, field, focusOpts = {}) {
    page.itemKeys.focusCell(rowIndex, field, focusOpts);
  }

  /** True while a create errand (out, or just back) owns this line — see peekErrandHoldsRow. */
  function peekHoldsRow(ri) {
    return peekErrandHoldsRow(peekReturn, peekHold, ri, !!peekHold && page.userMoves.movedSince(peekHold.mark));
  }

  /** A link pick list opened a "create …" peek from this box. */
  function notePeekFrom(input, doctype) {
    peekReturn = peekReturnTarget(input, doctype);
  }

  /** Back from a create peek: fill the box with the saved record, then put the cursor there. */
  async function comeBackFromPeek(leftFrom) {
    const plan = peekReturnPlan(peekReturn, leftFrom);
    const what = (peekReturn && peekReturn.doctype) || "";
    peekHold = plan && plan.row != null ? { row: plan.row, mark: page.userMoves.mark() } : null;
    peekReturn = null;
    if (!plan) return;
    const api = page.api();
    if (plan.row == null) {
      // A header box — the Sales Order's Customer (DF-03).
      if (!opts.focusHeaderField) return;
      if (plan.fill && api && page.editable()) {
        const res = await api.setHeader(plan.field, plan.fill);
        if (res && res.ok && !res.skipped) {
          page.noteUserEdit();
          await page.refresh();
          page.setStatus(`New ${what} ${plan.fill} is set.`);
        } else if (!res || !res.ok) {
          page.setStatus((res && res.reason) || `Could not set ${plan.fill}.`, "warn");
        }
      }
      opts.focusHeaderField(plan.field);
      return;
    }
    if (plan.fill && api && page.editable()) {
      const res = await api.setItem(plan.row, plan.field, plan.fill);
      if (res && res.ok) {
        page.noteUserEdit();
        page.repaint(res);
        page.setStatus(`New Item ${plan.fill} is on line ${plan.row + 1}.`);
      } else {
        page.setStatus((res && res.reason) || `Could not put ${plan.fill} on line ${plan.row + 1}.`, "warn");
      }
    }
    focusItemCell(plan.row, plan.field, { mode: plan.fill ? CELL_MODE_NAV : CELL_MODE_EDIT });
  }

  /** A new form shows one empty line to type in. */
  async function ensureAtLeastOneItemRow(doc) {
    const api = page.api();
    if (!api || !page.editable() || page.painting() || !canAddLines()) return;
    if (lines(doc).length > 0) return;
    const res = await api.addItem();
    if (res && res.ok) {
      page.noteUserEdit();
      page.repaint(res);
    }
  }

  /** The clerk left a line with no Item: remove it (unless a create peek owns it). */
  async function cleanupEmptyItemRow(rowIndex, itemCode) {
    if (!page.api() || !page.editable() || page.painting() || page.itemKeys.busy()) return;
    if (peekHoldsRow(rowIndex)) {
      page.logFocus("empty-line-kept", `line ${rowIndex + 1}: create errand`);
      return;
    }
    const decision = emptyItemRowCleanupAction(lines(page.lastDoc()).length, itemCode);
    if (decision.action !== "delete") return;
    page.setStatus("Removing empty line…");
    const removed = await deleteLine(rowIndex);
    if (removed && removed.ok) {
      page.noteUserEdit();
      page.repaint(removed);
      page.setStatus("Empty line removed.");
      opts.focusAfterLeaving();
    } else if (removed && removed.blockedLastRow) {
      page.showToast(removed.reason || opts.lastRowToast());
    }
  }

  /** The Amount button: type the line's amount, and the rate becomes Amount ÷ Qty. */
  function beginAmountBackIn(btn, ri) {
    const td = btn.closest("td");
    const lastDoc = page.lastDoc();
    if (!td || !lastDoc || !lastDoc.items || !lastDoc.items[ri]) return;
    const row = lastDoc.items[ri];
    const rate = page.rateLabel;
    const priorAmt =
      row.amount != null && row.amount !== ""
        ? String(row.amount)
        : String((Number(row.qty) || 0) * (Number(row.rate) || 0) || "");
    const inp = document.createElement("input");
    inp.type = "text";
    inp.inputMode = "decimal";
    inp.className = "money-cost amount-back-in-input";
    inp.setAttribute("data-testid", `${p}-amt-edit-${ri}`);
    const n0 = parseMoney(priorAmt);
    inp.value = n0 != null ? String(n0) : "";
    td.replaceChildren(inp);
    page.setStatus(`Back into ${rate.toLowerCase()}: enter Amount (calc OK) — ${rate} = Amount ÷ Qty.`);
    const finishRestore = () => page.repaint({ doc: page.lastDoc() });
    page.attachCalc(inp, {
      kind: "amount",
      commitOnIdleBlur: true,
      onCommit: async (value) => {
        const derived = rateFromBackedInAmount(value, row.qty);
        if (!derived.ok) {
          page.setStatus(derived.reason, "warn");
          finishRestore();
          return;
        }
        page.setStatus(`Updating ${rate.toLowerCase()} from amount…`);
        const res = await page.api().setItem(ri, "rate", derived.rateText);
        if (res && res.ok) {
          page.noteUserEdit();
          page.repaint(res);
          page.setStatus(`${rate} set to ${derived.rateText} (Amount ÷ Qty).`);
        } else {
          page.setStatus((res && res.reason) || `Could not update ${rate.toLowerCase()}.`, "err");
          await page.refresh();
        }
      },
    });
    inp.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && page.calcUi.getState().mode !== "active") {
        ev.preventDefault();
        // Detach before paint so blur does not idle-commit the edit.
        page.calcUi.clear(inp.value);
        finishRestore();
      }
    });
    inp.focus();
    try {
      inp.select();
    } catch {
      /* ignore */
    }
  }

  /**
   * Clear the template field first (or ERPNext refills the rows from it), then every row.
   * @param {{ quiet?: boolean }} [removeOpts]
   */
  async function removeAllTaxes(removeOpts = {}) {
    const api = page.api();
    const lastDoc = page.lastDoc();
    if (!api || !page.editable() || !lastDoc || removingTaxes) return;
    const locked = opts.taxesLocked ? opts.taxesLocked() : "";
    if (locked) {
      page.setStatus(locked, "warn");
      return;
    }
    removingTaxes = true;
    try {
      opts.taxNotes.removedOn.add(String(lastDoc.name || ""));
      let doc = lastDoc;
      let scratch;
      if (doc.taxes_and_charges) {
        const r = await api.setHeader("taxes_and_charges", "");
        if (!(r && r.ok)) {
          page.setStatus((r && r.reason) || "Could not clear the tax template.", "err");
          return;
        }
        doc = r.doc || doc;
        if (r.scratch) scratch = r.scratch;
      }
      for (let i = (Array.isArray(doc.taxes) ? doc.taxes.length : 0) - 1; i >= 0; i -= 1) {
        const r = await api.deleteTax(i);
        if (!(r && r.ok)) {
          page.setStatus((r && r.reason) || "Could not remove a tax row.", "err");
          break;
        }
        doc = r.doc || doc;
        if (r.scratch) scratch = r.scratch;
      }
      page.noteUserEdit();
      page.repaint({ doc, scratch });
      page.setStatus(
        removeOpts.quiet
          ? `ERPNext put the template's taxes back; removed again — you removed all taxes on this ${page.title().toLowerCase()}. Add tax/charge adds one.`
          : "All taxes and charges removed. They stay removed until you save; Add tax/charge adds one back.",
      );
    } finally {
      removingTaxes = false;
    }
  }

  /** Items, Taxes and Grand total under the taxes. */
  function paintMoneyStack(doc) {
    if (opts.showsTaxes && !opts.showsTaxes()) return;
    const el = page.el();
    const stack = billMoneyStack(doc);
    const fmt = (n) => formatUsdAmountHtml(n) || "$0.00";
    if (el.msItems) el.msItems.innerHTML = fmt(stack.itemSubtotal);
    if (el.msTaxes) el.msTaxes.innerHTML = fmt(stack.taxesTotal);
    if (el.msGrand) el.msGrand.innerHTML = stack.grandTotal != null ? fmt(stack.grandTotal) : "—";
    if (el.msNote) {
      el.msNote.hidden = !stack.note;
      el.msNote.textContent = stack.note || "";
    }
  }

  /** The Qty and Amount totals under the lines. */
  function paintLineTotals(doc) {
    const el = page.el();
    const sums = opts.lineSums ? opts.lineSums() : null;
    if (!el || !el.lineTotals || !sums) return;
    if (!lines(doc).length) {
      el.lineTotals.hidden = true;
      return;
    }
    el.lineTotals.hidden = false;
    const totQty = document.getElementById("tot-qty");
    const totAmt = document.getElementById("tot-amt");
    if (totQty) totQty.textContent = sums.formatTotal(sums.sumQty(doc));
    if (totAmt) totAmt.innerHTML = formatUsdAmountHtml(sums.sumAmt(doc)) || sums.formatTotal(sums.sumAmt(doc));
  }

  /**
   * Size the line grid from its content, then arm the drag handles. Runs after every repaint
   * because the header row is rebuilt each time; both calls are idempotent.
   */
  function sizeItemColumns() {
    try {
      const el = page.el();
      const table = el && el.items && el.items.closest ? el.items.closest("table") : null;
      if (!table) return;
      const tableKey = opts.tableKey("items");
      mountColResize(table, { tableKey, onChange: sizeItemColumns });
      mountDensityControl({ table, button: document.getElementById("btn-density") });
      autoSizeItemColumns(table, { tableKey, growSection: table.closest(".bill-section") });
    } catch {
      /* column sizing is presentation; never let it break a repaint */
    }
  }

  function sizeTaxColumns() {
    try {
      const el = page.el();
      const table = el && el.taxesBody && el.taxesBody.closest ? el.taxesBody.closest("table") : null;
      if (!table) return;
      const tableKey = opts.tableKey("taxes");
      mountColResize(table, { tableKey, onChange: sizeTaxColumns });
      autoSizeItemColumns(table, { tableKey, sticky: false, growSection: table.closest(".bill-section") });
    } catch {
      /* ignore */
    }
  }

  const itemRows = createItemRows({
    table: () => page.el() && page.el().items,
    api: () => page.api(),
    lastDoc: () => page.lastDoc(),
    painting: () => page.painting(),
    editable: () => page.editable(),
    lines,
    keyField: "item_code",
    itemKeys: page.itemKeys,
    calcActiveOn: (inp) => page.calcUi.getState().mode === "active" && page.calcUi.getInput() === inp,
    testIdPrefix: p,
    rateLabel: page.rateLabel,
    cellsOf: (model) => model.cells,
    canDeleteLines: canAddLines,
    afterRows: (doc) => {
      paintLineTotals(doc);
      sizeItemColumns();
    },
    attachCalc: page.attachCalc,
    deleteLine,
    repaint: page.repaint,
    lastRowToast: opts.lastRowToast,
    showToast: page.showToast,
    setStatus: page.setStatus,
    noteUserEdit: page.noteUserEdit,
    setItemCellMode,
    focusItemCell,
    focusAfterLeaving: opts.focusAfterLeaving,
    userMoves: page.userMoves,
    logFocus: page.logFocus,
    refresh: page.refresh,
    cleanupEmptyLine: cleanupEmptyItemRow,
    beginAmountBackIn,
    .../** @type {any} */ (opts.rows),
  });

  return {
    itemRows,
    /** True while Remove all taxes is working (the taxes table holds its own writes). */
    removingTaxes: () => removingTaxes,
    setItemCellMode,
    focusItemCell,
    ensureAtLeastOneItemRow,
    cleanupEmptyItemRow,
    beginAmountBackIn,
    notePeekFrom,
    comeBackFromPeek,
    removeAllTaxes,
    paintMoneyStack,
    paintLineTotals,
    sizeItemColumns,
    sizeTaxColumns,
  };
}
