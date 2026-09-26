import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  proposeRelinks,
  describeRelink,
  allocationRowFor,
  splitAutoRelinks,
  relinkReviewNote,
  AUTO_LINK_LIMIT,
} from "../src/payment-relink.js";

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

/**
 * 🔴 Auto-linking (5zorro 2026-09-26). The click moved from *before* the posting to *after* it, and
 * became optional: an unallocated payment is itself an open end in the accounting, so holding the
 * books wrong until somebody clicks is worse than making them right and asking somebody to check.
 *
 * That only holds if "high confidence" is genuinely near-certain, so `auto` is a stricter test than
 * `confidence: "high"`.
 */
describe("auto-linking — what may post without being asked", () => {
  const older = { created: "2026-09-12 10:00:00" };
  const newer = { created: "2026-09-22 10:00:00" };

  it("auto-links a payment that predates the amendment", () => {
    const [p] = proposeRelinks({
      payments: [{ ...pay("P1", 9), ...older }],
      invoices: [{ ...inv("A-1", 9, "A"), ...newer }],
    }).proposals;
    assert.equal(p.confidence, "high");
    assert.equal(p.auto, true);
  });

  // 🔴 The guard that makes the posting defensible. A payment made *after* the amendment existed
  // was never attached to its predecessor, so however well the amount matches, this is not that
  // story — it is still proposed, but somebody has to look.
  it("refuses to auto-link a payment younger than the amendment", () => {
    const [p] = proposeRelinks({
      payments: [{ ...pay("P1", 9), ...newer }],
      invoices: [{ ...inv("A-1", 9, "A"), ...older }],
    }).proposals;
    assert.equal(p.confidence, "high", "still the best candidate");
    assert.equal(p.auto, false, "but not one to post unasked");
    assert.match(p.why, /cannot have been stranded/i);
  });

  it("treats an unknown date as a reason to ask, not as a yes", () => {
    const [p] = proposeRelinks({
      payments: [pay("P1", 9)],
      invoices: [inv("A-1", 9, "A")],
    }).proposals;
    assert.equal(p.auto, false);
  });

  it("never auto-links a low-confidence proposal", () => {
    const [p] = proposeRelinks({
      payments: [{ ...pay("P1", 40), ...older }],
      invoices: [{ ...inv("A-1", 100, "A"), ...newer }],
    }).proposals;
    assert.equal(p.confidence, "low");
    assert.equal(p.auto, false);
  });
});

describe("splitAutoRelinks — the cap", () => {
  const auto = (n) =>
    Array.from({ length: n }, (_, i) => ({
      payment: `P${i}`,
      invoice: `A${i}-1`,
      amount: 9,
      confidence: "high",
      auto: true,
      why: "",
    }));

  it("posts up to the limit and leaves the rest to be clicked", () => {
    const { auto: go, ask, cappedOut } = splitAutoRelinks(auto(5), 3);
    assert.equal(go.length, 3);
    assert.equal(cappedOut, 2);
    assert.equal(ask.length, 2, "the capped ones are still offered, just not posted");
  });

  // Each pairing being near-certain on its own does not make a screenful of them safe: a rule that
  // turns out to be wrong multiplies by the batch size before a human sees it.
  it("defaults to a small limit", () => {
    assert.equal(AUTO_LINK_LIMIT, 3);
    assert.equal(splitAutoRelinks(auto(10)).auto.length, 3);
  });

  it("keeps ask-only proposals in `ask`", () => {
    const mixed = [...auto(1), { payment: "PX", invoice: "AX", amount: 1, confidence: "low", auto: false, why: "" }];
    const { auto: go, ask } = splitAutoRelinks(mixed);
    assert.deepEqual(go.map((p) => p.payment), ["P0"]);
    assert.deepEqual(ask.map((p) => p.payment), ["PX"]);
  });

  it("posts nothing when the limit is zero", () => {
    const { auto: go, cappedOut } = splitAutoRelinks(auto(2), 0);
    assert.deepEqual(go, []);
    assert.equal(cappedOut, 2);
  });
});

describe("relinkReviewNote — an allocation nobody typed has to explain itself", () => {
  const [p] = proposeRelinks({
    payments: [{ ...pay("PAY-1", 9), created: "2026-09-12" }],
    invoices: [{ ...inv("A-1", 9, "A"), created: "2026-09-22" }],
  }).proposals;

  it("says who did it, why, and how to undo it", () => {
    const note = relinkReviewNote(p);
    assert.match(note, /Auto-linked by the Doc shell/);
    assert.match(note, /\$9\.00 applied to A-1/);
    assert.match(note, /inferred/i);
    assert.match(note, /UnReconcile/);
  });

  // The shell finds its own flags again by this phrase, so it is load-bearing, not decoration.
  it("starts with the phrase the shell queries ToDos by", () => {
    assert.ok(relinkReviewNote(p).startsWith("Auto-linked by the Doc shell"));
  });
});
