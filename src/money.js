/**
 * Pure money helpers for the Doc Workflow shell.
 * No ERPNext imports — unit-testable offline (ADR-0002: unit tests first).
 */

/**
 * Round a dollar amount to the nearest nickel (5 cents).
 * Used later for OI-042 experiments; stub proves CI without a live server.
 * @param {number} amount
 * @returns {number}
 */
export function roundToNickel(amount) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    throw new TypeError("roundToNickel: amount must be a finite number");
  }
  return Math.round(amount * 20) / 20;
}

/**
 * Parse user/ERP money text → number (null if blank / not a number).
 * @param {unknown} value
 * @returns {number|null}
 */
export function parseMoney(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const n = Number(String(value).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Cost / qty-style: `#,##0.00` (no currency symbol).
 * @param {unknown} value
 * @param {{ decimals?: number, empty?: string }} [opts]
 * @returns {string}
 */
export function formatGroupedNumber(value, opts = {}) {
  const empty = opts.empty ?? "";
  const decimals = opts.decimals ?? 2;
  const n = parseMoney(value);
  if (n == null) return empty;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true,
  }).format(n);
}

/**
 * Full USD string: `$1,234.56` (museum fmtUsd).
 * @param {unknown} value
 * @returns {string}
 */
export function formatUsdAmount(value) {
  const n = parseMoney(value);
  if (n == null) return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

/**
 * Split for UI: dollars + underlined cents — `$#,###.__`
 * @param {unknown} value
 * @returns {{ empty: true } | { empty: false, prefix: string, intPart: string, cents: string, plain: string }}
 */
export function splitUsdDisplay(value) {
  const n = parseMoney(value);
  if (n == null) return { empty: true };
  const plain = formatUsdAmount(n);
  // plain is like "$1,234.56" or "-$1,234.56"
  const m = plain.match(/^(-?\$)(.+)\.(\d{2})$/);
  if (!m) {
    return { empty: false, prefix: "", intPart: plain, cents: "", plain };
  }
  return {
    empty: false,
    prefix: m[1],
    intPart: m[2],
    cents: m[3],
    plain,
  };
}

/**
 * Safe HTML fragment for Amount cells (caller must not double-escape).
 * Cents wrapped in `<span class="money-cents">` for underline styling.
 * @param {unknown} value
 * @returns {string}
 */
export function formatUsdAmountHtml(value) {
  const parts = splitUsdDisplay(value);
  if (parts.empty) return "";
  if (!parts.cents) {
    return escapeMoneyHtml(parts.plain);
  }
  return `${escapeMoneyHtml(parts.prefix)}${escapeMoneyHtml(parts.intPart)}.<span class="money-cents">${escapeMoneyHtml(parts.cents)}</span>`;
}

/**
 * @param {string} s
 */
function escapeMoneyHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
