import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formMatchesDoctype,
  stripHtmlPlain,
  rowNeedsItemEnrichment,
  pickItemAutofillFields,
  DOC_FORM_BRIDGE_VERSION,
} from "../src/erp-form-bridge.js";

describe("formMatchesDoctype", () => {
  it("matches doctype on frm or doc", () => {
    assert.equal(
      formMatchesDoctype({ doctype: "Purchase Invoice", doc: { doctype: "Purchase Invoice" } }, "Purchase Invoice"),
      true,
    );
    assert.equal(
      formMatchesDoctype({ doctype: "X", doc: { doctype: "Purchase Invoice" } }, "Purchase Invoice"),
      true,
    );
    assert.equal(formMatchesDoctype({ doctype: "X", doc: { doctype: "X" } }, "Purchase Invoice"), false);
    assert.equal(formMatchesDoctype(null, "Purchase Invoice"), false);
  });
});

describe("rowNeedsItemEnrichment", () => {
  it("true when description empty or rate zero", () => {
    assert.equal(rowNeedsItemEnrichment({ item_code: "SKU", description: "", rate: 0 }), true);
    assert.equal(rowNeedsItemEnrichment({ item_code: "SKU", description: "Tshirt", rate: 12 }), false);
    assert.equal(rowNeedsItemEnrichment({ item_code: "SKU", description: "<p>x</p>", rate: 0 }), true);
  });
});

describe("pickItemAutofillFields", () => {
  it("fills missing desc and rate from Item master", () => {
    const patch = pickItemAutofillFields(
      { item_name: "Tshirt", description: "<b>Tshirt</b>", last_purchase_rate: 9.5 },
      { description: "", rate: 0 },
    );
    assert.equal(patch.description, "Tshirt");
    assert.equal(patch.rate, 9.5);
  });

  it("skips fields already set", () => {
    const patch = pickItemAutofillFields(
      { item_name: "Tshirt", standard_rate: 3 },
      { description: "keep", rate: 1 },
    );
    assert.equal(patch.description, undefined);
    assert.equal(patch.rate, undefined);
  });
});

describe("stripHtmlPlain", () => {
  it("strips tags", () => {
    assert.equal(stripHtmlPlain("<p>Hi</p>"), "Hi");
    assert.equal(DOC_FORM_BRIDGE_VERSION, 5);
  });
});
