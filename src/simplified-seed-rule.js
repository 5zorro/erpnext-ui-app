/**
 * The rule that makes Simplified's Doc-skin defaults (5zorro 2026-10-10: "build the generator").
 *
 * The defaults were a hand-made list (2026-09-03/04) that drifted from the Doc skins twice. This
 * writes the rule down once; `npm run seeds:simplified` applies it to ERPNext's field lists (a
 * snapshot in tests/fixtures/simplified-seed-meta/) and writes simplified-seed-profiles.generated.js.
 * tests/simplified-seed-generator.test.js fails when the committed file and the rule disagree —
 * a Doc skin change, a rule change, or a refreshed snapshot after an ERPNext upgrade.
 *
 * Per field, first answer wins:
 *  1. layout / table / button types → not a field to assume;
 *  2. the Doc skin works it out itself (`derived`) → L2 quiet, with a default value if required;
 *  3. hidden or read-only in ERPNext → nothing to quiet;
 *  4. the clerk sets it on the Doc skin through a question, not a box (`quietClickable`) → L1;
 *  5. required → left alone (locking it with no value would block Save);
 *  6. a write path every skin owns (company, addresses, tax template, status, naming series);
 *  7. the Doc skin shows or writes it (`surfaced`) → left alone;
 *  8. a recorded exception (`keepNormal`, each with its reason) → left alone;
 *  9. everything else → L2 "quiet & locked": the Doc skin does not ask for it.
 * Pure: no files, no ERPNext; the script does the reading.
 */
import { isWritableBillHeaderField, BILL_DERIVED_FIELDS, BILL_QUESTION_FIELDS, BILL_MEMO_FIELD, BILL_TERMS_FIELD } from "./bill-map.js";
import { writablePoHeaderFields, PO_MEMO_FIELD } from "./po-map.js";
import { writableReceiptHeaderFields, RECEIPT_MEMO_FIELD, RECEIPT_TERMS_FIELD } from "./receipt-map.js";
import { ERP_FREEFORM_TERMS_FIELD } from "./doc-terms-fields.js";

/** Field types that are layout, not data entry — the Simplified bar skips the same set. */
export const SEED_SKIP_TYPES = Object.freeze(
  new Set(["Section Break", "Column Break", "Tab Break", "HTML", "Heading", "Button", "Table", "Table MultiSelect", "Fold", "Image"]),
);

/** Write paths every skin owns through its own picker or display, shown or not. */
export function isSeedWritePath(fieldname) {
  const f = String(fieldname || "");
  return f === "company" || /_address$/.test(f) || f === "taxes_and_charges" || f === "status" || f === "naming_series";
}

/** "Today" — what ERPNext stamps on a posting date. */
const TODAY = Object.freeze({ valueSource: "expr", expr: Object.freeze({ base: "today", offset: 0 }) });
/** Edit Posting Date stays off: a Bill's posting date is a stamp (5zorro 2026-10-10). */
const UNTICKED = Object.freeze({ valueSource: "literal", value: 0 });

/**
 * @typedef {{ fieldname: string, fieldtype?: string, reqd?: number|boolean, hidden?: number|boolean, read_only?: number|boolean }} MetaField
 * @typedef {{ valueSource: "expr", expr: { base: string, offset: number } } | { valueSource: "literal", value: string|number }} SeedValue
 * @typedef {{
 *   surfaced: (fieldname: string) => boolean,
 *   quietClickable?: readonly string[],
 *   derived?: Readonly<Record<string, SeedValue|null>>,
 *   keepNormal?: Readonly<Record<string, string>>,
 * }} SeedRuleConfig
 */

/**
 * @param {readonly MetaField[]} fields ERPNext's fields, in DocType order
 * @param {SeedRuleConfig} cfg
 * @returns {{ placements: Record<string, "L1"|"L2">, values: Record<string, SeedValue> }}
 */
