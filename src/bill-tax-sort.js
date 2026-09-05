/**
 * Display-order sort for Bill Taxes and Charges rows (OI-140 UX).
 * Row `idx` stays the ERP child index for setTax / delete / allocate.
 */

import {
  applyHeaderSortClick,
  compareSortValues,
  normalizeSortSpecs,
  sortHeaderArrow,
  sortHeaderState,
} from "./item-sort-specs.js";

export { applyHeaderSortClick, sortHeaderArrow, sortHeaderState };

/** @typedef {{ key: string, asc: boolean }} SortSpec */
/**
 * @typedef {{
 *   idx: number,
 *   lineNo: number,
 *   account_head: string,
 *   description: string,
 *   charge_type: string,
 *   rate: number|string,
 *   tax_amount: number|string,
 *   add_deduct_tax: string,
 * }} BillTaxRow
 */

/** @type {readonly { label: string, sortKey: string, className?: string }[]} */
export const BILL_TAX_SORTABLE_HEADERS = Object.freeze([
  { label: "Line", sortKey: "lineNo" },
  { label: "Account", sortKey: "account_head" },
  { label: "Description", sortKey: "description" },
  { label: "Type", sortKey: "charge_type" },
  { label: "Rate %", sortKey: "rate", className: "num" },
  { label: "Amount", sortKey: "tax_amount", className: "num" },
  { label: "Add/Deduct", sortKey: "add_deduct_tax" },
]);

/** Doc-form IR taxes table — same columns as Bill minus Line# (no allocate). */
export const DOC_TAX_SORTABLE_HEADERS = Object.freeze(
  BILL_TAX_SORTABLE_HEADERS.filter((h) => h.sortKey !== "lineNo"),
);

/**
 * @param {object|null|undefined} doc
 * @returns {BillTaxRow[]}
 */
export function readBillTaxRowsForSort(doc) {
  const taxes = doc && Array.isArray(doc.taxes) ? doc.taxes : [];
  return taxes.map((t, i) => {
    const erpIdx = t && t.idx != null ? Number(t.idx) : NaN;
    const lineNo = Number.isFinite(erpIdx) && erpIdx > 0 ? erpIdx : i + 1;
    return {
      idx: i,
      lineNo,
      account_head: (t && t.account_head) || "",
      description: (t && t.description) || "",
      charge_type: (t && t.charge_type) || "",
      rate: t && t.rate != null ? t.rate : "",
      tax_amount: t && t.tax_amount != null ? t.tax_amount : "",
      add_deduct_tax: (t && t.add_deduct_tax) || "Add",
    };
  });
}

/**
 * @param {BillTaxRow} row
 * @param {string} key
 */
function taxSortValue(row, key) {
  if (!row) return "";
  if (key === "lineNo") return row.lineNo;
  if (key === "rate" || key === "tax_amount") return row[key];
  return row[/** @type {keyof BillTaxRow} */ (key)] ?? "";
}

/**
 * @param {BillTaxRow[]} rows
 * @param {SortSpec[]|null|undefined} specs
 * @returns {BillTaxRow[]}
 */
export function sortBillTaxRows(rows, specs) {
  const list = Array.isArray(rows) ? [...rows] : [];
  const stack = normalizeSortSpecs(specs, "lineNo");
  list.sort((a, b) => {
    for (const spec of stack) {
      const cmp = compareSortValues(taxSortValue(a, spec.key), taxSortValue(b, spec.key));
      if (cmp !== 0) return spec.asc ? cmp : -cmp;
    }
    return a.idx - b.idx;
  });
  return list;
}

/**
 * Net taxes total (Add minus Deduct) for footer under Amount.
 * Prefers ERP `total_taxes_and_charges` when present.
 * @param {object|null|undefined} doc
 * @returns {number}
 */
export function billTaxesSubtotal(doc) {
  const d = doc && typeof doc === "object" ? doc : {};
  if (d.total_taxes_and_charges != null && Number.isFinite(Number(d.total_taxes_and_charges))) {
    return Number(d.total_taxes_and_charges);
  }
  const taxes = Array.isArray(d.taxes) ? d.taxes : [];
  return taxes.reduce((s, t) => {
    const amt = Number(t && t.tax_amount);
    if (!Number.isFinite(amt)) return s;
    const deduct = t && String(t.add_deduct_tax || "").toLowerCase() === "deduct";
    return s + (deduct ? -amt : amt);
  }, 0);
}
