import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAPPED_HEADER_COPY_FIELDS,
  MAPPED_HEADER_PARTY_FIELDS,
  planMappedHeaderApply,
} from "../src/mapped-header-fields.js";

/** A make_debit_note payload, trimmed to the header fields that matter here. */
const mappedCredit = {
  supplier: "Alpine Supply",
  supplier_name: "Alpine Supply",
  bill_no: "INV-9911",
  payment_terms_template: "2/10 Net 30",
  is_return: 1,
  return_against: "ACC-PINV-2026-00231",
  items: [{ item_code: "SKU004", qty: -1 }],
};

describe("mapped header field lists", () => {
  it("keeps supplier out of the plain-copy list", () => {
    // Copying frm.doc.supplier sets the label and skips credit_to / currency / taxes /
    // addresses / payment schedule. That is the silent failure this module exists to prevent.
    assert.ok(!MAPPED_HEADER_COPY_FIELDS.includes("supplier"));
    assert.ok(MAPPED_HEADER_PARTY_FIELDS.includes("supplier"));
  });

  it("does not let a field sit in both lists", () => {
    for (const f of MAPPED_HEADER_PARTY_FIELDS) {
      assert.ok(!MAPPED_HEADER_COPY_FIELDS.includes(f), `${f} is in both lists`);
    }
  });
});

describe("planMappedHeaderApply", () => {
  it("carries the vendor for a credit memo built on a blank draft", () => {
    // The dogfood bug (2026-09-09): the vendor the clerk had just picked came out empty.
    const plan = planMappedHeaderApply(mappedCredit, { applyParty: true, current: {} });
    assert.deepEqual(plan.party, [{ field: "supplier", value: "Alpine Supply" }]);
  });

  it("carries the credit fields as plain copies", () => {
    const plan = planMappedHeaderApply(mappedCredit, { applyParty: true });
    const byField = Object.fromEntries(plan.copy.map((c) => [c.field, c.value]));
    assert.equal(byField.is_return, 1);
    assert.equal(byField.return_against, "ACC-PINV-2026-00231");
    assert.equal(byField.bill_no, "INV-9911");
    assert.equal(byField.payment_terms_template, "2/10 Net 30");
  });

  it("leaves the party alone by default — the PO/IR merge must not change vendor", () => {
    const plan = planMappedHeaderApply(mappedCredit);
    assert.deepEqual(plan.party, []);
    // ...while still copying exactly what it copied before.
    assert.deepEqual(
      plan.copy.map((c) => c.field),
      ["bill_no", "payment_terms_template", "is_return", "return_against"],
    );
  });

  it("skips a party set that would be a no-op", () => {
    const plan = planMappedHeaderApply(mappedCredit, {
      applyParty: true,
      current: { supplier: "Alpine Supply" },
    });
    assert.deepEqual(plan.party, [], "re-setting the same vendor only re-runs fetches");
  });

  it("still sets the party when the form holds a different vendor", () => {
    const plan = planMappedHeaderApply(mappedCredit, {
      applyParty: true,
      current: { supplier: "Other Vendor" },
    });
    assert.deepEqual(plan.party, [{ field: "supplier", value: "Alpine Supply" }]);
  });

  it("says nothing about fields the source does not carry", () => {
    const plan = planMappedHeaderApply(
      { supplier: "Alpine Supply", items: [{}] },
      { applyParty: true },
    );
    assert.deepEqual(plan.copy, []);
    assert.deepEqual(plan.party, [{ field: "supplier", value: "Alpine Supply" }]);
  });

  it("treats is_return: 0 as 'the source says nothing', matching prior bridge behaviour", () => {
    const plan = planMappedHeaderApply({ is_return: 0, bill_no: "" }, { applyParty: true });
    assert.deepEqual(plan.copy, []);
  });

  it("survives junk input", () => {
    for (const junk of [null, undefined, "nope", 7]) {
      const plan = planMappedHeaderApply(junk, { applyParty: true });
      assert.deepEqual(plan.party, []);
      assert.deepEqual(plan.copy, []);
      assert.ok(Array.isArray(plan.refresh));
    }
  });

  it("hands back a fresh refresh list each time (callers may mutate it)", () => {
    const a = planMappedHeaderApply(mappedCredit);
    const b = planMappedHeaderApply(mappedCredit);
    assert.notEqual(a.refresh, b.refresh);
    assert.deepEqual(a.refresh, b.refresh);
    assert.ok(a.refresh.includes("supplier"));
  });
});
