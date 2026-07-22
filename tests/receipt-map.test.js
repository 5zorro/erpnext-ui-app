import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getReceiptAnchor,
  readReceiptHeader,
  readReceiptItemRows,
  isEditableReceiptItemField,
  writableReceiptHeaderFields,
  sumReceiptLineQty,
  sumReceiptLineAmount,
  RECEIPT_DOCTYPE,
  RECEIPT_ASSUMPTIONS,
  RECEIPT_EXPENSE_NOTE,
  MUSEUM_RECEIPT_ASSUMPTION_TOPICS,
  receiptAssumptionTopicsCovered,
  isDraftReceiptDoc,
} from "../src/receipt-map.js";

const sampleDoc = {
  doctype: RECEIPT_DOCTYPE,
  name: "PR-0001",
  supplier: "SUP-001",
  supplier_name: "Acme Hardware",
  posting_date: "2026-07-18",
  bill_no: "INV-9",
  lr_no: "PL-1",
  remarks: "Dock 2",
  grand_total: 42.5,
  items: [
    {
      item_code: "SKU-1",
      description: "<b>Widget</b>",
      qty: 2,
      rate: 10,
      amount: 20,
      project: "JOB-1",
    },
  ],
};

describe("getReceiptAnchor", () => {
  it("returns Item Receipt concept metadata", () => {
    const a = getReceiptAnchor();
    assert.equal(a.doctype, "Purchase Receipt");
    assert.equal(a.layoutKey, "item-receipt");
    assert.equal(a.title, "Item Receipt");
    assert.ok(a.newPath.includes("purchase-receipt"));
  });
});

describe("readReceiptHeader", () => {
  it("projects museum header labels without supplier invoice ref", () => {
    const h = readReceiptHeader(sampleDoc);
    assert.equal(h["Vendor Name"], "Acme Hardware");
    assert.equal(h.Date, "2026-07-18");
    assert.equal(h["Packing List / BOL Ref No."], "PL-1");
    assert.match(String(h["Total Amount"]), /42\.50|\$42/);
    assert.equal(h.Memo, "Dock 2");
    assert.equal(h["Supplier Invoice Ref No."], undefined);
  });
});

describe("readReceiptItemRows", () => {
  it("maps Bill-like item columns", () => {
    const rows = readReceiptItemRows(sampleDoc);
    assert.deepEqual(rows[0], ["SKU-1", "Widget", 2, 10, 20, "JOB-1"]);
  });
});

describe("editable fields", () => {
  it("allows item project qty rate description", () => {
    assert.equal(isEditableReceiptItemField("project"), true);
    assert.equal(isEditableReceiptItemField("amount"), false);
  });

  it("writable header excludes Total Amount and has packing list only", () => {
    const w = writableReceiptHeaderFields();
    assert.ok(w.includes("supplier"));
    assert.ok(w.includes("lr_no"));
    assert.ok(!w.includes("bill_no"));
    assert.ok(!w.includes("grand_total"));
  });
});

describe("line totals + assumptions", () => {
  it("sums qty and amount", () => {
    assert.equal(sumReceiptLineQty(sampleDoc), 2);
    assert.equal(sumReceiptLineAmount(sampleDoc), 20);
  });

  it("covers museum topics and expense note", () => {
    const covered = new Set(receiptAssumptionTopicsCovered());
    for (const t of MUSEUM_RECEIPT_ASSUMPTION_TOPICS) {
      assert.ok(covered.has(t), `missing topic ${t}`);
    }
    assert.ok(RECEIPT_ASSUMPTIONS.length >= 3);
    assert.match(RECEIPT_EXPENSE_NOTE, /items-based/);
  });

  it("isDraftReceiptDoc", () => {
    assert.equal(isDraftReceiptDoc({ docstatus: 0 }), true);
    assert.equal(isDraftReceiptDoc({ docstatus: 1 }), false);
  });
});
