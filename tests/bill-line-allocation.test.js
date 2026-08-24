import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeLineAllocation,
  formatAllocationSalesOrders,
  splitQtyAcrossSalesOrders,
  jitPoTitleForSalesOrders,
} from "../src/bill-line-allocation.js";
import { readBillItemRowsWithAllocation } from "../src/bill-item-table.js";

describe("bill-line-allocation", () => {
  it("formats multi SO list", () => {
    assert.equal(formatAllocationSalesOrders(["SO-1", "SO-2"], ""), "SO-1, SO-2");
    assert.equal(formatAllocationSalesOrders(["SO-1"], "PO-9"), "SO-1 · PO PO-9");
  });

  it("splits qty across SOs with remainder on last", () => {
    const parts = splitQtyAcrossSalesOrders(10, 3);
    assert.equal(parts.length, 3);
    const sum = parts.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 10) < 0.01);
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
    assert.equal(rows[0][7], "Acme");
    assert.match(String(rows[0][8]), /SO-1/);
    assert.equal(rows[0][9], "JOB-1");
  });

  it("normalizeLineAllocation dedupes SO ids", () => {
    const a = normalizeLineAllocation({ salesOrders: [" SO-1 ", "SO-1", "SO-2"] });
    assert.deepEqual(a.salesOrders, ["SO-1", "SO-2"]);
  });
});
