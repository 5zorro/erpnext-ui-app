import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { mergeSinglePaymentEntries } from "../src/payment-entry-batch.js";

function draft(overrides = {}) {
  return {
    doctype: "Payment Entry",
    company: "Acme Inc",
    party_type: "Supplier",
    party: "Acme Supply",
    payment_type: "Pay",
    paid_from: "Cash - AI",
    paid_to: "Creditors - AI",
    paid_from_account_currency: "USD",
    paid_to_account_currency: "USD",
    posting_date: "2026-09-09",
    reference_date: "2026-09-09",
    mode_of_payment: "",
    reference_no: "",
    paid_amount: 400,
    received_amount: 400,
    references: [
      { reference_doctype: "Purchase Invoice", reference_name: "PINV-0001", allocated_amount: 400 },
    ],
    ...overrides,
  };
}

describe("mergeSinglePaymentEntries", () => {
  it("merges two same-party/currency drafts into one doc with both references", () => {
    const a = draft();
    const b = draft({
      paid_amount: 150,
      received_amount: 150,
      references: [
        { reference_doctype: "Purchase Invoice", reference_name: "PINV-0002", allocated_amount: 150 },
      ],
    });
    const result = mergeSinglePaymentEntries([a, b]);
    assert.equal(result.ok, true);
    assert.equal(result.doc.party, "Acme Supply");
    assert.equal(result.doc.references.length, 2);
    assert.deepEqual(
      result.doc.references.map((r) => r.reference_name),
      ["PINV-0001", "PINV-0002"],
    );
    assert.equal(result.doc.paid_amount, 550);
    assert.equal(result.doc.received_amount, 550);
  });

  it("passes a single doc through unchanged in shape", () => {
    const a = draft();
    const result = mergeSinglePaymentEntries([a]);
    assert.equal(result.ok, true);
    assert.equal(result.doc.references.length, 1);
    assert.equal(result.doc.paid_amount, 400);
  });

  it("flattens an already-multi-reference draft (exploded installments) alongside another", () => {
    const a = draft({
      paid_amount: 300,
      references: [
        { reference_doctype: "Purchase Invoice", reference_name: "PINV-0001", allocated_amount: 100 },
        { reference_doctype: "Purchase Invoice", reference_name: "PINV-0001", allocated_amount: 200 },
      ],
    });
    const b = draft({ paid_amount: 150, references: [{ reference_doctype: "Purchase Invoice", reference_name: "PINV-0002", allocated_amount: 150 }] });
    const result = mergeSinglePaymentEntries([a, b]);
    assert.equal(result.ok, true);
    assert.equal(result.doc.references.length, 3);
    assert.equal(result.doc.paid_amount, 450);
  });

  it("rejects a party mismatch instead of silently merging", () => {
    const a = draft();
    const b = draft({ party: "Beta Traders" });
    const result = mergeSinglePaymentEntries([a, b]);
    assert.equal(result.ok, false);
    assert.match(result.reason, /party/);
  });

  it("rejects a paid_from (bank account) mismatch", () => {
    const a = draft();
    const b = draft({ paid_from: "Checking - AI" });
    const result = mergeSinglePaymentEntries([a, b]);
    assert.equal(result.ok, false);
    assert.match(result.reason, /paid_from/);
  });

  it("rejects a currency mismatch", () => {
    const a = draft();
    const b = draft({ paid_to_account_currency: "EUR" });
    const result = mergeSinglePaymentEntries([a, b]);
    assert.equal(result.ok, false);
    assert.match(result.reason, /paid_to_account_currency/);
  });

  it("rejects a company mismatch", () => {
    const a = draft();
    const b = draft({ company: "Other Co" });
    const result = mergeSinglePaymentEntries([a, b]);
    assert.equal(result.ok, false);
    assert.match(result.reason, /company/);
  });

  it("empty input is a clean failure, not a crash", () => {
    assert.equal(mergeSinglePaymentEntries([]).ok, false);
    assert.equal(mergeSinglePaymentEntries(null).ok, false);
    assert.equal(mergeSinglePaymentEntries(undefined).ok, false);
  });

  it("ignores junk (non-object) entries in the array rather than throwing", () => {
    const result = mergeSinglePaymentEntries([draft(), null, undefined, "junk"]);
    assert.equal(result.ok, true);
    assert.equal(result.doc.references.length, 1);
  });

  it("a doc with no references contributes nothing; all-empty fails cleanly", () => {
    const a = draft({ references: [] });
    const b = draft({ references: undefined });
    const result = mergeSinglePaymentEntries([a, b]);
    assert.equal(result.ok, false);
    assert.match(result.reason, /payable reference/);
  });

  it("sums allocated amounts without float drift", () => {
    const a = draft({ references: [{ reference_name: "P1", allocated_amount: 0.1 }] });
    const b = draft({ references: [{ reference_name: "P2", allocated_amount: 0.2 }] });
    const result = mergeSinglePaymentEntries([a, b]);
    assert.equal(result.ok, true);
    assert.equal(result.doc.paid_amount, 0.3);
  });

  it("does not mutate its inputs", () => {
    const a = draft();
    const b = draft({ references: [{ reference_name: "P2", allocated_amount: 150 }] });
    const aCopy = JSON.parse(JSON.stringify(a));
    const bCopy = JSON.parse(JSON.stringify(b));
    mergeSinglePaymentEntries([a, b]);
    assert.deepEqual(a, aCopy);
    assert.deepEqual(b, bCopy);
  });

  it("merged doc is a new object, not an alias of the first draft", () => {
    const a = draft();
    const result = mergeSinglePaymentEntries([a]);
    assert.notEqual(result.doc, a);
    result.doc.paid_amount = 999999;
    assert.equal(a.paid_amount, 400);
  });
});
