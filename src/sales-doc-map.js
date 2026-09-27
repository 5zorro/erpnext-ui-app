/**
 * A/R Doc skins (plan 2026-09-26, stage A1) — the readers the four A/R layouts share.
 *
 * Bill, PO and Item Receipt each carry a hand-written `read…Header` / `read…ItemRows`. The A/R
 * layouts are declared as data instead (estimate-map.js, sales-order-map.js, sales-invoice-map.js,
 * receive-payment-map.js) and read by these two functions, so adding a column is one line in the
 * layout, not a matching edit in a reader.
 *
 * Header meta is the PO shape (`label`, `field`, `display`, `column`, `readOnly`, …).
 * Line column meta adds:
 *   - `display`: read this field instead of `field` (a read-only column, e.g. delivered_qty)
 *   - `percent`: show as "40%"
 *   - `field: "__line_no"`: ERPNext's row number
 */

import { stripHtml, sumBillLineAmount, sumBillLineQty, formatBillLineTotal } from "./bill-map.js";
import { formatAddressDisplay } from "./address-format.js";
import { formatDocLineNumber } from "./doc-item-sort.js";

/**
 * @typedef {{
 *   label: string,
 *   field: string|null,
 *   type?: "text"|"date"|"textarea"|"number",
 *   linkDoctype?: string,
 *   display?: string,
 *   column?: "left"|"right"|"addresses",
 *   readOnly?: boolean,
 *   multiline?: boolean,
 *   validationHint?: string,
 * }} SalesHeaderMeta
 *
 * @typedef {{
 *   label: string,
 *   field: string|null,
 *   display?: string,
 *   displayOnly?: boolean,
 *   readOnly?: boolean,
 *   type?: "date",
 *   linkDoctype?: string,
 *   sortKey?: string,
 *   percent?: boolean,
 *   money?: boolean,
 * }} SalesLineCol
 *
 * @typedef {{ label: string, field: string, percent?: boolean }} SalesProgressMeta
 */

/**
 * `"customer_name|customer"` → the first alternative with a value.
 * @param {object} doc
 * @param {string} spec
 * @returns {string|number}
 */
function firstPresent(doc, spec) {
  for (const key of String(spec).split("|")) {
    const v = doc[key];
    if (v != null && v !== "") return v;
  }
  return "";
}

/**
 * @param {SalesHeaderMeta[]} fields
 * @param {object|null|undefined} doc
 * @returns {Record<string, string|number>} keyed by label, like readPoHeader
 */
export function readSalesHeader(fields, doc) {
  const d = doc && typeof doc === "object" ? doc : {};
  /** @type {Record<string, string|number>} */
  const out = {};
  for (const meta of fields) {
    const spec = meta.display || meta.field;
    if (!spec) {
      out[meta.label] = "";
      continue;
    }
    const v = firstPresent(d, spec);
    out[meta.label] = meta.multiline ? formatAddressDisplay(String(v || "")) : v;
  }
  return out;
}

/**
 * @param {SalesLineCol} col
 * @param {object} row
 * @param {number} ri
 * @returns {string|number}
 */
function readCell(col, row, ri) {
  if (col.field === "__line_no") return formatDocLineNumber(ri, row);
  const key = col.display || col.field;
  if (!key) return "";
  const v = row[key];
  if (v == null) return "";
  if (col.percent) {
    const n = Number(v);
    return Number.isFinite(n) ? `${Math.round(n)}%` : "";
  }
  if (key === "description") return stripHtml(v);
  return v;
}

/**
 * @param {SalesLineCol[]} cols
 * @param {object|null|undefined} doc
 * @param {string} [table="items"]
 * @returns {Array<Array<string|number>>}
 */
export function readSalesLineRows(cols, doc, table = "items") {
  const rows = doc && Array.isArray(doc[table]) ? doc[table] : [];
  return rows.map((it, ri) => cols.map((col) => readCell(col, it || {}, ri)));
}

/**
 * The Sales Order's progress strip: ERPNext's own running figures, read-only.
 * @param {SalesProgressMeta[]|null|undefined} spec
 * @param {object|null|undefined} doc
 * @returns {Array<{ label: string, field: string, value: string }>}
 */
export function salesProgressCells(spec, doc) {
  if (!Array.isArray(spec) || !doc || typeof doc !== "object") return [];
  return spec.map((m) => {
    const v = /** @type {Record<string, unknown>} */ (doc)[m.field];
    let value = v == null ? "" : String(v);
    if (m.percent) {
      const n = Number(v);
      value = `${Number.isFinite(n) ? Math.round(n) : 0}%`;
    }
    return { label: m.label, field: m.field, value };
  });
}

/**
 * Fields a clerk may type into on a line — everything with a real `field` that is not
 * read-only / display-only.
 * @param {SalesLineCol[]} cols
 * @returns {string[]}
 */
export function editableLineFields(cols) {
  return cols
    .filter((c) => typeof c.field === "string" && c.field && !c.field.startsWith("__"))
    .filter((c) => !c.readOnly && !c.displayOnly && !c.display)
    .map((c) => /** @type {string} */ (c.field));
}

/**
 * @param {object|null|undefined} doc
 * @returns {boolean}
 */
export function isDraftSalesDoc(doc) {
  if (!doc || typeof doc !== "object") return true;
  const ds = doc.docstatus;
  return ds == null || Number(ds) === 0;
}

/**
 * Map helpers the Doc form page asks for (doc-form-page.js `mapHelpers()`), built from a layout.
 * @param {{ headerFields: SalesHeaderMeta[], itemCols: SalesLineCol[], linesTable?: string }} layout
 */
export function salesMapHelpers(layout) {
  const table = layout.linesTable || "items";
  const editable = editableLineFields(layout.itemCols);
  return {
    readHeader: (/** @type {object} */ doc) => readSalesHeader(layout.headerFields, doc),
    readItemRows: (/** @type {object} */ doc) => readSalesLineRows(layout.itemCols, doc, table),
    sumQty: sumBillLineQty,
    sumAmt: sumBillLineAmount,
    formatTotal: formatBillLineTotal,
    isDraft: isDraftSalesDoc,
    isEditableItemField: (/** @type {string} */ field) => editable.includes(field),
  };
}
