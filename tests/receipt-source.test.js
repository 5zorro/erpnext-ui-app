import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildReceiptSourceGroups } from "../src/receipt-source.js";

describe("buildReceiptSourceGroups", () => {
  it("always includes NIC and PO groups when present", () => {
    const groups = buildReceiptSourceGroups({
      purchaseOrders: [{ name: "PO-1", transaction_date: "2026-07-01", grand_total: 10 }],
      purchaseOrdersDraft: [{ name: "PO-D", transaction_date: "2026-07-02", grand_total: 5 }],
    });
    assert.equal(groups[0].name.includes("NIC"), true);
    assert.equal(groups.length, 3);
    assert.equal(groups[1].items[0].kind, "po");
    assert.equal(!!groups[1].items[0].draft, false);
    assert.equal(!!groups[2].items[0].draft, true);
  });

  it("has no PR / Item Receipt source rows", () => {
    const groups = buildReceiptSourceGroups({
      purchaseOrders: [{ name: "PO-1" }],
    });
    const kinds = groups.flatMap((g) => (g.items || []).map((it) => it.kind));
    assert.ok(kinds.every((k) => k === "nic" || k === "po"));
    assert.ok(!kinds.includes("pr"));
  });
});
