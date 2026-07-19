/**
 * Bill source-flow contracts — when to open the source modal, merge rules, focus after choose.
 * Extracted so CI fails if dogfood trigger policy drifts (see bug-bounty-source-modal-vendor-pick).
 */

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
 * Product contract (approach A): open source modal on an explicit vendor *pick* event,
 * without waiting for ERP set_value / ajax quiet. Do not open on free-type blur no-ops.
 *
 * @param {{
 *   trigger: "link_pick" | "toolbar" | "blur" | "unknown",
 *   hasSupplier: boolean,
 *   editable?: boolean,
 *   modalAlreadyOpen?: boolean,
 *   setHeaderOk?: boolean | null,
 *   setHeaderSkipped?: boolean,
 * }} ctx
 * @returns {{ open: boolean, reason: string }}
 */
export function shouldOpenSourceModalAfterVendorPick(ctx) {
  const c = ctx && typeof ctx === "object" ? ctx : {};
  if (c.modalAlreadyOpen) return { open: false, reason: "modal_already_open" };
  if (c.editable === false) return { open: false, reason: "not_editable" };
  if (!c.hasSupplier) return { open: false, reason: "no_supplier" };

  if (c.trigger === "toolbar") {
    return { open: true, reason: "toolbar_select_po" };
  }
  if (c.trigger === "link_pick") {
    // UI-event first — setHeader outcome must not gate the open.
    return { open: true, reason: "vendor_link_pick" };
  }
  if (c.trigger === "blur") {
    // Free-type blur: only if a write actually happened (or skipped-but-flagged pick path).
    if (c.setHeaderOk === false) return { open: false, reason: "set_header_failed" };
    if (c.setHeaderSkipped && c.setHeaderOk !== true) {
      return { open: false, reason: "blur_noop" };
    }
    return { open: true, reason: "vendor_blur_commit" };
  }
  return { open: false, reason: "unknown_trigger" };
}

/**
 * After source choose (including NIC), focus Terms. Cancel/Esc → stay (no forced focus).
 * @param {"choose"|"cancel"|"escape"} closeKind
 * @returns {"terms"|"none"}
 */
export function focusTargetAfterSourceModal(closeKind) {
  if (closeKind === "choose") return "terms";
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
