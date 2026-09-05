/**
 * Bill snapshot enrich pending flags — linked PO logbook / IR refs / line meta.
 */

import {
  uniqueLinkedPurchaseOrderNames,
  uniqueLinkedPurchaseReceiptNames,
} from "./bill-map.js";

export const LINKED_SOURCE_LOADING_PLACEHOLDER = "Still loading…";

/**
 * @typedef {{ linkedPos?: boolean, linkedReceipts?: boolean, lineContext?: boolean }} BillEnrichPending
 */

/**
 * @param {object|null|undefined} doc
 * @returns {BillEnrichPending}
 */
export function defaultEnrichPendingForDoc(doc) {
  const poNames = uniqueLinkedPurchaseOrderNames(doc);
  const prNames = uniqueLinkedPurchaseReceiptNames(doc);
  const items = doc && Array.isArray(doc.items) ? doc.items : [];
  const needsLine =
    items.some((it) => {
      if (!it) return false;
      return (
        (it.purchase_order && String(it.purchase_order).trim()) ||
        (it.purchase_receipt && String(it.purchase_receipt).trim()) ||
        (it.po_detail && String(it.po_detail).trim()) ||
        (it.pr_detail && String(it.pr_detail).trim())
      );
    }) || false;
  return {
    linkedPos: poNames.length > 0,
    linkedReceipts: prNames.length > 0,
    lineContext: needsLine,
  };
}

/**
 * @param {BillEnrichPending|null|undefined} pending
 * @returns {boolean}
 */
export function billEnrichStillPending(pending) {
  if (!pending || typeof pending !== "object") return false;
  return !!(pending.linkedPos || pending.linkedReceipts || pending.lineContext);
}

/**
 * Merge completed enrich slices into pending flags.
 * @param {BillEnrichPending|null|undefined} pending
 * @param {{
 *   linkedPos?: unknown,
 *   linkedReceipts?: unknown,
 *   poLineMeta?: unknown,
 *   lineAllocations?: unknown,
 * }} result
 * @returns {BillEnrichPending}
 */
export function nextEnrichPending(pending, result) {
  const base = pending && typeof pending === "object" ? { ...pending } : {};
  if (base.linkedPos && Array.isArray(result.linkedPos)) {
    base.linkedPos = false;
  }
  if (base.linkedReceipts && Array.isArray(result.linkedReceipts)) {
    base.linkedReceipts = false;
  }
  if (
    base.lineContext &&
    result.poLineMeta &&
    typeof result.poLineMeta === "object" &&
    result.lineAllocations &&
    typeof result.lineAllocations === "object"
  ) {
    base.lineContext = false;
  }
  return base;
}
