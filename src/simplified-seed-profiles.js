/**
 * Simplified skin — default assumption profiles per doctype.
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
 * Deliberately NOT seeded (stay "Normal"):
 * - `is_return` / `return_against` — the credit/debit-note fields doc skin still needs to
 *   expose (OI-082); hiding them here would fight that work, not help it.
 * - `credit_to`, `supplier`, `posting_date`, `items`, `naming_series` — required fields;
 *   locking a required field with no seeded value risks blocking Save.
 * - `company`, `supplier_address`, `shipping_address`, `dispatch_address`,
 *   `billing_address`, `taxes_and_charges`, `status` — doc skin already writes through
 *   these via its own picker/display paths (OI-136 address picker, tax rows); hiding the
 *   raw vanilla field would cut off the fallback path those pickers rely on.
 * - `bill_date` (vanilla label "Supplier Invoice Date") — Doc Bill's own header field
 *   labeled "Invoice date" (`BILL_HEADER_FIELDS` in ./bill-map.js) writes to `posting_date`
 *   instead, a long-standing hotfix that reuses the required Posting Date field so Doc
 *   Bill only needs one date input. `bill_date` is the vanilla field that concept should
 *   map to, but the fieldNAME never appears in `BILL_HEADER_FIELDS` — an earlier pass here
 *   read that absence as "not surfaced by doc skin" and seeded it L2, locking the one
 *   field that actually embodies the "Invoice date" idea while doc skin quietly writes
 *   its answer somewhere else. Leave it Normal until the posting_date/bill_date split is
 *   resolved (see gotchas.md G5); do not re-seed it by re-running the same field-presence
 *   check without accounting for label/field renames like this one.
 * - Any field already `hidden` or hidden-by-`Table`/`Button` fieldtype in the doctype
 *   JSON — nothing to quiet, it is not visible in Vanilla either.
 */

/** @typedef {"L1"|"L2"|"L3"} SeedPlacement */

/** @type {Readonly<Record<string, SeedPlacement>>} */
const PURCHASE_INVOICE_SEED = Object.freeze({
  // Details tab — not on Doc Bill header/items/taxes
  apply_tds: "L2",
  cost_center: "L2",
  posting_time: "L2",
  set_posting_time: "L2",
  on_hold: "L2",
  release_date: "L2",
  hold_comment: "L2",
  update_billed_amount_in_purchase_order: "L2",
  update_billed_amount_in_purchase_receipt: "L2",
  contact_person: "L2",
  currency: "L2",
  conversion_rate: "L2",
  buying_price_list: "L2",
  plc_conversion_rate: "L2",
  ignore_pricing_rule: "L2",
  set_warehouse: "L2", // matches BILL_ASSUMPTIONS: "Warehouse defaults to Finished Goods."
  rejected_warehouse: "L2",
  update_stock: "L2",
  scan_barcode: "L2",
  tax_category: "L2",
  shipping_rule: "L2",
  apply_discount_on: "L2",
  additional_discount_percentage: "L2",
  discount_amount: "L2",

  // Payments tab — Doc Bill covers is_paid / mode_of_payment / cash_bank_account /
  // paid_amount via its own "Already paid" section; these are the rest.
  clearance_date: "L2",
  write_off_amount: "L2",
  write_off_account: "L2",
  write_off_cost_center: "L2",
  allocate_advances_automatically: "L2",

  // Terms tab — Doc Bill shows freeform `terms`; `tc_name` (Terms master picker) does not.
  tc_name: "L2",

  // Address & Contact tab — see "Deliberately NOT seeded" above (OI-136 write path).

  // More Info / Accounting Dimensions / Automation
  letter_head: "L2",
  group_same_items: "L2",
  select_print_heading: "L2",
  is_opening: "L2",
  from_date: "L2",
  to_date: "L2",
  incoterm: "L2",
  named_place: "L2",
  only_include_allocated_payments: "L2",
  use_company_roundoff_cost_center: "L2",
  supplier_group: "L2",
  update_outstanding_for_self: "L2",
  sender: "L2",
  last_scanned_warehouse: "L2",
  tax_withholding_group: "L2",
  ignore_tax_withholding_threshold: "L2",
  override_tax_withholding_entries: "L2",
});

/** @type {Readonly<Record<string, Readonly<Record<string, SeedPlacement>>>>} */
export const SEED_PROFILES = Object.freeze({
  "Purchase Invoice": PURCHASE_INVOICE_SEED,
});

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
  for (const fn of Object.keys(seed)) {
    fields[fn] = { value: null, placement: seed[fn], valueSource: "literal", expr: null };
  }
  return { doctype, fields, presets: [] };
}
