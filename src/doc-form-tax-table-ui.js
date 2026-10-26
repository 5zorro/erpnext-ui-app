/**
 * The taxes table, written once for every Doc form page, the Bill's way (plan 2026-10-25, R6a-1
 * step 3; 5zorro 2026-10-26: "bill probably has the better tax table stuff, please merge the
 * navigation", and of the rate: "I don't see a reason why the tax rate should be different, can
 * you make them the same (again preferring the bill right)?"):
 *   - sortable headers; the rows, Rate % shown from the net total on a fixed (Actual) row;
 *   - the keyboard walk (DF-02): Tab and the arrows move between Account and the row's number
 *     (Rate % on a percentage row, Amount on a fixed one), Tab past the end goes to the Add box,
 *     Shift+Tab before the start to Add tax; a move commits the box it leaves;
 *   - a cell commits on change, on blur, or on a move; one write at a time per cell;
 *   - a Rate typed on a fixed row works out its Amount from the net total; a typed Amount on a
 *     percentage row makes it fixed (and the ⓘ note says so — src/doc-form-tax-notes-ui.js);
 *   - × per row; the Taxes subtotal under the table.
 * Both pages lay the table out the same (Line, fixed widths, the subtotal footer — 5zorro: "make the
 * layout match the bills layout"). What differs comes in through `deps`: whether the clerk may type
 * in it (A/R follows the customer's template), the page's own chrome and row buttons (the Bill's
 * Allocate into items).
 */

import { uiIconHtml } from "./ui-icons.js";
import { formatGroupedNumber, formatUsdAmountHtml, parseMoney } from "./money.js";
import { valuesMeaningfullyEqual, dirtyCompareKindForField, normalizeEditableText } from "./dirty-gate.js";
import { billTaxesSubtotal, readBillTaxRowsForSort, sortBillTaxRows } from "./bill-tax-sort.js";
import { applyHeaderSortClick, sortHeaderArrow, sortHeaderState } from "./item-sort-specs.js";
import { neighborTaxCell, nextTaxCellTab, taxNavPos, taxRowNavFields } from "./bill-tax-table-nav.js";
import { displayTaxRateForRow, taxAmountFromRate, taxRateBaseFromDoc } from "./bill-tax-sync.js";

function escapeHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @typedef {{ label: string, sortKey: string, className?: string }} TaxHeader
 *
 * @typedef {{
 *   el: () => { taxesBody?: HTMLElement|null, taxesTotals?: HTMLElement|null, taxesSubtotal?: HTMLElement|null,
 *     taxesAdd?: HTMLElement|null, removeAllTax?: HTMLButtonElement|null,
 *     taxAccount?: HTMLElement|null, memo?: HTMLTextAreaElement|null, addTax?: HTMLButtonElement|null } | null,
 *   head: () => HTMLElement | null,
 *   api: () => { setTax?: Function, deleteTax?: Function } | null | undefined,
 *   lastDoc: () => any,
 *   painting: () => boolean,
 *   editable: () => boolean,
 *   shown?: () => boolean,
 *   readOnly?: () => boolean,
 *   headers: readonly TaxHeader[],
 *   defaultSort: { key: string, asc: boolean },
 *   testIdPrefix: string,
 *   taxNotes: ReturnType<typeof import("./doc-form-tax-notes-ui.js").createTaxNotes>,
 *   mountLinkPicker: (inp: HTMLInputElement, doctype: string, apply: Function) => void,
 *   repaint: (res: { doc?: any, scratch?: any }) => void,
 *   refresh: () => Promise<void>,
 *   setStatus: (text: string, cls?: string) => void,
 *   noteUserEdit: () => void,
 *   sizeColumns: () => void,
 *   paintMoneyStack: (doc: any) => void,
 *   beforeRows?: (doc: any, rowCount: number) => void,
 *   rowButtonsHtml?: (taxRaw: any, idx: number, canEdit: boolean) => string,
 *   wireRowButtons?: (body: HTMLElement) => void,
 *   deleteBlockedReason?: () => string,
 * }} TaxTableDeps
 *
 * `shown`: false when the layout has no taxes (doc-form's A/R Receive Payment). `readOnly`: the
 * clerk may not type here though the document is editable (A/R: the customer's Sales Taxes
 * template makes the rows). `headers`: the sortable columns; a `lineNo` header adds the Line
 * column. `beforeRows`: the page's own chrome around the table (doc-form's template ⓘ). `rowButtonsHtml` / `wireRowButtons`: buttons beside ×. `deleteBlockedReason`:
 * why × may not run now ("" when it may).
 */

