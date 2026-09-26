import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { proposeRelinks, describeRelink, allocationRowFor } from "../src/payment-relink.js";

const pay = (name, unallocated, supplier = "V1") => ({ name, unallocated, supplier });
const inv = (name, outstanding, amendedFrom, supplier = "V1") => ({
  name,
  outstanding,
  ...(amendedFrom ? { amendedFrom } : {}),
  supplier,
});

/**
 * The live case, from the 2026-09-22 dogfood: SAMPLE Vendor 01 has three open bills, and the loose
 * 9.00 belongs to the amended one. 🔴 ERPNext's own `allocate_entries` would put it against the
 * 107.00 bill, because it sorts by posting date and knows nothing about amendments.
 */
describe("proposeRelinks — the case ERPNext's own allocator gets wrong", () => {
  const invoices = [
    inv("ACC-PINV-2026-00247", 107),
    inv("ACC-PINV-2026-00231-1", 9, "ACC-PINV-2026-00231"),
    inv("ACC-PINV-2026-00243-1", 96.3, "ACC-PINV-2026-00243"),
  ];

  it("picks the amendment whose outstanding is exactly the loose amount", () => {
    const { proposals, unmatched } = proposeRelinks({
      payments: [pay("ACC-PAY-2026-00002", 9)],
      invoices,
    });
    assert.deepEqual(unmatched, []);
    assert.equal(proposals.length, 1);
    assert.equal(proposals[0].invoice, "ACC-PINV-2026-00231-1");
    assert.equal(proposals[0].amount, 9);
    assert.equal(proposals[0].confidence, "high");
    assert.match(proposals[0].why, /amendment of ACC-PINV-2026-00231/);
  });

  it("does not reach for the oldest or the biggest bill", () => {
    const { proposals } = proposeRelinks({ payments: [pay("P1", 9)], invoices });
    assert.notEqual(proposals[0].invoice, "ACC-PINV-2026-00247");
  });
});

describe("proposeRelinks — when it should not guess", () => {
  it("says nothing when no amended bill is open — this was not an amend", () => {
    const { proposals, unmatched } = proposeRelinks({
      payments: [pay("P1", 50)],
      invoices: [inv("I1", 50), inv("I2", 50)],
    });
    assert.deepEqual(proposals, []);
    assert.equal(unmatched.length, 1);
    assert.match(unmatched[0].why, /not stranded by an amend/i);
  });

  // 🔴 Two amendments open for the same amount is exactly when a confident-looking guess is worst.
  it("refuses to choose between two amendments of the same amount, and names both", () => {
    const { proposals, unmatched } = proposeRelinks({
      payments: [pay("P1", 9)],
      invoices: [inv("A-1", 9, "A"), inv("B-1", 9, "B")],
    });
    assert.deepEqual(proposals, []);
    assert.deepEqual(unmatched[0].candidates, ["A-1", "B-1"]);
    assert.match(unmatched[0].why, /cannot be told apart/i);
  });

  it("marks a sole-candidate-but-wrong-amount match low, and says both numbers", () => {
    const { proposals } = proposeRelinks({
      payments: [pay("P1", 40)],
      invoices: [inv("A-1", 100, "A")],
    });
    assert.equal(proposals[0].confidence, "low");
    assert.equal(proposals[0].amount, 40, "allocate what the payment has loose, not the whole bill");
    assert.match(proposals[0].why, /\$100\.00/);
    assert.match(proposals[0].why, /\$40\.00/);
  });

  it("allocates no more than the bill is short", () => {
    const { proposals } = proposeRelinks({
      payments: [pay("P1", 100)],
      invoices: [inv("A-1", 40, "A")],
    });
    assert.equal(proposals[0].amount, 40);
  });

  // An allocation posts against one supplier's account; crossing parties is not a near-miss, it is
  // a different ledger.
  it("never proposes across suppliers", () => {
    const { proposals, unmatched } = proposeRelinks({
      payments: [pay("P1", 9, "V1")],
      invoices: [inv("A-1", 9, "A", "V2")],
    });
    assert.deepEqual(proposals, []);
    assert.equal(unmatched.length, 1);
  });

  // Two loose payments that both look like they belong to one bill: the second must not be
  // proposed against a bill the first already claims, or the pair would overdraw it.
  it("does not propose the same bill twice in one run", () => {
    const { proposals, unmatched } = proposeRelinks({
      payments: [pay("P1", 9), pay("P2", 9)],
      invoices: [inv("A-1", 9, "A")],
    });
    assert.equal(proposals.length, 1);
    assert.equal(proposals[0].payment, "P1");
    assert.equal(unmatched.length, 1);
    assert.equal(unmatched[0].payment, "P2");
  });

  it("ignores fully-allocated payments and settled bills", () => {
    const { proposals, unmatched } = proposeRelinks({
      payments: [pay("P1", 0)],
      invoices: [inv("A-1", 0, "A")],
    });
    assert.deepEqual(proposals, []);
    assert.deepEqual(unmatched, []);
  });

  it("does not throw on junk", () => {
    assert.deepEqual(proposeRelinks(), { proposals: [], unmatched: [] });
    assert.deepEqual(proposeRelinks({ payments: null, invoices: null }), {
      proposals: [],
      unmatched: [],
    });
  });

  // Money compares to the cent; a float that is 8.999999999 is nine dollars.
  it("treats a sub-cent difference as the same amount", () => {
    const { proposals } = proposeRelinks({
      payments: [pay("P1", 9.000000001)],
      invoices: [inv("A-1", 8.999999999, "A")],
    });
    assert.equal(proposals[0].confidence, "high");
  });
});

