/**
 * Pure money helpers for the Doc Workflow shell.
 * No ERPNext imports — unit-testable offline (ADR-0002: unit tests first).
 */
import { evaluateTypedSum } from "./calc/field-calc.js";
import { DEFAULT_SITE_ROUNDING, roundByConvention, roundingRemainder, remainderNote } from "./calc/site-rounding.js";

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
 * A money box's text as an amount: a plain number, or a sum typed in it (`169.00*1.0845`), worked out
 * with the calculator's math (5zorro 2026-10-11 — the taxes Add box) and rounded by the tape's
 * convention to the box's places — plus what rounding dropped, so it can be said (R13-1: never
 * quietly): `remainder` is "Rounds to 183.28 — remainder under 1/1000"-style text, "" when nothing was.
 * @param {unknown} value
 * @param {{ precision: number, method?: string }} [rounding]
 * @returns {{ amount: number|null, remainder: string }}
 */
export function moneyOrSum(value, rounding = { precision: DEFAULT_SITE_ROUNDING.currency, method: DEFAULT_SITE_ROUNDING.method }) {
  let exact = typeof value === "string" ? evaluateTypedSum(value) : null;
  if (exact == null) {
    // An unfinished sum (`5*`) is not 5: parseMoney would drop the operator and read the digits.
    if (typeof value === "string" && (/[+*/]/.test(value) || /[0-9.]\s*-/.test(value))) return { amount: null, remainder: "" };
    exact = parseMoney(value);
  }
  if (exact == null) return { amount: null, remainder: "" };
  const dropped = roundingRemainder(exact, rounding);
  return {
    amount: roundByConvention(exact, rounding),
    remainder: dropped ? remainderNote(dropped, rounding.precision) : "",
  };
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
 * Signed USD for chip deltas: `+$10.00` / `−$10.00` with underlined cents.
 * @param {unknown} value
 * @returns {string} HTML or plain em-dash
 */
export function formatSignedUsdHtml(value) {
  if (value == null || value === "" || value === "—") return "—";
  const raw = String(value).trim();
  const sign = raw.startsWith("+") ? "+" : raw.startsWith("−") || raw.startsWith("-") ? "−" : "";
  const n = parseMoney(raw);
  if (n == null) return escapeMoneyHtml(raw);
  const abs = Math.abs(n);
  const html = formatUsdAmountHtml(abs);
  return sign ? `${sign}${html}` : html;
}

/**
 * Plain text with every `$#,###.##` amount inside it given the same underlined-cents treatment as
 * `formatUsdAmountHtml` — for sentences that carry amounts inline (a batching rationale, an audit
 * step, an advisory). Everything else in the text is escaped, so the result is safe for innerHTML.
 * A number that is not a two-decimal dollar amount (`9%`, `3/365`, a date) is left alone.
 * @param {unknown} text
 * @returns {string} safe HTML
 */
export function moneyTextHtml(text) {
  if (text == null) return "";
  return escapeMoneyHtml(text).replace(
    /(-?\$)(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})(?!\d)/g,
    (_, prefix, intPart, cents) => `${prefix}${intPart}.<span class="money-cents">${cents}</span>`,
  );
}

/**
 * @param {unknown} s
 */
function escapeMoneyHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
