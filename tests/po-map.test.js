import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getPoAnchor,
  readPoHeader,
  readPoItemRows,
  resolvePoDateExpected,
  resolvePoStampDate,
  defaultPoScheduleDate,
  poRowsNeedingScheduleStamp,
  isEditablePoItemField,
  writablePoHeaderFields,
  sumPoLineQty,
  sumPoLineAmount,
  formatPoLineTotal,
  PO_DOCTYPE,
  PO_ASSUMPTIONS,
  MUSEUM_PO_ASSUMPTION_TOPICS,
  poAssumptionTopicsCovered,
  isDraftPoDoc,
} from "../src/po-map.js";

const sampleDoc = {
  doctype: PO_DOCTYPE,
  name: "PO-0001",
  supplier: "SUP-001",
  supplier_name: "Acme Hardware",
  address_display: "<p>123 Main<br>Town</p>",
  shipping_address_display: "<p>Ship Yard</p>",
  transaction_date: "2026-07-18",
  grand_total: 42.5,
  items: [
    {
      item_code: "SKU-1",
      description: "<b>Widget</b>",
      qty: 2,
      rate: 10,
      amount: 20,
      sales_order: "SO-1",
      received_qty: 1,
      schedule_date: "2026-07-25",
    },
  ],
};

describe("getPoAnchor", () => {
  it("returns Purchase Order concept metadata", () => {
    const a = getPoAnchor();
    assert.equal(a.doctype, "Purchase Order");
    assert.equal(a.layoutKey, "purchase-order");
    assert.ok(a.newPath.includes("purchase-order"));
  });
});

describe("readPoHeader", () => {
  it("projects museum header labels", () => {
    const h = readPoHeader(sampleDoc);
    assert.equal(h.Vendor, "Acme Hardware");
    assert.equal(h["Vendor Shipping Address"], "123 Main Town");
    assert.equal(h["Ship To Address"], "Ship Yard");
    assert.equal(h.Date, "2026-07-18");
    assert.equal(h["P.O. No."], "PO-0001");
    assert.equal(h["Date Expected"], "2026-07-25");
  });

  it("prefers scratch Date Expected", () => {
    const h = readPoHeader(sampleDoc, { dateExpected: "2026-08-01" });
    assert.equal(h["Date Expected"], "2026-08-01");
  });
});

describe("resolvePoDateExpected", () => {
  it("falls back to first line schedule_date", () => {
    assert.equal(resolvePoDateExpected(sampleDoc), "2026-07-25");
  });

  it("returns empty when no scratch and no line dates", () => {
    assert.equal(resolvePoDateExpected({ items: [{ qty: 1 }] }), "");
  });
});

describe("readPoItemRows", () => {
  it("maps item columns including SO, Required By, and received qty", () => {
    const rows = readPoItemRows(sampleDoc);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], ["SKU-1", "Widget", 2, 10, "SO-1", "2026-07-25", 20, 1]);
  });
});

describe("editable fields", () => {
  it("allows item_code qty rate sales_order description schedule_date", () => {
    assert.equal(isEditablePoItemField("item_code"), true);
    assert.equal(isEditablePoItemField("sales_order"), true);
    assert.equal(isEditablePoItemField("schedule_date"), true);
    assert.equal(isEditablePoItemField("amount"), false);
  });

  it("writable header excludes scratch and read-only", () => {
    const w = writablePoHeaderFields();
    assert.ok(w.includes("supplier"));
    assert.ok(w.includes("transaction_date"));
    assert.ok(!w.includes("__date_expected"));
    assert.ok(!w.includes("name"));
  });
});

describe("line totals", () => {
  it("sums qty and amount", () => {
    assert.equal(sumPoLineQty(sampleDoc), 2);
    assert.equal(sumPoLineAmount(sampleDoc), 20);
    assert.equal(formatPoLineTotal(2.5), "2.50");
  });
});

describe("Date Expected → Required By stamp helpers", () => {
  it("resolvePoStampDate prefers header Date Expected", () => {
    assert.equal(resolvePoStampDate("2026-08-01"), "2026-08-01");
  });

  it("resolvePoStampDate falls back to week-out default", () => {
    const today = new Date(2026, 6, 21); // Jul 21
    assert.equal(defaultPoScheduleDate(today), "2026-07-28");
    assert.equal(resolvePoStampDate("", today), "2026-07-28");
  });

  it("poRowsNeedingScheduleStamp lists rows that differ", () => {
    const doc = {
      items: [
        { schedule_date: "2026-07-25" },
        { schedule_date: "" },
        { schedule_date: "2026-08-01" },
      ],
    };
    assert.deepEqual(poRowsNeedingScheduleStamp(doc, "2026-08-01"), [0, 1]);
    assert.deepEqual(poRowsNeedingScheduleStamp(doc, "2026-07-25"), [1, 2]);
  });
});

describe("assumptions + draft", () => {
  it("covers museum topics", () => {
    const covered = new Set(poAssumptionTopicsCovered());
    for (const t of MUSEUM_PO_ASSUMPTION_TOPICS) {
      assert.ok(covered.has(t), `missing topic ${t}`);
    }
    assert.ok(PO_ASSUMPTIONS.length >= 5);
  });

  it("isDraftPoDoc", () => {
    assert.equal(isDraftPoDoc({ docstatus: 0 }), true);
    assert.equal(isDraftPoDoc({ docstatus: 1 }), false);
  });
});
