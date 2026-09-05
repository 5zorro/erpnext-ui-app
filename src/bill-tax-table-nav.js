/**
 * Taxes & Charges keyboard policy — Tab stays on the add row; table rows use arrows after click-in.
 */

export const TAX_TABLE_NAV_FIELDS = Object.freeze(["account_head", "tax_amount"]);

/**
 * @param {string} field
 * @returns {boolean}
 */
export function isTaxTableNavField(field) {
  return TAX_TABLE_NAV_FIELDS.includes(field);
}

/**
 * @param {string} field
 * @param {number} rowIndex
 * @param {number} rowCount
 * @param {"up"|"down"|"left"|"right"} direction
 * @returns {{ rowIndex: number, field: string }|null}
 */
export function neighborTaxCell(field, rowIndex, rowCount, direction) {
  if (!isTaxTableNavField(field)) return null;
  const cols = TAX_TABLE_NAV_FIELDS;
  const fi = cols.indexOf(field);
  if (fi < 0) return null;
  const ri = Number(rowIndex) || 0;
  const n = Math.max(0, Number(rowCount) || 0);
  if (direction === "up") {
    if (ri <= 0) return null;
    return { rowIndex: ri - 1, field };
  }
  if (direction === "down") {
    if (n <= 0 || ri >= n - 1) return null;
    return { rowIndex: ri + 1, field };
  }
  if (direction === "left") {
    if (fi > 0) return { rowIndex: ri, field: cols[fi - 1] };
    return null;
  }
  if (direction === "right") {
    if (fi < cols.length - 1) return { rowIndex: ri, field: cols[fi + 1] };
    return null;
  }
  return null;
}

/**
 * Add-row Tab order — linear; last control exits to the next section (memo).
 */
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
 * Tab within the tax grid (account → amount → next row…).
 * @param {string} field
 * @param {number} rowIndex
 * @param {number} rowCount
 * @param {boolean} shiftKey
 * @returns {{ rowIndex: number, field: string }|null}
 */
export function nextTaxCellTab(field, rowIndex, rowCount, shiftKey) {
  if (!isTaxTableNavField(field)) return null;
  const ri = Number(rowIndex) || 0;
  const n = Math.max(0, Number(rowCount) || 0);
  if (shiftKey) {
    if (field === "tax_amount") return { rowIndex: ri, field: "account_head" };
    if (field === "account_head" && ri > 0) {
      return { rowIndex: ri - 1, field: "tax_amount" };
    }
    return null;
  }
  if (field === "account_head") return { rowIndex: ri, field: "tax_amount" };
  if (field === "tax_amount" && ri < n - 1) {
    return { rowIndex: ri + 1, field: "account_head" };
  }
  return null;
}
