import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatBillLineNumber,
  formatPoLineDisplay,
  washRoleForBillItem,
  readBillItemRowsWithAllocation,
  sortBillItemRowModels,
  buildBillItemRowModels,
  mergeAllocationFromPoMeta,
} from "../src/bill-item-table.js";
import { indexPoLineMeta } from "../src/bill-po-hydrate.js";

describe("bill-item-table", () => {
  it("washRoleForBillItem maps PO/PR/NIC sources", () => {
    assert.equal(washRoleForBillItem({ purchase_order: "PO-1" }), "order");
    assert.equal(washRoleForBillItem({ purchase_receipt: "PR-1" }), "fulfill");
    assert.equal(washRoleForBillItem({ item_code: "X" }), "invoice");
  });

  it("formatBillLineNumber prefers ERP idx", () => {
    assert.equal(formatBillLineNumber(0, { idx: 3 }), "3");
    assert.equal(formatBillLineNumber(2, {}), "3");
  });

  it("formatPoLineDisplay includes PO name when multiple POs on bill", () => {
    const item = { purchase_order: "PO-A", po_detail: "abc" };
    const meta = { poName: "PO-A", poLineIdx: 2 };
    assert.equal(formatPoLineDisplay(item, meta, false), "L2");
    assert.equal(formatPoLineDisplay(item, meta, true), "PO-A · L2");
  });

  it("readBillItemRowsWithAllocation includes line + PO line columns", () => {
    const rows = readBillItemRowsWithAllocation(
      {
        items: [
          {
            idx: 1,
            item_code: "X",
            qty: 1,
            rate: 5,
            amount: 5,
            purchase_order: "PO-1",
            po_detail: "POI-1",
          },
        ],
      },
      { 0: { customerName: "Acme", salesOrders: ["SO-1"] } },
      { 0: { poName: "PO-1", poLineIdx: 4, salesOrder: "SO-9", customerName: "From PO" } },
    );
    assert.equal(rows[0][0], "1");
    assert.equal(rows[0][1], "L4");
    assert.equal(rows[0][7], "Acme");
    assert.match(String(rows[0][8]), /SO-1/);
  });

  it("mergeAllocationFromPoMeta hydrates SO from linked PO when scratch empty", () => {
    const merged = mergeAllocationFromPoMeta(
      { customerName: "", salesOrders: [] },
      { salesOrder: "SO-PO", customerName: "PO Customer", poName: "PO-1" },
    );
    assert.equal(merged.customerName, "PO Customer");
    assert.deepEqual(merged.salesOrders, ["SO-PO"]);
    assert.equal(merged.bridgePo, "PO-1");
  });

  it("mergeAllocationFromPoMeta keeps scratch when already set", () => {
    const merged = mergeAllocationFromPoMeta(
      { customerName: "Acme", salesOrders: ["SO-1"] },
      { salesOrder: "SO-PO", customerName: "PO Customer", poName: "PO-1" },
    );
    assert.equal(merged.customerName, "Acme");
    assert.deepEqual(merged.salesOrders, ["SO-1"]);
  });

  it("sortBillItemRowModels sorts by item code while keeping stable row identity", () => {
    const doc = {
      items: [
        { idx: 1, item_code: "B", qty: 1 },
        { idx: 2, item_code: "A", qty: 1 },
      ],
    };
    const models = buildBillItemRowModels(doc, {}, {});
    const sorted = sortBillItemRowModels(models, "item_code", true);
    assert.equal(sorted[0].cells[0], "A");
    assert.equal(sorted[0].rowIndex, 1);
    assert.equal(sorted[1].rowIndex, 0);
  });

  it("sortBillItemRowModels tie-breaks equal amounts by line number", () => {
    const doc = {
      items: [
        { idx: 1, item_code: "A", qty: 1, rate: 2, amount: 2 },
        { idx: 2, item_code: "B", qty: 1, rate: 2, amount: 2 },
        { idx: 3, item_code: "C", qty: 1, rate: 2, amount: 2 },
        { idx: 4, item_code: "D", qty: 1, rate: 2, amount: 2 },
      ],
    };
    const models = buildBillItemRowModels(doc, {}, {});
    const sorted = sortBillItemRowModels(models, [{ key: "amount", asc: false }]);
    assert.deepEqual(
      sorted.map((m) => m.lineNo),
      ["1", "2", "3", "4"],
    );
  });

  it("sortBillItemRowModels multi-column: amount then item_code", () => {
    const doc = {
      items: [
        { idx: 1, item_code: "Z", qty: 1, rate: 5, amount: 5 },
        { idx: 2, item_code: "A", qty: 1, rate: 5, amount: 5 },
        { idx: 3, item_code: "M", qty: 1, rate: 1, amount: 1 },
      ],
    };
    const models = buildBillItemRowModels(doc, {}, {});
    const sorted = sortBillItemRowModels(models, [
      { key: "amount", asc: false },
      { key: "item_code", asc: true },
    ]);
    assert.deepEqual(
      sorted.map((m) => m.cells[0]),
      ["A", "Z", "M"],
    );
  });

  it("indexPoLineMeta maps po_detail to row metadata", () => {
    const doc = {
      items: [{ purchase_order: "PO-1", po_detail: "POI-99" }],
    };
    const meta = indexPoLineMeta(
      doc,
      { "POI-99": { idx: 2, sales_order: "SO-1" } },
      { "PO-1": { customer: "CUS-1", customer_name: "Acme" } },
    );
    assert.equal(meta[0].poLineIdx, 2);
    assert.equal(meta[0].salesOrder, "SO-1");
    assert.equal(meta[0].customerName, "Acme");
  });
});
