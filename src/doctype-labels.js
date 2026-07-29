/**
 * Friendly doctype labels (QB-style) — SSoT for Recent history + Find button copy.
 * Missing keys fall back to titleized slug via listLabelForDoctype / formLabelForDoctype.
 */
import { titleizeDoctype } from "./route-info.js";

export const DOCTYPE_LABELS = {
  "purchase-invoice": "Bill",
  "purchase-invoice:list": "Find Bills",
  "purchase-order": "Purchase Order",
  "purchase-order:list": "Find Purchase Orders",
  "purchase-receipt": "Item Receipt",
  "purchase-receipt:list": "Find Item Receipts",
  "sales-order": "Sales Order",
  "sales-invoice": "Sales Invoice",
  item: "Item",
  supplier: "Vendor",
  customer: "Customer",
  print: "Print preview",
};

/**
 * @param {string|null|undefined} doctypeKey e.g. purchase-order
 * @returns {string}
 */
export function normalizeDoctypeLabelKey(doctypeKey) {
  return String(doctypeKey || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
}

/**
 * @param {Record<string, string>|null|undefined} labels
 * @returns {Record<string, string>}
 */
function mergedLabels(labels) {
  return { ...DOCTYPE_LABELS, ...(labels && typeof labels === "object" ? labels : {}) };
}

/**
 * Singular form label (Recent form slot, banners).
 * @param {string|null|undefined} doctypeKey
 * @param {Record<string, string>} [labels]
 * @returns {string}
 */
export function formLabelForDoctype(doctypeKey, labels) {
  const dt = normalizeDoctypeLabelKey(doctypeKey);
  if (!dt) return "";
  const map = mergedLabels(labels);
  return map[dt] || titleizeDoctype(dt) || dt;
}

/**
 * List / Find label for Recent (no ellipsis) — never confuse PO with Item Receipt.
 * @param {string|null|undefined} doctypeKey
 * @param {Record<string, string>} [labels]
 * @returns {string}
 */
export function listLabelForDoctype(doctypeKey, labels) {
  const dt = normalizeDoctypeLabelKey(doctypeKey);
  if (!dt) return "Find Documents";
  const map = mergedLabels(labels);
  if (map[`${dt}:list`]) return map[`${dt}:list`];
  const base = formLabelForDoctype(dt, map) || "Documents";
  if (/s$/i.test(base)) return `Find ${base}`;
  return `Find ${base}s`;
}

/**
 * Toolbar Find button copy (with ellipsis).
 * @param {string|null|undefined} doctypeKey
 * @param {Record<string, string>} [labels]
 * @returns {string}
 */
export function findButtonLabel(doctypeKey, labels) {
  const dt = normalizeDoctypeLabelKey(doctypeKey);
  const list = listLabelForDoctype(dt, labels);
  if (dt === "purchase-invoice") return "Find Bill…";
  if (dt === "purchase-order") return "Find Purchase Order…";
  if (dt === "purchase-receipt") return "Find Item Receipt…";
  if (list.endsWith("…") || list.endsWith("...")) return list;
  return `${list.replace(/\.*$/, "")}…`;
}
