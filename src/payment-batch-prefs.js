/**
 * Cost-model prefs for `payment-batch-economics.js` (OI-161 Packet 3).
 *
 * apr, postage and perCheck are company/user judgment calls, not ERP truth —
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
 *   runIntervalDays: number,   // C8: days between check runs; 0 leaves the cutoff off
 *   nextRunDate: string,       // C8: "YYYY-MM-DD", or "" when no run has been set
 *   runEarlyOn: string,        // C8: the day "Do this run today" was pressed; ignored on any other day
 *   methodFees?: Record<string, number>,
 * }} PaymentBatchPrefs
 *
 * The three C8 fields are optional in `validatePaymentBatchPrefs` and defaulted by the merge, so a
 * prefs file written before the cutoff existed still loads as "no check run set".
 *
 * `groupWindowDays` was retired 2026-09-12: it bounded a greedy clustering pass, not a business
 * judgment, and the exact grouping in `payment-batch-economics.js` needs no bound. A prefs file saved
 * before then still carries it; `mergePaymentBatchPrefs` drops it like any other unknown key.
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
  // "Every 2 weeks sounds good" (5zorro 2026-09-14) — the common arbitrary choice, and inert until a
  // date is entered.
  runIntervalDays: 14,
  nextRunDate: "",
  runEarlyOn: "",
});

const FIELDS = /** @type {const} */ (["apr", "postage", "perCheck"]);
const RUN_DATE_FIELDS = /** @type {const} */ (["nextRunDate", "runEarlyOn"]);

/** @param {unknown} v @returns {v is string} */
function isIsoDateString(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === v;
}

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
 * The methods the assumptions panel gives a cost input to, in the order it shows them (Packet C1).
 *
 * Cheque first because it is the composed one and the panel groups its two inputs together; the
 * rest ascend by cost, which is also the order that makes B2c's story legible — $0.40 to $50 is the
 * whole reason batching is a wire feature.
 */
export const KNOWN_PAYMENT_METHODS = Object.freeze([CHEQUE_METHOD, "ACH", "DOM_WIRE", "INT_WIRE"]);

/**
 * Human labels for a `Mode of Payment` name (Packet C3).
 *
 * 5zorro 2026-09-09: *"the mode of payment is unclear from the invoice as it currently renders."*
 * The ERP names are screaming-snake identifiers chosen for the Link field; they are not what a
 * clerk should read off a dashboard row.
 *
 * `short` fits the invoice row and a compact node; `long` is for the balloon and the check drawer.
 */
export const PAYMENT_METHOD_LABELS = Object.freeze({
  [CHEQUE_METHOD]: { short: "Check", long: "Cheque by post", nameToken: "POSTAL" },
  ACH: { short: "ACH", long: "ACH push", nameToken: "ACH" },
  DOM_WIRE: { short: "Wire", long: "Domestic wire", nameToken: "DOM_WIRE" },
  INT_WIRE: { short: "Int'l wire", long: "International wire", nameToken: "INT_WIRE" },
});

/**
 * The token a method contributes to a Payment Term **name** — the `(METHOD)` of
 * `CREDIT_PERIOD (METHOD) ±GRACE` (Packet C6).
 *
 * It is not always the Link value: `USPS_Check` writes `(POSTAL)`, which is 5zorro's own convention
 * from the A5 fixtures. Kept in this table rather than in the term planner so there is exactly one
 * place that knows what a method is called, whatever it is being called *for* — the machine-readable
 * method is always `mode_of_payment`, and this token is for humans reading the name.
 *
 * @param {string|null|undefined} method
 * @returns {string}
 */
