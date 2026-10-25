/**
 * Rounding on the calculator tape, never quietly (review 10-19 R13-1; 5zorro 2026-10-25: "i don't
 * want rounding to be quiet"). A result with more places than the box keeps is rounded once, as it
 * goes in, and the part dropped is named: "Rounds to 5.03 — remainder −5/1000".
 *
 * **Round is mathematical rounding** (add half, then drop the rest; halves away from zero), not the
 * site's Banker's Rounding (5zorro 2026-10-25). Banker's sends halves to the even digit so that
 * *many* roundings of one set (an allocation, a column of totals) do not drift up together; one
 * typed calculation has no set to balance, and the tape cannot know what the number is for (a
 * third of an asset's life may need rounding down everywhere). ERPNext stores the rounded number
 * as given: it has nothing past the box's places left to round.
 *
 * The **places** come from the site (`frappe.boot.sysdefaults`, read by main.js
 * `calc-site-rounding`): `currency_precision` (blank → the number format's decimals, 2 for
 * `#,###.##`) and `float_precision` (quantities; Frappe's fallback is 3). The remainder is reported
 * one place finer than the box: thousandths on money, ten-thousandths on quantities.
 * `roundLikeFrappe` mirrors all three of Frappe's methods; the tape uses its Commercial Rounding.
 */

export const ROUNDING_LEGACY = "Banker's Rounding (legacy)";
export const ROUNDING_BANKERS = "Banker's Rounding";
export const ROUNDING_COMMERCIAL = "Commercial Rounding";

/**
 * The clerk's rounding convention, a toggle pinned to the top of the tape (5zorro 2026-10-25):
 * Round (mathematical: add half, drop the rest), Round up (anything past the last place goes up
 * one), Round down (drop what is past the last place). All count away from / toward zero.
 */
export const CONVENTION_ROUND = "round";
export const CONVENTION_UP = "up";
export const CONVENTION_DOWN = "down";
export const ROUNDING_CONVENTIONS = Object.freeze([
  { id: CONVENTION_ROUND, label: "Round" },
  { id: CONVENTION_UP, label: "Round up" },
  { id: CONVENTION_DOWN, label: "Round down" },
]);

/** @param {unknown} v */
export function normalizeConvention(v) {
  return v === CONVENTION_UP || v === CONVENTION_DOWN ? v : CONVENTION_ROUND;
}

/** Until the site answers: Frappe's stock default method and the stock precisions. */
export const DEFAULT_SITE_ROUNDING = Object.freeze({ method: ROUNDING_LEGACY, currency: 2, float: 3 });

const METHODS = new Set([ROUNDING_LEGACY, ROUNDING_BANKERS, ROUNDING_COMMERCIAL]);

/**
 * The site's answer, checked; anything missing or odd falls back to the default.
 * @param {unknown} raw
 * @returns {{ method: string, currency: number, float: number }}
 */
export function siteRoundingFrom(raw) {
  const r = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  const digits = (v, dflt) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n <= 9 ? n : dflt;
  };
  return {
    method: METHODS.has(String(r.method)) ? String(r.method) : DEFAULT_SITE_ROUNDING.method,
    currency: digits(r.currency, DEFAULT_SITE_ROUNDING.currency),
    float: digits(r.float, DEFAULT_SITE_ROUNDING.float),
  };
}

/**
 * Frappe's `_round` (`frappe/public/js/frappe/utils/number_format.js`, v16), line for line.
 * @param {number} num
 * @param {number} precision
 * @param {string} [method]
 * @returns {number}
 */
export function roundLikeFrappe(num, precision, method = ROUNDING_LEGACY) {
  const isNegative = num < 0;
  const d = Math.trunc(Number(precision) || 0);
  if (method === ROUNDING_BANKERS) {
    if (num === 0) return 0.0;
    const multiplier = 10 ** d;
    let n = Math.abs(num) * multiplier;
    const floorNum = Math.floor(n);
    const decimalPart = n - floorNum;
    const epsilon = 2.0 ** (Math.log2(Math.abs(n)) - 52.0);
    if (Math.abs(decimalPart - 0.5) < epsilon) n = floorNum % 2 === 0 ? floorNum : floorNum + 1;
    else n = Math.round(n);
    n /= multiplier;
    return isNegative ? -n : n;
  }
  if (method === ROUNDING_COMMERCIAL) {
    if (num === 0) return 0.0;
    const multiplier = 10 ** d;
    let n = num * multiplier;
    let epsilon = 2.0 ** (Math.log2(Math.abs(n)) - 52.0);
    if (isNegative) epsilon = -1 * epsilon;
    n = Math.round(n + epsilon);
    return n / multiplier;
  }
  // Banker's Rounding (legacy), Frappe's default.
  const m = 10 ** d;
  const n = +(d ? Math.abs(num) * m : Math.abs(num)).toFixed(8); // Frappe: "Avoid rounding errors"
  const i = Math.floor(n);
  const f = n - i;
  let r = !d && f === 0.5 ? (i % 2 === 0 ? i : i + 1) : Math.round(n);
  r = d ? r / m : r;
  return isNegative ? -r : r;
}

