import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { paymentBatchEconomics } from "../src/payment-batch-economics.js";

/** @param {Partial<import("../src/outstanding-bills.js").OutstandingBillRow>} overrides */
function bill(overrides) {
  const invoice = overrides.invoice ?? "PI-TEST";
  return {
    invoice,
    installmentKey: invoice, // matches outstanding-bills.js's default (non-exploded bill)
    supplier: "SUP-A",
    postingDate: "2026-01-01",
    dueDate: "2026-01-31",
    invoiced: 300,
    outstanding: 300,
    currency: "USD",
    ...overrides,
  };
}

describe("paymentBatchEconomics", () => {
  it("1. three same-vendor bills due Mon/Tue/Wed batch to one group", () => {
    const bills = [
      bill({ invoice: "PI-01", dueDate: "2026-03-02" }), // Monday
      bill({ invoice: "PI-02", dueDate: "2026-03-03" }), // Tuesday
      bill({ invoice: "PI-03", dueDate: "2026-03-04" }), // Wednesday
    ];
    const { groups } = paymentBatchEconomics({ bills, perPaymentFee: 0.83, apr: 0.09 });
    assert.equal(groups.length, 1);
    const g = groups[0];
    assert.equal(g.reason, "batch");
    assert.equal(g.payOn, "2026-03-02");
    assert.deepEqual(g.bills, ["PI-01", "PI-02", "PI-03"]);
    assert.equal(g.totalAmount, 900);
    assert.equal(g.feesSaved, 1.66); // (3-1) * 0.83
    assert.equal(g.floatCost, 0.22); // 300*(0.09/365)*(1+2), rounded
    assert.equal(g.netBenefit, 1.44);
    assert.ok(g.netBenefit > 0);
    assert.match(g.rationale, /3 bills batched/);
    assert.match(g.rationale, /\$1\.66/);
    assert.match(g.rationale, /\$0\.22/);
    assert.match(g.rationale, /\$1\.44/);
  });

  it("2. same bills but apr high enough that float cost beats fee savings -> no batch", () => {
    const bills = [
      bill({ invoice: "PI-01", dueDate: "2026-03-02" }),
      bill({ invoice: "PI-02", dueDate: "2026-03-03" }),
      bill({ invoice: "PI-03", dueDate: "2026-03-04" }),
    ];
    // apr: 1.0 (deliberately unrealistic) so 300*(1.0/365)*(1+2) = 2.47 > feesSaved 1.66.
    const { groups } = paymentBatchEconomics({ bills, perPaymentFee: 0.83, apr: 1.0 });
    assert.equal(groups.length, 3);
    for (const g of groups) {
      assert.equal(g.reason, "pay-alone");
      assert.equal(g.bills.length, 1);
      assert.equal(g.feesSaved, 0);
      assert.equal(g.floatCost, 0);
      assert.equal(g.netBenefit, 0);
      assert.match(g.rationale, /Not batched/);
    }
    assert.deepEqual(
      groups.map((g) => g.payOn),
      ["2026-03-02", "2026-03-03", "2026-03-04"],
    );
  });

  it("3. discount window beats batching -> discount-capture, independent of any group", () => {
    const target = bill({
      invoice: "PI-DISC",
      dueDate: "2026-04-01", // Wednesday
      discountDate: "2026-03-12", // Thursday, 20 days earlier
      discountAmount: 20,
    });
    // A same-supplier neighbor close enough it would otherwise batch with PI-DISC.
    const neighbor = bill({ invoice: "PI-NEAR", dueDate: "2026-04-02" });
    const { groups } = paymentBatchEconomics({
      bills: [target, neighbor],
      perPaymentFee: 0.83,
      apr: 0.09,
    });
    const discGroup = groups.find((g) => g.bills.includes("PI-DISC"));
    assert.equal(discGroup.reason, "discount-capture");
    assert.equal(discGroup.payOn, "2026-03-12");
    assert.equal(discGroup.bills.length, 1, "discount capture is independent, not folded into a group");
    // floatCost = 300 * (0.09/365) * 20 = 1.48 (rounded); net = 20 - 1.48 = 18.52
    assert.equal(discGroup.floatCost, 1.48);
    assert.equal(discGroup.netBenefit, 18.52);
    assert.match(discGroup.rationale, /Discount capture/);
    assert.match(discGroup.rationale, /2026-03-12/);

    const otherGroup = groups.find((g) => g.bills.includes("PI-NEAR"));
    assert.equal(otherGroup.reason, "pay-alone");
    assert.equal(otherGroup.bills.length, 1, "the neighbor lost its only batching partner");
  });

  it("4. different suppliers never batch together", () => {
    const bills = [
      bill({ invoice: "PI-A", supplier: "SUP-A", dueDate: "2026-04-15" }),
      bill({ invoice: "PI-B", supplier: "SUP-B", dueDate: "2026-04-15" }),
    ];
    const { groups } = paymentBatchEconomics({ bills, perPaymentFee: 0.83, apr: 0.09 });
    assert.equal(groups.length, 2);
    assert.ok(groups.every((g) => g.reason === "pay-alone" && g.bills.length === 1));
    assert.deepEqual(
      new Set(groups.map((g) => g.supplier)),
      new Set(["SUP-A", "SUP-B"]),
    );
  });

  it("5. bills outside groupWindowDays of each other don't batch even same-vendor", () => {
    const bills = [
      bill({ invoice: "PI-EARLY", dueDate: "2026-04-06" }), // Monday
      bill({ invoice: "PI-LATE", dueDate: "2026-04-16" }), // Thursday, 10 days later
    ];
    const { groups } = paymentBatchEconomics({ bills, perPaymentFee: 0.83, apr: 0.09 });
    assert.equal(groups.length, 2);
    assert.ok(groups.every((g) => g.reason === "pay-alone"));
  });

  it("6. empty bills -> no groups; single bill -> one pay-alone group with netBenefit 0", () => {
    assert.deepEqual(paymentBatchEconomics({ bills: [], perPaymentFee: 0.83, apr: 0.09 }), {
      groups: [],
    });
    const { groups } = paymentBatchEconomics({
      bills: [bill({ invoice: "PI-SOLO", dueDate: "2026-04-15" })],
      perPaymentFee: 0.83,
      apr: 0.09,
    });
    assert.equal(groups.length, 1);
    assert.equal(groups[0].reason, "pay-alone");
    assert.equal(groups[0].netBenefit, 0);
  });

  it("7. a single bill due on a Sunday pays on the prior Friday, float cost against the shift", () => {
    const { groups } = paymentBatchEconomics({
      bills: [bill({ invoice: "PI-SUN", dueDate: "2028-08-06" })], // Sunday
      perPaymentFee: 0.83,
      apr: 0.09,
    });
    assert.equal(groups[0].payOn, "2028-08-04"); // prior Friday
    assert.equal(groups[0].floatCost, 0, "paid on its own effective due date — no early-payment cost");
  });

  it("8. group payOn lands on the correct prior business day, not a raw holiday due date", () => {
    const bills = [
      bill({ invoice: "PI-HOL", dueDate: "2026-07-04" }), // Saturday, observed Fri 7/3 -> effective 7/2
      bill({ invoice: "PI-MON", dueDate: "2026-07-06" }), // Monday, ordinary
      bill({ invoice: "PI-WED", dueDate: "2026-07-08" }), // Wednesday, ordinary
    ];
    const { groups } = paymentBatchEconomics({ bills, perPaymentFee: 0.83, apr: 0.09 });
    assert.equal(groups.length, 1);
    assert.equal(groups[0].reason, "batch");
    assert.equal(groups[0].payOn, "2026-07-02", "earliest EFFECTIVE date, not the raw 7/4 holiday");
  });

  it("does not mutate input bill objects", () => {
    const b = bill({ invoice: "PI-IMMUTABLE", dueDate: "2026-04-15" });
    const snapshot = { ...b };
    paymentBatchEconomics({ bills: [b], perPaymentFee: 0.83, apr: 0.09 });
    assert.deepEqual(b, snapshot);
  });

  it("groupWindowDays is configurable", () => {
    const bills = [
      bill({ invoice: "PI-EARLY", dueDate: "2026-04-06" }), // Monday
      bill({ invoice: "PI-LATE", dueDate: "2026-04-16" }), // Thursday, 10 days later
    ];
    const { groups } = paymentBatchEconomics({
      bills,
      perPaymentFee: 0.83,
      apr: 0.09,
      groupWindowDays: 14,
    });
    assert.equal(groups.length, 1);
    assert.equal(groups[0].reason, "batch");
  });
});
