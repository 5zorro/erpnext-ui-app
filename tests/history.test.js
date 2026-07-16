import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pushHistory, HISTORY_CAP } from "../src/history.js";

describe("pushHistory", () => {
  it("dedupes by doctype and keeps most recent first", () => {
    let h = [];
    h = pushHistory(h, "/desk/purchase-invoice/A");
    h = pushHistory(h, "/desk/sales-order/B");
    h = pushHistory(h, "/desk/purchase-invoice/C");
    assert.equal(h.length, 2);
    assert.equal(h[0].dt, "purchase-invoice");
    assert.equal(h[0].route, "/desk/purchase-invoice/C");
    assert.equal(h[1].dt, "sales-order");
  });

  it("uses label map when provided", () => {
    const h = pushHistory([], "/desk/purchase-invoice/x", {
      labels: { "purchase-invoice": "Bill" },
    });
    assert.equal(h[0].label, "Bill");
  });

  it("ignores routes without doctype", () => {
    const h = pushHistory([{ route: "/desk/item/1", dt: "item", label: "Item" }], "/desk");
    assert.equal(h.length, 1);
    assert.equal(h[0].dt, "item");
  });

  it("caps list length", () => {
    let h = [];
    for (let i = 0; i < HISTORY_CAP + 5; i++) {
      h = pushHistory(h, `/desk/doctype-${i}/r`);
    }
    assert.equal(h.length, HISTORY_CAP);
    assert.equal(h[0].dt, `doctype-${HISTORY_CAP + 4}`);
  });

  it("does not mutate the previous array", () => {
    const prev = [];
    const next = pushHistory(prev, "/desk/item/1");
    assert.equal(prev.length, 0);
    assert.equal(next.length, 1);
  });
});
