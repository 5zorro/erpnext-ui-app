/**
 * Bill source-flow contracts — merge rules, focus after choose, header copy on map.
 * Vendor-pick trigger policy is shared with Item Receipt in doc-source-flow.js.
 */

export { shouldOpenSourceModalAfterVendorPick } from "./doc-source-flow.js";

/** Child/header keys never copied from mapped PO/PR → Bill (museum mergeFromSource). */
export const BILL_MERGE_SKIP_FIELDS = Object.freeze([
  "name",
  "idx",
  "docstatus",
  "parent",
  "parentfield",
  "parenttype",
  "owner",
  "creation",
  "modified",
  "modified_by",
]);

/** Header fields copied from mapped source when present. */
export const BILL_MERGE_COPY_HEADER_FIELDS = Object.freeze([
  "bill_no",
  "payment_terms_template",
  "due_date",
]);

/**
 * @param {"po"|"pr"|string|null|undefined} kind
 * @returns {string|null} frappe whitelisted method path
 */
export function mergeMethodForSourceKind(kind) {
  if (kind === "po") {
    return "erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_invoice";
  }
  if (kind === "pr") {
    return "erpnext.stock.doctype.purchase_receipt.purchase_receipt.make_purchase_invoice";
  }
  return null;
}

/**
 * After source modal closes, focus Invoice date (next field after Vendor on Bill).
 * @param {"choose"|"cancel"|"escape"|"backdrop"|string} closeKind
 * @returns {"invoice_date"|"none"}
 */
export function focusTargetAfterSourceModal(closeKind) {
  if (
    closeKind === "choose" ||
    closeKind === "cancel" ||
    closeKind === "escape" ||
    closeKind === "backdrop"
  ) {
    return "invoice_date";
  }
  return "none";
}

/**
 * Copy allowed header fields from mapped source onto a Bill-shaped target.
 * @param {object} target
 * @param {object} src
 * @returns {object} target (mutated for convenience; also returned)
 */
export function applyMappedSourceHeaders(target, src) {
  const t = target && typeof target === "object" ? target : {};
  const s = src && typeof src === "object" ? src : {};
  for (const f of BILL_MERGE_COPY_HEADER_FIELDS) {
    if (s[f] != null && s[f] !== "") t[f] = s[f];
  }
  return t;
}

/**
 * Filter one mapped item row for add_child (drop skip keys).
 * @param {object} item
 * @returns {Record<string, unknown>}
 */
export function mappedItemFieldsForBill(item) {
  const row = item && typeof item === "object" ? item : {};
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (BILL_MERGE_SKIP_FIELDS.includes(k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Vendor display vs ERP key — either match means header set is a no-op for dirty/skip.
 * @param {{ supplier?: unknown, supplier_name?: unknown }|null|undefined} doc
 * @param {unknown} next
 * @param {(a: unknown, b: unknown, opts?: object) => boolean} valuesEqual
 */
export function supplierHeaderUnchanged(doc, next, valuesEqual) {
  if (!doc || typeof valuesEqual !== "function") return false;
  if (valuesEqual(doc.supplier, next, { kind: "text" })) return true;
  if (valuesEqual(doc.supplier_name, next, { kind: "text" })) return true;
  return false;
}
