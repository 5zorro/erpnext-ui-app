/**
 * "This field is still filling in" — the visible half of an async header write.
 *
 * Under `start:chaos` (and on a slow real server) a vendor pick takes long enough that the
 * fields ERPNext repopulates — addresses, terms, due date — sit empty or stale for a second
 * or two. 5zorro read that as a bug and opened an incident before it resolved itself
 * (2026-09-09): *"a couple things took a second to load, and I thought it was an incident at
 * first, then it updated."* An empty field and a field that has not answered yet look
 * identical, and only one of them is worth worrying about.
 *
 * Timing is part of the contract, not decoration. Showing the indicator instantly makes every
 * fast reply flash, which is its own kind of noise; hiding it the instant the reply lands can
 * blink it out before it has been read. So: wait a beat before showing, and once shown, hold
 * it briefly.
 */

/** Wait this long before admitting we are waiting. Below it, the reply feels instant. */
export const FIELD_LOADING_SHOW_AFTER_MS = 220;

/** Once the indicator is up, keep it up at least this long so it is readable, not a flicker. */
export const FIELD_LOADING_MIN_VISIBLE_MS = 320;

/**
 * Header writes whose settle repopulates other fields, and which fields those are. Keys are
 * the Doc skin's element names (`el.*`), because that is what the renderer marks.
 *
 * `supplier` is the one that matters in practice: ERPNext fetches the address displays off the
 * party, and the payment-terms template resettles the due date. The field being written is
 * never in its own list — the clerk just typed it and it already shows the right answer.
 *
 * @type {Record<string, string[]>}
 */
export const SETTLE_DEPENDENT_FIELDS = {
  supplier: ["billingAddress", "shipFrom", "shipTo", "terms", "duedate"],
  payment_terms_template: ["terms", "duedate"],
  bill_date: ["duedate"],
};

/**
 * Which fields to mark while `field` is settling.
 * @param {string|null|undefined} field
 * @returns {string[]} element keys; empty when this write settles nothing else
 */
export function fieldsSettlingFor(field) {
  const key = field != null ? String(field).trim() : "";
  const list = SETTLE_DEPENDENT_FIELDS[key];
  return Array.isArray(list) ? list.slice() : [];
}

/**
 * @param {string|null|undefined} field
 * @returns {boolean}
 */
export function writeSettlesOtherFields(field) {
  return fieldsSettlingFor(field).length > 0;
}

/**
 * How long to keep the indicator up once the reply has landed.
 *
 * @param {number|null|undefined} shownAt when the indicator went up (0 / null = never did)
 * @param {number} now
 * @param {{ minVisibleMs?: number }} [opts]
 * @returns {number} milliseconds to wait before clearing; 0 to clear immediately
 */
export function remainingHoldMs(shownAt, now, opts = {}) {
  if (!shownAt) return 0;
  const min = opts.minVisibleMs != null ? opts.minVisibleMs : FIELD_LOADING_MIN_VISIBLE_MS;
  const shown = Number(now) - Number(shownAt);
  if (!Number.isFinite(shown)) return 0;
  // A clock that jumped backwards (or a shownAt in the future) must not turn into a long
  // hold — treat it as "just shown" and wait the normal minimum, never more.
  const elapsed = shown > 0 ? shown : 0;
  const left = min - elapsed;
  return left > 0 ? left : 0;
}
