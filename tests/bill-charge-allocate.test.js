import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  money2,
  splitByWeights,
  splitCustom,
  planChargeToStockAllocation,
  isAllocatableChargeRow,
  allocationBasisWeights,
  taxRowDeleteAllowed,
} from "../src/bill-charge-allocate.js";

describe("bill-charge-allocate (OI-140)", () => {
  it("splitByWeights puts remainder cents on largest weight", () => {
    const { shares, remainder } = splitByWeights(10, [1, 1, 1]);
    assert.equal(remainder, 0);
    assert.equal(money2(shares.reduce((a, b) => a + b, 0)), 10);
    // Equal weights → first index gets the penny remainder after floor split
    assert.ok(shares[0] >= shares[1]);
  });

  it("splitByWeights leaves remainder when no positive weights", () => {
    const { shares, remainder } = splitByWeights(5, [0, 0]);
    assert.deepEqual(shares, [0, 0]);
    assert.equal(remainder, 5);
  });

  it("allocates by amount and builds Deduct offset", () => {
    const plan = planChargeToStockAllocation({
      mode: "amount",
      chargeAmount: 10,
      chargeAccount: "Freight - HI",
      chargeDescription: "Freight",
      items: [
        { rowIndex: 0, qty: 1, rate: 40, amount: 40 },
        { rowIndex: 1, qty: 1, rate: 60, amount: 60 },
      ],
    });
    assert.equal(plan.ok, true);
    assert.equal(plan.allocatedTotal, 10);
    assert.equal(plan.offsetTax.add_deduct_tax, "Deduct");
    assert.equal(plan.offsetTax.tax_amount, 10);
    assert.equal(plan.itemUpdates.length, 2);
    const u0 = plan.itemUpdates.find((u) => u.rowIndex === 0);
    const u1 = plan.itemUpdates.find((u) => u.rowIndex === 1);
    assert.equal(u0.addAmount, 4);
    assert.equal(u1.addAmount, 6);
    assert.equal(u0.nextAmount, 44);
    assert.equal(u1.nextAmount, 66);
  });

  it("allocates by qty", () => {
    const plan = planChargeToStockAllocation({
      mode: "qty",
      chargeAmount: 9,
      chargeAccount: "Freight - HI",
      items: [
        { rowIndex: 0, qty: 1, rate: 100, amount: 100 },
        { rowIndex: 1, qty: 2, rate: 50, amount: 100 },
      ],
    });
    assert.equal(plan.ok, true);
    const by = Object.fromEntries(plan.itemUpdates.map((u) => [u.rowIndex, u.addAmount]));
    assert.equal(by[0], 3);
    assert.equal(by[1], 6);
  });

  it("custom dollars; remainder to largest share / first id", () => {
    const plan = planChargeToStockAllocation({
      mode: "custom",
      chargeAmount: 10,
      chargeAccount: "Freight - HI",
      custom: [
        { rowIndex: 0, dollars: 4 },
        { rowIndex: 1, dollars: 4 },
      ],
      items: [
        { rowIndex: 0, qty: 1, rate: 10, amount: 10 },
        { rowIndex: 1, qty: 1, rate: 10, amount: 10 },
      ],
    });
    assert.equal(plan.ok, true);
    assert.equal(plan.allocatedTotal, 10);
    const by = Object.fromEntries(plan.itemUpdates.map((u) => [u.rowIndex, u.addAmount]));
    assert.equal(by[0] + by[1], 10);
  });

  it("rejects Deduct / zero charge rows", () => {
    assert.equal(isAllocatableChargeRow({ add_deduct_tax: "Add", tax_amount: 5 }), true);
    assert.equal(isAllocatableChargeRow({ add_deduct_tax: "Deduct", tax_amount: 5 }), false);
    assert.equal(isAllocatableChargeRow({ add_deduct_tax: "Add", tax_amount: 0 }), false);
  });

  it("allocationBasisWeights", () => {
    assert.deepEqual(
      allocationBasisWeights(
        [
          { qty: 2, amount: 10 },
          { qty: 0, amount: 50 },
        ],
        "qty",
      ),
      [2, 0],
    );
  });

  it("splitCustom percent of charge", () => {
    const { shares } = splitCustom(100, [{ rowIndex: 0 }, { rowIndex: 1 }], [
      { rowIndex: 0, percent: 25 },
      { rowIndex: 1, percent: 75 },
    ]);
    assert.deepEqual(shares, [25, 75]);
  });

  it("taxRowDeleteAllowed freezes while allocate modal is open", () => {
    assert.equal(taxRowDeleteAllowed(false), true);
    assert.equal(taxRowDeleteAllowed(true), false);
  });
});