export function deriveSeed(fields, cfg) {
  /** @type {Record<string, "L1"|"L2">} */
  const placements = {};
  /** @type {Record<string, SeedValue>} */
  const values = {};
  const derived = cfg.derived || {};
  const quiet = new Set(cfg.quietClickable || []);
  const keep = cfg.keepNormal || {};
  for (const f of fields || []) {
    const fn = f && f.fieldname;
    if (!fn || SEED_SKIP_TYPES.has(f.fieldtype)) continue;
    if (Object.prototype.hasOwnProperty.call(derived, fn)) {
      placements[fn] = "L2";
      if (derived[fn]) values[fn] = derived[fn];
      continue;
    }
    if (f.hidden || f.read_only) continue;
    if (quiet.has(fn)) {
      placements[fn] = "L1";
      continue;
    }
    if (f.reqd || isSeedWritePath(fn) || cfg.surfaced(fn)) continue;
    if (Object.prototype.hasOwnProperty.call(keep, fn)) continue;
    placements[fn] = "L2";
  }
  return { placements, values };
}

const ROUNDING = "a rounding-math toggle is not the kind of field to silently lock";

/**
 * What each Doc skin shows, asks, and works out — read from the skins' own maps, so a skin change
 * moves the defaults with it. `snapshot` is the fixture file name under tests/fixtures/simplified-seed-meta/.
 * @type {Readonly<Record<string, SeedRuleConfig & { snapshot: string, source: { module: string, path: string } }>>}
 */
export const SEED_RULE_CONFIG = Object.freeze({
  "Purchase Invoice": {
    snapshot: "purchase_invoice.json",
    source: { module: "accounts", path: "erpnext/accounts/doctype/purchase_invoice/purchase_invoice.json" },
    surfaced: (fn) =>
      isWritableBillHeaderField(fn) || fn === BILL_MEMO_FIELD || fn === BILL_TERMS_FIELD || fn === "bill_date" || fn === "due_date",
    quietClickable: BILL_QUESTION_FIELDS,
    derived: Object.fromEntries(BILL_DERIVED_FIELDS.map((fn) => [fn, fn === "posting_date" ? TODAY : UNTICKED])),
    keepNormal: {
      disable_rounded_total: ROUNDING,
      unrealized_profit_loss_account: "shown only for an internal supplier (depends_on is_internal_supplier)",
      set_from_warehouse: "shown only for an internal supplier receiving stock",
      supplier_warehouse: "shown only on a subcontracted bill (depends_on is_subcontracted)",
    },
  },
  "Purchase Order": {
    snapshot: "purchase_order.json",
    source: { module: "buying", path: "erpnext/buying/doctype/purchase_order/purchase_order.json" },
    surfaced: (fn) =>
      writablePoHeaderFields().some((m) => m.field === fn) ||
      fn === PO_MEMO_FIELD ||
      fn === ERP_FREEFORM_TERMS_FIELD ||
      // the logbook PO# (the Doc PO's "their number", doc-number-pref.js) and its terms picker
      fn === "title" ||
      fn === "payment_terms_template",
    keepNormal: {
      disable_rounded_total: ROUNDING,
      set_reserve_warehouse: "shown only when the PO supplies raw materials (depends_on supplied_items)",
    },
  },
  "Purchase Receipt": {
    snapshot: "purchase_receipt.json",
    source: { module: "stock", path: "erpnext/stock/doctype/purchase_receipt/purchase_receipt.json" },
    surfaced: (fn) =>
      writableReceiptHeaderFields().some((m) => m.field === fn) ||
      fn === RECEIPT_MEMO_FIELD ||
      fn === RECEIPT_TERMS_FIELD ||
      // the packing list / BOL number — the Item Receipt's "their number" (doc-number-pref.js)
      fn === "lr_no",
    keepNormal: {
      disable_rounded_total: ROUNDING,
    },
  },
});

/**
 * The defaults for every configured doctype from snapshots of their fields.
 * @param {Record<string, readonly MetaField[]>} fieldsByDoctype
 */
export function deriveAllSeeds(fieldsByDoctype) {
  /** @type {Record<string, Record<string, "L1"|"L2">>} */
  const profiles = {};
  /** @type {Record<string, Record<string, SeedValue>>} */
  const values = {};
  for (const [dt, cfg] of Object.entries(SEED_RULE_CONFIG)) {
    const out = deriveSeed(fieldsByDoctype[dt] || [], cfg);
    profiles[dt] = out.placements;
    if (Object.keys(out.values).length) values[dt] = out.values;
  }
  return { profiles, values };
}
