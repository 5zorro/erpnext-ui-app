import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildBillSourceGroups,
  isSelectableSourceItem,
  formatSourceMoney,
  enrichReceiptsWithPurchaseOrders,
  sourceItemFromRow,
} from "../src/source-modal.js";

describe("buildBillSourceGroups", () => {
  it("always includes NIC and greys drafts", () => {
    const g = buildBillSourceGroups({
      purchaseOrders: [{ name: "PO-1", transaction_date: "2019-01-01", grand_total: 10 }],
      purchaseOrdersDraft: [{ name: "PO-D", transaction_date: "2019-01-02", grand_total: 1 }],
      purchaseReceipts: [],
      purchaseReceiptsDraft: [],
    });
    assert.equal(g[0].items[0].kind, "nic");
    assert.equal(isSelectableSourceItem(g[0].items[0]), true);
    const po = g.find((x) => x.name.includes("submitted"));
    assert.ok(po);
    assert.equal(isSelectableSourceItem(po.items[0]), true);
    const draft = g.find((x) => x.name.includes("draft"));
    assert.ok(draft);
    assert.equal(isSelectableSourceItem(draft.items[0]), false);
  });

  it("formats money", () => {
    assert.equal(formatSourceMoney(12.5), "12.50");
    assert.equal(formatSourceMoney(null), "");
  });

  it("shows PO number on Item Receipt rows", () => {
    const prs = enrichReceiptsWithPurchaseOrders(
      [{ name: "PR-1", posting_date: "2019-02-01", grand_total: 50 }],
      [
        { parent: "PR-1", purchase_order: "PO-9" },
        { parent: "PR-1", purchase_order: "PO-9" },
      ],
    );
    const item = sourceItemFromRow(prs[0], "pr", false);
    assert.match(item.label, /PO PO-9|PO-9/);
    assert.ok(item.label.includes("PR-1"));
  });

  it("labels receipt with no PO clearly", () => {
    const item = sourceItemFromRow(
      { name: "PR-2", posting_date: "2019-02-01", grand_total: 1, purchase_orders: [] },
      "pr",
      false,
    );
    assert.match(item.label, /no PO/);
  });
});
