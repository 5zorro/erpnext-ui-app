import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { billLineOrderPeeks } from "../src/source-doc-peek.js";

// 5zorro 2026-10-11: from the Bill's Sales order(s) cell, peek the Sales Order and the PO the link
// lives on (to change it there, or void & amend it).
describe("billLineOrderPeeks", () => {
  it("each Sales Order, then the line's PO", () => {
    assert.deepEqual(billLineOrderPeeks({ salesOrders: ["SAL-ORD-1", "SAL-ORD-2"] }, { purchase_order: "PUR-ORD-9" }), [
      { kind: "sales-order", name: "SAL-ORD-1", route: "/app/sales-order/SAL-ORD-1" },
      { kind: "sales-order", name: "SAL-ORD-2", route: "/app/sales-order/SAL-ORD-2" },
      { kind: "purchase-order", name: "PUR-ORD-9", route: "/app/purchase-order/PUR-ORD-9" },
    ]);
  });
  it("the just-in-time bridge PO when the line itself has none yet", () => {
    assert.deepEqual(billLineOrderPeeks({ salesOrders: ["S1"], bridgePo: "JIT PO 1" }, {}).map((p) => p.route), [
      "/app/sales-order/S1",
      "/app/purchase-order/JIT%20PO%201",
    ]);
  });
  it("a PO with no Sales Order still offers the PO; repeats and blanks are dropped", () => {
    assert.deepEqual(billLineOrderPeeks({ salesOrders: ["", "S1", "S1"] }, { purchase_order: "P1" }).map((p) => p.name), ["S1", "P1"]);
    assert.deepEqual(billLineOrderPeeks(null, { purchase_order: "P1" }).map((p) => p.kind), ["purchase-order"]);
  });
  it("a line on no PO and no Sales Order offers nothing", () => {
    assert.deepEqual(billLineOrderPeeks({}, {}), []);
    assert.deepEqual(billLineOrderPeeks(undefined, undefined), []);
  });
});
