import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MUSEUM_BILL_TOOLBAR,
  ALPHA_BILL_TOOLBAR,
  billToolbarGapMatrix,
  museumToolbarActionStatus,
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
    assert.equal(museumToolbarActionStatus("Select PO"), "buggy");
    assert.equal(museumToolbarActionStatus("Find Bills"), "missing");
    assert.equal(museumToolbarActionStatus("Print"), "missing");
    const matrix = billToolbarGapMatrix();
    assert.equal(matrix.length, MUSEUM_BILL_TOOLBAR.length);
    assert.ok(ALPHA_BILL_TOOLBAR.some((a) => a.id === "btn-select-po"));
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