describe("describeRelink — a guess must not look like a certainty", () => {
  it("labels a high-confidence proposal plainly", () => {
    const [p] = proposeRelinks({
      payments: [pay("PAY-1", 9)],
      invoices: [inv("A-1", 9, "A")],
    }).proposals;
    const told = describeRelink(p);
    assert.equal(told.button, "Re-link");
    assert.match(told.chip, /\$9\.00 unapplied → A-1/);
    assert.doesNotMatch(told.lines.join("\n"), /not a certain match/);
  });

  it("puts the doubt in the button, not only in the small print", () => {
    const [p] = proposeRelinks({
      payments: [pay("PAY-1", 40)],
      invoices: [inv("A-1", 100, "A")],
    }).proposals;
    const told = describeRelink(p);
    assert.match(told.button, /check first/i);
    assert.match(told.lines.join("\n"), /not a certain match/);
  });

  it("says who does the posting", () => {
    const [p] = proposeRelinks({
      payments: [pay("PAY-1", 9)],
      invoices: [inv("A-1", 9, "A")],
    }).proposals;
    assert.match(describeRelink(p).lines.join("\n"), /Payment Reconciliation/);
  });
});

describe("allocationRowFor — built from ERP's own rows", () => {
  const [p] = proposeRelinks({
    payments: [pay("PAY-1", 9)],
    invoices: [inv("A-1", 9, "A")],
  }).proposals;
  const erpPayments = [
    {
      reference_type: "Payment Entry",
      reference_name: "PAY-1",
      reference_row: "row-abc",
      amount: 9,
      difference_amount: 0,
      cost_center: "Main - X",
    },
  ];
  const erpInvoices = [
    { invoice_type: "Purchase Invoice", invoice_number: "A-1", outstanding_amount: 9, currency: "USD" },
  ];

  it("carries ERP's own identifiers through untouched", () => {
    const row = allocationRowFor(p, erpPayments, erpInvoices);
    assert.equal(row.reference_row, "row-abc", "the payment's row id is ERP's, not ours");
    assert.equal(row.invoice_type, "Purchase Invoice");
    assert.equal(row.currency, "USD");
    assert.equal(row.cost_center, "Main - X");
    assert.equal(row.allocated_amount, 9);
  });

  // 🔴 The board may have been read a minute ago. If the bill has been part-paid since, allocating
  // the stale amount would overdraw it and ERPNext would throw mid-post.
  it("clamps to whatever ERP says is available right now", () => {
    const row = allocationRowFor(p, erpPayments, [{ ...erpInvoices[0], outstanding_amount: 4 }]);
    assert.equal(row.allocated_amount, 4);
  });

  it("returns null rather than a half-built row when the pairing has gone", () => {
    assert.equal(allocationRowFor(p, [], erpInvoices), null);
    assert.equal(allocationRowFor(p, erpPayments, []), null);
    assert.equal(allocationRowFor(p, erpPayments, [{ ...erpInvoices[0], outstanding_amount: 0 }]), null);
  });
});
