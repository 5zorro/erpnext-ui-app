/**
 * Taxes & Charges keyboard policy — Tab stays on the add row; table rows use arrows after click-in.
 */

export const TAX_TABLE_NAV_FIELDS = Object.freeze(["account_head", "tax_amount"]);

/**
 * The cells a row's keyboard walk visits (DF-02, 5zorro 2026-10-10): ERPNext's own rule — a
 * percentage row is typed by its Rate %, a fixed ("Actual") row by its Amount. The other number is
 * still editable with the mouse; typing a % row's Amount makes the row Actual (the bridge's
 * setTaxRow), after which Amount is its walk.
 * @param {{ charge_type?: string }|null|undefined} row
 * @returns {readonly string[]}
 */
export function taxRowNavFields(row) {
  return row && row.charge_type === "Actual" ? TAX_TABLE_NAV_FIELDS : ["account_head", "rate"];
}

/**
 * @param {string} field
 * @returns {boolean}
 */
export function isTaxTableNavField(field) {
  return TAX_TABLE_NAV_FIELDS.includes(field);
}

/**
 * A cell the arrow / Tab walk can start from: Account, or either number (position 1 — the
 * off-walk number, reached by mouse, moves on like the on-walk one).
 * @param {string} field
 * @returns {number} 0, 1, or -1 when not a walk cell
 */
export function taxNavPos(field) {
  if (field === "account_head") return 0;
  if (field === "rate" || field === "tax_amount") return 1;
  return -1;
}

/** @param {number} _ri @returns {readonly string[]} */
const staticFields = (_ri) => TAX_TABLE_NAV_FIELDS;

/**
 * @param {string} field
 * @param {number} rowIndex
 * @param {number} rowCount
 * @param {"up"|"down"|"left"|"right"} direction
 * @param {(rowIndex: number) => readonly string[]} [fieldsFor] per-row walk; default Account → Amount
 * @returns {{ rowIndex: number, field: string }|null}
 */
export function neighborTaxCell(field, rowIndex, rowCount, direction, fieldsFor = staticFields) {
  const fi = fieldsFor === staticFields ? TAX_TABLE_NAV_FIELDS.indexOf(field) : taxNavPos(field);
  if (fi < 0) return null;
  const ri = Number(rowIndex) || 0;
  const n = Math.max(0, Number(rowCount) || 0);
  if (direction === "up") {
    if (ri <= 0) return null;
    return { rowIndex: ri - 1, field: fieldsFor(ri - 1)[fi] };
  }
  if (direction === "down") {
    if (n <= 0 || ri >= n - 1) return null;
    return { rowIndex: ri + 1, field: fieldsFor(ri + 1)[fi] };
  }
  const cols = fieldsFor(ri);
  if (direction === "left") return fi > 0 ? { rowIndex: ri, field: cols[fi - 1] } : null;
  if (direction === "right") return fi < cols.length - 1 ? { rowIndex: ri, field: cols[fi + 1] } : null;
  return null;
}

export const TAX_ADD_ROW_TAB_ORDER = Object.freeze(["taxAccount", "taxAmount", "addTax"]);

/**
 * @param {"taxAccount"|"taxAmount"|"addTax"|string} current
 * @param {boolean} shiftKey
 * @returns {"taxAccount"|"taxAmount"|"addTax"|null} null = leave add row (browser Tab)
 */
export function nextTaxAddRowTabTarget(current, shiftKey) {
  const order = TAX_ADD_ROW_TAB_ORDER;
  const i = order.indexOf(current);
  if (i < 0) return null;
  if (shiftKey) return i === 0 ? null : order[i - 1];
  return i === order.length - 1 ? null : order[i + 1];
}

/**
 * Tab within the tax grid (account → number → next row…).
 * @param {string} field
 * @param {number} rowIndex
 * @param {number} rowCount
 * @param {boolean} shiftKey
 * @param {(rowIndex: number) => readonly string[]} [fieldsFor] per-row walk; default Account → Amount
 * @returns {{ rowIndex: number, field: string }|null}
 */
export function nextTaxCellTab(field, rowIndex, rowCount, shiftKey, fieldsFor = staticFields) {
  const pos = fieldsFor === staticFields ? TAX_TABLE_NAV_FIELDS.indexOf(field) : taxNavPos(field);
  if (pos < 0) return null;
  const ri = Number(rowIndex) || 0;
  const n = Math.max(0, Number(rowCount) || 0);
  if (shiftKey) {
    if (pos === 1) return { rowIndex: ri, field: fieldsFor(ri)[0] };
    return ri > 0 ? { rowIndex: ri - 1, field: fieldsFor(ri - 1)[1] } : null;
  }
  if (pos === 0) return { rowIndex: ri, field: fieldsFor(ri)[1] };
  return ri < n - 1 ? { rowIndex: ri + 1, field: fieldsFor(ri + 1)[0] } : null;
}
