import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  captureBillFocus,
  isBillFormFocusTarget,
  restoreBillFocus,
} from "../src/bill-focus-guard.js";

describe("bill-focus-guard", () => {
  it("isBillFormFocusTarget recognizes data-field inputs", () => {
    const input = { getAttribute: (k) => (k === "data-field" ? "bill_no" : null) };
    assert.equal(isBillFormFocusTarget(input), true);
    assert.equal(isBillFormFocusTarget({ getAttribute: () => null }), false);
  });

  it("captureBillFocus returns null when nothing bill-focused", () => {
    const doc = {
      activeElement: { getAttribute: () => null },
    };
    const prev = globalThis.document;
    globalThis.document = doc;
    try {
      assert.deepEqual(captureBillFocus(), { element: null, field: null });
    } finally {
      globalThis.document = prev;
    }
  });

  it("restoreBillFocus skips when allowFocusVendor", () => {
    let focused = false;
    const el = {
      focus() {
        focused = true;
      },
      getAttribute: () => "bill_no",
    };
    restoreBillFocus({ element: el, field: "bill_no" }, { allowFocusVendor: true });
    assert.equal(focused, false);
  });
});
