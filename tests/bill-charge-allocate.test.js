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
