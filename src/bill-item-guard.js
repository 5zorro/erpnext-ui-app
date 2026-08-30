/**
 * Bill / PO / IR items: always keep ≥1 row (Vanilla requires items on save).
 * × on the last row clears it instead of removing it.
 */

/**
 * @param {string} [docLabel] unused — kept for call-site compatibility
 */
export function lastItemRowToast(docLabel = "Bill") {
  void docLabel;
  return "Must have at least 1 row on the items table";
}

export const LAST_ITEM_ROW_TOAST = lastItemRowToast("Bill");

/**
 * ERP child fields blanked when × clears the sole remaining line.
 * Shared by Bill / PO / IR (extra keys no-op if absent on the doctype).
 * @type {readonly { field: string, value: string|number }[]}
 */
export const ITEM_ROW_CLEAR_FIELDS = Object.freeze([
  { field: "item_code", value: "" },
  { field: "item_name", value: "" },
  { field: "description", value: "" },
  { field: "qty", value: 0 },
  { field: "rate", value: 0 },
  { field: "amount", value: 0 },
  { field: "project", value: "" },
  { field: "sales_order", value: "" },
  { field: "purchase_order", value: "" },
  { field: "po_detail", value: "" },
  { field: "purchase_receipt", value: "" },
  { field: "pr_detail", value: "" },
  { field: "material_request", value: "" },
  { field: "schedule_date", value: "" },
]);

/**
 * @param {string|number|null|undefined} itemCode
 */
export function isEmptyItemCode(itemCode) {
  return itemCode == null || String(itemCode).trim() === "";
}

/**
 * Block × *removal* when only one row remains (clear instead — see itemRowDeleteAction).
 * @param {number} rowCount
 */
export function shouldBlockDeleteLastItemRow(rowCount) {
  return Math.max(0, Number(rowCount) || 0) <= 1;
}

/**
 * What × should do for this items table.
 * @param {number} rowCount
 * @returns {{ action: "delete"|"clear", reason?: string }}
 */
export function itemRowDeleteAction(rowCount) {
  const n = Math.max(0, Number(rowCount) || 0);
  if (n <= 1) {
    return {
      action: "clear",
      reason: LAST_ITEM_ROW_TOAST,
    };
  }
  return { action: "delete" };
}

/**
 * Drop a blank Item row after Tab/blur/dismiss — but never remove the last line.
 * @param {number} rowCount
 * @param {string|number|null|undefined} itemCode
 * @returns {{ action: "delete"|"keep"|"clear", reason?: string }}
 */
export function emptyItemRowCleanupAction(rowCount, itemCode) {
  if (!isEmptyItemCode(itemCode)) return { action: "keep" };
  const n = Math.max(0, Number(rowCount) || 0);
  if (n <= 1) {
    return {
      action: "keep",
      reason: LAST_ITEM_ROW_TOAST,
    };
  }
  return { action: "delete" };
}
