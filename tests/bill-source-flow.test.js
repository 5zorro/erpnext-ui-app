import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  shouldOpenSourceModalAfterVendorPick,
  focusTargetAfterSourceModal,
  mergeMethodForSourceKind,
  BILL_MERGE_SKIP_FIELDS,
  BILL_MERGE_COPY_HEADER_FIELDS,
  applyMappedSourceHeaders,
  mappedItemFieldsForBill,
  supplierHeaderUnchanged,
} from "../src/bill-source-flow.js";
import { valuesMeaningfullyEqual } from "../src/dirty-gate.js";

describe("shouldOpenSourceModalAfterVendorPick", () => {
  it("opens on link_pick even if setHeader not finished (approach A)", () => {
    const r = shouldOpenSourceModalAfterVendorPick({
      trigger: "link_pick",
      hasSupplier: true,
      editable: true,
      setHeaderOk: null,
    });
    assert.equal(r.open, true);
    assert.equal(r.reason, "vendor_link_pick");
  });

  it("opens on toolbar when supplier set", () => {
    assert.equal(
      shouldOpenSourceModalAfterVendorPick({
        trigger: "toolbar",
        hasSupplier: true,
        editable: true,
      }).open,
      true,
    );
  });

  it("refuses without supplier, when not editable, or modal open", () => {
    assert.equal(
      shouldOpenSourceModalAfterVendorPick({
        trigger: "link_pick",
        hasSupplier: false,
        editable: true,
      }).reason,
      "no_supplier",
    );
    assert.equal(
      shouldOpenSourceModalAfterVendorPick({
        trigger: "link_pick",
        hasSupplier: true,
        editable: false,
      }).reason,
      "not_editable",
    );
    assert.equal(
      shouldOpenSourceModalAfterVendorPick({
        trigger: "link_pick",
        hasSupplier: true,
        editable: true,
        modalAlreadyOpen: true,
      }).reason,
      "modal_already_open",
    );
  });

  it("blur: skips noop; opens on successful commit", () => {
    assert.equal(
      shouldOpenSourceModalAfterVendorPick({
        trigger: "blur",
        hasSupplier: true,
        editable: true,
        setHeaderSkipped: true,
      }).open,
      false,
    );
    assert.equal(
      shouldOpenSourceModalAfterVendorPick({
        trigger: "blur",
        hasSupplier: true,
        editable: true,
        setHeaderOk: true,
      }).open,
      true,
    );
  });
});

describe("focusTargetAfterSourceModal", () => {
  it("Terms after choose; none on cancel/esc", () => {
    assert.equal(focusTargetAfterSourceModal("choose"), "terms");
    assert.equal(focusTargetAfterSourceModal("cancel"), "none");
    assert.equal(focusTargetAfterSourceModal("escape"), "none");
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
