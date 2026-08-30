import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  billRefocusAction,
  billLoadPhaseAfterSnap,
  BILL_LOAD_FAILED,
  BILL_LOAD_LOADING,
  BILL_LOAD_READY,
} from "../src/bill-load-phase.js";

describe("billRefocusAction", () => {
  it("refocuses when doc is loaded", () => {
    assert.equal(billRefocusAction({ hasDoc: true, phase: BILL_LOAD_READY }), "refocus");
  });

  it("skips refocus while load is in flight", () => {
    assert.equal(billRefocusAction({ hasDoc: false, phase: BILL_LOAD_LOADING }), "skip");
  });

  it("reloads on failed or idle without doc", () => {
    assert.equal(billRefocusAction({ hasDoc: false, phase: BILL_LOAD_FAILED }), "reload");
    assert.equal(billRefocusAction({ hasDoc: false, phase: "idle" }), "reload");
  });
});

describe("billLoadPhaseAfterSnap", () => {
  it("maps snap ok to ready/failed", () => {
    assert.equal(billLoadPhaseAfterSnap(true), BILL_LOAD_READY);
    assert.equal(billLoadPhaseAfterSnap(false), BILL_LOAD_FAILED);
  });
});
