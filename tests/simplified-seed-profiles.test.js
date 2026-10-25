import { test } from "node:test";
import assert from "node:assert/strict";
import { SEED_PROFILES, seedProfileFor } from "../src/simplified-seed-profiles.js";
import { PLACEMENTS, normalizeProfile, assumedFields } from "../src/assume-core.js";

const NEVER_SEEDED_PI = [
  // credit/debit-note fields OI-082 still needs exposed
  "is_return",
  "return_against",
  // required fields — locking with no value risks blocking Save (posting_date is the exception:
  // seeded quiet with "Today", since the Doc Bill derives it — see SEED_VALUES)
  "credit_to",
  "supplier",
  "items",
  "naming_series",
  // doc skin's own write paths (OI-136 address picker, tax rows)
  "company",
  "supplier_address",
  "shipping_address",
  "dispatch_address",
  "billing_address",
  "taxes_and_charges",
  "status",
  // fields Doc Bill already surfaces directly
  "due_date",
  "bill_no",
  "payment_terms_template",
  "remarks",
  "terms",
  // bill_date ("Supplier Invoice Date") — the Doc Bill's "Invoice date" box writes it; it drives
  // the due date, and the posting date is stamped at save. See simplified-seed-profiles.js header.
  "bill_date",
];

const NEVER_SEEDED_PO = [
  // required fields
  "naming_series",
  "supplier",
  "company",
  "transaction_date",
  "currency",
  "conversion_rate",
  "items",
  "status",
  // doc skin's own write paths (OI-136 address picker, tax rows)
  "supplier_address",
  "shipping_address",
  "dispatch_address",
  "billing_address",
  "taxes_and_charges",
  // fields Doc PO already surfaces directly
  "title",
  "payment_terms_template",
  "terms",
  // rounding-math toggle — not the kind of field to silently lock
  "disable_rounded_total",
];

const NEVER_SEEDED_RECEIPT = [
  // required fields
  "naming_series",
  "supplier",
  "company",
  "posting_date",
  "posting_time",
  "currency",
  "conversion_rate",
  "items",
  "status",
  // doc skin's own write paths (OI-136 address picker, tax rows)
  "supplier_address",
  "shipping_address",
  "dispatch_address",
  "billing_address",
  "taxes_and_charges",
  // fields Doc IR already surfaces directly
  "lr_no",
  "remarks",
  "terms",
  // rounding-math toggle — not the kind of field to silently lock
  "disable_rounded_total",
];

test("every seeded placement is a valid non-vanilla PLACEMENTS value", () => {
  for (const doctype of Object.keys(SEED_PROFILES)) {
    const seed = SEED_PROFILES[doctype];
    for (const fn of Object.keys(seed)) {
      assert.ok(PLACEMENTS.includes(seed[fn]), `${doctype}.${fn} placement`);
      assert.notEqual(seed[fn], "vanilla", `${doctype}.${fn} should not seed "vanilla"`);
    }
  }
});

test("Purchase Invoice seed excludes credit-note, required, and doc-skin-owned fields", () => {
  const seed = SEED_PROFILES["Purchase Invoice"];
  for (const fn of NEVER_SEEDED_PI) {
    assert.equal(seed[fn], undefined, `${fn} must not be seeded`);
  }
});

test("Purchase Order seed excludes required, address/tax write-path, and doc-skin-owned fields", () => {
  const seed = SEED_PROFILES["Purchase Order"];
  for (const fn of NEVER_SEEDED_PO) {
    assert.equal(seed[fn], undefined, `${fn} must not be seeded`);
  }
});

test("Purchase Receipt seed excludes required, address/tax write-path, and doc-skin-owned fields", () => {
  const seed = SEED_PROFILES["Purchase Receipt"];
  for (const fn of NEVER_SEEDED_RECEIPT) {
    assert.equal(seed[fn], undefined, `${fn} must not be seeded`);
  }
});

test("seedProfileFor returns null for an unknown doctype", () => {
  assert.equal(seedProfileFor("Sales Order"), null);
});

test("seedProfileFor builds a normalizeProfile()-compatible raw profile", () => {
  const raw = seedProfileFor("Purchase Invoice");
  assert.equal(raw.doctype, "Purchase Invoice");
  const normalized = normalizeProfile(raw, "Purchase Invoice");
  const assumed = assumedFields(normalized);
  assert.ok(assumed.length > 0);
  assert.ok(assumed.includes("cost_center"));
  for (const fn of assumed) {
    // Only SEED_VALUES fields carry a value: Posting Date's "Today", and Edit Posting Date fixed
    // off — a Bill's posting date is a stamp (5zorro 2026-10-10).
    if (fn === "posting_date") {
      assert.equal(normalized.fields[fn].valueSource, "expr");
    } else if (fn === "set_posting_time") {
      assert.deepEqual([normalized.fields[fn].valueSource, normalized.fields[fn].value], ["literal", 0]);
    } else {
      assert.equal(normalized.fields[fn].value, null);
      assert.equal(normalized.fields[fn].valueSource, "literal");
    }
  }
});

import { isWritableBillHeaderField, BILL_DERIVED_FIELDS } from "../src/bill-map.js";
import { SEED_VALUES } from "../src/simplified-seed-profiles.js";
import { checkProfile } from "../src/assume-core.js";

test("Simplified's Doc-skin defaults never lock a field the clerk sets on the Doc Bill (DF-02 guard)", () => {
  // The defaults were a hand-made list that drifted from the Doc Bill twice (09-04, 09-26). A
  // field the clerk sets on the Doc Bill must stay editable in Simplified: Normal or L1.
  const seed = SEED_PROFILES["Purchase Invoice"];
  const locked = Object.entries(seed)
    .filter(([fn, pl]) => (pl === "L2" || pl === "L3") && isWritableBillHeaderField(fn))
    .map(([fn, pl]) => `${fn}=${pl}`);
  assert.deepEqual(locked, []);
});

test("what the Doc Bill works out for itself is quiet in Simplified, and Posting Date is safe to quiet", () => {
  const seed = SEED_PROFILES["Purchase Invoice"];
  for (const fn of BILL_DERIVED_FIELDS) assert.equal(seed[fn], "L2", `${fn} quiet`);
  // posting_date is required: quieting it needs a value, or checkProfile leaves it alone.
  assert.deepEqual(SEED_VALUES["Purchase Invoice"].posting_date.expr, { base: "today", offset: 0 });
  const p = normalizeProfile(seedProfileFor("Purchase Invoice"), "Purchase Invoice");
  const check = checkProfile(p, [{ fieldname: "posting_date", reqd: 1 }]);
  assert.equal(check.ok, true, JSON.stringify(check.problems));
  assert.equal(p.source, "doc-skin");
});

test("Doc-skin defaults carry the doc-skin marker, so Simplified follows the Doc Bill's rules", () => {
  const p = normalizeProfile({ fields: {}, source: "doc-skin" }, "Purchase Invoice");
  assert.equal(p.source, "doc-skin");
  assert.equal(normalizeProfile({ fields: {} }, "Purchase Invoice").source, undefined);
});
