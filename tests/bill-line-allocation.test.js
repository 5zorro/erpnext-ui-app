import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeLineAllocation,
  formatAllocationSalesOrders,
  splitQtyAcrossSalesOrders,
  jitPoTitleForSalesOrders,
  bridgePoFailureText,
} from "../src/bill-line-allocation.js";
import { readBillItemRowsWithAllocation } from "../src/bill-item-table.js";

describe("bill-line-allocation", () => {
  it("formats multi SO list", () => {
    assert.equal(formatAllocationSalesOrders(["SO-1", "SO-2"], ""), "SO-1, SO-2");
    assert.equal(formatAllocationSalesOrders(["SO-1"], "PO-9"), "SO-1 · PO PO-9");
  });

  it("a whole-number unit splits in whole units, the extra to the earliest orders (R6b-4)", () => {
    const w = { wholeUnits: true };
    assert.deepEqual(splitQtyAcrossSalesOrders(7, 3, w), { ok: true, parts: [3, 2, 2] });
    assert.deepEqual(splitQtyAcrossSalesOrders(10, 3, w), { ok: true, parts: [4, 3, 3] });
    assert.deepEqual(splitQtyAcrossSalesOrders(5, 1, w), { ok: true, parts: [5] });
  });
  it("a whole-number unit refuses fewer units than orders, a fraction, or no qty", () => {
    const w = { wholeUnits: true };
    assert.match(splitQtyAcrossSalesOrders(2, 3, w).reason, /2 units can't be split across 3 Sales Orders/);
    assert.match(splitQtyAcrossSalesOrders(2.5, 2, w).reason, /not a whole number/);
    assert.equal(splitQtyAcrossSalesOrders(0, 2, w).ok, false);
    assert.equal(splitQtyAcrossSalesOrders(-1, 2, w).ok, false);
  });
  it("a unit that allows fractions splits to thousandths — 5zorro's plates", () => {
    const f = { wholeUnits: false };
    assert.deepEqual(splitQtyAcrossSalesOrders(1, 2, f), { ok: true, parts: [0.5, 0.5] });
    assert.deepEqual(splitQtyAcrossSalesOrders(3, 2, f), { ok: true, parts: [1.5, 1.5] });
    assert.deepEqual(splitQtyAcrossSalesOrders(3.75, 2, f), { ok: true, parts: [1.875, 1.875] });
    assert.deepEqual(splitQtyAcrossSalesOrders(1, 3, f), { ok: true, parts: [0.334, 0.333, 0.333] });
    const sum = splitQtyAcrossSalesOrders(2.5, 3, f).parts.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 2.5) < 1e-9);
  });
  it("unit unknown: whole when the qty is whole", () => {
    assert.deepEqual(splitQtyAcrossSalesOrders(7, 3), { ok: true, parts: [3, 2, 2] });
    assert.deepEqual(splitQtyAcrossSalesOrders(2.5, 2), { ok: true, parts: [1.25, 1.25] });
  });

  it("jit title joins multiple SOs", () => {
    assert.equal(jitPoTitleForSalesOrders(["A", "B"], "INV-1"), "JIT-A+B-INV-1");
  });

  it("readBillItemRowsWithAllocation projects scratch columns", () => {
    const rows = readBillItemRowsWithAllocation(
      {
        items: [{ item_code: "X", qty: 1, rate: 5, amount: 5, project: "JOB-1" }],
      },
      { 0: { customerName: "Acme", salesOrders: ["SO-1"] } },
    );
    // DF-02 J: Rec'd by / Rec'd Date sit after Amount (7, 8), blank with nothing received.
    assert.equal(rows[0][7], "");
    assert.equal(rows[0][8], "");
    assert.equal(rows[0][9], "Acme");
    assert.match(String(rows[0][10]), /SO-1/);
    assert.equal(rows[0][11], "JOB-1");
  });

  it("normalizeLineAllocation dedupes SO ids", () => {
    const a = normalizeLineAllocation({ salesOrders: [" SO-1 ", "SO-1", "SO-2"] });
    assert.deepEqual(a.salesOrders, ["SO-1", "SO-2"]);
  });
});

describe("bridgePoFailureText (review 10-19 R2-2)", () => {
  it("a refused submit whose draft was deleted says nothing was left", () => {
    const t = bridgePoFailureText({ ok: false, step: "submit", draft: "PUR-ORD-1", draftDeleted: true, reason: "Closed period" });
    assert.match(t, /refused to submit it \(Closed period\)\. Nothing was left behind/);
  });
  it("a draft that could not be removed is named", () => {
    const t = bridgePoFailureText({ ok: false, step: "submit", draft: "PUR-ORD-1", draftDeleted: false, reason: "x" });
    assert.match(t, /draft PUR-ORD-1 could not be removed/);
  });
  it("no step means the page died mid-way: it may already exist", () => {
    assert.match(bridgePoFailureText({ ok: false, reason: "ERPNext page reloaded" }), /may already exist/);
    assert.match(bridgePoFailureText(null), /may already exist/);
  });
  it("a refusal before anything was sent, or at insert, is just the reason", () => {
    assert.equal(bridgePoFailureText({ ok: false, notRun: true, reason: "ERP view not ready" }), "The Purchase Order for it was not made: ERP view not ready");
    assert.equal(bridgePoFailureText({ ok: false, step: "insert", reason: "Mandatory" }), "The Purchase Order for it was not made: Mandatory");
  });
});