// 5zorro 2026-10-11, DF-02: 14.28 allocated, the lines rose 14.27 — rates were rounded per unit and
// nobody checked the total. The lines must take exactly what the offset says.
import { lineAmountCents, exactRates } from "../src/bill-charge-allocate.js";

describe("allocation is exact to the cent", () => {
  const rise = (items, plan) =>
    plan.itemUpdates.reduce((a, u) => {
      const it = items.find((x) => x.rowIndex === u.rowIndex);
      return a + lineAmountCents(it.qty, u.nextRate) - lineAmountCents(it.qty, it.rate);
    }, 0);

  it("DF-02: 3 @ 21.00 and 4 @ 26.50, 14.28 of tax → lines rise exactly 14.28", () => {
    const items = [
      { rowIndex: 0, qty: 3, rate: 21, amount: 63 },
      { rowIndex: 1, qty: 4, rate: 26.5, amount: 106 },
    ];
    const plan = planChargeToStockAllocation({ items, chargeAmount: 14.28, mode: "amount", chargeAccount: "5225 - Tax Expense" });
    assert.equal(plan.ok, true);
    assert.equal(rise(items, plan), 1428);
    assert.equal(plan.allocatedTotal, 14.28);
    assert.equal(plan.offsetTax.tax_amount, 14.28);
    assert.equal(plan.remainder, 0);
  });

  it("when no whole-cent unit cost can place the last cent, it stays with the charge, and the offset matches the lines", () => {
    const items = [
      { rowIndex: 0, qty: 2, rate: 10, amount: 20 },
      { rowIndex: 1, qty: 4, rate: 5, amount: 20 },
    ];
    const plan = planChargeToStockAllocation({ items, chargeAmount: 1.01, mode: "amount", chargeAccount: "X" });
    assert.equal(rise(items, plan), 100);
    assert.equal(plan.offsetTax.tax_amount, 1);
    assert.equal(plan.remainder, 0.01);
  });

  it("custom mode never moves a line the clerk left out", () => {
    const items = [
      { rowIndex: 0, qty: 3, rate: 10, amount: 30 },
      { rowIndex: 1, qty: 7, rate: 4, amount: 28 },
      { rowIndex: 2, qty: 5, rate: 2, amount: 10 },
    ];
    const plan = planChargeToStockAllocation({ items, chargeAmount: 10, mode: "custom", custom: [{ rowIndex: 0, dollars: 4 }, { rowIndex: 1, dollars: 6 }], chargeAccount: "X" });
    assert.deepEqual(plan.itemUpdates.map((u) => u.rowIndex).sort(), [0, 1]);
    assert.equal(rise(items, plan), 1000);
  });

  it("a sweep of quantities and charges: the lines always rise by exactly what the offset says", () => {
    let seed = 7;
    const rnd = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648) % n);
    for (let t = 0; t < 300; t++) {
      const n = 1 + rnd(5);
      const items = Array.from({ length: n }, (_, i) => {
        const qty = 1 + rnd(12);
        const rate = (100 + rnd(9000)) / 100;
        return { rowIndex: i, qty, rate, amount: lineAmountCents(qty, rate) / 100 };
      });
      const charge = (1 + rnd(5000)) / 100;
      const plan = planChargeToStockAllocation({ items, chargeAmount: charge, mode: t % 2 ? "qty" : "amount", chargeAccount: "X" });
      assert.equal(plan.ok, true);
      assert.equal(rise(items, plan), Math.round(plan.offsetTax.tax_amount * 100), `case ${t}`);
      assert.equal(Math.round((plan.allocatedTotal + plan.remainder) * 100), Math.round(charge * 100), `case ${t}`);
      // Line totals move in steps of their quantities' common factor, so less than that is all that can be left.
      const gcd = (a, b) => (b ? gcd(b, a % b) : a);
      const g = items.reduce((a, it) => gcd(a, it.qty), 0);
      assert.ok(plan.remainder >= 0 && Math.round(plan.remainder * 100) < g, `case ${t}: remainder ${plan.remainder}, qty factor ${g}`);
    }
  });

  it("amounts round the way this site does (Banker's), fractional quantities included", () => {
    assert.equal(lineAmountCents(3, 22.77), 6831);
    assert.equal(lineAmountCents(2.5, 0.01), 2); // 2.5¢ → 2 (half to even)
    assert.equal(lineAmountCents(1.5, 0.01), 2); // 1.5¢ → 2
    assert.deepEqual(exactRates([{ qty: 3, rateCents: 2100, prevCents: 6300, shareCents: 528 }], 528).missCents, 0);
  });
});

