import { test } from "node:test";
import assert from "node:assert/strict";
import { SEED_PROFILES, seedProfileFor } from "../src/simplified-seed-profiles.js";
import { PLACEMENTS, normalizeProfile, assumedFields } from "../src/assume-core.js";

const NEVER_SEEDED_PI = [
  // credit/debit-note fields OI-082 still needs exposed
  "is_return",
  "return_against",
  // required fields — locking with no value risks blocking Save
  "credit_to",
  "supplier",
  "posting_date",
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
  "posting_date",
  "due_date",
  "bill_no",
  "payment_terms_template",
  "remarks",
  "terms",
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
    assert.equal(normalized.fields[fn].value, null);
    assert.equal(normalized.fields[fn].valueSource, "literal");
  }
});
