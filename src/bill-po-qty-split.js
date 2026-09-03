/**
 * OI-151 P3 — split Bill qty over PO/PR line allowance into sourced cap + NIC excess row.
 * Pure logic; ERP fetch lives in electron/main.js (bill-po-hydrate indexPoLineMeta).
 */

const QTY_EPS = 1e-9;

/**
 * @param {object|null|undefined} row
 */
export function billRowHasSource(row) {
  const r = row && typeof row === "object" ? row : null;
  if (!r) return false;
  return (
    (r.po_detail != null && String(r.po_detail).trim() !== "") ||
    (r.purchase_order != null && String(r.purchase_order).trim() !== "") ||
    (r.pr_detail != null && String(r.pr_detail).trim() !== "") ||
    (r.purchase_receipt != null && String(r.purchase_receipt).trim() !== "")
  );
}

export const OVERBILL_CAP_CACHE_BLOCKER =
  "PO/PR line limit still loading — wait for source columns to finish, then retry Save.";

/**
 * Save/split blockers when sourced rows lack cached maxBillableQty (OI-151).
 * @param {object[]|null|undefined} items
 * @param {(rowIndex: number) => number|null|undefined} capForRow
 * @returns {string[]}
 */
export function listOverbillCapCacheBlockers(items, capForRow) {
  const rows = Array.isArray(items) ? items : [];
  const capFn = typeof capForRow === "function" ? capForRow : () => null;
  for (let ri = 0; ri < rows.length; ri += 1) {
    const row = rows[ri];
    if (!billRowHasSource(row)) continue;
    if (capFn(ri) == null) return [OVERBILL_CAP_CACHE_BLOCKER];
  }
  return [];
}

/**
 * ERP over-billing validation (save or setRow).
 * @param {unknown} text
 */
export function isOverBillingError(text) {
  const s = String(text || "");
  return (
    /over limit by/i.test(s) ||
    /over billing allowance/i.test(s) ||
    /\bover limit\b/i.test(s)
  );
}

/**
 * @param {{ reason?: unknown, blockers?: unknown[] }|null|undefined} payload
 */
export function saveFailureIsOverBilling(payload) {
  if (!payload) return false;
  const parts = [];
  if (payload.reason != null) parts.push(String(payload.reason));
  if (Array.isArray(payload.blockers)) parts.push(...payload.blockers.map(String));
  return parts.some(isOverBillingError);
}

/**
 * Clerk-facing ERP text on Bill skin (Vanilla says "document" / "Purchase Invoice").
 * @param {unknown} text
 */
export function humanizeBillErpMessage(text) {
  return String(text || "")
    .replace(
      /Are you making another Purchase Invoice against the same Purchase Order Item\?/gi,
      "Qty exceeds the PO line — split excess to a NIC row (no PO link) for approval.",
    )
    .replace(/\bThis document\b/gi, "This bill")
    .replace(/\bPurchase Invoice\b/g, "Bill")
    .replace(
      /To allow over billing, update "Over Billing Allowance" in Accounts Settings or the Item\./gi,
      "",
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * @param {unknown} v
 * @returns {number|null}
 */
function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Max billable qty from a PO Item or PR Item row (qty / amount − billed_amt).
 * @param {{ qty?: unknown, rate?: unknown, amount?: unknown, billed_amt?: unknown }|null|undefined} lineItem
 * @returns {number|null}
 */
export function maxBillableQtyForSourceItem(lineItem) {
  if (!lineItem || typeof lineItem !== "object") return null;
  const qty = numOrNull(lineItem.qty);
  const rate = numOrNull(lineItem.rate);
  const amount = numOrNull(lineItem.amount);
  const billedAmt = numOrNull(lineItem.billed_amt) ?? 0;
  if (rate != null && rate > 0) {
    const capAmt = amount != null ? amount : qty != null ? qty * rate : null;
    if (capAmt != null) {
      const remainAmt = Math.max(0, capAmt - billedAmt);
      const fromAmt = remainAmt / rate;
      if (qty != null) {
        const billedQty = billedAmt / rate;
        const fromQty = Math.max(0, qty - billedQty);
        return Math.min(fromAmt, fromQty);
      }
      return fromAmt;
    }
  }
  if (qty != null) return Math.max(0, qty);
  return null;
}

/** @param {number} n */
export function formatQtyForErp(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "";
  const s = x.toFixed(6).replace(/\.?0+$/, "");
  return s || "0";
}

/**
 * @param {number} excessQty
 */
export function overlimitNicDescription(excessQty) {
  const q = formatQtyForErp(excessQty);
  return `Over-PO qty (+${q}) — approval required`;
}

/**
 * @param {object|null|undefined} itemRow
 * @param {number|null|undefined} maxBillableQty
 * @param {string|number|null|undefined} enteredQty
 * @returns {
 *   | { action: "noop" }
 *   | { action: "blocked"; reason: string }
 *   | {
 *       action: "split";
 *       sourcedQty: number;
 *       excessQty: number;
 *       itemCode: string;
 *       rate: string|number|null|undefined;
 *       uom: string|number|null|undefined;
 *       excessDescription: string;
 *     }
 * }
 */
export function planBillLineQtySplit(itemRow, maxBillableQty, enteredQty) {
  const row = itemRow && typeof itemRow === "object" ? itemRow : null;
  if (!row) return { action: "noop" };
  if (!billRowHasSource(row)) return { action: "noop" };
  if (maxBillableQty == null) return { action: "noop" };

  const qty = Number(enteredQty);
  if (!Number.isFinite(qty) || qty <= 0) return { action: "noop" };

  const cap = Number(maxBillableQty);
  if (!Number.isFinite(cap) || cap < 0) return { action: "noop" };
  if (qty <= cap + QTY_EPS) return { action: "noop" };

  const sourcedQty = cap;
  const excessQty = qty - cap;
  if (excessQty <= QTY_EPS) return { action: "noop" };

  if (sourcedQty <= QTY_EPS) {
    return {
      action: "blocked",
      reason:
        "PO/PR line is already fully billed — add a NIC row (Add line) for extra qty.",
    };
  }

  return {
    action: "split",
    sourcedQty,
    excessQty,
    itemCode: row.item_code != null ? String(row.item_code).trim() : "",
    rate: row.rate,
    uom: row.uom,
    excessDescription: overlimitNicDescription(excessQty),
  };
}
