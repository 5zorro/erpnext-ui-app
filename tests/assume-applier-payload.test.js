import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSimplifiedPayload, buildSimplifiedTeardown } from "../src/assume-applier-payload.js";

describe("Simplified payload", () => {
  it("is valid JavaScript (compiled, not run)", () => {
    assert.doesNotThrow(() => new Function(buildSimplifiedPayload()));
    assert.doesNotThrow(() => new Function(buildSimplifiedTeardown()));
  });

  // DF-01 R (5zorro 2026-10-01): ERPNext's "Expense Head Changed" says what happened, not what to do.
  it("adds the Update Stock note to ERPNext's Expense Head Changed dialog, and stops watching on destroy", () => {
    const js = buildSimplifiedPayload();
    assert.match(js, /"Expense Head Changed"/);
    assert.match(js, /customize-form\?doc_type=Purchase%20Invoice/);
    assert.match(js, /expenseHeadObserver\.disconnect\(\)/);
  });
});