export function paymentMethodNameToken(method) {
  const key = method == null ? "" : String(method).trim();
  if (!key) return "";
  const known = PAYMENT_METHOD_LABELS[key];
  return known ? known.nameToken : key.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/**
 * A readable label for a `Mode of Payment`.
 *
 * 🔴 A missing method reads as **"No method"**, never as "Check". The engine prices an unrecorded
 * method at the cheque fee (see `paymentMethodFee`) because that is the conservative guess, but a
 * guess made for arithmetic must not be reported to the clerk as a fact about the bill. Those are
 * different claims, and C4's chip exists to explain the difference.
 *
 * @param {string|null|undefined} method
 * @param {{ long?: boolean }} [opts]
 * @returns {string}
 */
export function paymentMethodLabel(method, opts = {}) {
  const key = method == null ? "" : String(method).trim();
  if (!key) return opts.long ? "No method of payment recorded" : "No method";
  const known = PAYMENT_METHOD_LABELS[key];
  if (known) return opts.long ? known.long : known.short;
  return key.replace(/_/g, " ");
}

/**
 * Everything a surface needs to render one method's cost, including **where the number came from**.
 *
 * `feeSource` is the part that matters for C4 and C5: `$0.83` on a row means something quite
 * different when it is the cheque composition than when it is the fallback for a bill that records
 * no method at all, and the audit trail has to be able to say which.
 *
 * @param {PaymentBatchPrefs} prefs
 * @param {string|null|undefined} method
 * @returns {{
 *   key: string,
 *   label: string,
 *   longLabel: string,
 *   fee: number,
 *   feeSource: "composed"|"override"|"default"|"fallback",
 * }}
 */
export function describePaymentMethod(prefs, method) {
  const key = method == null ? "" : String(method).trim();
  const fee = paymentMethodFee(prefs, method);
  return {
    key,
    label: paymentMethodLabel(key),
    longLabel: paymentMethodLabel(key, { long: true }),
    fee,
    feeSource: feeSourceFor(prefs, key),
  };
}

/** @param {PaymentBatchPrefs} prefs @param {string} key */
function feeSourceFor(prefs, key) {
  if (!key) return "fallback";
  if (key === CHEQUE_METHOD) return "composed";
  const overrides = prefs && typeof prefs === "object" ? prefs.methodFees : null;
  if (overrides && typeof overrides === "object") {
    const n = Number(/** @type {Record<string, unknown>} */ (overrides)[key]);
    if (Number.isFinite(n) && n >= 0) return "override";
  }
  return Object.prototype.hasOwnProperty.call(DEFAULT_PAYMENT_METHOD_FEES, key) ? "default" : "fallback";
}

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
  if ("runIntervalDays" in p) {
    const v = p.runIntervalDays;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
      errors.push("runIntervalDays must be a whole number of days, 0 or more");
    }
  }
  for (const field of RUN_DATE_FIELDS) {
    if (field in p && p[field] !== "" && !isIsoDateString(p[field])) {
      errors.push(`${field} must be a YYYY-MM-DD date, or empty`);
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
  const interval = o.runIntervalDays;
  if (typeof interval === "number" && Number.isInteger(interval) && interval >= 0) {
    merged.runIntervalDays = interval;
  }
  for (const field of RUN_DATE_FIELDS) {
    const v = o[field];
    if (v === "" || isIsoDateString(v)) merged[field] = v;
  }
  const methodFees = pickMethodFees(o.methodFees);
  if (methodFees) merged.methodFees = methodFees;
  return merged;
}

/**
 * The valid entries of a `methodFees` override map, or `undefined` when there are none.
 *
 * Carried through the merge rather than dropped — without this, C1's per-method cost inputs would
 * save and then vanish on the next load, because the round trip is
 * `setPrefs → mergePaymentBatchPrefs → disk → mergePaymentBatchPrefs → panel`.
 *
 * Filtered per entry, never all-or-nothing, matching `paymentMethodFee`'s read-time rule: one
 * mistyped wire cost must not silently discard the ACH cost next to it.
 *
 * @param {unknown} raw
 * @returns {Record<string, number>|undefined}
 */
function pickMethodFees(raw) {
  if (!raw || typeof raw !== "object") return undefined;
  /** @type {Record<string, number>} */
  const out = {};
  for (const [key, value] of Object.entries(/** @type {Record<string, unknown>} */ (raw))) {
    const n = Number(value);
    if (key && Number.isFinite(n) && n >= 0) out[key] = round2(n);
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * The cheque fee, and the two prefs it is composed from (Packet C1).
 *
 * 5zorro: *"at least a border around the two inputs that contribute."* `Postage` and `Per-check` are
 * the only two inputs on the panel that combine into one number, and nothing on screen said so —
 * they read as four peers alongside APR and the batch window. This is the composition the panel
 * renders next to them.
 *
 * @param {PaymentBatchPrefs} prefs
 * @returns {{ postage: number, perCheck: number, total: number }}
 */
export function composedChequeFee(prefs) {
  const p = mergePaymentBatchPrefs(prefs);
  return { postage: p.postage, perCheck: p.perCheck, total: round2(p.postage + p.perCheck) };
}
