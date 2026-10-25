/**
 * Preserve keyboard focus across async Bill paint() — avoids late refresh yanking
 * focus back to Payment terms (or other header fields) after the user has moved on.
 */

/** @typedef {{ element: Element|null, field: string|null, row?: string|null }} BillFocusCapture */

/**
 * @param {Element|null|undefined} el
 * @returns {boolean}
 */
export function isBillFormFocusTarget(el) {
  if (!el || typeof el !== "object") return false;
  const node = /** @type {Element} */ (el);
  if (!node.getAttribute) return false;
  const field = node.getAttribute("data-field");
  if (field) return true;
  if (node.id === "f-memo" || node.id === "f-amountdue") return true;
  if (node.closest && node.closest("#items-body, #taxes-body, .link-dd button")) return true;
  return false;
}

/**
 * @returns {BillFocusCapture}
 */
export function captureBillFocus() {
  if (typeof document === "undefined") {
    return { element: null, field: null };
  }
  const active = document.activeElement;
  if (!isBillFormFocusTarget(active)) {
    return { element: null, field: null };
  }
  const field =
    active && /** @type {Element} */ (active).getAttribute
      ? /** @type {Element} */ (active).getAttribute("data-field")
      : null;
  const row =
    active && /** @type {Element} */ (active).getAttribute
      ? /** @type {Element} */ (active).getAttribute("data-row")
      : null;
  return { element: active, field: field != null ? String(field) : null, row: row != null ? String(row) : null };
}

/**
 * @param {BillFocusCapture|Element|null|undefined} saved
 * @param {{ allowFocusVendor?: boolean, skipRestore?: boolean }} [opts]
 */
export function restoreBillFocus(saved, opts = {}) {
  if (opts.skipRestore || opts.allowFocusVendor) return;
  const cap =
    saved && typeof saved === "object" && "element" in saved
      ? /** @type {BillFocusCapture} */ (saved)
      : { element: saved || null, field: null };
  let el = cap.element;
  if (!el || typeof el.focus !== "function") return;
  if (typeof document !== "undefined" && !document.contains(el)) {
    // The repaint rebuilt that line: the same row and field, as a new element (5zorro 2026-10-11 —
    // a click into a line while a new bill loaded was dropped by the next repaint).
    if (!cap.field || cap.row == null) return;
    const again = document.querySelector(`[data-row="${cap.row}"][data-field="${cap.field}"]`);
    if (!again) return;
    el = again;
  }
  if (!isBillFormFocusTarget(el)) return;
  try {
    el.focus({ preventScroll: true });
  } catch {
    try {
      el.focus();
    } catch {
      /* ignore */
    }
  }
}
