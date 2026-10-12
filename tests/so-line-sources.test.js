import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { soLineSources, formatSourceQty } from "../src/so-line-sources.js";
import { sourcesCellHtml } from "../src/so-line-sources-ui.js";

// Plan 2026-10-12 S4 — 5zorro's examples, worked.
const line = (over = {}) => ({ name: "r1", item_code: "SAMPLE-SKU-01", qty: 2, stock_qty: 2, conversion_factor: 1, uom: "Nos", stock_uom: "Nos", delivered_qty: 0, ...over });
const labels = (res, row = "r1") => res[row].parts.map((p) => p.label);

describe("soLineSources", () => {
  it("his order: line 1 on a draft PO, line 2 from stock", () => {
    const res = soLineSources({
      items: [line(), line({ name: "r2", item_code: "SAMPLE-SKU-02", delivered_qty: 2 })],
      purchaseOrders: [{ name: "PUR-ORD-2026-00001", docstatus: 0, sales_order_item: "r1", stock_qty: 2 }],
      bins: [],
    });
    assert.deepEqual(labels(res), ["PO PUR-ORD-2026-00001 ×2 (draft)"]);
    assert.deepEqual(labels(res, "r2"), ["Stock ×2"]);
    assert.equal(res.r1.parts[0].route, "/app/purchase-order/PUR-ORD-2026-00001");
  });

  it("one line, two sources: 5 units, 3 on a PO and 2 shipped from stock", () => {
    const res = soLineSources({
      items: [line({ qty: 5, stock_qty: 5, delivered_qty: 5 })],
      purchaseOrders: [{ name: "PO-1", docstatus: 1, sales_order_item: "r1", stock_qty: 3 }],
    });
    assert.deepEqual(labels(res), ["PO PO-1 ×3", "Stock ×2"]);
    assert.equal(res.r1.notSourced, 0);
  });

  it("a Work Order to build, and a Material Request not yet ordered", () => {
    const res = soLineSources({
      items: [line({ qty: 8, stock_qty: 8 })],
      workOrders: [{ name: "MFG-WO-2026-00001", docstatus: 1, status: "Not Started", sales_order_item: "r1", qty: 5 }],
      materialRequests: [
        { name: "MAT-MR-1", docstatus: 1, sales_order_item: "r1", stock_qty: 3, ordered_qty: 1 },
      ],
      bins: [],
    });
    assert.deepEqual(labels(res), ["WO MFG-WO-2026-00001 ×5 (to build)", "MR MAT-MR-1 ×2 (requested)", "Not sourced ×1 (QOH ×0 Nos)"]);
  });

  it("nothing yet: not sourced, with the quantity on hand in the line's warehouse", () => {
    const res = soLineSources({
      items: [line({ warehouse: "Stores - X" })],
      bins: [
        { item_code: "SAMPLE-SKU-01", warehouse: "Stores - X", actual_qty: 7 },
        { item_code: "SAMPLE-SKU-01", warehouse: "Other - X", actual_qty: 100 },
      ],
    });
    assert.deepEqual(labels(res), ["Not sourced ×2 (QOH ×7 Nos)"]);
    assert.equal(res.r1.qoh, 7);
  });

  it("stock reserved on the order counts as from stock", () => {
    const res = soLineSources({
      items: [line({ qty: 4, stock_qty: 4 })],
      reservations: [{ voucher_detail_no: "r1", reserved_qty: 3, delivered_qty: 1 }],
      bins: [{ item_code: "SAMPLE-SKU-01", warehouse: "W", actual_qty: 9 }],
    });
    assert.deepEqual(labels(res), ["Stock ×2", "Not sourced ×2 (QOH ×9 Nos)"]);
  });

  it("a delivery is read as coming from the orders first (no double count)", () => {
    const res = soLineSources({
      items: [line({ qty: 2, stock_qty: 2, delivered_qty: 2 })],
      purchaseOrders: [{ name: "PO-1", docstatus: 1, sales_order_item: "r1", stock_qty: 2 }],
    });
    assert.deepEqual(labels(res), ["PO PO-1 ×2"]);
  });

  it("shown in the line's unit: a box of 12", () => {
    const res = soLineSources({
      items: [line({ qty: 3, stock_qty: 36, conversion_factor: 12, uom: "Box", stock_uom: "Nos" })],
      purchaseOrders: [{ name: "PO-1", docstatus: 0, sales_order_item: "r1", stock_qty: 12 }],
      bins: [{ item_code: "SAMPLE-SKU-01", warehouse: "W", actual_qty: 30 }],
    });
    assert.deepEqual(labels(res), ["PO PO-1 ×1 (draft)", "Not sourced ×2 (QOH ×30 Nos)"]);
  });

  it("no stock read (null bins): no QOH bit", () => {
    const res = soLineSources({ items: [line()] });
    assert.deepEqual(labels(res), ["Not sourced ×2"]);
  });

  it("two lines of one PO for the same order line add up", () => {
    const res = soLineSources({
      items: [line({ qty: 5, stock_qty: 5 })],
      purchaseOrders: [
        { name: "PO-1", docstatus: 1, sales_order_item: "r1", stock_qty: 2 },
        { name: "PO-1", docstatus: 1, sales_order_item: "r1", stock_qty: 1 },
      ],
      bins: [],
    });
    assert.deepEqual(labels(res), ["PO PO-1 ×3", "Not sourced ×2 (QOH ×0 Nos)"]);
  });

  it("quantities read plainly", () => {
    assert.equal(formatSourceQty(2), "2");
    assert.equal(formatSourceQty(1 / 3), "0.333");
    assert.equal(formatSourceQty(2.5), "2.5");
  });
});

describe("sourcesCellHtml (chips: wash, desk hatch, hatch-free text, peek)", () => {
  it("a PO chip is an A/P peek in the order wash; stock is on no desk; not sourced has no link", () => {
    const res = soLineSources({
      items: [line({ qty: 5, stock_qty: 5, delivered_qty: 5 }), line({ name: "r2" })],
      purchaseOrders: [{ name: "PO-1", docstatus: 0, sales_order_item: "r1", stock_qty: 3 }],
      bins: [],
    });
    const html = sourcesCellHtml(res.r1, false);
    assert.match(html, /<button type="button" class="src-chip" data-role="order" data-desk="ap" data-kind="po" data-peek-route="\/app\/purchase-order\/PO-1"/);
    assert.match(html, /<span class="hatch-clear">PO PO-1 ×3 \(draft\)<\/span>/);
    assert.match(html, /<span class="src-chip" data-role="fulfill" data-desk="" data-kind="stock"><span class="hatch-clear">Stock ×2<\/span>/);
    assert.match(sourcesCellHtml(res.r2, false), /data-kind="none"><span class="hatch-clear">Not sourced ×2 \(QOH ×0 Nos\)/);
  });
  it("while loading: an ellipsis; nothing known: empty", () => {
    assert.match(sourcesCellHtml(undefined, true), /…/);
    assert.equal(sourcesCellHtml(undefined, false), "");
  });
});
