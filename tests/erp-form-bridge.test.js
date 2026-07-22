import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  formMatchesDoctype,
  stripHtmlPlain,
  rowNeedsItemEnrichment,
  pickItemAutofillFields,
  DOC_FORM_BRIDGE_VERSION,
  isMandatoryValuePresent,
  listMandatoryBlockersFromSnap,
  mergeSaveBlockers,
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
    assert.equal(DOC_FORM_BRIDGE_VERSION, 6);
  });
});

describe("live meta mandatory preflight helpers", () => {
  it("treats Check fields as always present", () => {
    assert.equal(isMandatoryValuePresent(0, "Check"), true);
    assert.equal(isMandatoryValuePresent("", "Data"), false);
    assert.equal(isMandatoryValuePresent("Alpine", "Data"), true);
    assert.equal(isMandatoryValuePresent([], "Table"), false);
    assert.equal(isMandatoryValuePresent([{}], "Table"), true);
  });

  it("formats parent and child-table missing fields like Vanilla", () => {
    const lines = listMandatoryBlockersFromSnap({
      parent: [
        { label: "Supplier", required: true, present: false },
        { label: "Credit To", required: true, present: true },
      ],
      tables: [
        {
          label: "Items",
          totalRows: 2,
          missing: [{ label: "Item Name", rows: [1, 2] }],
        },
      ],
    });
    assert.ok(lines.some((l) => /Supplier is required/i.test(l)));
    assert.ok(lines.some((l) => /Item Name is required in every row/i.test(l)));
    assert.ok(!lines.some((l) => /Credit To/i.test(l)));
  });

  it("merges Doc-skin and meta blockers uniquely", () => {
    assert.deepEqual(
      mergeSaveBlockers(
        ["Vendor (Supplier) is required.", "Amount Due must match Grand total (checksum)."],
        ["Supplier is required.", "Items is required."],
      ),
      [
        "Vendor (Supplier) is required.",
        "Amount Due must match Grand total (checksum).",
        "Supplier is required.",
        "Items is required.",
      ],
    );
  });
});

describe("erp-form-bridge-page save settle contract", () => {
  it("exposes saveDoc and listMandatoryMissing on the bridge", () => {
    const page = readFileSync(
      fileURLToPath(new URL("../electron/erp-form-bridge-page.js", import.meta.url)),
      "utf8",
    );
    assert.match(page, /listMandatoryMissing:\s*listMandatoryMissing/);
    assert.match(page, /saveDoc:\s*saveDoc/);
    assert.match(page, /var VERSION = 6/);
    assert.match(page, /frappe\.desk\.form\.save\.savedocs/);
  });
});
