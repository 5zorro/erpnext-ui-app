/**
 * Cost-model prefs for `payment-batch-economics.js` (OI-161 Packet 3).
 *
 * apr, postage, perCheck, and groupWindowDays are company/user judgment calls, not ERP truth —
 * they don't exist as fields anywhere in ERPNext (confirmed in Packet 0). Stored the same way
 * other shell-only prefs live today (userData JSON, not a new ERP doctype — Clean Core stays
 * intact since nothing is written to ERP). Electron read/write wiring lands with Packet 4, same
 * as Packet 1's IPC layer.
 */

/** @typedef {{ apr: number, postage: number, perCheck: number, groupWindowDays: number }} PaymentBatchPrefs */

export const DEFAULT_PAYMENT_BATCH_PREFS = Object.freeze({
  apr: 0.09,
  postage: 0.78,
  perCheck: 0.05,
  groupWindowDays: 7,
});

const FIELDS = /** @type {const} */ (["apr", "postage", "perCheck", "groupWindowDays"]);

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
