import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ERP_UNLOAD_CLEAR_MS,
  ERP_UNLOAD_LEAVE,
  ERP_UNLOAD_STAY,
  decideErpUnload,
  erpUnloadDialogSpec,
  erpUnloadPageLabel,
  isLeaveChoice,
} from "../src/erp-unload-guard.js";

describe("decideErpUnload", () => {
  it("asks when the shell never checked (edits typed in Vanilla — nav incident 03:52)", () => {
    assert.equal(decideErpUnload({ clearedAt: 0, now: 1_000_000 }), "ask");
  });

  it("lets the load through right after the shell's own check passed", () => {
    assert.equal(decideErpUnload({ clearedAt: 1_000_000, now: 1_000_500 }), "allow");
  });

  it("covers both loads of one open (/app, then the form)", () => {
    const t = 1_000_000;
    assert.equal(decideErpUnload({ clearedAt: t, now: t + ERP_UNLOAD_CLEAR_MS }), "allow");
  });

  it("an old pass does not cover a later, unrelated load", () => {
    const t = 1_000_000;
    assert.equal(decideErpUnload({ clearedAt: t, now: t + ERP_UNLOAD_CLEAR_MS + 1 }), "ask");
  });

  it("a clock that went backwards is not a pass", () => {
    assert.equal(decideErpUnload({ clearedAt: 2_000, now: 1_000 }), "ask");
  });
});

describe("erpUnloadDialogSpec", () => {
  it("Enter, Esc and closing the box all keep the edits", () => {
    const spec = erpUnloadDialogSpec();
    assert.equal(spec.defaultId, ERP_UNLOAD_STAY);
    assert.equal(spec.cancelId, ERP_UNLOAD_STAY);
    assert.equal(spec.buttons.length, 2);
    assert.equal(isLeaveChoice(ERP_UNLOAD_STAY), false);
    assert.equal(isLeaveChoice(ERP_UNLOAD_LEAVE), true);
  });
});

describe("erpUnloadPageLabel", () => {
  it("names the page in the clerk's words, record decoded", () => {
    assert.equal(
      erpUnloadPageLabel({ doctype: "supplier", record: "ACME%20SUPPLY%20CO" }, { supplier: "Vendor" }),
      "Vendor — ACME SUPPLY CO",
    );
  });

  it("falls back to the doctype in words, and to nothing off a form", () => {
    assert.equal(
      erpUnloadPageLabel({ doctype: "payment-terms-template", record: "" }),
      "Payment Terms Template",
    );
    assert.equal(erpUnloadPageLabel({ doctype: "", record: "" }), "");
  });

  it("the box shows it as the last page, never claims it as the culprit", () => {
    const spec = erpUnloadDialogSpec({ pageLabel: "Bill — new-purchase-invoice-a" });
    assert.match(spec.detail, /^Last page: Bill — new-purchase-invoice-a/);
    assert.doesNotMatch(erpUnloadDialogSpec().detail, /Last page/);
  });
});
