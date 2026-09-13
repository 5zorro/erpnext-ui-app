import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { paymentBatchEconomics } from "../src/payment-batch-economics.js";
import { paymentMethodFeeResolver } from "../src/payment-batch-prefs.js";

const round2 = (x) => Math.round(x * 100) / 100;

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

  it("9. two bills already payable on the same day become one payment, not two checks", () => {
    // A Saturday and a Sunday due date both pull back to the same Friday, so batching *those two*
    // moves no payment by a day: zero float cost, one fee saved. The third bill is what makes this
    // the real path — it drags the whole cluster's float cost past the fee saving, and because
    // resolveCluster is all-or-nothing per cluster the rejection used to scatter the same-day pair
    // into two separate checks. (A same-day pair on its own already batches inside resolveCluster.)
    const bills = [
      bill({ invoice: "PI-SAT", dueDate: "2028-08-05" }), // Saturday -> Fri 2028-08-04
      bill({ invoice: "PI-SUN", dueDate: "2028-08-06" }), // Sunday   -> Fri 2028-08-04
      bill({ invoice: "PI-LATER", dueDate: "2028-08-09" }), // Wed, 5 days of float sinks the cluster
    ];
    const { groups } = paymentBatchEconomics({ bills, perPaymentFee: 0.83, apr: 1.0 });
    assert.equal(groups.length, 2, "the same-day pair merged; the later bill still stands alone");

    const sameDay = groups.filter((g) => g.payOn === "2028-08-04");
    assert.equal(sameDay.length, 1, "one check on 2028-08-04, not one per bill");
    assert.deepEqual(sameDay[0].bills, ["PI-SAT", "PI-SUN"]);
    assert.equal(sameDay[0].reason, "batch");
    assert.equal(sameDay[0].floatCost, 0, "neither payment moved, so there is no float to cost");
    assert.equal(sameDay[0].feesSaved, 0.83);
    assert.equal(sameDay[0].netBenefit, 0.83);
    assert.equal(sameDay[0].totalAmount, 600);
    assert.match(sameDay[0].rationale, /already payable on 2028-08-04/);
    assert.match(sameDay[0].rationale, /no float cost/);

    const later = groups.find((g) => g.payOn === "2028-08-09");
    assert.deepEqual(later.bills, ["PI-LATER"], "merging is same-date only — it never moves a date");
  });

  it("10. a same-day merge never crosses suppliers, and never absorbs a discount capture", () => {
    const bills = [
      bill({ invoice: "PI-A1", supplier: "SUP-A", dueDate: "2028-08-05" }), // -> Fri 08-04
      bill({ invoice: "PI-A2", supplier: "SUP-A", dueDate: "2028-08-06" }), // -> Fri 08-04
      bill({ invoice: "PI-A3", supplier: "SUP-A", dueDate: "2028-08-09" }), // sinks SUP-A's cluster
      bill({ invoice: "PI-B1", supplier: "SUP-B", dueDate: "2028-08-05" }), // -> Fri 08-04, alone
      // Lands on the same date as SUP-A's merged pair, but it is there to capture a discount:
      // $80 saved against 56 days of float at apr 1.0 ($46.03) still wins.
      bill({
        invoice: "PI-DISC", supplier: "SUP-A", dueDate: "2028-09-29",
        discountDate: "2028-08-04", discountAmount: 80,
      }),
    ];
    const { groups } = paymentBatchEconomics({ bills, perPaymentFee: 0.83, apr: 1.0 });
    const onDate = groups.filter((g) => g.payOn === "2028-08-04");
    assert.equal(onDate.length, 3, "SUP-A's merged pair, SUP-B's lone bill, and the discount capture");
    assert.deepEqual(
      onDate.find((g) => g.supplier === "SUP-A" && g.reason === "batch").bills,
      ["PI-A1", "PI-A2"],
    );
    assert.deepEqual(onDate.find((g) => g.supplier === "SUP-B").bills, ["PI-B1"]);
    const disc = onDate.find((g) => g.reason === "discount-capture");
    assert.deepEqual(disc.bills, ["PI-DISC"], "a discount capture keeps its own identity and rationale");

    // These three share a payOn, which is exactly why the view cannot use payOn as an identity.
    assert.equal(new Set(onDate.map((g) => g.id)).size, 3, "same date, three distinct ids");
  });

  it("11. every group carries a unique, deterministic id, and no bill is lost when merging", () => {
    // 90 daily installments of one invoice — SUP-DAILY-LG. The bank calendar collapses each
    // weekend (and each pre-holiday Friday) onto a shared date, so before the merge this produced
    // 89 groups with 13 dates carrying 2-5 separate checks apiece.
    const posting = Date.UTC(2026, 6, 24);
    const iso = (t) => new Date(t).toISOString().slice(0, 10);
    const bills = Array.from({ length: 90 }, (_, i) =>
      bill({
        invoice: "PI-DAILY",
        installmentKey: `PI-DAILY#${i + 1}`,
        dueDate: iso(posting + (i + 1) * 86400000),
        invoiced: 225000,
        outstanding: 2500,
      }),
    );
    const args = { bills, perPaymentFee: 0.1, apr: 0.09, groupWindowDays: 7 };
    const { groups } = paymentBatchEconomics(args);

    const ids = groups.map((g) => g.id);
    assert.ok(ids.every((id) => typeof id === "string" && id.length > 0));
    assert.equal(new Set(ids).size, groups.length, "ids are unique");
    // Deterministic: the same inputs must give the same ids, or a re-render moves a pinned focus.
    assert.deepEqual(paymentBatchEconomics(args).groups.map((g) => g.id), ids);

    // No same-vendor date is proposed twice — the symptom 5zorro hovered into on 2026-07-24.
    const perDate = new Map();
    for (const g of groups) perDate.set(g.payOn, (perDate.get(g.payOn) || 0) + 1);
    assert.deepEqual([...perDate.values()].filter((n) => n > 1), [], "one proposed check per date");

    // And the coalescing pass neither drops nor duplicates an obligation.
    const claimed = groups.flatMap((g) => g.bills);
    assert.equal(claimed.length, 90);
    assert.equal(new Set(claimed).size, 90);
    assert.equal(
      round2(groups.reduce((s, g) => s + g.totalAmount, 0)),
      2500 * 90,
      "every dollar still accounted for",
    );
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

// --- Packet B2b: per-method partitioning --------------------------------------------------------
// A Payment Entry carries ONE header mode_of_payment, so bills paid different ways cannot merge
// into one payment however good the arithmetic looks. And with ACH at $0.40 against a $50
// international wire, one flat fee for a vendor stopped being defensible.


const PREFS = Object.freeze({ apr: 0.09, postage: 0.78, perCheck: 0.05, groupWindowDays: 7 });
const feeForMethod = paymentMethodFeeResolver(PREFS);

describe("paymentBatchEconomics — per-method partitioning (B2b)", () => {
  it("never merges bills paid by different methods, even on identical dates", () => {
    // Same vendor, same day, zero float cost — the "free merge" case. Still two payments, because
    // one PE cannot be both a cheque and a wire.
    const bills = [
      bill({ invoice: "PI-CHQ", dueDate: "2026-03-04", modeOfPayment: "USPS_Check" }),
      bill({ invoice: "PI-ACH", dueDate: "2026-03-04", modeOfPayment: "ACH" }),
    ];
    const { groups } = paymentBatchEconomics({ bills, perPaymentFee: 0.83, apr: 0.09, feeForMethod });
    assert.equal(groups.length, 2);
    assert.deepEqual(groups.map((g) => g.method).sort(), ["ACH", "USPS_Check"]);
    for (const g of groups) assert.equal(g.bills.length, 1);
  });

  it("still merges same-method bills on the same date", () => {
    const bills = [
      bill({ invoice: "PI-A1", dueDate: "2026-03-04", modeOfPayment: "ACH" }),
      bill({ invoice: "PI-A2", dueDate: "2026-03-04", modeOfPayment: "ACH" }),
    ];
    const { groups } = paymentBatchEconomics({ bills, perPaymentFee: 0.83, apr: 0.09, feeForMethod });
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].bills, ["PI-A1", "PI-A2"]);
    assert.equal(groups[0].method, "ACH");
    assert.equal(groups[0].feesSaved, 0.4, "priced at the ACH fee, not the cheque fee");
  });

  it("prices each partition at its own fee", () => {
    const bills = [
      bill({ invoice: "PI-W1", dueDate: "2026-03-04", modeOfPayment: "DOM_WIRE" }),
      bill({ invoice: "PI-W2", dueDate: "2026-03-04", modeOfPayment: "DOM_WIRE" }),
      bill({ invoice: "PI-C1", dueDate: "2026-03-04", modeOfPayment: "USPS_Check" }),
      bill({ invoice: "PI-C2", dueDate: "2026-03-04", modeOfPayment: "USPS_Check" }),
    ];
    const { groups } = paymentBatchEconomics({ bills, perPaymentFee: 0.83, apr: 0.09, feeForMethod });
    const wire = groups.find((g) => g.method === "DOM_WIRE");
    const cheque = groups.find((g) => g.method === "USPS_Check");
    assert.equal(wire.feesSaved, 25, "one wire avoided is $25");
    assert.equal(cheque.feesSaved, 0.83);
    assert.equal(wire.perPaymentFee, 25, "the input is recorded, not just the arithmetic (B5)");
    assert.equal(cheque.perPaymentFee, 0.83);
  });

  it("batches wires that cheques of the same shape would not justify", () => {
    // The headline consequence of the real numbers. Two $5,000 bills a week apart:
    //   float of pulling one 7 days early ≈ 5000 * 0.09 * 7/365 = $8.63
    //   ACH saves $0.40  -> not worth it
    //   DOM_WIRE saves $25 -> clearly worth it
    const mk = (method) => [
      bill({ invoice: `${method}-1`, dueDate: "2026-03-04", outstanding: 5000, invoiced: 5000, modeOfPayment: method }),
      bill({ invoice: `${method}-2`, dueDate: "2026-03-11", outstanding: 5000, invoiced: 5000, modeOfPayment: method }),
    ];

    const ach = paymentBatchEconomics({ bills: mk("ACH"), perPaymentFee: 0.83, apr: 0.09, feeForMethod }).groups;
    assert.equal(ach.length, 2, "ACH at $0.40 never justifies moving a $5,000 bill");
    for (const g of ach) assert.equal(g.reason, "pay-alone");

    const wire = paymentBatchEconomics({ bills: mk("DOM_WIRE"), perPaymentFee: 0.83, apr: 0.09, feeForMethod }).groups;
    assert.equal(wire.length, 1, "a $25 wire fee comfortably beats $8.63 of float");
    assert.equal(wire[0].reason, "batch");
    assert.ok(wire[0].netBenefit > 0);
  });

  it("keeps NULL-method bills in their own partition, priced at the fallback", () => {
    // Every payment_schedule row in the sandbox is NULL mode_of_payment until A5 seeds it.
    const bills = [
      bill({ invoice: "PI-NULL1", dueDate: "2026-03-04" }),
      bill({ invoice: "PI-NULL2", dueDate: "2026-03-04" }),
      bill({ invoice: "PI-ACH", dueDate: "2026-03-04", modeOfPayment: "ACH" }),
    ];
    const { groups } = paymentBatchEconomics({ bills, perPaymentFee: 0.83, apr: 0.09, feeForMethod });
    const unknown = groups.find((g) => g.method === undefined);
    assert.deepEqual(unknown.bills, ["PI-NULL1", "PI-NULL2"]);
    assert.equal(unknown.perPaymentFee, 0.83, "unknown falls back to the cheque fee, never to $0");
    assert.ok(groups.some((g) => g.method === "ACH"));
  });

  it("gives every group a unique id across partitions", () => {
    const bills = [
      bill({ invoice: "PI-1", dueDate: "2026-03-04", modeOfPayment: "ACH" }),
      bill({ invoice: "PI-2", dueDate: "2026-03-04", modeOfPayment: "USPS_Check" }),
      bill({ invoice: "PI-3", dueDate: "2026-03-04", modeOfPayment: "DOM_WIRE" }),
    ];
    const { groups } = paymentBatchEconomics({ bills, perPaymentFee: 0.83, apr: 0.09, feeForMethod });
    const ids = groups.map((g) => g.id);
    assert.equal(new Set(ids).size, ids.length, "same payOn across partitions must not collide");
  });

  it("is byte-identical to the old behaviour when feeForMethod is omitted", () => {
    const mk = () => [
      bill({ invoice: "PI-01", dueDate: "2026-03-02", modeOfPayment: "ACH" }),
      bill({ invoice: "PI-02", dueDate: "2026-03-03", modeOfPayment: "DOM_WIRE" }),
      bill({ invoice: "PI-03", dueDate: "2026-03-04" }),
    ];
    const before = paymentBatchEconomics({ bills: mk(), perPaymentFee: 0.83, apr: 0.09 });
    // Methods present on the bills must be ignored entirely without the resolver — otherwise the
    // existing caller would silently change behaviour before B2a's wiring lands.
    assert.equal(before.groups.length, 1);
    assert.equal(before.groups[0].method, undefined);
    assert.equal(before.groups[0].perPaymentFee, undefined);
  });

  it("survives a resolver that throws, rather than losing the vendor card", () => {
    const bills = [bill({ invoice: "PI-X", dueDate: "2026-03-04", modeOfPayment: "ACH" })];
    const { groups } = paymentBatchEconomics({
      bills,
      perPaymentFee: 0.83,
      apr: 0.09,
      feeForMethod: () => {
        throw new Error("prefs unreadable");
      },
    });
    assert.equal(groups.length, 1);
    assert.equal(groups[0].perPaymentFee, 0.83, "falls back to the flat fee");
  });

  it("never lets a resolver return a negative or non-finite fee", () => {
    const bills = [
      bill({ invoice: "PI-A", dueDate: "2026-03-04", modeOfPayment: "ACH" }),
      bill({ invoice: "PI-B", dueDate: "2026-03-04", modeOfPayment: "ACH" }),
    ];
    for (const bad of [-5, NaN, Infinity, "free", null, undefined]) {
      const { groups } = paymentBatchEconomics({
        bills,
        perPaymentFee: 0.83,
        apr: 0.09,
        feeForMethod: () => bad,
      });
      assert.equal(groups[0].perPaymentFee, 0.83, `fee ${String(bad)} must fall back`);
      assert.ok(groups[0].feesSaved >= 0);
    }
  });

  it("does not mutate the input bills when partitioning", () => {
    const b = bill({ invoice: "PI-IMM", dueDate: "2026-03-04", modeOfPayment: "ACH" });
    const snapshot = { ...b };
    paymentBatchEconomics({ bills: [b], perPaymentFee: 0.83, apr: 0.09, feeForMethod });
    assert.deepEqual(b, snapshot);
  });
});
