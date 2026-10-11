/**
 * Simplified skin — default assumption profiles per doctype.
 *
 * GENERATED since 2026-10-10: the lists come from `npm run seeds:simplified`
 * (src/simplified-seed-rule.js applied to ERPNext's field lists in
 * tests/fixtures/simplified-seed-meta/) via ./simplified-seed-profiles.generated.js. Change the
 * rule or a Doc skin, then regenerate; the drift test fails until you do. The notes below are the
 * reasoning the rule encodes — each "not seeded" case is a rule step or a `keepNormal` entry.
 *
 * Without a seed, the assumptions bar opens with every field on "Normal" until a human
 * configures each one by hand — a wall of unconfigured switches for a doc-skin user who
 * expects most of this to already be decided. This seed pre-answers it: any Purchase
 * Invoice field the Bill Doc skin does not already surface (`BILL_HEADER_FIELDS`,
 * `BILL_ASSUMPTIONS`, `BILL_VANILLA_TAB_NOTES` in ./bill-map.js) starts at "L2" (quiet &
 * locked) instead of "Normal". A seed only applies while no profile has ever been saved
 * for that doctype (`assume-applier-payload.js` `load()`); the first Save writes a real
 * profile that wins from then on, so this is a first-run default, not a permanent lock.
 *
 * Sourced 2026-09-04 against the live Purchase Invoice DocType JSON
 * (apps/erpnext/erpnext/accounts/doctype/purchase_invoice/purchase_invoice.json) —
 * re-diff after a Vanilla ERP upgrade touches this doctype.
 *
 * Purchase Order and Purchase Receipt below (added 2026-09-05, sourced the same way
 * against `purchase_order.json` / `purchase_receipt.json`) follow the same mechanical
 * rule: skip layout/Table/Button fields, `reqd`, `hidden`, `read_only`, the write-path
 * fields the shared address picker / tax rows / status badge own directly regardless of
 * whether a doc-skin header shows them (`company`, `*_address`, `taxes_and_charges`,
 * `status`, `naming_series`), and whatever that doctype's own `*-map.js` HEADER_FIELDS /
 * memo / terms already surfaces. `disable_rounded_total` is held back on both (present,
 * unseeded, on Purchase Invoice too) — a rounding-math toggle is not the kind of field to
 * silently lock. Unlike Purchase Invoice's seed, this pass does not carve out further
 * per-field exceptions (e.g. `project`, `supplier_warehouse` stay in-scope for L2) — if a
 * dogfood pass finds one of these fields is load-bearing for some workflow, un-seed it
 * here rather than adding a silent PI-only precedent to the rule.
 *
 * Deliberately NOT seeded (stay "Normal"):
 * - `is_return` / `return_against` — the credit/debit-note fields doc skin still needs to
 *   expose (OI-082); hiding them here would fight that work, not help it.
 * - `credit_to`, `supplier`, `posting_date`, `items`, `naming_series` — required fields;
 *   locking a required field with no seeded value risks blocking Save.
 * - `company`, `supplier_address`, `shipping_address`, `dispatch_address`,
 *   `billing_address`, `taxes_and_charges`, `status` — doc skin already writes through
 *   these via its own picker/display paths (OI-136 address picker, tax rows); hiding the
 *   raw vanilla field would cut off the fallback path those pickers rely on.
 * - `bill_date` (vanilla label "Supplier Invoice Date") — Doc Bill's header field labeled
 *   "Invoice date" (`BILL_HEADER_FIELDS` in ./bill-map.js) writes here directly, matching
 *   vanilla's own due-date-for-credit-terms basis (`accounts_controller.py`:
 *   `date = bill_date or posting_date`). Since 2026-09-26 the Doc Bill's Posting Date
 *   **follows** it (typed: `set_posting_time` ticked and `posting_date` = the Invoice date;
 *   cleared: back to today — bridge `setHeader` `postingDateFollows`). The Doc skin shows only
 *   the Supplier Invoice Date; Simplified cannot hide `posting_date` (required), so under the
 *   Doc-skin profile it stays visible and follows (assume-applier-payload.js
 *   `installPostingFollows`). `set_posting_time` is therefore L1, never locked.
 *   History (gotchas.md G5): this list was derived by hand on 2026-09-03/04, when the Doc
 *   Bill's "Invoice date" wrote `posting_date` by mistake; it was never re-derived after the
 *   09-26 change, which left Edit Posting Date locked unticked here (DF-02). The guard test
 *   (tests/simplified-seed-profiles.test.js) now fails if a field the Doc Bill writes is
 *   seeded L2/L3.
 * - Any field already `hidden` or hidden-by-`Table`/`Button` fieldtype in the doctype
 *   JSON — nothing to quiet, it is not visible in Vanilla either.
 */

/** @typedef {"L1"|"L2"|"L3"} SeedPlacement */

import { GENERATED_SEED_PROFILES, GENERATED_SEED_VALUES } from "./simplified-seed-profiles.generated.js";

/**
 * Default values a seed field needs beyond its placement. A required field assumed with no value
 * is left alone (assume-core checkProfile), so Posting Date carries "Today" — what ERPNext stamps.
 */
export const SEED_VALUES = GENERATED_SEED_VALUES;

/** @type {Readonly<Record<string, Readonly<Record<string, SeedPlacement>>>>} */
export const SEED_PROFILES = GENERATED_SEED_PROFILES;

/**
 * Build a normalizeProfile()-shaped raw profile from a doctype's seed, or null if the
 * doctype has no seed yet.
 * @param {string} doctype
 * @returns {{ doctype: string, fields: Record<string, { value: null, placement: SeedPlacement, valueSource: "literal", expr: null }>, presets: [] } | null}
 */
export function seedProfileFor(doctype) {
  const seed = SEED_PROFILES[doctype];
  if (!seed) return null;
  /** @type {Record<string, { value: null, placement: SeedPlacement, valueSource: "literal", expr: null }>} */
  const fields = {};
  const values = SEED_VALUES[doctype] || {};
  for (const fn of Object.keys(seed)) {
    const v = values[fn];
    fields[fn] = v
      ? { value: null, placement: seed[fn], valueSource: v.valueSource, expr: { ...v.expr } }
      : { value: null, placement: seed[fn], valueSource: "literal", expr: null };
  }
  return { doctype, fields, presets: [], source: "doc-skin" };
}
