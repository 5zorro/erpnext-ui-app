/**
 * AP vs AR direction for Payment Entry (Packet 4b, 5zorro 2026-09-05).
 *
 * `/app/payment-entry/new` carries no `payment_type` in the URL, so the shell cannot tell
 * whether a clerk wants to pay a vendor or record a customer receipt from the route alone.
 * "Separation of duties causes A/R to be separate from A/P, so 90% of the time a User will use
 * the one according to their payment entry function" -- so this remembers the last direction,
 * the same way lens-prefs.js remembers per-doctype lens choice. Mirrors that module's shape,
 * not a new convention.
 *
 * Resolution order, strongest signal first: (1) which Home tile was clicked this visit
 * ("Pay Bills"/"Write Checks" vs "Receive Payments") -- always wins when present; (2) the
 * remembered direction from the persisted pref; (3) default "Pay" (this tranche builds AP;
 * Receive falls through to Vanilla until AR ships).
 *
 * For an *existing* Payment Entry the pref is irrelevant -- the real `payment_type` on the
 * document is truth. This module only resolves `/new`'s genuine ambiguity.
 */

/** @typedef {"Pay"|"Receive"} PaymentDirection */

export const DEFAULT_PAYMENT_DIRECTION = /** @type {PaymentDirection} */ ("Pay");

/** @type {PaymentDirection[]} */
export const PAYMENT_DIRECTIONS = ["Pay", "Receive"];

/**
 * @param {unknown} value
 * @returns {PaymentDirection|null}
 */
export function normalizePaymentDirection(value) {
  return value === "Pay" || value === "Receive" ? value : null;
}

/**
 * @param {{ direction?: unknown }|null|undefined} prefs
 * @param {PaymentDirection} [fallback]
 * @returns {PaymentDirection}
 */
export function preferredPaymentDirection(prefs, fallback = DEFAULT_PAYMENT_DIRECTION) {
  const v = prefs && typeof prefs === "object" ? normalizePaymentDirection(prefs.direction) : null;
  return v || fallback;
}

/**
 * @param {{ direction?: unknown }|null|undefined} prefs
 * @param {unknown} direction
 * @returns {object} new prefs object (immutable) -- unchanged (but copied) if direction is invalid
 */
export function rememberPaymentDirection(prefs, direction) {
  const base = prefs && typeof prefs === "object" ? { ...prefs } : {};
  const d = normalizePaymentDirection(direction);
  if (!d) return base;
  return { ...base, direction: d };
}

/**
 * Always a complete prefs object, corrupt/absent input falling back to the default.
 * @param {unknown} raw parsed JSON, possibly corrupt/absent
 * @returns {{ direction: PaymentDirection }}
 */
export function mergePaymentDirectionPrefs(raw) {
  const direction =
    normalizePaymentDirection(raw && typeof raw === "object" ? raw.direction : null) ||
    DEFAULT_PAYMENT_DIRECTION;
  return { direction };
}

/**
 * @param {{ tileIntent?: unknown, prefs?: { direction?: unknown }|null }} [args]
 * @returns {PaymentDirection}
 */
export function resolvePaymentDirection({ tileIntent, prefs } = {}) {
  const fromTile = normalizePaymentDirection(tileIntent);
  if (fromTile) return fromTile;
  return preferredPaymentDirection(prefs);
}
