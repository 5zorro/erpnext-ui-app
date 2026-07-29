import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  findButtonLabel,
  listLabelForDoctype,
  formLabelForDoctype,
} from "../src/doctype-labels.js";

describe("doctype label SSoT", () => {
  it("Find buttons differ PO vs Item Receipt", () => {
    assert.equal(findButtonLabel("purchase-order"), "Find Purchase Order…");
    assert.equal(findButtonLabel("purchase-receipt"), "Find Item Receipt…");
    assert.equal(findButtonLabel("purchase-invoice"), "Find Bill…");
  });

  it("Recent list labels use explicit :list keys", () => {
    assert.equal(listLabelForDoctype("purchase-order"), "Find Purchase Orders");
    assert.equal(listLabelForDoctype("purchase-receipt"), "Find Item Receipts");
    assert.equal(formLabelForDoctype("purchase-order"), "Purchase Order");
    assert.equal(formLabelForDoctype("purchase-receipt"), "Item Receipt");
  });
});
