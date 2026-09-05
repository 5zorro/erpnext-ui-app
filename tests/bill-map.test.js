import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getBillAnchor,
  readBillHeader,
  readBillItemRows,
  amountDueMatchesGrandTotal,
  amountDueChecksumStatus,
  amountDueChecksumChip,
  amountDueGrandPointer,
  billCompareTotal,
  amountDueDelta,
  billMoneyStack,
  readBillTaxRows,
  isEditableBillTaxField,
  billShowsEditableTermsField,
  BILL_TAX_EDIT_FIELDS,
  stripHtml,
  sumBillLineQty,
  sumBillLineAmount,
  formatBillLineTotal,
  BILL_DOCTYPE,
  writableBillHeaderFields,
  isEditableBillItemField,
  BILL_ITEM_EDIT_FIELDS,
  BILL_ASSUMPTIONS,
  BILL_VANILLA_TAB_NOTES,
  BILL_EXPENSE_NOTE,
  MUSEUM_BILL_ASSUMPTION_TOPICS,
  billAssumptionTopicsCovered,
  isDraftBillDoc,
  projectClearedQtyItems,
  packingSlipHashAfterClear,
  reconciliationReport,
  saveActionsBlockedByChecksum,
  shouldShowAmountDueSticky,
  formatUsdAmount,
  uniqueLinkedPurchaseOrderNames,
  linkedPurchaseOrdersForBill,
  BILL_HEADER_FIELDS,
} from "../src/bill-map.js";
import { splitHeaderColumns } from "../src/doc-action-flow.js";

