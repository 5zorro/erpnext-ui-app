import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getBillAnchor,
  readBillHeader,
  readBillItemRows,
  amountDueMatchesGrandTotal,
  amountDueChecksumStatus,
  stripHtml,
  sumBillLineQty,
  sumBillLineAmount,
  formatBillLineTotal,
  BILL_DOCTYPE,
  writableBillHeaderFields,
  isEditableBillItemField,
  BILL_ITEM_EDIT_FIELDS,
  BILL_ASSUMPTIONS,
  BILL_EXPENSE_NOTE,
  MUSEUM_BILL_ASSUMPTION_TOPICS,
  billAssumptionTopicsCovered,
  isDraftBillDoc,
  projectClearedQtyItems,
  packingSlipHashAfterClear,
  reconciliationReport,
  saveActionsBlockedByChecksum,
  formatUsdAmount,
} from "../src/bill-map.js";

const sampleDoc = {
  doctype: BILL_DOCTYPE,
  supplier: "SUP-001",
  supplier_name: "Acme Hardware",
  address_display: "<p>123 Main<br>Town</p>",
  payment_terms_template: "Net 30",
  posting_date: "2026-07-18",
  bill_no: "INV-9",
  due_date: "2026-08-18",
  remarks: "Rush",
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

describe("getBillAnchor", () => {
  it("returns Bill concept metadata", () => {
    const a = getBillAnchor();
    assert.equal(a.doctype, "Purchase Invoice");
    assert.equal(a.title, "Bill");
    assert.ok(a.newPath.includes("purchase-invoice"));
  });
});

describe("readBillHeader", () => {
  it("projects museum header labels", () => {
    const h = readBillHeader(sampleDoc);
    assert.equal(h["Vendor Name"], "Acme Hardware");
    assert.equal(h.Address, "123 Main Town");
    assert.equal(h.Date, "2026-07-18");
    assert.equal(h.Memo, "Rush");
    assert.equal(h["Amount Due"], 42.5);
  });

  it("prefers scratch amount due", () => {
    const h = readBillHeader(sampleDoc, { amountDue: "40.00" });
    assert.equal(h["Amount Due"], "40.00");
  });
});

describe("readBillItemRows", () => {
  it("maps item columns including display amount", () => {
    const rows = readBillItemRows(sampleDoc);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], ["SKU-1", "Widget", 2, 10, 20, "JOB-1"]);
  });
});

describe("amountDueMatchesGrandTotal", () => {
  it("allows empty due; rejects mismatch", () => {
    assert.equal(amountDueMatchesGrandTotal("", 10), true);
    assert.equal(amountDueMatchesGrandTotal(10, 10), true);
    assert.equal(amountDueMatchesGrandTotal("$10.00", 10), true);
    assert.equal(amountDueMatchesGrandTotal(9, 10), false);
  });
});

describe("amountDueChecksumStatus", () => {
  it("idle when empty; match/mismatch when typed", () => {
    assert.equal(amountDueChecksumStatus("", 42.5), "idle");
    assert.equal(amountDueChecksumStatus(42.5, 42.5), "match");
    assert.equal(amountDueChecksumStatus(40, 42.5), "mismatch");
  });
});

describe("stripHtml", () => {
  it("strips tags", () => {
    assert.equal(stripHtml("<i>x</i>"), "x");
  });
});

describe("writableBillHeaderFields", () => {
  it("excludes read-only address", () => {
    const fields = writableBillHeaderFields().map((f) => f.field);
    assert.ok(fields.includes("supplier"));
    assert.ok(!fields.includes(null));
  });
});

describe("sumBillLineQty / sumBillLineAmount", () => {
  it("sums qty and extended amounts", () => {
    const doc = {
      items: [
        { qty: 2, rate: 10, amount: 20 },
        { qty: 3, rate: 5, amount: 0 },
      ],
    };
    assert.equal(sumBillLineQty(doc), 5);
    assert.equal(sumBillLineAmount(doc), 20 + 15);
    assert.equal(formatBillLineTotal(5), "5");
    assert.equal(formatBillLineTotal(15.5), "15.50");
  });
});

describe("isEditableBillItemField", () => {
  it("allows item_code qty rate; rejects amount", () => {
    assert.ok(BILL_ITEM_EDIT_FIELDS.includes("item_code"));
    assert.equal(isEditableBillItemField("item_code"), true);
    assert.equal(isEditableBillItemField("qty"), true);
    assert.equal(isEditableBillItemField("amount"), false);
    assert.equal(isEditableBillItemField(""), false);
  });
});

describe("BILL_ASSUMPTIONS museum topic parity", () => {
  it("covers all museum SPECS topics", () => {
    assert.equal(BILL_ASSUMPTIONS.length, 6);
    const covered = billAssumptionTopicsCovered();
    for (const topic of MUSEUM_BILL_ASSUMPTION_TOPICS) {
      assert.ok(covered.includes(topic), `missing topic ${topic}`);
    }
    assert.match(BILL_EXPENSE_NOTE, /items-based/i);
  });
});

describe("isDraftBillDoc", () => {
  it("accepts numeric or string docstatus 0", () => {
    assert.equal(isDraftBillDoc({ docstatus: 0 }), true);
    assert.equal(isDraftBillDoc({ docstatus: "0" }), true);
    assert.equal(isDraftBillDoc({ docstatus: 1 }), false);
    assert.equal(isDraftBillDoc(null), false);
  });
});

describe("projectClearedQtyItems / packingSlipHashAfterClear", () => {
  it("zeros qty and hash is 0 (OI-026)", () => {
    const cleared = projectClearedQtyItems(sampleDoc);
    assert.equal(cleared[0].qty, 0);
    assert.equal(cleared[0].item_code, "SKU-1");
    const hash = packingSlipHashAfterClear(sampleDoc);
    assert.equal(hash.sumQty, 0);
    assert.equal(hash.ok, true);
  });
});

describe("reconciliationReport / saveActionsBlockedByChecksum", () => {
  it("reports chip, Σ lines, and save gate", () => {
    const r = reconciliationReport(sampleDoc, "42.50");
    assert.equal(r.chip, "match");
    assert.equal(r.saveAllowed, true);
    assert.equal(r.linesSum, 20);
    assert.equal(saveActionsBlockedByChecksum("mismatch"), true);
    assert.equal(saveActionsBlockedByChecksum("idle"), false);
    assert.equal(saveActionsBlockedByChecksum("match"), false);
  });
});

describe("formatUsdAmount", () => {
  it("formats USD like museum fmtUsd", () => {
    assert.equal(formatUsdAmount(""), "");
    assert.match(formatUsdAmount(12.5), /\$12\.50/);
  });
});
