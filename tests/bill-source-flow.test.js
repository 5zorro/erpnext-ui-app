import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  focusTargetAfterSourceModal,
  mergeMethodForSourceKind,
  BILL_MERGE_SKIP_FIELDS,
  BILL_MERGE_COPY_HEADER_FIELDS,
  applyMappedSourceHeaders,
  mappedItemFieldsForBill,
  supplierHeaderUnchanged,
  billSourceChoiceAction,
  billSourcePulledStatus,
} from "../src/bill-source-flow.js";
import { valuesMeaningfullyEqual } from "../src/dirty-gate.js";

describe("focusTargetAfterSourceModal", () => {
  it("Invoice date after any close (choose, cancel, esc, backdrop)", () => {
    assert.equal(focusTargetAfterSourceModal("choose"), "invoice_date");
    assert.equal(focusTargetAfterSourceModal("cancel"), "invoice_date");
    assert.equal(focusTargetAfterSourceModal("escape"), "invoice_date");
    assert.equal(focusTargetAfterSourceModal("backdrop"), "invoice_date");
  });
});

describe("mergeMethodForSourceKind", () => {
  it("maps po and pr; rejects nic", () => {
    assert.match(mergeMethodForSourceKind("po"), /purchase_order\.make_purchase_invoice/);
    assert.match(mergeMethodForSourceKind("pr"), /purchase_receipt\.make_purchase_invoice/);
    assert.equal(mergeMethodForSourceKind("nic"), null);
  });
});

describe("merge field contracts", () => {
  it("skips identity keys; copies museum header fields", () => {
    assert.ok(BILL_MERGE_SKIP_FIELDS.includes("name"));
    assert.ok(BILL_MERGE_SKIP_FIELDS.includes("docstatus"));
    assert.deepEqual([...BILL_MERGE_COPY_HEADER_FIELDS], [
      "bill_no",
      "payment_terms_template",
      "due_date",
    ]);
    const t = applyMappedSourceHeaders(
      {},
      { bill_no: "INV-1", payment_terms_template: "Net 30", due_date: "2026-08-01", name: "X" },
    );
    assert.equal(t.bill_no, "INV-1");
    assert.equal(t.name, undefined);
    const row = mappedItemFieldsForBill({
      name: "row1",
      item_code: "SKU",
      qty: 2,
      parent: "PO-1",
    });
    assert.equal(row.item_code, "SKU");
    assert.equal(row.name, undefined);
    assert.equal(row.parent, undefined);
  });
});

describe("supplierHeaderUnchanged", () => {
  it("matches supplier id or supplier_name display", () => {
    const doc = { supplier: "SUP-1", supplier_name: "Alpine Co" };
    assert.equal(supplierHeaderUnchanged(doc, "SUP-1", valuesMeaningfullyEqual), true);
    assert.equal(supplierHeaderUnchanged(doc, "Alpine Co", valuesMeaningfullyEqual), true);
    assert.equal(supplierHeaderUnchanged(doc, "Other", valuesMeaningfullyEqual), false);
  });
});

describe("billSourceChoiceAction — a pick in the Bill's source picker, Credit memo off", () => {
  it("NIC, by mode or as the only item", () => {
    assert.deepEqual(billSourceChoiceAction({ mode: "nic", items: [] }), { action: "nic" });
    assert.deepEqual(billSourceChoiceAction({ mode: "merge", items: [{ kind: "nic" }] }), { action: "nic" });
  });
  it("nothing checked, or no choice, says to pick", () => {
    assert.deepEqual(billSourceChoiceAction({ mode: "merge", items: [] }), { action: "warn" });
    assert.deepEqual(billSourceChoiceAction(null), { action: "warn" });
    assert.deepEqual(billSourceChoiceAction({ mode: "other", items: [{ kind: "po", name: "PO-1" }] }), { action: "warn" });
  });
  it("pulls the checked sources, named by name or kind", () => {
    assert.deepEqual(
      billSourceChoiceAction({ mode: "merge", items: [{ kind: "po", name: "PO-1", label: "x" }, { kind: "pr", name: "PR-2" }] }),
      { action: "merge", payload: [{ kind: "po", name: "PO-1" }, { kind: "pr", name: "PR-2" }], labels: "PO-1, PR-2" },
    );
    assert.equal(billSourceChoiceAction({ mode: "merge", items: [{ kind: "po" }] }).labels, "po");
  });
  it("says one pulled source by name, several by count", () => {
    assert.equal(billSourcePulledStatus([{ kind: "po", name: "PO-1" }]), "Pulled from PO-1.");
    assert.equal(billSourcePulledStatus([{ kind: "po", name: "PO-1" }, { kind: "pr", name: "PR-2" }]), "Pulled from 2 sources.");
  });
});
