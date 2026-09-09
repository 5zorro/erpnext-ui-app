/**
 * Which header fields a mapped source document carries onto the target form, and **how**.
 *
 * Two lists, because the distinction is load-bearing:
 *
 * - **copy** — plain assignment onto `frm.doc`. The field means the same thing on both
 *   documents and nothing else in ERPNext hangs off it.
 * - **party** — must go through `frm.set_value()`, because ERPNext's own client script fetches
 *   a pile of dependent state when it changes: `credit_to`, `currency`, `price_list`, the tax
 *   template, the address displays, the payment schedule. Assigning `frm.doc.supplier`
 *   directly sets the label and none of that — which looks like it worked.
 *
 * Found by dogfood (5zorro, 2026-09-09, focus incident): `make_debit_note` returns the source
 * Bill's supplier, but `mergeFromMapped` only ever applied four header fields, and `supplier`
 * was not among them. A credit memo built from a blank draft therefore came out with **no
 * vendor at all** — the vendor the clerk had picked a moment earlier looked like it had been
 * dropped. Museum OI-166 / OI-147.
 *
 * Party goes on **before** the lines: the supplier fetch rewrites taxes and can touch item
 * rows, so it has to land first or it undoes the merge it was supposed to precede.
 */

/**
 * Plain copies. `is_return` / `return_against` only ever appear on a `make_debit_note` mapped
 * doc, so they are a no-op for the ordinary PO/PR merge.
 * @type {string[]}
 */
export const MAPPED_HEADER_COPY_FIELDS = [
  "bill_no",
  "payment_terms_template",
  "is_return",
  "return_against",
];

/**
 * Fields ERPNext hangs dependent fetches off. Never widen this list without checking that the
 * target form's client script really does fetch on that field — and never move one of these
 * into the copy list, which is the silent-failure shape this module exists to prevent.
 * @type {string[]}
 */
export const MAPPED_HEADER_PARTY_FIELDS = ["supplier"];

/** Fields worth a `refresh_fields` once everything is applied. @type {string[]} */
export const MAPPED_HEADER_REFRESH_FIELDS = [
  "supplier",
  "bill_no",
  "payment_terms_template",
  "due_date",
  "is_return",
  "return_against",
];

/**
 * @typedef {{ field: string, value: unknown }} MappedHeaderAssignment
 * @typedef {{
 *   party: MappedHeaderAssignment[],
 *   copy: MappedHeaderAssignment[],
 *   refresh: string[],
 * }} MappedHeaderPlan
 */

/**
 * What to apply from a mapped source doc onto the target form.
 *
 * `applyParty` is **opt-in**: the ordinary PO/PR merge runs on a Bill whose vendor the clerk
 * already picked (and the source list is vendor-scoped), so re-setting it there would only
 * re-trigger fetches and could clobber an address display the bridge already waited for. The
 * credit-memo path is the one that starts from a genuinely blank draft.
 *
 * @param {object|null|undefined} src mapped source document
 * @param {{ applyParty?: boolean, current?: object|null }} [opts]
 * @returns {MappedHeaderPlan}
 */
export function planMappedHeaderApply(src, opts = {}) {
  const doc = src && typeof src === "object" ? src : {};
  const current = opts.current && typeof opts.current === "object" ? opts.current : {};
  /** @type {MappedHeaderAssignment[]} */
  const party = [];
  /** @type {MappedHeaderAssignment[]} */
  const copy = [];

  if (opts.applyParty) {
    for (const field of MAPPED_HEADER_PARTY_FIELDS) {
      const value = doc[field];
      if (!value) continue;
      // Already right: setting it again would re-run the fetch chain for no gain.
      if (current[field] != null && String(current[field]) === String(value)) continue;
      party.push({ field, value: String(value) });
    }
  }

  for (const field of MAPPED_HEADER_COPY_FIELDS) {
    const value = doc[field];
    // Truthiness, deliberately: this mirrors what the bridge has always done, so an absent
    // field and a zero `is_return` both mean "the source says nothing about this".
    if (!value) continue;
    copy.push({ field, value });
  }

  return { party, copy, refresh: MAPPED_HEADER_REFRESH_FIELDS.slice() };
}
