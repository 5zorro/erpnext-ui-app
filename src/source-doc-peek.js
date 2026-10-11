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
  // The Bill's Applied payments rows (5zorro 2026-09-30): reach a draft payment to submit or delete it.
  if (k === "payment-entry" || k === "pe") {
    return `/app/payment-entry/${encodeURIComponent(n)}`;
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
    r.startsWith("/app/sales-order/") ||
    r.startsWith("/app/payment-entry/")
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
  if (k === "payment-entry" || k === "pe") return "Payment";
  return "source document";
}

/**
 * The peeks a Bill line's Sales order(s) cell offers (5zorro 2026-10-11): each Sales Order, then the
 * Purchase Order the link lives on — a sourced PO, or the just-in-time bridge PO "Assign…" made.
 * The Bill line has no Sales Order field of its own, so changing the link is a PO errand (draft:
 * edit it; submitted: void & amend), which is why the PO sits beside the Sales Order.
 * @param {{ salesOrders?: string[], bridgePo?: string }|null|undefined} alloc
 * @param {{ purchase_order?: string }|null|undefined} item
 * @returns {{ kind: "sales-order"|"purchase-order", name: string, route: string }[]}
 */
export function billLineOrderPeeks(alloc, item) {
  const a = alloc || {};
  /** @type {{ kind: "sales-order"|"purchase-order", name: string, route: string }[]} */
  const out = [];
  const seen = new Set();
  for (const so of Array.isArray(a.salesOrders) ? a.salesOrders : []) {
    const name = String(so || "").trim();
    if (!name || seen.has(`so:${name}`)) continue;
    seen.add(`so:${name}`);
    out.push({ kind: "sales-order", name, route: /** @type {string} */ (linkedSourcePeekRoute("sales-order", name)) });
  }
  const po = String((item && item.purchase_order) || a.bridgePo || "").trim();
  if (po) out.push({ kind: "purchase-order", name: po, route: /** @type {string} */ (linkedSourcePeekRoute("purchase-order", po)) });
  return out;
}

