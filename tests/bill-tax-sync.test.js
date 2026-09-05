import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  taxRateBaseFromDoc,
  impliedTaxRateFromAmount,
  taxAmountFromRate,
  displayTaxRateForRow,
} from "../src/bill-tax-sync.js";

describe("bill-tax-sync", () => {
  it("uses net_total as rate base when present", () => {
    assert.equal(taxRateBaseFromDoc({ net_total: 525, items: [{ amount: 100 }] }), 525);
  });

  it("falls back to item subtotal", () => {
    assert.equal(
      taxRateBaseFromDoc({ items: [{ qty: 10, rate: 40 }, { qty: 5, rate: 25 }] }),
      525,
    );
  });

  it("implied rate from amount (DF-01 tax on 525)", () => {
    const rate = impliedTaxRateFromAmount(38.06, 525);
    assert.ok(rate != null && Math.abs(rate - 7.25) < 0.01);
  });

  it("amount from rate round-trips at 2 dp", () => {
    const base = 169;
    const amt = taxAmountFromRate(7.5, base);
    assert.equal(amt, 12.68);
    const back = impliedTaxRateFromAmount(amt, base);
    assert.ok(back != null && Math.abs(back - 7.5) < 0.01);
  });

  it("displayTaxRateForRow derives implied % for Actual rows", () => {
    const doc = { net_total: 525, items: [{ amount: 525 }] };
    assert.equal(
      displayTaxRateForRow({ charge_type: "Actual", tax_amount: 36.25, rate: 6 }, doc),
      6.9,
    );
  });

  it("displayTaxRateForRow keeps ERP rate for percentage rows", () => {
    const doc = { net_total: 525 };
    assert.equal(
      displayTaxRateForRow({ charge_type: "On Net Total", tax_amount: 31.5, rate: 6 }, doc),
      6,
    );
  });
});
