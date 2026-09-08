/**
 * Soft-peek routes for linked source documents on Bill document-information rows (OI-148 / T3).
 */

/**
 * @param {"purchase-order"|"purchase-receipt"|"purchase-invoice"|"sales-order"|string} kind
 * @param {string|null|undefined} name ERP document name
 * @returns {string|null}
 */
export function linkedSourcePeekRoute(kind, name) {
  const n = name != null ? String(name).trim() : "";
  if (!n) return null;
  const k = String(kind || "")
    .toLowerCase()
    .replace(/_/g, "-");
  if (k === "purchase-order" || k === "po") {
    return `/app/purchase-order/${encodeURIComponent(n)}`;
  }
  if (k === "purchase-receipt" || k === "pr" || k === "item-receipt") {
    return `/app/purchase-receipt/${encodeURIComponent(n)}`;
  }
  if (k === "purchase-invoice" || k === "bill") {
    return `/app/purchase-invoice/${encodeURIComponent(n)}`;
  }
  if (k === "sales-order" || k === "so") {
    return `/app/sales-order/${encodeURIComponent(n)}`;
  }
  return null;
}

/**
 * @param {string|null|undefined} route
 * @returns {boolean}
 */
export function canSoftPeekLinkedSourceRoute(route) {
  const r = route != null ? String(route).trim() : "";
  return (
    r.startsWith("/app/purchase-order/") ||
    r.startsWith("/app/purchase-receipt/") ||
    r.startsWith("/app/purchase-invoice/") ||
    r.startsWith("/app/sales-order/")
  );
}

/**
 * Clerk-facing label for peek status / button title.
 * @param {"purchase-order"|"purchase-receipt"|"purchase-invoice"|"sales-order"|string} kind
 * @returns {string}
 */
export function linkedSourcePeekKindLabel(kind) {
  const k = String(kind || "")
    .toLowerCase()
    .replace(/_/g, "-");
  if (k === "purchase-order" || k === "po") return "Purchase Order";
  if (k === "purchase-receipt" || k === "pr" || k === "item-receipt") return "Item Receipt";
  if (k === "purchase-invoice" || k === "bill") return "Bill";
  if (k === "sales-order" || k === "so") return "Sales Order";
  return "source document";
}
