import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeLineAllocation,
  formatAllocationSalesOrders,
  planSalesOrderSplit,
  jitPoTitleForSalesOrders,
  bridgePoFailureText,
} from "../src/bill-line-allocation.js";
import { readBillItemRowsWithAllocation } from "../src/bill-item-table.js";

describe("bill-line-allocation", () => {
  it("formats multi SO list", () => {
    assert.equal(formatAllocationSalesOrders(["SO-1", "SO-2"], ""), "SO-1, SO-2");
    assert.equal(formatAllocationSalesOrders(["SO-1"], "PO-9"), "SO-1 · PO PO-9");
  });

  // 5zorro's example (2026-10-22): SO-A needs 6, SO-B needs 2 — 8 open.
  const AB = [
    { salesOrder: "SO-A", salesOrderItem: "a1", open: 6 },
    { salesOrder: "SO-B", salesOrderItem: "b1", open: 2 },
  ];
  const gets = (p) => p.rows.map((r) => r.gets);

  it("exact: each order gets what it needs, nothing to confirm", () => {
    const p = planSalesOrderSplit({ qty: 8, wholeUnits: true, lines: AB });
    assert.deepEqual(gets(p), [6, 2]);
    assert.equal(p.toStock, 0);
    assert.equal(p.needsConfirm, false);
  });
  it("short: split by need, the shortfall shown per order, needs the Okay", () => {
    const whole = planSalesOrderSplit({ qty: 5, wholeUnits: true, lines: AB });
    assert.deepEqual(gets(whole), [4, 1]); // 3.75 / 1.25 in whole units
    assert.deepEqual(whole.rows.map((r) => r.diff), [-2, -1]);
    assert.equal(whole.needsConfirm, true);
    assert.deepEqual(gets(planSalesOrderSplit({ qty: 5, wholeUnits: false, lines: AB })), [3.75, 1.25]);
  });
  it("more than they need: each gets its need, the rest to stock", () => {
    const p = planSalesOrderSplit({ qty: 10, wholeUnits: true, lines: AB });
    assert.deepEqual(gets(p), [6, 2]);
    assert.equal(p.toStock, 2);
    assert.equal(p.needsConfirm, true);
  });
  it("an order ticked from stock takes nothing; the others take the Bill", () => {
    const p = planSalesOrderSplit({ qty: 5, wholeUnits: true, lines: AB, fromStock: ["SO-B"] });
    assert.deepEqual(gets(p), [5, 0]);
    assert.deepEqual(p.rows.map((r) => [r.fromStock, r.diff]), [[false, -1], [true, -2]]);
    const all = planSalesOrderSplit({ qty: 5, wholeUnits: true, lines: AB, fromStock: ["SO-A", "SO-B"] });
    assert.equal(all.toStock, 5);
  });
  it("an order with no line for the item gets nothing and is shown", () => {
    const p = planSalesOrderSplit({ qty: 2, wholeUnits: true, lines: [...AB.slice(1), { salesOrder: "SO-C", salesOrderItem: "", open: 0 }] });
    assert.deepEqual(gets(p), [2, 0]);
    assert.equal(p.needsConfirm, false);
  });
  it("the leftover units follow the shared rule — 5zorro's 6.667 over ten equal orders", () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ salesOrder: `SO-${i}`, salesOrderItem: `l${i}`, open: 1 }));
    assert.deepEqual(gets(planSalesOrderSplit({ qty: 6.667, wholeUnits: false, lines: ten })), [0.667, 0.667, 0.667, 0.667, 0.667, 0.667, 0.667, 0.666, 0.666, 0.666]);
  });
  it("refuses no qty, or a fraction of a whole-number unit; unit unknown follows the qty", () => {
    assert.equal(planSalesOrderSplit({ qty: 0, lines: AB }).ok, false);
    assert.match(planSalesOrderSplit({ qty: 2.5, wholeUnits: true, lines: AB }).reason, /not a whole number/);
    assert.deepEqual(gets(planSalesOrderSplit({ qty: 2.5, lines: AB })), [1.875, 0.625]);
  });
  it("the key changes when the plan does (so a stale Okay is caught)", () => {
    const a = planSalesOrderSplit({ qty: 5, wholeUnits: true, lines: AB });
    const b = planSalesOrderSplit({ qty: 5, wholeUnits: true, lines: [AB[0], { ...AB[1], open: 1 }] });
    assert.notEqual(a.key, b.key);
    assert.equal(a.key, planSalesOrderSplit({ qty: 5, wholeUnits: true, lines: AB }).key);
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
