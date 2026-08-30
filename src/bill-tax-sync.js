/**
 * Bill tax row amount ↔ rate helpers (Taxes and Charges grid).
 * Base for implied % is ERP net_total when present, else item line subtotal.
 */

import { sumBillLineAmount } from "./bill-map.js";

/**
 * @param {object|null|undefined} doc
 * @returns {number}
 */
export function taxRateBaseFromDoc(doc) {
  const net = Number(doc && doc.net_total);
  if (Number.isFinite(net) && net > 0) return net;
  const lines = sumBillLineAmount(doc);
  return Number.isFinite(lines) && lines > 0 ? lines : 0;
}

/**
 * Implied rate % from amount ÷ base (2 dp).
 * @param {number|string|null|undefined} taxAmount
 * @param {number} base
 * @returns {number|null}
 */
export function impliedTaxRateFromAmount(taxAmount, base) {
  const amt = Number(taxAmount);
  const b = Number(base);
  if (!Number.isFinite(amt) || !Number.isFinite(b) || b <= 0) return null;
  return Math.round((amt / b) * 10000) / 100;
}

/**
 * Tax amount from rate % × base (2 dp money).
 * @param {number|string|null|undefined} ratePercent
 * @param {number} base
 * @returns {number|null}
 */
export function taxAmountFromRate(ratePercent, base) {
  const r = Number(ratePercent);
  const b = Number(base);
  if (!Number.isFinite(r) || !Number.isFinite(b) || b <= 0) return null;
  return Math.round((r / 100) * b * 100) / 100;
}

/**
 * Rate % shown in the grid — for Actual rows, derive from amount ÷ base
 * so clerks see implied % without writing rate back to ERP (which would
 * recalculate amount from % on percentage charge types).
 * @param {{ charge_type?: string, rate?: unknown, tax_amount?: unknown }} row
 * @param {object|null|undefined} doc
 * @returns {number|string}
 */
export function displayTaxRateForRow(row, doc) {
  if (!row) return "";
  const ct = String(row.charge_type || "");
  const amt = Number(row.tax_amount);
  if (ct === "Actual" && Number.isFinite(amt) && amt !== 0) {
    const implied = impliedTaxRateFromAmount(amt, taxRateBaseFromDoc(doc));
    if (implied != null) return implied;
  }
  return row.rate != null && row.rate !== "" ? row.rate : "";
}