// 5zorro 2026-10-11: ten $1 SKUs — leftover cents spread one at a time, not piled on the first line.
describe("leftover cents spread evenly (largest remainder)", () => {
  const tenOnes = Array.from({ length: 10 }, (_, i) => ({ rowIndex: i, qty: 1, rate: 1, amount: 1 }));
  const cents = (charge, items = tenOnes) =>
    planChargeToStockAllocation({ items, chargeAmount: charge, mode: "amount", chargeAccount: "X" }).itemUpdates.map((u) => Math.round(u.addAmount * 100));
  it("60¢ → 6¢ each", () => assert.deepEqual(cents(0.6), [6, 6, 6, 6, 6, 6, 6, 6, 6, 6]));
  it("67¢ → seven 7¢ and three 6¢ (was 13¢ on the first line)", () => assert.deepEqual(cents(0.67), [7, 7, 7, 7, 7, 7, 7, 6, 6, 6]));
  it("3.33 → only three round up to 34¢", () => assert.deepEqual(cents(3.33), [34, 34, 34, 33, 33, 33, 33, 33, 33, 33]));
  it("29¢ → nine 3¢ and one 2¢", () => assert.deepEqual(cents(0.29), [3, 3, 3, 3, 3, 3, 3, 3, 3, 2]));
  it("unequal lines: the cent goes to the share nearest rounding up, not the biggest line", () => {
    // 10¢ over $3 / $2 / $1 lines → 5.00 / 3.33 / 1.67: the last line's .67 is nearest the next cent.
    assert.deepEqual(splitByWeights(0.1, [3, 2, 1]).shares, [0.05, 0.03, 0.02]);
  });
});

import { allocatedFromDoc } from "../src/bill-charge-allocate.js";

describe("allocatedFromDoc (review 10-19 R6b-3)", () => {
  const before = [
    { rowIndex: 0, qty: 3, rate: 20, amount: 60 },
    { rowIndex: 1, qty: 2.5, rate: 10, amount: 25 },
  ];
  const updates = [
    { rowIndex: 0, addAmount: 6, nextRate: 22, nextAmount: 66 },
    { rowIndex: 1, addAmount: 2.53, nextRate: 11.01, nextAmount: 27.53 },
  ];
  it("takes ERPNext's line amounts, not the plan's", () => {
    // A site rounding the half cent up: 2.5 × 11.01 = 27.525 → 27.53 planned; ERPNext says 27.52.
    const r = allocatedFromDoc(before, [{ amount: 66 }, { amount: 27.52 }], updates, 8.53);
    assert.equal(r.allocatedTotal, 8.52);
    assert.equal(r.driftCents, 1);
  });
  it("no drift when ERPNext agrees", () => {
    const r = allocatedFromDoc(before, [{ amount: 66 }, { amount: 27.53 }], updates, 8.53);
    assert.deepEqual(r, { allocatedTotal: 8.53, driftCents: 0 });
  });
  it("a line ERPNext did not report keeps the plan's figure", () => {
    const r = allocatedFromDoc(before, [{ amount: 66 }], updates, 8.53);
    assert.deepEqual(r, { allocatedTotal: 8.53, driftCents: 0 });
  });
});
