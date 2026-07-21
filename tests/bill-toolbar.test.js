import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MUSEUM_BILL_TOOLBAR,
  ALPHA_BILL_TOOLBAR,
  BILL_COMMIT_GATE_ACTIONS,
  billToolbarGapMatrix,
  museumToolbarActionStatus,
  shouldOpenCommitGate,
  normalizeCommitGateChoice,
  commitGateContinues,
  commitGateAllowsAction,
  MUSEUM_BILL_NAV_TABS,
  MUSEUM_BILL_LINE_TABS,
  MUSEUM_BILL_FOOTER,
} from "../src/bill-toolbar.js";

describe("museum Bill toolbar contract", () => {
  it("lists museum docs.js toolbar labels", () => {
    assert.ok(MUSEUM_BILL_TOOLBAR.includes("Find Bills"));
    assert.ok(MUSEUM_BILL_TOOLBAR.includes("Select PO"));
    assert.ok(MUSEUM_BILL_TOOLBAR.includes("Pay Bill"));
    assert.equal(MUSEUM_BILL_TOOLBAR.length, 10);
  });

  it("marks alpha coverage honestly", () => {
    assert.equal(museumToolbarActionStatus("Save"), "partial");
    assert.equal(museumToolbarActionStatus("Select PO"), "present");
    assert.equal(museumToolbarActionStatus("Find Bills"), "present");
    assert.equal(museumToolbarActionStatus("New"), "present");
    assert.equal(museumToolbarActionStatus("Print"), "present");
    const matrix = billToolbarGapMatrix();
    assert.equal(matrix.length, MUSEUM_BILL_TOOLBAR.length);
    assert.ok(ALPHA_BILL_TOOLBAR.some((a) => a.id === "btn-select-po"));
    assert.ok(ALPHA_BILL_TOOLBAR.some((a) => a.id === "btn-revert"));
    assert.ok(ALPHA_BILL_TOOLBAR.some((a) => a.id === "btn-find"));
    assert.ok(ALPHA_BILL_TOOLBAR.some((a) => a.id === "btn-new"));
    assert.ok(ALPHA_BILL_TOOLBAR.some((a) => a.id === "btn-print"));
  });

  it("records museum nav / line tabs / footer", () => {
    assert.deepEqual([...MUSEUM_BILL_NAV_TABS], [
      "Bill",
      "Bill Credit",
      "Item Receipt (no bill)",
    ]);
    assert.deepEqual([...MUSEUM_BILL_LINE_TABS], ["Items", "Expenses"]);
    assert.ok(MUSEUM_BILL_FOOTER.some((f) => /Revert/i.test(f)));
  });
});

describe("T3a commit gate", () => {
  it("opens only when the Bill is dirty", () => {
    assert.equal(shouldOpenCommitGate(false), false);
    assert.equal(shouldOpenCommitGate(true), true);
  });

  it("gates find / new / print", () => {
    assert.deepEqual([...BILL_COMMIT_GATE_ACTIONS], ["find", "new", "print"]);
  });

  it("normalizes choices and continues after discard/save/submit", () => {
    assert.equal(normalizeCommitGateChoice("discard"), "discard");
    assert.equal(normalizeCommitGateChoice("nope"), null);
    assert.equal(commitGateContinues("discard"), true);
    assert.equal(commitGateContinues("cancel"), false);
  });

  it("blocks print after discard on a brand-new Bill", () => {
    assert.equal(commitGateAllowsAction("print", "discard", { isNew: true }).ok, false);
    assert.equal(commitGateAllowsAction("print", "save", { isNew: true }).ok, true);
    assert.equal(commitGateAllowsAction("find", "discard", { isNew: true }).ok, true);
    assert.equal(commitGateAllowsAction("print", "discard", { isNew: false }).ok, true);
  });
});
