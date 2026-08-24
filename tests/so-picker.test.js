import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  billLineSkus,
  impliedMarginForBillAndSo,
  rankSalesOrdersForBill,
  formatSalesOrderPickerLabel,
  isSelectableSalesOrderRow,
  NEGATIVE_MARGIN_MARK,
} from "../src/so-picker.js";

describe("so-picker", () => {
  it("computes implied margin on matching SKUs", () => {
    const bill = [{ item_code: "A", qty: 2, rate: 10, amount: 20 }];
    const soItems = [{ item_code: "A", qty: 2, rate: 15, amount: 30 }];
    assert.equal(impliedMarginForBillAndSo(bill, soItems), 10);
  });

  it("returns null margin when Bill has no lines", () => {
    assert.equal(impliedMarginForBillAndSo([], [{ item_code: "A", qty: 1, rate: 1 }]), null);
  });

  it("ranks SKU-matching submitted SOs first and drafts last", () => {
    const orders = [
      { name: "SO-D", docstatus: 0, customer_name: "C", grand_total: 1, items: [] },
      { name: "SO-2", docstatus: 1, customer_name: "C", grand_total: 50, items: [{ item_code: "X" }] },
      { name: "SO-1", docstatus: 1, customer_name: "C", grand_total: 40, items: [{ item_code: "A" }] },
    ];
    const ranked = rankSalesOrdersForBill(orders, [{ item_code: "A", qty: 1, rate: 5 }]);
    assert.equal(ranked[0].name, "SO-1");
    assert.equal(ranked[0].skuMatch, true);
    assert.equal(ranked[ranked.length - 1].name, "SO-D");
    assert.equal(isSelectableSalesOrderRow(ranked[ranked.length - 1]), false);
  });

  it("labels negative margin with caution mark", () => {
    const label = formatSalesOrderPickerLabel({
      name: "SO-1",
      customer_name: "Acme",
      grand_total: 10,
      skuMatch: true,
      impliedMargin: -3,
      negativeMargin: true,
      draft: false,
    });
    assert.ok(label.startsWith(NEGATIVE_MARGIN_MARK));
    assert.match(label, /margin -3\.00/);
  });

  it("billLineSkus dedupes", () => {
    assert.deepEqual(
      billLineSkus([{ item_code: "A" }, { item_code: "A" }, { item_code: "B" }]),
      ["A", "B"],
    );
  });
});
