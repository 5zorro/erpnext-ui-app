import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BILL_FEATURE_CATALOG,
  billFeaturesByCoverage,
  billFeaturesBuiltFromMuseum,
  billFeaturesMissingInAlpha,
} from "../src/bill-feature-catalog.js";

describe("BILL_FEATURE_CATALOG", () => {
  it("has unique ids and required fields", () => {
    const ids = new Set();
    for (const row of BILL_FEATURE_CATALOG) {
      assert.ok(row.id, "id required");
      assert.ok(row.name, "name required");
      assert.equal(typeof row.museum, "boolean");
      assert.equal(typeof row.alpha, "boolean");
      assert.ok(
        ["tested", "built_untested", "electron_only", "missing", "buggy"].includes(row.coverage),
        row.id,
      );
      assert.equal(ids.has(row.id), false, `duplicate ${row.id}`);
      ids.add(row.id);
    }
    assert.ok(BILL_FEATURE_CATALOG.length >= 30, "catalog should cover gap audit breadth");
  });

  it("every museum+alpha feature is tested, electron_only, or known buggy", () => {
    for (const row of billFeaturesBuiltFromMuseum()) {
      assert.ok(
        ["tested", "electron_only", "buggy"].includes(row.coverage),
        `${row.id} built but coverage=${row.coverage} — extract pure tests or mark missing`,
      );
    }
  });

  it("missing museum features are coverage=missing and alpha=false", () => {
    for (const row of billFeaturesMissingInAlpha()) {
      assert.equal(row.alpha, false);
      assert.equal(row.coverage, "missing", row.id);
    }
  });

  it("source-open-after-vendor is tested after HAR root-cause fix", () => {
    const row = BILL_FEATURE_CATALOG.find((r) => r.id === "source-open-after-vendor");
    assert.ok(row);
    assert.equal(row.coverage, "tested");
    assert.equal(row.alpha, true);
  });

  it("exposes coverage filters", () => {
    assert.ok(billFeaturesByCoverage("tested").length > 10);
    assert.ok(billFeaturesByCoverage("missing").length >= 5);
  });
});
