import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DOC_SKIN_PROFILES,
  profileByLayoutKey,
  profileByDoctypeKey,
  docFormUiPayload,
} from "../src/doc-skin-registry.js";

describe("DOC_SKIN_PROFILES", () => {
  it("registers bill, po, receipt", () => {
    assert.equal(DOC_SKIN_PROFILES.bill.shell, "bill");
    assert.equal(DOC_SKIN_PROFILES.po.shell, "doc-form");
    assert.equal(DOC_SKIN_PROFILES.receipt.shell, "doc-form");
  });

  it("lookup by layoutKey and doctypeKey", () => {
    assert.equal(profileByLayoutKey("purchase-order")?.id, "po");
    assert.equal(profileByLayoutKey("item-receipt")?.id, "receipt");
    assert.equal(profileByDoctypeKey("purchase-receipt")?.id, "receipt");
    assert.equal(profileByDoctypeKey("purchase-invoice")?.id, "bill");
  });

  it("docFormUiPayload only for doc-form shells", () => {
    assert.equal(docFormUiPayload("bill"), null);
    const po = docFormUiPayload("po");
    assert.equal(po?.title, "Purchase Order");
    assert.equal(po?.features.amountDue, false);
    assert.equal(po?.features.dateExpected, true);
    assert.ok(Array.isArray(po?.itemCols));
    const ir = docFormUiPayload("receipt");
    assert.equal(ir?.title, "Item Receipt");
    assert.equal(ir?.features.sourceModal, true);
    assert.equal(ir?.sourceLabel, "Select PO");
  });

  it("PO excludes taxes/source; IR includes taxes/source/memo", () => {
    assert.equal(DOC_SKIN_PROFILES.po.features.taxes, false);
    assert.equal(DOC_SKIN_PROFILES.po.features.sourceModal, false);
    assert.equal(DOC_SKIN_PROFILES.po.features.memo, false);
    assert.equal(DOC_SKIN_PROFILES.receipt.features.taxes, true);
    assert.equal(DOC_SKIN_PROFILES.receipt.features.memo, true);
  });
});
