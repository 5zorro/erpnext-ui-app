import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  paymentBatchEconomics,
  explainGroupMembership,
  describeGroupMembership,
} from "../src/payment-batch-economics.js";
import { paymentMethodFeeResolver } from "../src/payment-batch-prefs.js";
import { effectivePayByDate } from "../src/bank-business-days.js";

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
    // apr: 1.2 (deliberately unrealistic) so even ONE day early costs 300*(1.2/365) = $0.99, more
    // than the $0.83 fee. It was 1.0 under the all-or-nothing engine, which rejected the whole
    // cluster — but at 1.0 one day costs $0.82, so pairing two adjacent bills genuinely saves $0.01
    // and the exact grouping (rightly) takes it.
    const { groups } = paymentBatchEconomics({ bills, perPaymentFee: 0.83, apr: 1.2 });
    assert.equal(groups.length, 3);
    for (const g of groups) {
      assert.equal(g.reason, "pay-alone");
      assert.equal(g.bills.length, 1);
      assert.equal(g.feesSaved, 0);
      assert.equal(g.floatCost, 0);
      assert.equal(g.netBenefit, 0);
    }
    assert.match(groups[0].rationale, /Paid alone: no later SUP-A bill is worth paying early to join it/);
    for (const g of groups.slice(1)) {
      assert.match(g.rationale, /Not batched: joining the 2026-03-0\d payment means paying 1 day early — \$0\.99 float cost, more than the \$0\.83 fee it would save/);
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

  it("5. a bill is paid early exactly as far as its float stays under the fee — there is no window", () => {
    // $300 at 9% costs $0.074 a day early, so a $0.83 cheque fee buys about 11 days.
    const near = [
      bill({ invoice: "PI-EARLY", dueDate: "2026-04-06" }), // Monday
      bill({ invoice: "PI-10", dueDate: "2026-04-16" }), // Thursday, 10 days later: $0.74 float
    ];
    const a = paymentBatchEconomics({ bills: near, perPaymentFee: 0.83, apr: 0.09 }).groups;
    assert.equal(a.length, 1, "the old 7-day window refused this, though it saves $0.09");
    assert.equal(a[0].reason, "batch");
    assert.equal(a[0].floatCost, 0.74);
    assert.equal(a[0].netBenefit, 0.09);

    const far = [
      bill({ invoice: "PI-EARLY", dueDate: "2026-04-06" }), // Monday
      bill({ invoice: "PI-14", dueDate: "2026-04-20" }), // Monday, 14 days later: $1.04 float
    ];
    const b = paymentBatchEconomics({ bills: far, perPaymentFee: 0.83, apr: 0.09 }).groups;
    assert.equal(b.length, 2);
    assert.ok(b.every((g) => g.reason === "pay-alone"));
    assert.match(b[1].rationale, /paying 14 days early — \$1\.04 float cost, more than the \$0\.83 fee/);
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
    // moves no payment by a day: zero float cost, one fee saved. The third bill is what made this
    // the real path — it dragged the whole cluster's float cost past the fee saving, and the old
    // all-or-nothing engine scattered the same-day pair into two separate checks. The exact grouping
    // has no such path, but the dogfood symptom stays pinned.
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
    const args = { bills, perPaymentFee: 0.1, apr: 0.09 };
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

    // And the grouping neither drops nor duplicates an obligation.
    const claimed = groups.flatMap((g) => g.bills);
    assert.equal(claimed.length, 90);
    assert.equal(new Set(claimed).size, 90);
    assert.equal(
      round2(groups.reduce((s, g) => s + g.totalAmount, 0)),
      2500 * 90,
      "every dollar still accounted for",
    );
  });

  it("a groupWindowDays argument from an old caller changes nothing", () => {
    const bills = [
      bill({ invoice: "PI-EARLY", dueDate: "2026-04-06" }), // Monday
      bill({ invoice: "PI-LATE", dueDate: "2026-04-16" }), // Thursday, 10 days later
    ];
    const plain = paymentBatchEconomics({ bills, perPaymentFee: 0.83, apr: 0.09 });
    for (const groupWindowDays of [0, 3, 7, 14]) {
      assert.deepEqual(
        paymentBatchEconomics({ bills, perPaymentFee: 0.83, apr: 0.09, groupWindowDays }),
        plain,
        `window ${groupWindowDays}`,
      );
    }
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

describe("paymentBatchEconomics: a discount capture still knows its method", () => {
  const bill = {
    invoice: "PI-DISC",
    installmentKey: "PI-DISC",
    supplier: "Vendor D",
    postingDate: "2026-09-05",
    dueDate: "2026-10-07",
    invoiced: 60000,
    outstanding: 60000,
    currency: "USD",
    discountDate: "2026-09-15",
    discountAmount: 1200,
    modeOfPayment: "ACH",
  };

  // Found 2026-09-11 by rendering C3's chip: discount capture is decided in pass 1, before the
  // method partitioning, so it never reached tagMethod and every such node claimed "No method"
  // while its own bill plainly carried ACH. A false statement about the bill, not just a gap.
  it("tags the method and the fee it was priced at", () => {
    const { groups } = paymentBatchEconomics({
      bills: [bill],
      perPaymentFee: 0.83,
      apr: 0.09,
      feeForMethod: (m) => (m === "ACH" ? 0.4 : 0.83),
    });
    assert.equal(groups.length, 1);
    assert.equal(groups[0].reason, "discount-capture");
    assert.equal(groups[0].method, "ACH");
    assert.equal(groups[0].perPaymentFee, 0.4);
  });

  it("leaves the method absent when the bill records none", () => {
    const { groups } = paymentBatchEconomics({
      bills: [{ ...bill, modeOfPayment: undefined }],
      perPaymentFee: 0.83,
      apr: 0.09,
      feeForMethod: () => 0.83,
    });
    assert.equal(groups[0].method, undefined, "absent, never the empty string");
    assert.equal(groups[0].perPaymentFee, 0.83);
  });

  // The no-feeForMethod path must stay byte-identical to its pre-B2b behaviour.
  it("adds nothing at all when the caller did not opt into per-method pricing", () => {
    const { groups } = paymentBatchEconomics({ bills: [bill], perPaymentFee: 0.83, apr: 0.09 });
    assert.equal("method" in groups[0], false);
    assert.equal("perPaymentFee" in groups[0], false);
  });
});

// 5zorro 2026-09-12: the row audit walked 8/2 -> 8/1 -> 7/31 and stopped, while the suggested payment
// beside it said 7/28. These pin the step that connects the two.
describe("explainGroupMembership: why a bill pays on its group's date", () => {
  const run = (bills, extra = {}) =>
    paymentBatchEconomics({ bills, perPaymentFee: 0.83, apr: 0.09, ...extra }).groups;
  const find = (groups, key) => groups.find((g) => g.bills.includes(key));

  it("a bill pulled forward is credited one fee and charged only its own float", () => {
    const bills = [
      bill({ invoice: "PI-01", dueDate: "2026-03-02" }), // Monday
      bill({ invoice: "PI-02", dueDate: "2026-03-04" }), // Wednesday
    ];
    const groups = run(bills);
    assert.equal(groups.length, 1);
    const m = explainGroupMembership(groups[0], bills[1], { apr: 0.09 });
    assert.equal(m.kind, "joined-early");
    assert.equal(m.ownPayOn, "2026-03-04");
    assert.equal(m.payOn, "2026-03-02");
    assert.equal(m.daysEarly, 2);
    assert.equal(m.feeSaved, 0.83);
    assert.equal(m.floatCost, 0.15); // 300 * 0.09/365 * 2
    assert.equal(m.net, 0.68);

    const { step, note } = describeGroupMembership(m);
    assert.equal(step.rule, "batched");
    assert.equal(step.date, "2026-03-02");
    assert.equal(step.deltaDays, -2, "signed like the calendar steps above it");
    assert.equal(step.severity, undefined);
    assert.match(step.detail, /\$0\.68 saved by batching with the 2026-03-02 payment/);
    assert.match(step.detail, /\$0\.83 payment fee against \$0\.15 float cost for paying 2 days early/);
    assert.match(step.detail, /\$300\.00 × 9% APR × 2\/365/);
    assert.match(note, /2 bills, \$0\.83 fees saved − \$0\.15 float cost = \$0\.68 net/);
  });

  it("the earliest bill sets the date and is credited nothing", () => {
    const bills = [bill({ invoice: "PI-01", dueDate: "2026-03-02" }), bill({ invoice: "PI-02", dueDate: "2026-03-04" })];
    const m = explainGroupMembership(run(bills)[0], bills[0], { apr: 0.09 });
    assert.equal(m.kind, "sets-date");
    assert.equal(m.net, 0);
    const { step } = describeGroupMembership(m);
    assert.equal(step.label, "Sets the payment date");
    assert.equal(step.deltaDays, 0);
    assert.match(step.detail, /other 1 is paid with it/);
  });

  // The property that makes the row audit and the group popup one explanation, not two.
  it("per-bill nets add back up to the group's net benefit", () => {
    const bills = [
      bill({ invoice: "PI-01", dueDate: "2026-03-02" }),
      bill({ invoice: "PI-02", dueDate: "2026-03-03" }),
      bill({ invoice: "PI-03", dueDate: "2026-03-04" }),
    ];
    const [g] = run(bills);
    const sum = bills.reduce((s, b) => s + explainGroupMembership(g, b, { apr: 0.09 }).net, 0);
    assert.ok(Math.abs(round2(sum) - g.netBenefit) <= 0.01, `${sum} vs ${g.netBenefit}`);
  });

  it("a bill the calendar already put on the group's date saves a fee at no float", () => {
    const bills = [
      bill({ invoice: "PI-SAT", dueDate: "2026-03-07" }), // Saturday -> Friday 03-06
      bill({ invoice: "PI-SUN", dueDate: "2026-03-08" }), // Sunday   -> Friday 03-06
    ];
    const [g] = run(bills);
    const m = explainGroupMembership(g, bills[1], { apr: 0.09 });
    assert.equal(m.kind, "same-day");
    assert.equal(m.daysEarly, 0);
    assert.equal(m.floatCost, 0);
    assert.equal(m.net, 0.83);
    assert.match(describeGroupMembership(m).step.detail, /already payable that day/);
  });

  // The engine can no longer produce this (see the cheapest-grouping suite below) — it is the exact
  // batch the old all-or-nothing engine proposed. This function accepts any group, so a losing
  // member is still reported rather than assumed away.
  it("still flags a member whose own float exceeds the fee it saves, in a group built elsewhere", () => {
    const bills = [
      bill({ invoice: "PI-01", dueDate: "2026-03-02", outstanding: 300 }),
      bill({ invoice: "PI-02", dueDate: "2026-03-03", outstanding: 300 }),
      bill({ invoice: "PI-BIG", dueDate: "2026-03-05", outstanding: 50000 }), // 3 days early: $36.99 float
    ];
    const handBuilt = {
      supplier: "SUP-A",
      bills: ["PI-01", "PI-02", "PI-BIG"],
      payOn: "2026-03-02",
      totalAmount: 50600,
      feesSaved: 50,
      floatCost: 37.06,
      netBenefit: 12.94,
      rationale: "",
      reason: "batch",
    };
    const m = explainGroupMembership(handBuilt, bills[2], { apr: 0.09 });
    assert.equal(m.fee, 25, "read back off feesSaved / (n - 1)");
    assert.equal(m.net, -11.99);
    const { step } = describeGroupMembership(m);
    assert.equal(step.severity, "warn");
    assert.match(step.detail, /Costs \$11\.99 more than it saves on its own/);
    assert.match(step.detail, /Paying it alone would be cheaper/);
  });

  it("prices with the fee the group recorded, not the caller's fallback", () => {
    const bills = [
      bill({ invoice: "PI-01", dueDate: "2026-03-02", modeOfPayment: "ACH" }),
      bill({ invoice: "PI-02", dueDate: "2026-03-03", modeOfPayment: "ACH" }),
    ];
    const [g] = run(bills, { feeForMethod: (m) => (m === "ACH" ? 0.4 : 0.83) });
    const m = explainGroupMembership(g, bills[1], { apr: 0.09, perPaymentFee: 99 });
    assert.equal(m.fee, 0.4);
    assert.equal(m.method, "ACH");
    assert.match(describeGroupMembership(m, { methodLabel: "ACH" }).step.detail, /one \$0\.40 ACH payment fee/);
  });

  it("passes the engine's own reasoning through for pay-alone and discount capture", () => {
    const threes = [
      bill({ invoice: "PI-01", dueDate: "2026-03-02" }),
      bill({ invoice: "PI-02", dueDate: "2026-03-03" }),
    ];
    const alone = paymentBatchEconomics({ bills: threes, perPaymentFee: 0.01, apr: 1.0 }).groups;
    const a = describeGroupMembership(explainGroupMembership(find(alone, "PI-02"), threes[1], { apr: 1.0 }));
    assert.equal(a.step.label, "Paid alone");
    assert.match(a.step.detail, /Not batched/);
    assert.equal(a.step.deltaDays, 0);

    const disc = bill({ invoice: "PI-D", dueDate: "2026-03-31", discountDate: "2026-03-10", discountAmount: 6 });
    const [dg] = run([disc]);
    assert.equal(dg.reason, "discount-capture");
    const dm = explainGroupMembership(dg, disc, { apr: 0.09 });
    assert.equal(dm.kind, "discount-capture");
    assert.equal(dm.ownPayOn, "2026-03-10", "measured from the discount deadline, not the due date");
    assert.match(describeGroupMembership(dm).step.detail, /Discount capture/);
  });

  it("never claims a saving it could not compute", () => {
    const bills = [bill({ invoice: "PI-01", dueDate: "2026-03-02" }), bill({ invoice: "PI-02", dueDate: "2026-03-04" })];
    const m = explainGroupMembership(run(bills)[0], bills[1], {});
    assert.equal(m.floatCost, null);
    assert.equal(m.net, null);
    assert.match(describeGroupMembership(m).step.detail, /float cost unknown/);
  });

  it("returns null for a bill outside the group, and for junk", () => {
    const bills = [bill({ invoice: "PI-01", dueDate: "2026-03-02" }), bill({ invoice: "PI-02", dueDate: "2026-03-04" })];
    const [g] = run(bills);
    assert.equal(explainGroupMembership(g, bill({ invoice: "PI-ZZ" }), { apr: 0.09 }), null);
    assert.equal(explainGroupMembership(null, bills[0]), null);
    assert.equal(explainGroupMembership(g, null), null);
    assert.equal(describeGroupMembership(null), null);
  });
});

// 5zorro 2026-09-12: "I feel like a bill that loses money inside a batch, should make a new batch.
// The larger bill then has a net cost of zero and the subsequent bills that get grouped with that
// large one have less float loss." The engine now finds the cheapest grouping exactly.
describe("paymentBatchEconomics — the cheapest grouping, exactly", () => {
  const mk = (invoice, dueDate, outstanding) => bill({ invoice, dueDate, outstanding, invoiced: outstanding });
  const run = (bills, perPaymentFee = 25, apr = 0.09) =>
    paymentBatchEconomics({ bills, perPaymentFee, apr }).groups;

  it("splits off a bill that would lose money, instead of letting it ride along", () => {
    const groups = run([mk("S1", "2026-03-02", 300), mk("S2", "2026-03-03", 300), mk("BIG", "2026-03-05", 50000)]);
    assert.deepEqual(groups.map((g) => g.bills), [["S1", "S2"], ["BIG"]]);
    assert.equal(groups[0].netBenefit, 24.93, "was $12.94 with BIG riding along");
    assert.equal(groups[1].payOn, "2026-03-05");
    assert.match(
      groups[1].rationale,
      /joining the 2026-03-02 payment means paying 3 days early — \$36\.99 float cost, more than the \$25\.00 fee/,
    );
  });

  it("keeps the profitable part of a group that loses overall, instead of scattering it", () => {
    const groups = run([mk("S1", "2026-03-02", 300), mk("S2", "2026-03-03", 300), mk("BIG", "2026-03-09", 50000)]);
    assert.deepEqual(groups.map((g) => g.bills), [["S1", "S2"], ["BIG"]]);
    assert.equal(groups[0].reason, "batch");
    assert.equal(groups[0].netBenefit, 24.93, "the old engine paid all three alone and saved nothing");
  });

  // The second half of 5zorro's point: bills after the big one join the big one's nearer date.
  it("starts a new payment at the big bill, and later bills join that nearer date", () => {
    const groups = run([
      mk("S1", "2026-03-02", 300),
      mk("BIG", "2026-03-05", 50000),
      mk("T1", "2026-03-06", 300), // Friday
      mk("T2", "2026-03-09", 300), // Monday
    ]);
    assert.deepEqual(groups.map((g) => g.bills), [["S1"], ["BIG", "T1", "T2"]]);
    assert.equal(groups[1].payOn, "2026-03-05");
    assert.equal(groups[1].floatCost, 0.37, "T1 1 day + T2 4 days on BIG's date, not 4 + 7 on S1's");
    assert.equal(groups[1].netBenefit, 49.63);
  });

  /** Deterministic PRNG so a failure reproduces. */
  function mulberry32(seed) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const dayOf = (iso) => Date.parse(`${iso}T00:00:00Z`) / 86400000;

  /** Fees + float of one payment made on its earliest member's payable date. */
  function paymentCost(members, fee, apr) {
    const first = Math.min(...members.map((b) => dayOf(effectivePayByDate(b.dueDate))));
    return members.reduce(
      (s, b) => s + b.outstanding * (apr / 365) * (dayOf(effectivePayByDate(b.dueDate)) - first),
      fee,
    );
  }

  /** The cheapest cost over EVERY set partition — not only runs of consecutive bills. */
  function bruteForceMin(bills, fee, apr) {
    let best = Infinity;
    const blocks = [];
    (function assign(k) {
      if (k === bills.length) {
        best = Math.min(best, blocks.reduce((s, blk) => s + paymentCost(blk, fee, apr), 0));
        return;
      }
      for (const blk of blocks) {
        blk.push(bills[k]);
        assign(k + 1);
        blk.pop();
      }
      blocks.push([bills[k]]);
      assign(k + 1);
      blocks.pop();
    })(0);
    return best;
  }

  function randomVendor(rand) {
    const n = 1 + Math.floor(rand() * 7);
    const amounts = [40, 300, 1200, 5000, 50000];
    return Array.from({ length: n }, (_, i) =>
      mk(
        `R${i}`,
        new Date(Date.UTC(2026, 2, 2 + Math.floor(rand() * 21))).toISOString().slice(0, 10),
        amounts[Math.floor(rand() * amounts.length)],
      ),
    );
  }

  const FEES = [0.4, 0.83, 25, 50];
  const APRS = [0.09, 0.2, 1.0];

  it("matches brute force over every possible grouping, on 300 random vendors", () => {
    const rand = mulberry32(20260912);
    for (let trial = 0; trial < 300; trial++) {
      const bills = randomVendor(rand);
      const fee = FEES[Math.floor(rand() * FEES.length)];
      const apr = APRS[Math.floor(rand() * APRS.length)];
      const byKey = new Map(bills.map((b) => [b.installmentKey, b]));
      const groups = run(bills, fee, apr);
      const engineCost = groups.reduce((s, g) => s + paymentCost(g.bills.map((k) => byKey.get(k)), fee, apr), 0);
      const expected = bruteForceMin(bills, fee, apr);
      assert.ok(
        Math.abs(engineCost - expected) < 1e-6,
        `trial ${trial}: engine ${engineCost} vs best ${expected} for ${JSON.stringify({ fee, apr, bills: bills.map((b) => [b.dueDate, b.outstanding]) })}`,
      );
      assert.equal(groups.flatMap((g) => g.bills).length, bills.length, `trial ${trial}: every bill paid once`);
    }
  });

  it("never proposes a batch member whose own float exceeds the fee it saves", () => {
    const rand = mulberry32(7);
    for (let trial = 0; trial < 300; trial++) {
      const bills = randomVendor(rand);
      const fee = FEES[Math.floor(rand() * FEES.length)];
      const apr = APRS[Math.floor(rand() * APRS.length)];
      for (const g of run(bills, fee, apr)) {
        if (g.reason !== "batch") continue;
        for (const b of bills.filter((x) => g.bills.includes(x.installmentKey))) {
          const m = explainGroupMembership(g, b, { apr });
          assert.ok(m.net === 0 || m.net >= -0.005, `trial ${trial}: ${b.installmentKey} nets ${m.net} in ${g.id}`);
        }
      }
    }
  });
});

// C8: a batch never straddles a check run — the later bills would be finalized a run early, which
// is exactly the rework the cutoff exists to avoid.
describe("paymentBatchEconomics — never combines across a check run", () => {
  const two = () => [
    bill({ invoice: "S1", dueDate: "2026-03-02" }), // Monday
    bill({ invoice: "S2", dueDate: "2026-03-03" }), // Tuesday: batches with S1 when nothing stops it
  ];

  it("splits a batch that would span a boundary, and says why on both sides", () => {
    const { groups } = paymentBatchEconomics({ bills: two(), perPaymentFee: 0.83, apr: 0.09, runBreaks: ["2026-03-03"] });
    assert.deepEqual(groups.map((g) => g.bills), [["S1"], ["S2"]]);
    assert.ok(groups.every((g) => g.reason === "pay-alone"));
    assert.match(groups[0].rationale, /the next SUP-A bill belongs to the 2026-03-03 check run or later/);
    assert.match(groups[1].rationale, /Not combined with earlier SUP-A bills: those go out before the 2026-03-03 check run/);
  });

  it("still finds the cheapest grouping inside one run", () => {
    const { groups } = paymentBatchEconomics({ bills: two(), perPaymentFee: 0.83, apr: 0.09, runBreaks: ["2026-03-10"] });
    assert.equal(groups.length, 1);
    assert.equal(groups[0].reason, "batch");
  });

  it("keeps bills payable on the same day together, even with a boundary on that day", () => {
    const bills = [
      bill({ invoice: "PI-SAT", dueDate: "2026-03-07" }), // -> Friday 03-06
      bill({ invoice: "PI-SUN", dueDate: "2026-03-08" }), // -> Friday 03-06
    ];
    const { groups } = paymentBatchEconomics({ bills, perPaymentFee: 0.83, apr: 0.09, runBreaks: ["2026-03-06"] });
    assert.deepEqual(groups.map((g) => g.bills), [["PI-SAT", "PI-SUN"]]);
  });

  it("is identical to no boundaries when none, or only junk, are given", () => {
    const plain = paymentBatchEconomics({ bills: two(), perPaymentFee: 0.83, apr: 0.09 });
    for (const runBreaks of [[], ["nope", null, 7], undefined, "2026-03-03"]) {
      assert.deepEqual(
        paymentBatchEconomics({ bills: two(), perPaymentFee: 0.83, apr: 0.09, runBreaks }),
        plain,
        JSON.stringify(runBreaks),
      );
    }
  });

  it("a later stretch batches among itself on its own", () => {
    const bills = [
      bill({ invoice: "A", dueDate: "2026-03-02" }),
      bill({ invoice: "B", dueDate: "2026-03-10" }), // Tuesday
      bill({ invoice: "C", dueDate: "2026-03-11" }), // Wednesday
    ];
    const { groups } = paymentBatchEconomics({ bills, perPaymentFee: 0.83, apr: 0.09, runBreaks: ["2026-03-09"] });
    assert.deepEqual(groups.map((g) => g.bills), [["A"], ["B", "C"]]);
    assert.equal(groups[1].reason, "batch");
  });
});
