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
 *   `date = bill_date or posting_date`). `posting_date` stays unseeded too (required field,
 *   above) but Doc Bill no longer writes it at all — it keeps its DocType default ("Today")
 *   and gets forced back to today at save time regardless (`alignPostingDateLikeVanillaOk`
 *   in erp-form-bridge-page.js, mirroring Vanilla's own posting-date-confirm). See
 *   gotchas.md G5 for the full history: an earlier pass here read `bill_date`'s absence
 *   from `BILL_HEADER_FIELDS` as "not surfaced by doc skin" and seeded it L2 — at the time
 *   correct about the code, but the code itself had "Invoice date" wired to the wrong
 *   field; the real fix repointed `bill-map.js` at `bill_date`, not this seed.
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

/**
 * Not seeded on Purchase Order: `schedule_date` (top-level mirror of the line-level
 * Required By `po-map.js` already surfaces per row) *is* seeded L2 — no PO header field
 * reads it directly, and Date Expected/line edits are the doc skin's real write path.
 * @type {Readonly<Record<string, SeedPlacement>>}
 */
const PURCHASE_ORDER_SEED = Object.freeze({
  // Vendor confirmation / drop-ship contact — not on Doc PO header.
  order_confirmation_no: "L2",
  order_confirmation_date: "L2",
  customer_contact_person: "L2",
  customer_contact_display: "L2",
  contact_person: "L2",
  schedule_date: "L2",

  // Pricing / currency — matches Bill's treatment of the same fields.
  buying_price_list: "L2",
  plc_conversion_rate: "L2",
  ignore_pricing_rule: "L2",
  apply_discount_on: "L2",
  additional_discount_percentage: "L2",
  discount_amount: "L2",

  // Warehouse / subcontracting — rare outside a manufacturing-adjacent buyer.
  set_warehouse: "L2", // matches PO_ASSUMPTIONS: "Warehouse defaults to Finished Goods."
  set_from_warehouse: "L2",
  is_subcontracted: "L2",
  supplier_warehouse: "L2",
  scan_barcode: "L2",
  last_scanned_warehouse: "L2",

  // Tax / shipping — matches Bill's treatment of the same fields.
  tax_category: "L2",
  shipping_rule: "L2",

  // Terms tab — Doc PO shows Payment terms + freeform terms directly; `tc_name` does not.
  tc_name: "L2",

  // More Info / print / accounting dimensions.
  letter_head: "L2",
  select_print_heading: "L2",
  group_same_items: "L2",
  language: "L2",
  from_date: "L2",
  to_date: "L2",
  cost_center: "L2",
  project: "L2",
  incoterm: "L2",
  named_place: "L2",
  transaction_time: "L2",
});

/** @type {Readonly<Record<string, SeedPlacement>>} */
const PURCHASE_RECEIPT_SEED = Object.freeze({
  // Vendor's own delivery-note ref / freight tracking — Doc IR uses Packing List/BOL (`lr_no`) instead.
  supplier_delivery_note: "L2",
  transporter_name: "L2",
  lr_date: "L2",
  contact_person: "L2",

  // Posting time, pricing / currency — matches Bill's treatment of the same fields.
  set_posting_time: "L2",
  buying_price_list: "L2",
  plc_conversion_rate: "L2",
  ignore_pricing_rule: "L2",
  apply_discount_on: "L2",
  additional_discount_percentage: "L2",
  discount_amount: "L2",

  // Warehouse / subcontracting / stock automation.
  set_warehouse: "L2", // matches RECEIPT_ASSUMPTIONS: "Warehouse defaults to Finished Goods."
  set_from_warehouse: "L2",
  rejected_warehouse: "L2",
  supplier_warehouse: "L2",
  apply_putaway_rule: "L2",
  scan_barcode: "L2",
  last_scanned_warehouse: "L2",

  // Tax / shipping — matches Bill's treatment of the same fields.
  tax_category: "L2",
  shipping_rule: "L2",

  // Terms tab — Doc IR shows freeform terms directly; `tc_name` does not.
  tc_name: "L2",

  // Extra freeform note — Doc IR's own Memo block is `remarks`, not this.
  instructions: "L2",

  // More Info / print / accounting dimensions.
  letter_head: "L2",
  select_print_heading: "L2",
  group_same_items: "L2",
  project: "L2",
  cost_center: "L2",
  incoterm: "L2",
  named_place: "L2",
  title: "L2",
});

/** @type {Readonly<Record<string, Readonly<Record<string, SeedPlacement>>>>} */
export const SEED_PROFILES = Object.freeze({
  "Purchase Invoice": PURCHASE_INVOICE_SEED,
  "Purchase Order": PURCHASE_ORDER_SEED,
  "Purchase Receipt": PURCHASE_RECEIPT_SEED,
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
