/**
 * Cost-model prefs for `payment-batch-economics.js` (OI-161 Packet 3).
 *
 * apr, postage, perCheck, and groupWindowDays are company/user judgment calls, not ERP truth —
 * they don't exist as fields anywhere in ERPNext (confirmed in Packet 0). Stored the same way
 * other shell-only prefs live today (userData JSON, not a new ERP doctype — Clean Core stays
 * intact since nothing is written to ERP). Electron read/write wiring lands with Packet 4, same
 * as Packet 1's IPC layer.
 */

/**
 * @typedef {{
 *   apr: number,
 *   postage: number,
 *   perCheck: number,
 *   groupWindowDays: number,
 *   methodFees?: Record<string, number>,
 * }} PaymentBatchPrefs
 *
 * `methodFees` is an optional per-`Mode of Payment` override map layered over
 * `DEFAULT_PAYMENT_METHOD_FEES`. It is not one of `FIELDS`, so `mergePaymentBatchPrefs` neither
 * defaults nor validates it — `paymentMethodFee` validates each entry at read time instead, which
 * keeps one bad method fee from discarding the whole prefs object.
 */

export const DEFAULT_PAYMENT_BATCH_PREFS = Object.freeze({
  apr: 0.09,
  postage: 0.78,
  perCheck: 0.05,
  groupWindowDays: 7,
});

const FIELDS = /** @type {const} */ (["apr", "postage", "perCheck", "groupWindowDays"]);

/**
 * What one payment costs to send, by `Mode of Payment` (Packet B2a).
 *
 * Real figures from 5zorro (2026-09-08). These are **company facts, not ERP truth**: the
 * `Mode of Payment` doctype holds only `mode_of_payment`, `type`, `accounts` and `enabled` — there
 * is nowhere in ERPNext to record what a wire costs, so this lives in `userData` prefs alongside
 * the APR (same Clean Core reasoning as the rest of this module).
 *
 * `USPS_Check` is deliberately **absent** from this table: its fee stays derived from the existing
 * `postage` + `perCheck` prefs so the two panel inputs 5zorro already tunes keep working, and no
 * migration is needed. `paymentMethodFee` resolves it.
 *
 * 🔴 `transitDays` / `clearDays` are **not here yet, on purpose.** They decide *when* a payment is
 * released and how much float survives it, and 5zorro has not given the numbers. A guess would be a
 * wrong date on screen, not a placeholder — see the plan's B2a.
 */
export const DEFAULT_PAYMENT_METHOD_FEES = Object.freeze({
  ACH: 0.4,
  DOM_WIRE: 25,
  // $25 push + $25 international intermediary. Flat by decision — 5zorro is not modelling
  // intermediary count, so this is one number and not a per-hop multiplier.
  INT_WIRE: 50,
});

/** The Mode of Payment whose fee is composed from the `postage` + `perCheck` prefs. */
export const CHEQUE_METHOD = "USPS_Check";

/**
 * The fee for one payment sent by `method`.
 *
 * This is the function `pay-outstanding.src.html` should call instead of computing
 * `prefs.postage + prefs.perCheck` inline — that composition was business logic sitting in the
 * view, where a second surface could disagree with it.
 *
 * An unknown or missing method falls back to the cheque fee. That is the conservative choice
 * rather than `0`: a bill whose `mode_of_payment` is NULL (every row in the sandbox today) is far
 * more likely to be paid by cheque than to be free, and a zero fee would make the batching engine
 * claim savings that do not exist.
 *
 * @param {PaymentBatchPrefs} prefs
 * @param {string|null|undefined} method a `Mode of Payment` name
 * @returns {number} dollars
 */
export function paymentMethodFee(prefs, method) {
  const p = mergePaymentBatchPrefs(prefs);
  const chequeFee = round2(p.postage + p.perCheck);
  const key = method == null ? "" : String(method).trim();
  if (!key || key === CHEQUE_METHOD) return chequeFee;

  const overrides = prefs && typeof prefs === "object" ? prefs.methodFees : null;
  if (overrides && typeof overrides === "object") {
    const v = /** @type {Record<string, unknown>} */ (overrides)[key];
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return round2(n);
  }

  const known = DEFAULT_PAYMENT_METHOD_FEES[/** @type {keyof typeof DEFAULT_PAYMENT_METHOD_FEES} */ (key)];
  return Number.isFinite(known) ? known : chequeFee;
}

/**
 * A `(method) => fee` resolver bound to one prefs object — the shape `paymentBatchEconomics` takes
 * so it can price each method partition without importing prefs itself (pure module, no config).
 *
 * @param {PaymentBatchPrefs} prefs
 * @returns {(method: string|null|undefined) => number}
 */
export function paymentMethodFeeResolver(prefs) {
  return (method) => paymentMethodFee(prefs, method);
}

/** @param {number} x */
function round2(x) {
  return Math.round(x * 100) / 100;
}

/**
 * @param {unknown} prefs
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validatePaymentBatchPrefs(prefs) {
  if (!prefs || typeof prefs !== "object") {
    return { ok: false, errors: ["prefs must be an object"] };
  }
  const p = /** @type {Record<string, unknown>} */ (prefs);
  const errors = [];
  for (const field of FIELDS) {
    const v = p[field];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      errors.push(`${field} must be a finite number`);
    } else if (v < 0) {
      errors.push(`${field} must not be negative`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Raw/partial overrides merged onto defaults — always yields a complete, valid
 * `PaymentBatchPrefs`. Each field is checked independently: a missing or invalid field falls back
 * to its own default rather than discarding the whole object over one bad value.
 * @param {unknown} raw
 * @returns {PaymentBatchPrefs}
 */
export function mergePaymentBatchPrefs(raw) {
  const merged = { ...DEFAULT_PAYMENT_BATCH_PREFS };
  if (!raw || typeof raw !== "object") return merged;
  const o = /** @type {Record<string, unknown>} */ (raw);
  for (const field of FIELDS) {
    const v = o[field];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
      merged[field] = v;
    }
  }
  return merged;
}
