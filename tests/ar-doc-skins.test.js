/**
 * A/R Doc skins (plan 2026-09-26, stage A1): Estimate, Sales Order, Invoice, Receive Payment.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DOC_SKIN_PROFILES,
  docFormUiPayload,
  docFormMapFor,
  profileByDoctypeKey,
  profileByLayoutKey,
} from "../src/doc-skin-registry.js";
import { DOC_SKIN_INDEX, resolveDocSkinTarget } from "../src/lens-context.js";
import { readSalesHeader, readSalesLineRows, editableLineFields, salesProgressCells } from "../src/sales-doc-map.js";
import { ESTIMATE_HEADER_FIELDS } from "../src/estimate-map.js";
import { SALES_ORDER_ITEM_COLS, SALES_ORDER_PROGRESS } from "../src/sales-order-map.js";
import { RECEIVE_PAYMENT_ITEM_COLS, sumAppliedPayments } from "../src/receive-payment-map.js";
import { washForProfile } from "../src/doc-wash.js";
import { relabelTerm } from "../src/doc-terms.js";
import { formLabelForDoctype, listLabelForDoctype } from "../src/doctype-labels.js";
import { dirtyCompareKindForField } from "../src/dirty-gate.js";

const AR_IDS = ["estimate", "sales-order", "invoice", "receive-payment"];

describe("A/R profiles", () => {
  it("each is a doc-form layout with a map, an A/R wash and a Find label", () => {
    for (const id of AR_IDS) {
      const ui = docFormUiPayload(id);
      assert.ok(ui, id);
      assert.equal(ui.desk, "ar", id);
      assert.ok(ui.partyField, id);
      assert.ok(ui.headerFields.some((m) => m.field === ui.partyField && m.linkDoctype === "Customer"), id);
      assert.ok(docFormMapFor(id), id);
      assert.equal(washForProfile(id)?.desk, "ar", id);
      assert.match(ui.findLabel, /^Find .+…$/, id);
    }
  });

  it("Estimate/SO/Invoice answer by doctype; Receive Payment only by layout", () => {
    assert.equal(profileByDoctypeKey("quotation")?.id, "estimate");
    assert.equal(profileByDoctypeKey("sales-order")?.id, "sales-order");
    assert.equal(profileByDoctypeKey("sales-invoice")?.id, "invoice");
    assert.equal(profileByDoctypeKey("payment-entry"), null);
    assert.equal(profileByLayoutKey("receive-payment")?.id, "receive-payment");
  });

  it("every A/R skin-index row names a registry layout", () => {
    for (const id of ["estimate", "sales-order", "invoice"]) {
      const row = DOC_SKIN_INDEX.find((e) => e.id === id);
      assert.ok(row?.ready, id);
      assert.equal(profileByLayoutKey(row.layoutKey)?.id, id);
    }
    const t = resolveDocSkinTarget({ route: "/app/payment-entry/new", paymentDirection: "Receive" });
    assert.equal(t && t.kind === "doc-form" && profileByLayoutKey(t.layoutKey)?.id, "receive-payment");
  });

  it("Receive Payment: lines are references, no add/remove, defaults set Receive + Customer", () => {
    const ui = docFormUiPayload("receive-payment");
    assert.equal(ui.linesTable, "references");
    assert.equal(ui.features.addLine, false);
    assert.equal(ui.features.fetchOutstandingOnParty, true);
    assert.deepEqual(ui.newDocDefaults, [
      ["payment_type", "Receive"],
      ["party_type", "Customer"],
    ]);
    assert.equal(DOC_SKIN_PROFILES["receive-payment"].layoutOnly, true);
  });

  it("only the Invoice keeps a typed posting date; only the Sales Order has a progress strip", () => {
    for (const id of AR_IDS) {
      const f = DOC_SKIN_PROFILES[id].features;
      assert.equal(!!f.keepTypedPostingDate, id === "invoice", id);
      assert.equal(!!f.progress, id === "sales-order", id);
      assert.equal(!!f.taxesReadOnly, id !== "receive-payment" || !f.taxes, id);
    }
  });
});

describe("sales-doc-map readers", () => {
  it("reads a Quotation header by display alternatives and blanks unknown fields", () => {
    const h = readSalesHeader(ESTIMATE_HEADER_FIELDS, {
      party_name: "CUST-1",
      customer_name: "Grant Plastics Ltd.",
      transaction_date: "2026-09-26",
      name: "SAL-QTN-2026-00001",
    });
    assert.equal(h.Customer, "Grant Plastics Ltd.");
    assert.equal(h.Date, "2026-09-26");
    assert.equal(h["Estimate No."], "SAL-QTN-2026-00001");
    assert.equal(h["Valid until"], "");
  });

  it("reads Sales Order lines, display columns included", () => {
    const rows = readSalesLineRows(SALES_ORDER_ITEM_COLS, {
      items: [
        { idx: 1, item_code: "A", description: "<p>Widget</p>", qty: 2, rate: 5, delivery_date: "2026-10-01", amount: 10, delivered_qty: 1, billed_amt: 5 },
      ],
    });
    assert.deepEqual(rows, [["1", "A", "Widget", 2, 5, "2026-10-01", 10, 1, 5]]);
  });

  it("only real, typeable fields are editable", () => {
    assert.deepEqual(editableLineFields(SALES_ORDER_ITEM_COLS), ["item_code", "description", "qty", "rate", "delivery_date"]);
    assert.deepEqual(editableLineFields(RECEIVE_PAYMENT_ITEM_COLS), ["allocated_amount"]);
    assert.equal(docFormMapFor("receive-payment").isEditableItemField("outstanding_amount"), false);
  });

  it("Receive Payment reads the references table and sums what is applied", () => {
    const doc = {
      items: [{ qty: 99 }],
      references: [
        { reference_name: "SINV-1", due_date: "2026-09-01", total_amount: 100, outstanding_amount: 100, allocated_amount: 60 },
        { reference_name: "SINV-2", due_date: "2026-09-20", total_amount: 50, outstanding_amount: 50, allocated_amount: 0 },
      ],
    };
    const map = docFormMapFor("receive-payment");
    assert.deepEqual(map.readItemRows(doc)[0], ["SINV-1", "2026-09-01", 100, 100, 60]);
    assert.equal(map.readItemRows(doc).length, 2);
    assert.equal(sumAppliedPayments(doc), 60);
  });

  it("progress strip rounds percents and passes status through", () => {
    const cells = salesProgressCells(SALES_ORDER_PROGRESS, { per_delivered: 33.333, per_billed: null, status: "To Deliver and Bill" });
    assert.deepEqual(
      cells.map((c) => c.value),
      ["33%", "0%", "To Deliver and Bill"],
    );
    assert.deepEqual(salesProgressCells(SALES_ORDER_PROGRESS, null), []);
  });
});

describe("A/R words and field kinds", () => {
  it("Doc skins say Estimate and Invoice; the ERPNext words are only relabelled, never edited", () => {
    assert.equal(relabelTerm("Sales Invoice"), "Invoice");
    assert.equal(relabelTerm("Quotation"), "Estimate");
    assert.equal(formLabelForDoctype("sales-invoice"), "Invoice");
    assert.equal(listLabelForDoctype("sales-invoice"), "Find Invoices");
  });

  it("new A/R dates and the payment allocation compare as their kinds", () => {
    for (const f of ["delivery_date", "valid_till", "reference_date"]) {
      assert.equal(dirtyCompareKindForField(f), "date", f);
    }
    assert.equal(dirtyCompareKindForField("allocated_amount"), "number");
  });
});
