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
      "At least one Item line is required.",
    ]);
    const blockers = listDocFormSaveBlockers({
      supplier: "ACME",
      doc: { items: [{ item_code: "X" }] },
    });
    assert.equal(blockers.length, 0);
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

  it("splitHeaderColumns balances columns", () => {
    const { left, right } = splitHeaderColumns([1, 2, 3, 4, 5]);
    assert.deepEqual(left, [1, 2, 3]);
    assert.deepEqual(right, [4, 5]);
  });
});
