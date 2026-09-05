import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  listDocFormSaveBlockers,
  docGateTriggerLabel,
  linkDoctypeForDocField,
  focusTargetAfterDocSourceModal,
  splitHeaderColumns,
} from "../src/doc-action-flow.js";
import { PO_HEADER_FIELDS, PO_ITEM_COLS } from "../src/po-map.js";

describe("doc-action-flow", () => {
  it("listDocFormSaveBlockers — no Amount Due checksum", () => {
    assert.deepEqual(listDocFormSaveBlockers({}), [
      "Vendor (Supplier) is required.",
      "At least one Item line with an Item code is required.",
    ]);
    const blockers = listDocFormSaveBlockers({
      supplier: "ACME",
      doc: { items: [{ item_code: "X" }] },
    });
    assert.equal(blockers.length, 0);
    assert.deepEqual(
      listDocFormSaveBlockers({
        supplier: "ACME",
        doc: { items: [{ item_code: "" }] },
      }),
      ["At least one Item line with an Item code is required."],
    );
  });

  it("docGateTriggerLabel uses UI labels", () => {
    const labels = {
      leaving: "leaving this Purchase Order",
      find: "Find Purchase Order…",
      new: "New Purchase Order",
      print: "Print",
    };
    assert.equal(
      docGateTriggerLabel({ kind: "nav", label: "Home" }, labels),
      "Home",
    );
    assert.equal(docGateTriggerLabel({ kind: "toolbar", action: "find" }, labels), labels.find);
  });

  it("linkDoctypeForDocField resolves from header/item meta", () => {
    assert.equal(
      linkDoctypeForDocField("supplier", PO_HEADER_FIELDS, PO_ITEM_COLS),
      "Supplier",
    );
    assert.equal(
      linkDoctypeForDocField("payment_terms_template", PO_HEADER_FIELDS, PO_ITEM_COLS),
      "Payment Terms Template",
    );
    assert.equal(
      linkDoctypeForDocField("sales_order", PO_HEADER_FIELDS, PO_ITEM_COLS),
      "Sales Order",
    );
    assert.equal(linkDoctypeForDocField("description", PO_HEADER_FIELDS, PO_ITEM_COLS), null);
  });

  it("focusTargetAfterDocSourceModal — receipt focuses packing list ref", () => {
    assert.equal(focusTargetAfterDocSourceModal("receipt", "choose"), "lr_no");
    assert.equal(focusTargetAfterDocSourceModal("po", "choose"), null);
    assert.equal(focusTargetAfterDocSourceModal("receipt", "cancel"), null);
  });

  it("splitHeaderColumns balances columns and peels address roles", () => {
    const { left, right, addresses } = splitHeaderColumns([1, 2, 3, 4, 5]);
    assert.deepEqual(left, [1, 2, 3]);
    assert.deepEqual(right, [4, 5]);
    assert.deepEqual(addresses, []);
    const parted = splitHeaderColumns([
      { label: "A" },
      { label: "Ship from", addressRole: "ship_from" },
      { label: "B" },
      { label: "Ship to", addressRole: "ship_to" },
    ]);
    assert.deepEqual(
      parted.left.map((x) => x.label),
      ["A"],
    );
    assert.deepEqual(
      parted.right.map((x) => x.label),
      ["B"],
    );
    assert.deepEqual(
      parted.addresses.map((x) => x.addressRole),
      ["ship_from", "ship_to"],
    );
  });

  it("splitHeaderColumns respects explicit column (billing in left)", () => {
    const parted = splitHeaderColumns([
      { label: "Vendor", column: "left" },
      { label: "Billing", addressRole: "billing", column: "left" },
      { label: "Terms", column: "left" },
      { label: "Due", column: "left" },
      { label: "Date", column: "right" },
      { label: "Ship from", addressRole: "ship_from", column: "addresses" },
    ]);
    assert.deepEqual(
      parted.left.map((x) => x.label),
      ["Vendor", "Billing", "Terms", "Due"],
    );
    assert.deepEqual(
      parted.right.map((x) => x.label),
      ["Date"],
    );
    assert.deepEqual(
      parted.addresses.map((x) => x.addressRole),
      ["ship_from"],
    );
  });
});
