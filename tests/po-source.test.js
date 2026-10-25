import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { docSourceMapper, soSelectedItemsWithoutVendor, trimMappedSoLines, SOURCE_KIND_NOUN, emptySourceReason } from "../src/po-source.js";
import { sourceSlicesForSkin, buildBillSourceLoadingGroups, buildSourceGroupFromSliceRows } from "../src/source-list-slices.js";
import { poSourceItemFromRow } from "../src/source-modal.js";
import { salesOrdersToOrder } from "../src/so-create-po.js";

// Plan 2026-10-12 S3 (5zorro: "NIC, MatReq, SQ and SO" on the PO, as the Bill has NIC / PO / IR).
describe("the PO's sources", () => {
  it("each skin lists its own slices; the Item Receipt no longer offers Item Receipts", () => {
    assert.deepEqual(sourceSlicesForSkin("po"), ["mr_submitted", "sq_submitted", "so_submitted"]);
    assert.deepEqual(sourceSlicesForSkin("receipt"), ["po_to_receive", "po_draft"]);
    assert.deepEqual(sourceSlicesForSkin("bill"), ["po_submitted", "pr_submitted", "po_draft", "pr_draft"]);
    assert.deepEqual(sourceSlicesForSkin(""), sourceSlicesForSkin("bill"));
  });
  it("NIC speaks the skin's own name, then one loading group per slice", () => {
    const g = buildBillSourceLoadingGroups("po");
    assert.equal(g[0].items[0].label, "NIC — enter this Purchase Order manually (no source)");
    assert.deepEqual(g.slice(1).map((x) => [x.id, x.items[0].kind]), [["mr_submitted", "mr"], ["sq_submitted", "sq"], ["so_submitted", "so"]]);
    assert.match(buildBillSourceLoadingGroups()[0].items[0].label, /this Bill/);
  });
  it("a mapper per skin and kind; anything else is refused", () => {
    assert.match(docSourceMapper("po", "mr"), /material_request\.make_purchase_order$/);
    assert.match(docSourceMapper("po", "sq"), /supplier_quotation\.make_purchase_order$/);
    assert.match(docSourceMapper("po", "so"), /sales_order\.make_purchase_order$/);
    assert.match(docSourceMapper("receipt", "po"), /make_purchase_receipt$/);
    assert.equal(docSourceMapper("receipt", "pr"), null);
    assert.equal(docSourceMapper("po", "po"), null);
    assert.equal(SOURCE_KIND_NOUN.sq, "Supplier Quotation");
  });
});

describe("how each source reads in the picker", () => {
  it("Material Request: title and when it is needed", () => {
    assert.equal(
      poSourceItemFromRow({ name: "MAT-MR-2026-00001", title: "Shop restock", transaction_date: "2026-10-01", schedule_date: "2026-10-15" }, "mr").label,
      "MAT-MR-2026-00001   ·   Shop restock   ·   2026-10-01   ·   needed by 2026-10-15",
    );
  });
  it("Supplier Quotation: total and how long it is good for", () => {
    const it = poSourceItemFromRow({ name: "PUR-SQTN-2026-00001", transaction_date: "2026-10-02", grand_total: 51, valid_till: "2026-11-01" }, "sq");
    assert.deepEqual(it, { label: "PUR-SQTN-2026-00001   ·   2026-10-02   ·   51.00   ·   good till 2026-11-01", kind: "sq", name: "PUR-SQTN-2026-00001" });
  });
  it("Sales Order: customer and lines still to order", () => {
    const rows = salesOrdersToOrder([
      { name: "SAL-ORD-2026-00001", customer: "C1", customer_name: "First Customer", transaction_date: "2026-10-11", stock_qty: 2, ordered_qty: 0 },
      { name: "SAL-ORD-2026-00001", customer: "C1", customer_name: "First Customer", transaction_date: "2026-10-11", stock_qty: 2, ordered_qty: 0 },
      { name: "SAL-ORD-2026-00002", customer: "C2", transaction_date: "2026-10-11", stock_qty: 1, ordered_qty: 1 },
    ]);
    assert.deepEqual(rows.map((r) => [r.name, r.lines_to_order]), [["SAL-ORD-2026-00001", 2]]);
    const g = buildSourceGroupFromSliceRows("so_submitted", rows);
    assert.equal(g.name, "Sales Orders — still to order (1)");
    assert.equal(g.items[0].label, "SAL-ORD-2026-00001   ·   First Customer   ·   2026-10-11   ·   2 lines to order");
  });
});

describe("Sales Order → the open PO", () => {
  it("asks the mapper with no vendor, one entry per item code, nothing already ordered", () => {
    assert.deepEqual(
      soSelectedItemsWithoutVendor([
        { itemCode: "A", pendingQty: 2 },
        { itemCode: "A", pendingQty: 1 },
        { itemCode: "B", pendingQty: 0 },
        { itemCode: "C", pendingQty: 5 },
      ]),
      [{ item_code: "A", supplier: null }, { item_code: "C", supplier: null }],
    );
  });
  it("trims lines already on draft POs and drops the empty ones", () => {
    const items = [
      { item_code: "A", qty: 2, stock_qty: 2, conversion_factor: 1, sales_order_item: "r1" },
      { item_code: "B", qty: 3, stock_qty: 36, conversion_factor: 12, sales_order_item: "r2" },
      { item_code: "C", qty: 4, stock_qty: 4, conversion_factor: 1, sales_order_item: "r3" },
    ];
    assert.deepEqual(
      trimMappedSoLines(items, { r1: 0, r2: 1 }).map((i) => [i.item_code, i.qty, i.stock_qty]),
      [["B", 1, 12], ["C", 4, 4]],
    );
  });
});

describe("a source with nothing left to bring in (review R7-1)", () => {
  it("names why, so the merge refuses instead of clearing the lines", () => {
    assert.equal(emptySourceReason("receipt", "po", "PO-1"), "Every line of PO-1 is already received — nothing to bring in.");
    assert.equal(emptySourceReason("po", "mr", "MR-1"), "Material Request MR-1 has no lines left to bring in.");
  });
});
