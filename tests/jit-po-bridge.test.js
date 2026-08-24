import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatJitPoTitle,
  findExistingBridgePo,
  jitPoItemsFromSalesOrder,
} from "../src/jit-po-bridge.js";

describe("jit-po-bridge", () => {
  it("formatJitPoTitle uses JIT-SO-ref pattern", () => {
    assert.equal(formatJitPoTitle("SAL-ORD-1", "INV-9"), "JIT-SAL-ORD-1-INV-9");
    assert.equal(formatJitPoTitle("SAL-ORD-1", ""), "JIT-SAL-ORD-1");
    assert.equal(formatJitPoTitle("", "INV-9"), "JIT--INV-9");
  });

  it("findExistingBridgePo matches vendor + SO on lines", () => {
    const pos = [
      { name: "PO-A", supplier: "V1", docstatus: 1, per_billed: 0 },
      { name: "PO-B", supplier: "V2", docstatus: 1, per_billed: 0 },
    ];
    const items = [
      { parent: "PO-A", sales_order: "SO-1" },
      { parent: "PO-B", sales_order: "SO-1" },
    ];
    assert.deepEqual(findExistingBridgePo(pos, items, "V1", "SO-1"), {
      name: "PO-A",
      title: "",
    });
    assert.equal(findExistingBridgePo(pos, items, "V1", "SO-2"), null);
  });

  it("jitPoItemsFromSalesOrder stamps sales_order links", () => {
    const rows = jitPoItemsFromSalesOrder(
      [{ name: "SOI-1", item_code: "ITEM-1", qty: 2, rate: 5 }],
      "SO-1",
      "2026-08-21",
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].sales_order, "SO-1");
    assert.equal(rows[0].sales_order_item, "SOI-1");
    assert.equal(rows[0].schedule_date, "2026-08-21");
  });
});
