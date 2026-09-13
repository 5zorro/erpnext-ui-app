/**
 * Grace days, parsed off the **name** of a Payment Term (Packet A, A2g).
 *
 * ERPNext has no field anywhere for "how late can this vendor actually be paid" — not on Payment
 * Term, Payment Terms Template, Payment Schedule, Supplier or Purchase Invoice (verified
 * 2026-09-08 against the doctype JSON). 5zorro's decision: it rides in the term's own name, e.g.
 * `NET_30_DAYS (POSTAL) -3`.
 *
 * Why the name and not a Custom Field or a Description token:
 * - `Payment Term.autoname` is `field:payment_term_name` and that field is `unique: 1`, so the DB
 *   enforces "no two terms collide" for free.
 * - `payment_schedule.payment_term` is a **Link**, already `in_list_view` on the Bill's Payment
 *   Schedule grid and already inside the payload `fetchOutstandingBills` pulls — so the value
 *   arrives as structured data with no extra fetch, and no free-text field a clerk can reword.
 *
 * Convention: `CREDIT_PERIOD (METHOD) ±GRACE` — grace **last**, explicitly signed. The method is in
 * the name for human legibility only; the machine reads `mode_of_payment`, so nothing here parses
 * it (a second source of truth for the method is exactly what we are avoiding).
 *
 * 🔴 The name is the primary key. Payment Term has `allow_rename: 1`, so renaming one rewrites
 * `payment_schedule.payment_term` on every historical bill (`frappe/model/rename_doc.py`
 * `update_link_field_values`). House rule: to change grace, create a new term and reassign — never
 * rename. A changed grace is a different term.
 */

/**
 * Grace must be the last whitespace-delimited token and must carry an explicit sign.
 *
 * The sign requirement is the whole safety property: without it `NET 45` would read as `+45`. The
 * leading-whitespace requirement is the other half: without it `NET-45` would read as `-45`. Both
 * failures are silent wrong numbers on a payment date, which is why the grammar refuses rather than
 * guesses.
 */
const GRACE_SUFFIX_RE = /\s([+-]\d+)\s*$/;

/**
 * Grace days encoded in a Payment Term name, or `undefined` when the name states none.
 *
 * Absent is **absent**, never `0` — callers must be able to tell "nobody recorded a grace period"
 * from "this vendor gives exactly none" (the A1 rule for every term field). Write `+0` in a term
 * name to say the latter explicitly.
 *
 * @param {string|null|undefined} termName the Payment Term's name (a `payment_term` Link value)
 * @returns {number|undefined} signed whole days, or `undefined` if none is encoded
 *
 * @example
 * parsePaymentTermGrace("NET_30_DAYS (POSTAL) -3") // -3
 * parsePaymentTermGrace("NET_30_DAYS (ACH) +2")    // 2
 * parsePaymentTermGrace("NET 45")                  // undefined — unsigned, not a grace token
 * parsePaymentTermGrace("NET-45")                  // undefined — no whitespace before the sign
 */
export function parsePaymentTermGrace(termName) {
  const m = GRACE_SUFFIX_RE.exec(asName(termName));
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) ? n : undefined;
}

/**
 * The term name with its grace suffix removed — the part a human reads as the term itself.
 *
 * `"NET_30_DAYS (POSTAL) -3"` → `"NET_30_DAYS (POSTAL)"`. Names with no suffix come back trimmed
 * but otherwise untouched, so this is safe to call unconditionally when building a label.
 *
 * @param {string|null|undefined} termName
 * @returns {string}
 */
export function stripGraceSuffix(termName) {
  const name = asName(termName);
  return name.replace(GRACE_SUFFIX_RE, "").trim();
}

/**
 * Add or replace a grace suffix on a term name, keeping the convention's ordering.
 *
 * Intended for the Payment Terms Generator (deferred to the next tranche) so the naming convention
 * is enforced by code rather than by typing. Passing `undefined`/`null` strips the suffix.
 *
 * @param {string|null|undefined} termName
 * @param {number|null|undefined} graceDays
 * @returns {string}
 */
export function withGraceSuffix(termName, graceDays) {
  const base = stripGraceSuffix(termName);
  if (graceDays == null) return base;
  const n = Number(graceDays);
  if (!Number.isSafeInteger(n)) return base;
  const suffix = `${n < 0 ? "-" : "+"}${Math.abs(n)}`;
  return base ? `${base} ${suffix}` : suffix;
}

/* `applyGraceToDueDate` was removed 2026-09-09. It shifted a due date by the parsed grace, which
 * is precisely what this module must NOT do: grace now folds into the Payment Term's own
 * `credit_days` (Net 30 with +16 tolerance is a term of 46 days), so ERPNext computes the real
 * due date and the shell reads it. A shell-side shift on top would double-count.
 *
 * Nothing here is load-bearing any more. A parse failure degrades a label from
 * "Net 30 + 16 days tolerance" to "Net 46"; it can no longer move a payment date or change which
 * batch a bill joins. See the plan's "REVERSED 2026-09-09" section. */

/** @param {unknown} v */
function asName(v) {
  return v == null ? "" : String(v);
}
