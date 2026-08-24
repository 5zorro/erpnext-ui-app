/**
 * Bill / PO / IR items: always keep ≥1 row (Vanilla requires items on save).
 */

/**
 * @param {string|number|null|undefined} itemCode
 */
export function isEmptyItemCode(itemCode) {
  return itemCode == null || String(itemCode).trim() === "";
}

/**
 * Block × on the sole remaining line.
 * @param {number} rowCount
 */
export function shouldBlockDeleteLastItemRow(rowCount) {
  return Math.max(0, Number(rowCount) || 0) <= 1;
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
      reason: "Must have at least one item on every document",
    };
  }
  return { action: "delete" };
}

/**
 * @param {string} [docLabel]
 */
export function lastItemRowToast(docLabel = "Bill") {
  return `Must have at least one item on every saved ${docLabel}`;
}

export const LAST_ITEM_ROW_TOAST = lastItemRowToast("Bill");
