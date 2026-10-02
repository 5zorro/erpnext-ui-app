import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_NUMBER_LEAD,
  normalizeNumberLead,
  mergeNumberPrefs,
  flipNumberLead,
  theirNumberFor,
  docNumbers,
  billRowNumbers,
  numberLeadButtonLabel,
} from "../src/doc-number-pref.js";

describe("doc-number-pref (OI-170, DF-01 E)", () => {
  it("defaults to their number — 5zorro tracks by the vendor's ref and the logbook PO#", () => {
    assert.equal(DEFAULT_NUMBER_LEAD, "theirs");
    assert.deepEqual(mergeNumberPrefs(null), { lead: "theirs" });
    assert.deepEqual(mergeNumberPrefs({ lead: "ours" }), { lead: "ours" });
    assert.equal(normalizeNumberLead("garbage"), "theirs");
    assert.equal(flipNumberLead("theirs"), "ours");
    assert.equal(flipNumberLead("ours"), "theirs");
  });

  it("knows each Doc skin's own number field", () => {
    assert.equal(theirNumberFor("purchase-invoice").field, "bill_no");
    assert.equal(theirNumberFor("purchase_order").field, "title");
    assert.equal(theirNumberFor("Purchase Receipt").field, "lr_no");
    assert.equal(theirNumberFor("sales-order").field, "po_no", "the customer's PO the order was made from");
    assert.equal(theirNumberFor("quotation"), null);
  });

  it("leads with the vendor ref, the ERPNext ID beside it", () => {
    const n = docNumbers("purchase-invoice", { name: "ACC-PINV-2026-00001", bill_no: "ASI-77821 DOC" }, "theirs");
    assert.deepEqual(n.primary, { label: "Supplier No", value: "ASI-77821 DOC" });
    assert.deepEqual(n.secondary, { label: "Our No", value: "ACC-PINV-2026-00001" });
    const o = docNumbers("purchase-invoice", { name: "ACC-PINV-2026-00001", bill_no: "ASI-77821 DOC" }, "ours");
    assert.equal(o.primary.value, "ACC-PINV-2026-00001");
    assert.equal(o.secondary.value, "ASI-77821 DOC");
  });

  it("never leads with a blank: an unsaved draft has no ID, a fresh bill may have no ref yet", () => {
    const unsaved = docNumbers("purchase-invoice", { name: "new-purchase-invoice-zwliilabqn", bill_no: "X1" }, "ours");
    assert.deepEqual(unsaved.primary, { label: "Supplier No", value: "X1" });
    assert.deepEqual(unsaved.secondary, { label: "Our No", value: "" });
    const noRef = docNumbers("purchase-invoice", { name: "ACC-PINV-2026-00003", bill_no: "" }, "theirs");
    assert.equal(noRef.primary.value, "ACC-PINV-2026-00003");
    assert.equal(noRef.secondary.label, "Supplier No");
  });

  it("a doctype without their number shows only ours", () => {
    const n = docNumbers("quotation", { name: "SAL-QTN-2026-00001" }, "theirs");
    assert.equal(n.primary.value, "SAL-QTN-2026-00001");
    assert.equal(n.secondary, null);
  });

  it("a board row uses invoice + billNo", () => {
    const n = billRowNumbers({ invoice: "ACC-PINV-2026-00002", billNo: "ASI-77821 SIMP" }, "theirs");
    assert.equal(n.primary.value, "ASI-77821 SIMP");
    assert.equal(n.secondary.value, "ACC-PINV-2026-00002");
    assert.equal(billRowNumbers({ invoice: "ACC-PINV-2026-00002" }, "theirs").primary.value, "ACC-PINV-2026-00002");
  });

  it("the button says which number leads, in the doctype's own words", () => {
    assert.equal(numberLeadButtonLabel("purchase-invoice", "theirs"), "No.: Supplier No");
    assert.equal(numberLeadButtonLabel("purchase-order", "theirs"), "No.: Logbook PO#");
    assert.equal(numberLeadButtonLabel("purchase-order", "ours"), "No.: Our No");
  });

  // 5zorro 2026-10-01: on the sales side the Sales Order is the approval, as the PO is when buying.
  it("a Sales Invoice leads with the Sales Order(s) it bills", () => {
    const doc = {
      name: "ACC-SINV-2026-00004",
      po_no: "CPO-88120",
      items: [{ sales_order: "SAL-ORD-2026-00012" }, { sales_order: "SAL-ORD-2026-00012" }, { sales_order: "" }],
    };
    const n = docNumbers("sales-invoice", doc, "theirs");
    assert.deepEqual(n.primary, { label: "Sales Order", value: "SAL-ORD-2026-00012" });
    assert.equal(n.secondary.value, "ACC-SINV-2026-00004");
    assert.equal(numberLeadButtonLabel("sales-invoice", "theirs"), "No.: Sales Order");
    const two = docNumbers("sales-invoice", { name: "X", items: [{ sales_order: "A" }, { sales_order: "B" }] }, "theirs");
    assert.equal(two.primary.value, "A, B");
    assert.equal(docNumbers("sales-invoice", { name: "X", items: [] }, "theirs").primary.value, "X");
  });
});
