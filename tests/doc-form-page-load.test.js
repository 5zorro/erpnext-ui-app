import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Smoke: doc-form-page.js must load as ESM. A bad named import left the PO/IR
 * shell stuck on static HTML (dogfood 2026-07-21).
 */
describe("doc-form-page module load", () => {
  it("billExpensesTaxOrientation lives on bill-action-flow (not bill-map)", async () => {
    const billMap = await import("../src/bill-map.js");
    const flow = await import("../src/bill-action-flow.js");
    assert.equal("billExpensesTaxOrientation" in billMap, false);
    assert.equal(typeof flow.billExpensesTaxOrientation, "function");
  });

  it("imports doc-form-page without missing named exports", async () => {
    const elStub = () => ({
      textContent: "",
      className: "",
      hidden: true,
      disabled: false,
      value: "",
      title: "",
      innerHTML: "",
      style: {},
      classList: { toggle() {}, add() {}, remove() {} },
      setAttribute() {},
      getAttribute: () => null,
      replaceChildren() {},
      append() {},
      addEventListener() {},
      querySelectorAll: () => [],
      querySelector: () => null,
    });
    globalThis.window = { erpDoc: null };
    globalThis.document = {
      getElementById: () => elStub(),
      querySelector: () => elStub(),
      addEventListener() {},
    };
    await assert.doesNotReject(() => import("../src/doc-form-page.js?t=" + Date.now()));
  });
});