/** @param {TaxTableDeps} deps */
export function createTaxTable(deps) {
  const p = deps.testIdPrefix;
  const hasLineCol = deps.headers.some((h) => h.sortKey === "lineNo");
  const colCount = deps.headers.length + 1;
  let sortSpecs = [deps.defaultSort];
  let headWired = false;
  /** True while a Tab / arrow move commits a cell, so the blur it causes does not commit again. */
  let tabGuard = false;

  function paintHead() {
    const head = deps.head();
    if (!head || (deps.shown && !deps.shown())) return;
    head.innerHTML =
      deps.headers
        .map((h) => {
          const st = sortHeaderState(sortSpecs, h.sortKey);
          const arrow = sortHeaderArrow(sortSpecs, h.sortKey);
          const cls = ["sortable", st.active ? "sorted" : "", h.className || ""].filter(Boolean).join(" ");
          return `<th class="${cls}" data-tax-sort="${escapeHtml(h.sortKey)}" title="Sort by ${escapeHtml(h.label)}">${escapeHtml(h.label)}${arrow ? ` ${arrow}` : ""}</th>`;
        })
        .join("") + `<th data-col-key="tax_actions"></th>`;
    if (!headWired) {
      headWired = true;
      head.addEventListener("click", (ev) => {
        const th = ev.target && /** @type {HTMLElement} */ (ev.target).closest("[data-tax-sort]");
        if (!th) return;
        const key = th.getAttribute("data-tax-sort");
        if (!key) return;
        sortSpecs = applyHeaderSortClick(sortSpecs, key, {
          ctrlKey: !!ev.ctrlKey,
          metaKey: !!ev.metaKey,
        });
        if (deps.lastDoc()) paint(deps.lastDoc());
      });
    }
  }

  /** Back to the default sort (a new document layout); the head is wired again. */
  function reset() {
    sortSpecs = [deps.defaultSort];
    headWired = false;
  }

  /** @param {any} doc */
  function taxRows(doc) {
    return doc && Array.isArray(doc.taxes) ? doc.taxes : [];
  }

  function focusTaxCell(rowIndex, field) {
    const body = deps.el() && deps.el().taxesBody;
    if (!body || taxNavPos(field) < 0) return;
    const inp = /** @type {HTMLInputElement|null} */ (
      body.querySelector(`[data-tax-row="${rowIndex}"][data-tax-field="${field}"]`)
    );
    if (!inp || typeof inp.focus !== "function") return;
    try {
      inp.focus({ preventScroll: false });
      if (typeof inp.select === "function") inp.select();
    } catch {
      try {
        inp.focus();
      } catch {
        /* ignore */
      }
    }
  }

  /** The keyboard walk for tax row `ri` — Rate % on a percentage row, Amount on a fixed one. */
  function taxFieldsForRow(ri) {
    return taxRowNavFields(taxRows(deps.lastDoc())[ri] || null);
  }

  /**
   * @param {any} doc
   * @param {ReturnType<typeof readBillTaxRowsForSort>} rows
   * @param {boolean} canEdit
   */
  function rowsHtml(doc, rows, canEdit) {
    return rows
      .map((r) => {
        const taxRaw = taxRows(doc)[r.idx] || null;
        const lineCell = (inner) => (hasLineCol ? `<td>${inner}</td>` : "");
        if (!canEdit) {
          return `<tr>
            ${lineCell(escapeHtml(String(r.lineNo)))}
            <td>${escapeHtml(r.account_head)}</td>
            <td>${escapeHtml(r.description)}</td>
            <td>${escapeHtml(r.charge_type)}</td>
            <td class="num">${escapeHtml(r.rate === "" ? "" : String(r.rate))}</td>
            <td class="num">${formatUsdAmountHtml(r.tax_amount) || escapeHtml(String(r.tax_amount ?? ""))}</td>
            <td>${escapeHtml(r.add_deduct_tax)}</td>
            <td></td>
          </tr>`;
        }
        const rateVal = displayTaxRateForRow(r, doc);
        const rateShown = rateVal === "" || rateVal == null ? "" : formatGroupedNumber(Number(rateVal));
        const amtShown = r.tax_amount === "" || r.tax_amount == null ? "" : formatGroupedNumber(r.tax_amount);
        const buttons = deps.rowButtonsHtml ? deps.rowButtonsHtml(taxRaw || r, r.idx, canEdit) : "";
        return `<tr data-taxidx="${r.idx}">
          ${lineCell(`<span class="ro">${escapeHtml(String(r.lineNo))}</span>`)}
          <td class="cell-wrap"><span class="cell-text">${escapeHtml(r.account_head)}</span><input type="text" data-tax-row="${r.idx}" data-tax-field="account_head" value="${escapeHtml(r.account_head)}" data-testid="${p}-tax-${r.idx}-account" /></td>
          <td class="cell-wrap"><span class="cell-text">${escapeHtml(r.description)}</span><input type="text" data-tax-row="${r.idx}" data-tax-field="description" value="${escapeHtml(r.description)}" data-testid="${p}-tax-${r.idx}-desc" /></td>
          <td><span class="ro">${escapeHtml(r.charge_type)}</span>${deps.taxNotes.fixedMarkerHtml(taxRaw, r.idx)}</td>
          <td class="num"><input type="text" inputmode="decimal" class="money-cost" data-tax-row="${r.idx}" data-tax-field="rate" value="${escapeHtml(rateShown)}" data-testid="${p}-tax-${r.idx}-rate" /></td>
          <td class="num"><input type="text" inputmode="decimal" class="money-cost" data-tax-row="${r.idx}" data-tax-field="tax_amount" value="${escapeHtml(amtShown)}" data-testid="${p}-tax-${r.idx}-amount" /></td>
          <td>
            <select data-tax-row="${r.idx}" data-tax-field="add_deduct_tax" data-testid="${p}-tax-${r.idx}-adddeduct">
              <option value="Add"${r.add_deduct_tax === "Add" ? " selected" : ""}>Add</option>
              <option value="Deduct"${r.add_deduct_tax === "Deduct" ? " selected" : ""}>Deduct</option>
            </select>
          </td>
          <td style="white-space:nowrap">
            ${buttons}
            <button type="button" class="del" data-tax-del="${r.idx}" title="Remove this tax/charge" aria-label="Remove this tax/charge" data-testid="${p}-tax-del-${r.idx}">${uiIconHtml("trash", { size: 13 })}</button>
          </td>
        </tr>${deps.taxNotes.fixedNoteRowHtml(taxRaw, r.idx, colCount)}`;
      })
      .join("");
  }

  /** @param {HTMLInputElement} inp */
  function wireCell(inp) {
    const api = deps.api;
    // Same resting-text sync as the items grid (Packet T step B).
    const taxCellText = inp.closest("td.cell-wrap")?.querySelector(".cell-text");
    if (taxCellText) {
      const syncTaxCellText = () => {
        taxCellText.textContent = inp.value;
      };
      inp.addEventListener("input", syncTaxCellText);
      inp.addEventListener("change", syncTaxCellText);
    }
    const field = inp.getAttribute("data-tax-field") || "";
    const ri = Number(inp.getAttribute("data-tax-row"));
    // The walk moves between cells itself (DF-02); the browser's Tab order never enters the rows.
    inp.tabIndex = -1;
    let taxBusy = false;
    const rowNow = () => taxRows(deps.lastDoc())[ri] || null;
    const readTaxValue = () => {
      const kind = dirtyCompareKindForField(field);
      let next = kind === "number" ? inp.value : normalizeEditableText(inp.value);
      if (field === "rate" || field === "tax_amount") {
        const n = parseMoney(inp.value);
        next = n == null ? "" : String(n);
      }
      return next;
    };
    const focusAfter = (applyOpts) => {
      if (applyOpts.focus) {
        requestAnimationFrame(() => focusTaxCell(applyOpts.focus.rowIndex, applyOpts.focus.field));
      }
    };
    const apply = async (value, applyOpts = {}) => {
      if (!api() || deps.painting() || !api().setTax || taxBusy) return null;
      taxBusy = true;
      try {
        deps.setStatus(`Updating tax ${field}…`);
        const res = await api().setTax(ri, field, value);
        if (res && res.ok) {
          deps.noteUserEdit();
          deps.repaint(res);
          focusAfter(applyOpts);
          deps.setStatus("Tax row updated — totals refreshed.");
        } else {
          deps.setStatus((res && res.reason) || "Tax update failed.", "err");
          await deps.refresh();
        }
        return res;
      } finally {
        taxBusy = false;
      }
    };
    const syncTaxRateAndAmount = async (editedField, rawValue, applyOpts = {}) => {
      if (!api() || deps.painting() || !api().setTax || taxBusy) return;
      const base = taxRateBaseFromDoc(deps.lastDoc());
      const n = parseMoney(rawValue);
      if (n == null) {
        await apply(String(rawValue), applyOpts);
        return;
      }
      const row = rowNow();
      const isPercentRow = !!row && row.charge_type !== "Actual";
      if (editedField === "tax_amount") {
        // A typed Amount on a % row makes it Actual (bridge setTaxRow): the amount is the row's truth now.
        if (isPercentRow && row.name) deps.taxNotes.fixedByClerk.set(String(row.name), row.rate);
        await apply(String(n), applyOpts);
        return;
      }
      if (editedField === "rate" && isPercentRow) {
        // ERPNext's own rule: a % row is typed by its rate and computes its amount.
        await apply(String(n), applyOpts);
        return;
      }
      if (editedField === "rate") {
        const amt = taxAmountFromRate(n, base);
        if (amt == null) {
          await apply(String(n), applyOpts);
          return;
        }
        taxBusy = true;
        try {
          deps.setStatus("Updating tax amount from rate…");
          const resAmt = await api().setTax(ri, "tax_amount", String(amt));
          if (resAmt && resAmt.ok) {
            deps.noteUserEdit();
            deps.repaint(resAmt);
            focusAfter(applyOpts);
            deps.setStatus("Tax row updated — totals refreshed.");
            if (Math.abs(n - Number(resAmt.doc?.taxes?.[ri]?.rate ?? n)) > 0.001) {
              const resRate = await api().setTax(ri, "rate", String(n));
              if (resRate && resRate.ok) {
                deps.repaint(resRate);
                focusAfter(applyOpts);
              }
            }
          } else {
            deps.setStatus((resAmt && resAmt.reason) || "Tax update failed.", "err");
            await deps.refresh();
          }
        } finally {
          taxBusy = false;
        }
      }
    };
    if (field === "account_head") {
      deps.mountLinkPicker(inp, "Account", apply);
    }
    const commitTaxCell = async (applyOpts = {}) => {
      // A Tab / arrow move commits through here itself (fromMove); the guard only keeps the
      // blur that the move causes from committing a second time. DF-02: the guard used to
      // stop the move's own commit too, so Tab out of an edited Amount dropped the edit.
      if (!api() || deps.painting() || taxBusy || (tabGuard && !applyOpts.fromMove)) return;
      const next = readTaxValue();
      if (field === "rate" || field === "tax_amount") {
        const n = parseMoney(inp.value);
        if (n != null) inp.value = formatGroupedNumber(n);
      }
      const row = rowNow();
      let prev = row && row[field] != null ? row[field] : "";
      if (field === "rate" && row) {
        prev = displayTaxRateForRow(row, deps.lastDoc());
      }
      const kind = dirtyCompareKindForField(field);
      if (valuesMeaningfullyEqual(prev, next, { kind })) return;
      if (field === "rate" || field === "tax_amount") {
        await syncTaxRateAndAmount(field, inp.value, applyOpts);
        return;
      }
      await apply(next, applyOpts);
    };
    inp.addEventListener("change", () => {
      void commitTaxCell();
    });
    inp.addEventListener("blur", () => {
      if (tabGuard) return;
      void commitTaxCell();
    });
    if (taxNavPos(field) < 0) return;
    inp.addEventListener("focus", () => {
      if (field === "tax_amount" || field === "rate") {
        const n = parseMoney(inp.value);
        if (n != null) inp.value = String(n);
      }
    });
    inp.addEventListener("keydown", (ev) => {
      if (!deps.editable() || deps.painting()) return;
      const rowCount = taxRows(deps.lastDoc()).length;

      const runMove = async (dest, leaveForward, leaveBackward) => {
        tabGuard = true;
        try {
          const next = readTaxValue();
          const row = rowNow();
          const prev = row && row[field] != null ? row[field] : "";
          const kind = dirtyCompareKindForField(field);
          const dirty = !valuesMeaningfullyEqual(prev, next, { kind });
          if (!dest) {
            if (dirty) await commitTaxCell({ fromMove: true });
            const el = deps.el() || {};
            if (leaveForward) {
              if (el.taxAccount) el.taxAccount.focus();
              else if (el.memo && !el.memo.readOnly) el.memo.focus();
            } else if (leaveBackward) {
              if (el.addTax && !el.addTax.disabled) el.addTax.focus();
            }
            return;
          }
          if (dirty) {
            await commitTaxCell({ focus: dest, fromMove: true });
          } else {
            focusTaxCell(dest.rowIndex, dest.field);
          }
        } finally {
          tabGuard = false;
        }
      };

      if (ev.key === "Tab") {
        ev.preventDefault();
        const dest = nextTaxCellTab(field, ri, rowCount, !!ev.shiftKey, taxFieldsForRow);
        void runMove(dest, !ev.shiftKey && !dest, !!ev.shiftKey && !dest);
        return;
      }
      const dir =
        ev.key === "ArrowUp"
          ? "up"
          : ev.key === "ArrowDown"
            ? "down"
            : ev.key === "ArrowLeft"
              ? "left"
              : ev.key === "ArrowRight"
                ? "right"
                : null;
      if (!dir) return;
      ev.preventDefault();
      const dest = neighborTaxCell(field, ri, rowCount, dir, taxFieldsForRow);
      void runMove(dest, false, false);
    });
  }

  /** @param {HTMLButtonElement} btn */
  function wireDelete(btn) {
    btn.tabIndex = -1;
    if (deps.deleteBlockedReason && deps.deleteBlockedReason()) btn.disabled = true;
    btn.addEventListener("click", async () => {
      const blocked = deps.deleteBlockedReason ? deps.deleteBlockedReason() : "";
      if (blocked) {
        deps.setStatus(blocked, "warn");
        return;
      }
      const api = deps.api();
      if (!api || !api.deleteTax) return;
      const ri = Number(btn.getAttribute("data-tax-del"));
      deps.setStatus("Removing tax row…");
      const res = await api.deleteTax(ri);
      if (res && res.ok) {
        deps.noteUserEdit();
        deps.repaint(res);
        deps.setStatus("Tax row removed.");
      } else {
        deps.setStatus((res && res.reason) || "Delete tax failed.", "err");
      }
    });
  }

  /** @param {any} doc */
  function paint(doc) {
    const el = deps.el();
    const body = el && el.taxesBody;
    if (!body || (deps.shown && !deps.shown())) return;
    paintHead();
    const rows = sortBillTaxRows(readBillTaxRowsForSort(doc), sortSpecs);
    const canEdit = deps.editable() && !(deps.readOnly && deps.readOnly());
    if (el.taxesAdd) el.taxesAdd.style.display = canEdit ? "" : "none";
    if (el.removeAllTax) el.removeAllTax.disabled = !rows.length;
    if (deps.beforeRows) deps.beforeRows(doc, rows.length);
    if (el.taxesTotals) el.taxesTotals.hidden = !rows.length;
    if (rows.length && el.taxesSubtotal) {
      el.taxesSubtotal.innerHTML = formatUsdAmountHtml(billTaxesSubtotal(doc)) || "0.00";
    }
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="${colCount}" class="link-muted">No tax/charge rows yet.</td></tr>`;
      deps.paintMoneyStack(doc);
      return;
    }
    body.innerHTML = rowsHtml(doc, rows, canEdit);
    deps.sizeColumns();
    body.querySelectorAll("[data-tax-row]").forEach((inp) => wireCell(/** @type {HTMLInputElement} */ (inp)));
    body.querySelectorAll("[data-tax-del]").forEach((btn) => wireDelete(/** @type {HTMLButtonElement} */ (btn)));
    deps.taxNotes.wireFixedNotes();
    if (deps.wireRowButtons) deps.wireRowButtons(body);
    deps.paintMoneyStack(doc);
    deps.taxNotes.followDoc(doc);
  }

  return { paint, paintHead, reset, rowsHtml };
}