/**
 * Round `num` to `precision` by the clerk's convention: Round is mathematical rounding (Frappe's
 * Commercial Rounding: halves away from zero, with its guard so 1.005 is a half and goes to 1.01).
 * Up / down step at the last place; `toFixed(8)` first, as Frappe does, so 0.29 × 100 = 28.999…
 * is not "past" 29.
 * @param {number} num
 * @param {{ precision: number, method?: string, convention?: string }} rounding
 * @returns {number}
 */
export function roundByConvention(num, rounding) {
  const precision = Math.trunc(Number(rounding.precision) || 0);
  const convention = normalizeConvention(rounding.convention);
  if (convention === CONVENTION_ROUND) return roundLikeFrappe(num, precision, ROUNDING_COMMERCIAL);
  const m = 10 ** precision;
  const n = +(Math.abs(num) * m).toFixed(8);
  const r = (convention === CONVENTION_UP ? Math.ceil(n) : Math.floor(n)) / m;
  return num < 0 && r !== 0 ? -r : r;
}

/**
 * The places a calculator box keeps: quantities follow `float_precision`, every other box
 * (rate, amount, amount due) is money.
 * @param {string|null|undefined} kind
 * @param {{ currency: number, float: number }} site
 */
export function calcFieldPrecision(kind, site) {
  const s = site || DEFAULT_SITE_ROUNDING;
  return kind === "qty" ? s.float : s.currency;
}

/**
 * What rounding `exact` to `precision` keeps and drops, by the clerk's convention.
 * @param {number} exact
 * @param {{ precision: number, method?: string, convention?: string }} rounding
 * @returns {{ rounded: number, remainder: number, units: number, scale: number } | null}
 *   null = nothing dropped. `remainder` = exact − rounded (negative when it rounded up); `units`
 *   is it counted in 1/`scale` (one place finer than the box), 0 when smaller than one of those.
 */
export function roundingRemainder(exact, rounding) {
  if (!Number.isFinite(exact) || !rounding) return null;
  const precision = Math.trunc(Number(rounding.precision) || 0);
  const rounded = roundByConvention(exact, { ...rounding, precision });
  const remainder = exact - rounded;
  // Float noise (0.1 + 0.2) is not a remainder: anything below a millionth of the finer unit.
  const noise = Math.max(10 ** -(precision + 7), Math.abs(exact) * 1e-12);
  if (Math.abs(remainder) <= noise) return null;
  const scale = 10 ** (precision + 1);
  // Counted at the finer place; less than one of those reads "under 1/…", never rounded up to 1.
  const finer = +(Math.abs(remainder) * scale).toFixed(6);
  const units = finer < 1 ? 0 : Math.sign(remainder) * Math.round(finer);
  return { rounded, remainder, units, scale };
}

/**
 * The yellow tape row: "Rounds to 5.02 — remainder 5/1000" (5zorro's wording, 2026-10-25).
 * @param {{ rounded: number, units: number, scale: number }} r
 * @param {number} precision
 */
export function remainderNote(r, precision) {
  const shown = r.rounded.toFixed(Math.max(0, Math.trunc(precision)));
  const part = r.units === 0 ? `under 1/${r.scale}` : `${r.units < 0 ? "−" : ""}${Math.abs(r.units)}/${r.scale}`;
  return `Rounds to ${shown} — remainder ${part}`;
}

/** @param {number} precision */
function placeName(precision) {
  if (precision === 0) return "whole number";
  if (precision === 2) return "cent";
  if (precision === 3) return "thousandth";
  return `${(10 ** -precision).toFixed(precision)}`;
}

/**
 * The ⓘ under the convention toggle: the chosen rule in plain words, at the box's own places,
 * with worked examples from the same code that rounds (so the words cannot drift from it).
 * @param {{ precision: number, method?: string, convention?: string }} rounding
 * @returns {string}
 */
export function conventionNote(rounding) {
  const p = Math.trunc(Number(rounding.precision) || 0);
  const place = placeName(p);
  const step = 10 ** -p;
  const fine = 10 ** -(p + 1);
  const x = (base, lastDigit) => +(5 + 2 * step + lastDigit * fine + base).toFixed(p + 1);
  const show = (v) => `${v.toFixed(p + 1)} → ${roundByConvention(v, { ...rounding, precision: p }).toFixed(p)}`;
  const convention = normalizeConvention(rounding.convention);
  if (convention === CONVENTION_UP) {
    return `Round up: anything past the ${place} goes up to the next ${place}. ${show(x(0, 1))}, ${show(x(0, 9))}.`;
  }
  if (convention === CONVENTION_DOWN) {
    return `Round down: everything past the ${place} is dropped. ${show(x(0, 1))}, ${show(x(0, 9))}.`;
  }
  return `Round: add half a ${place}, then drop everything past the ${place}. ${show(x(0, 4))}, ${show(x(0, 5))}.`;
}
