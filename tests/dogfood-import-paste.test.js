import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DOGFOOD_AP_SOURCES } from "../src/sample-data/dogfood-ap-sources.js";
import { buildMessyImportPaste, MESSY_VENDOR_11COL } from "../src/sample-data/dogfood-import-paste.js";

describe("dogfood import paste", () => {
  it("DF-13 has 11 columns and suggested map", () => {
    const doc = DOGFOOD_AP_SOURCES.find((d) => d.id === "DF-13");
    assert.ok(doc);
    const paste = buildMessyImportPaste(doc);
    assert.equal(paste.rows[0].length, 11);
    assert.equal(paste.ignoreLeadingRows, 2);
    assert.equal(paste.suggestedMap[3], "item_code");
    assert.equal(MESSY_VENDOR_11COL.headerRow.length, 11);
  });
});
