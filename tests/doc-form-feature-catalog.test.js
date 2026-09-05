import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DOC_FORM_FEATURE_CATALOG,
  docFormFeaturesForProfile,
} from "../src/doc-form-feature-catalog.js";

describe("DOC_FORM_FEATURE_CATALOG", () => {
  it("has unique ids and required fields", () => {
    const ids = new Set();
    for (const row of DOC_FORM_FEATURE_CATALOG) {
      assert.ok(row.id, "id required");
      assert.ok(row.name, "name required");
      assert.ok(["po", "receipt", "both"].includes(row.profiles));
      assert.equal(typeof row.museum, "boolean");
      assert.equal(typeof row.alpha, "boolean");
      assert.ok(
        ["tested", "built_untested", "electron_only", "missing", "buggy", "partial"].includes(
          row.coverage,
        ),
        row.id,
      );
      assert.equal(ids.has(row.id), false, `duplicate ${row.id}`);
      ids.add(row.id);
    }
    assert.ok(DOC_FORM_FEATURE_CATALOG.length >= 10);
  });

  it("IR tax header sort is tested and alpha", () => {
    const row = DOC_FORM_FEATURE_CATALOG.find((r) => r.id === "ir-tax-header-sort");
    assert.ok(row);
    assert.equal(row.alpha, true);
    assert.equal(row.coverage, "tested");
    assert.equal(row.profiles, "receipt");
  });

  it("docFormFeaturesForProfile filters scope", () => {
    const po = docFormFeaturesForProfile("po");
    const receipt = docFormFeaturesForProfile("receipt");
    assert.ok(po.some((r) => r.id === "po-date-expected"));
    assert.equal(po.some((r) => r.id === "ir-tax-header-sort"), false);
    assert.ok(receipt.some((r) => r.id === "ir-tax-header-sort"));
    assert.ok(receipt.some((r) => r.id === "doc-caps-toggle"));
  });
});