const sampleDoc = {
  doctype: BILL_DOCTYPE,
  supplier: "SUP-001",
  supplier_name: "Acme Hardware",
  address_display: "<p>123 Main<br>Town</p>",
  payment_terms_template: "Net 30",
  posting_date: "2026-07-01",
  bill_date: "2026-07-18",
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

describe("billShowsEditableTermsField", () => {
  it("Doc Bill never shows editable freeform terms", () => {
    assert.equal(billShowsEditableTermsField(), false);
  });
});

describe("Bill header layout (OI-121 linked POs)", () => {
  it("places invoice date before terms; ship addresses only in addr row", () => {
    const { left, right, addresses } = splitHeaderColumns(BILL_HEADER_FIELDS);
    assert.deepEqual(
      left.map((f) => f.label),
      [
        "Vendor Name",
        "Invoice date",
        "Remittance & Billing Address",
        "Payment terms",
        "Bill Due Date",
      ],
    );
    assert.deepEqual(
      right.map((f) => f.label),
      ["Ref No. (Supplier Invoice No.)", "Amount Due"],
    );
    assert.deepEqual(
      addresses.map((f) => f.addressRole),
      ["ship_from", "ship_to"],
    );
  });

  it("uniqueLinkedPurchaseOrderNames preserves first-seen order", () => {
    assert.deepEqual(
      uniqueLinkedPurchaseOrderNames({
        items: [
          { purchase_order: "PUR-ORD-1" },
          { purchase_order: "PUR-ORD-2" },
          { purchase_order: "PUR-ORD-1" },
          { purchase_order: "" },
          {},
        ],
      }),
      ["PUR-ORD-1", "PUR-ORD-2"],
    );
  });

  it("linkedPurchaseOrdersForBill pairs titles by name", () => {
    const doc = {
      items: [{ purchase_order: "PUR-ORD-A" }, { purchase_order: "PUR-ORD-B" }],
    };
    assert.deepEqual(linkedPurchaseOrdersForBill(doc, [{ name: "PUR-ORD-B", title: "JE0001" }]), [
      { name: "PUR-ORD-A", title: "" },
      { name: "PUR-ORD-B", title: "JE0001" },
    ]);
    assert.deepEqual(linkedPurchaseOrdersForBill(doc, { "PUR-ORD-A": "TO0002" }), [
      { name: "PUR-ORD-A", title: "TO0002" },
      { name: "PUR-ORD-B", title: "" },
    ]);
  });
});

describe("readBillHeader", () => {
  it("projects museum header labels", () => {
    const h = readBillHeader(sampleDoc);
    assert.equal(h["Vendor Name"], "Acme Hardware");
    assert.equal(h["Remittance & Billing Address"], "123 Main\nTown");
    assert.equal(h["Ship from / supplier dispatch"], "");
    assert.equal(h["Ship to / receiving address"], "");
    assert.equal(h["Invoice date"], "2026-07-18");
    assert.equal(h.Memo, "Rush");
    assert.equal(h["Amount Due"], "");
  });

  it("projects three address roles with USA multiline formatting", () => {
    const h = readBillHeader({
      ...sampleDoc,
      dispatch_address_display:
        "<p>Three Little Pigs<br>attn:AR clerk<br>123 street addr<br>City, TX 77444-1234<br>United States</p>",
      shipping_address_display: "<p>Our Warehouse<br>9 Dock Rd<br>Houston, TX 77002<br>USA</p>",
      address_display: "<p>Billing Desk<br>PO Box 1<br>Austin, TX 78701</p>",
    });
    assert.equal(
      h["Ship from / supplier dispatch"],
      "Three Little Pigs\nattn:AR clerk\n123 street addr\nCity, TX 77444-1234",
    );
    assert.equal(
      h["Ship to / receiving address"],
      "Our Warehouse\n9 Dock Rd\nHouston, TX 77002",
    );
    assert.equal(
      h["Remittance & Billing Address"],
      "Billing Desk\nPO Box 1\nAustin, TX 78701",
    );
  });

  it("prefers scratch amount due", () => {
    const h = readBillHeader(sampleDoc, { amountDue: "40.00" });
    assert.equal(h["Amount Due"], "40.00");
  });

  it("does not seed Amount Due from grand_total", () => {
    const h = readBillHeader({ grand_total: 99.5, supplier: "S" });
    assert.equal(h["Amount Due"], "");
  });
});

describe("readBillItemRows", () => {
  it("maps item columns including display amount", () => {
    const rows = readBillItemRows(sampleDoc);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], ["1", "", "SKU-1", "Widget", 2, 10, 20, "", "", "JOB-1"]);
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

describe("amountDueChecksumChip", () => {
  it("splits icon and money; shows dollar delta on mismatch", () => {
    const chip = amountDueChecksumChip(50, 40);
    assert.equal(chip.status, "mismatch");
    assert.equal(chip.icon, "alert");
    assert.match(chip.moneyText, /\$10\.00/);
    assert.match(chip.title, /Off by/);
  });

  it("idle shows dash; match shows check and $0", () => {
    const idle = amountDueChecksumChip("", 10);
    assert.equal(idle.icon, "idle");
    assert.equal(idle.moneyText, "—");
    const match = amountDueChecksumChip(10, 10);
    assert.equal(match.icon, "check");
    assert.match(match.moneyText, /\$0\.00/);
  });
});

describe("amountDueGrandPointer (OI-073)", () => {
  it("shows Bill $ next to the chip target", () => {
    const ptr = amountDueGrandPointer(123.45);
    assert.match(ptr.text, /Bill \$123\.45/);
    assert.equal(ptr.grandTotal, 123.45);
  });

  it("shows dash when total missing", () => {
    assert.equal(amountDueGrandPointer(null).text, "Bill —");
    assert.equal(amountDueGrandPointer("x").grandTotal, null);
  });
});

describe("billCompareTotal", () => {
  it("prefers grand_total over Σ line amounts (museum amountDueOK)", () => {
    const doc = {
      grand_total: 999,
      items: [
        { qty: 1, rate: 10, amount: 10 },
        { qty: 2, rate: 5, amount: 10 },
      ],
    };
    assert.equal(billCompareTotal(doc), 999);
  });

  it("falls back to Σ lines when grand_total missing", () => {
    assert.equal(
      billCompareTotal({ items: [{ qty: 1, rate: 42, amount: 42 }] }),
      42,
    );
  });

  it("does not treat stale grand_total 0 as compare when lines have money", () => {
    assert.equal(
      billCompareTotal({
        grand_total: 0,
        items: [{ amount: 100 }],
        taxes: [{ tax_amount: 8, add_deduct_tax: "Add" }],
      }),
      108,
    );
  });

  it("returns null for missing doc (not 0)", () => {
    assert.equal(billCompareTotal(null), null);
  });
});

describe("amountDueDelta null-safety", () => {
  it("does not coerce null compare to $0", () => {
    assert.equal(amountDueDelta(50, null), null);
    assert.equal(amountDueDelta(50, undefined), null);
    assert.equal(amountDueDelta(50, ""), null);
    assert.equal(amountDueDelta(50, 0), 50);
    assert.equal(amountDueDelta(50, 40), 10);
  });
});

describe("billMoneyStack / readBillTaxRows", () => {
  it("projects item subtotal, taxes, grand total", () => {
    const doc = {
      grand_total: 110,
      total_taxes_and_charges: 10,
      items: [{ amount: 100 }],
      taxes: [
        {
          account_head: "Sales Tax Payable - X",
          description: "Tax",
          charge_type: "Actual",
          rate: 0,
          tax_amount: 10,
          add_deduct_tax: "Add",
        },
      ],
    };
    const stack = billMoneyStack(doc);
    assert.equal(stack.itemSubtotal, 100);
    assert.equal(stack.taxesTotal, 10);
    assert.equal(stack.grandTotal, 110);
    assert.equal(stack.taxRowCount, 1);
    assert.equal(stack.note, null);

    const rows = readBillTaxRows(doc);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].account_head, "Sales Tax Payable - X");
    assert.equal(isEditableBillTaxField("tax_amount"), true);
    assert.equal(isEditableBillTaxField("charge_type"), false);
    assert.ok(BILL_TAX_EDIT_FIELDS.includes("account_head"));
  });

  it("notes when no tax rows", () => {
    const stack = billMoneyStack({ grand_total: 20, items: [{ amount: 20 }], taxes: [] });
    assert.match(stack.note || "", /No tax/);
  });
});

describe("stripHtml", () => {
  it("strips tags", () => {
    assert.equal(stripHtml("<i>x</i>"), "x");
  });
});

describe("writableBillHeaderFields", () => {
  it("excludes read-only address displays; link fields still writable via gate", () => {
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
    assert.match(BILL_EXPENSE_NOTE, /Taxes and Charges/i);
  });

  it("lists Vanilla Bill tabs for Payments brainstorm", () => {
    assert.ok(BILL_VANILLA_TAB_NOTES.length >= 5);
    const tabs = BILL_VANILLA_TAB_NOTES.map((t) => t.tab);
    assert.ok(tabs.includes("Payments"));
    assert.ok(tabs.includes("Payment Schedule"));
    assert.ok(tabs.includes("Details"));
    assert.match(
      BILL_VANILLA_TAB_NOTES.find((t) => t.tab === "Payments").note,
      /Already paid|is_paid/i,
    );
  });
});

describe("isDraftBillDoc", () => {
  it("accepts numeric or string docstatus 0", () => {
    assert.equal(isDraftBillDoc({ docstatus: 0 }), true);
    assert.equal(isDraftBillDoc({ docstatus: "0" }), true);
    assert.equal(isDraftBillDoc({ docstatus: 1 }), false);
    assert.equal(isDraftBillDoc(null), false);
  });

  it("treats missing docstatus as draft (new form)", () => {
    assert.equal(isDraftBillDoc({ name: "new-purchase-invoice-1" }), true);
    assert.equal(isDraftBillDoc({ name: "ACC-1", docstatus: null }), true);
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
  it("gates on grand_total; Σ lines is diagnostic", () => {
    const matchGrand = reconciliationReport(sampleDoc, "42.50");
    assert.equal(matchGrand.chip, "match");
    assert.equal(matchGrand.saveAllowed, true);
    assert.equal(matchGrand.linesSum, 20);
    assert.equal(matchGrand.compareTotal, 42.5);
    assert.equal(matchGrand.grandTotal, 42.5);

    const mismatch = reconciliationReport(sampleDoc, "20");
    assert.equal(mismatch.chip, "mismatch");
    assert.equal(mismatch.saveAllowed, false);
    assert.equal(saveActionsBlockedByChecksum("mismatch"), true);
    assert.equal(saveActionsBlockedByChecksum("idle"), false);
    assert.equal(saveActionsBlockedByChecksum("match"), false);
    assert.equal(shouldShowAmountDueSticky("mismatch", false), true);
    assert.equal(shouldShowAmountDueSticky("mismatch", true), false);
    assert.equal(shouldShowAmountDueSticky("match", false), false);
    assert.equal(shouldShowAmountDueSticky("idle", false), false);
  });
});

describe("formatUsdAmount", () => {
  it("formats USD like museum fmtUsd", () => {
    assert.equal(formatUsdAmount(""), "");
    assert.match(formatUsdAmount(12.5), /\$12\.50/);
  });
});
