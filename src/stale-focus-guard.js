/**
 * Skip late async focus restore/steal when the clerk has already moved on.
 */

/**
 * @param {Element|null|undefined} active
 * @returns {boolean}
 */
function isBodyFocus(active) {
  if (!active) return true;
  return typeof document !== "undefined" && active === document.body;
}

/**
 * @param {{ field: string|null, row: string|null, scratch: string|null }|null|undefined} anchor
 * @param {Element|null|undefined} active
 * @returns {boolean}
 */
export function shouldRestoreFocusAnchor(anchor, active) {
  if (!anchor) return false;
  const hasAnchor =
    anchor.field != null || anchor.row != null || anchor.scratch != null;
  if (!hasAnchor) return false;
  if (isBodyFocus(active)) return true;
  if (!active || typeof active.getAttribute !== "function") return false;
  if (anchor.scratch === "dateExpected") {
    return active.id === "f-date-expected";
  }
  if (anchor.row != null && anchor.field) {
    return (
      active.getAttribute("data-row") === String(anchor.row) &&
      active.getAttribute("data-field") === anchor.field
    );
  }
  if (anchor.field) {
    return active.getAttribute("data-field") === anchor.field;
  }
  return false;
}

/**
 * Bill: move focus to Invoice date only while user is still on vendor/date (or body).
 * @param {Element|null|undefined} active
 * @returns {boolean}
 */
export function shouldScheduleInvoiceDateFocus(active) {
  if (isBodyFocus(active)) return true;
  if (!active || typeof active.getAttribute !== "function") return false;
  const field = active.getAttribute("data-field");
  if (!field || field === "supplier" || field === "bill_date") return true;
  return false;
}
