import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  docFormCuratedForProfile,
  DOC_FORM_CURATED_UNION,
  PO_DOC_CURATED,
  RECEIPT_DOC_CURATED,
} from "../src/inventories/doc-form-inventory.js";
import { DOC_SKIN_PROFILES } from "../src/doc-skin-registry.js";

describe("doc-form-inventory", () => {
  it("PO inventory excludes IR-only taxes and source modal", () => {
    const ids = new Set(PO_DOC_CURATED.map((r) => r.id));
    assert.equal(ids.has("doc-add-tax"), false);
    assert.equal(ids.has("doc-select-source"), false);
    assert.equal(ids.has("doc-memo"), false);
    assert.equal(ids.has("doc-date-expected"), true);
    assert.equal(ids.has("doc-clear-qty"), true);
  });

  it("Receipt inventory includes taxes, memo, and source chrome; no editable terms", () => {
    const ids = new Set(RECEIPT_DOC_CURATED.map((r) => r.id));
    assert.equal(ids.has("doc-add-tax"), true);
    assert.equal(ids.has("doc-select-source"), true);
    assert.equal(ids.has("doc-memo"), true);
    assert.equal(ids.has("doc-terms-text"), false);
    assert.equal(ids.has("doc-tax-template:amount"), true);
    assert.equal(ids.has("doc-date-expected"), false);
  });

  it("profile inventories have unique ids", () => {
    for (const profileId of ["po", "receipt"]) {
      const rows = docFormCuratedForProfile(profileId);
      const ids = rows.map((r) => r.id);
      assert.equal(new Set(ids).size, ids.length, `${profileId} duplicate ids`);
    }
  });

  it("union covers both profile header field testids", () => {
    const ids = new Set(DOC_FORM_CURATED_UNION.map((r) => r.id));
    assert.equal(ids.has("doc-supplier"), true);
    assert.equal(ids.has("doc-lr_no"), true);
    assert.equal(ids.has("doc-title"), true);
  });

  it("registry doc-form profiles match inventory builders", () => {
    for (const [id, p] of Object.entries(DOC_SKIN_PROFILES)) {
      if (p.shell !== "doc-form") continue;
      if (id === "bill") continue; // Bill uses bill-doc-inventory.js (separate shell markup)
      const rows = docFormCuratedForProfile(id);
      assert.ok(rows.length >= 20, `${id} inventory too thin (${rows.length})`);
    }
  });
});
