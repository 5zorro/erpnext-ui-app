import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  neighborTaxCell,
  nextTaxAddRowTabTarget,
  nextTaxCellTab,
  isTaxTableNavField,
  taxRowNavFields,
} from "../src/bill-tax-table-nav.js";

describe("neighborTaxCell", () => {
  it("moves down within account column", () => {
    assert.deepEqual(neighborTaxCell("account_head", 0, 3, "down"), {
      rowIndex: 1,
      field: "account_head",
    });
  });

  it("moves right to amount on same row", () => {
    assert.deepEqual(neighborTaxCell("account_head", 1, 3, "right"), {
      rowIndex: 1,
      field: "tax_amount",
    });
  });

  it("returns null at top row up", () => {
    assert.equal(neighborTaxCell("tax_amount", 0, 2, "up"), null);
  });
});

describe("nextTaxAddRowTabTarget", () => {
  it("steps forward through add row then exits", () => {
    assert.equal(nextTaxAddRowTabTarget("taxAccount", false), "taxAmount");
    assert.equal(nextTaxAddRowTabTarget("taxAmount", false), "addTax");
    assert.equal(nextTaxAddRowTabTarget("addTax", false), null);
  });

  it("steps backward with shift", () => {
    assert.equal(nextTaxAddRowTabTarget("addTax", true), "taxAmount");
    assert.equal(nextTaxAddRowTabTarget("taxAccount", true), null);
  });
});

describe("nextTaxCellTab", () => {
  it("tabs across account then amount then next row", () => {
    assert.deepEqual(nextTaxCellTab("account_head", 0, 2, false), {
      rowIndex: 0,
      field: "tax_amount",
    });
    assert.deepEqual(nextTaxCellTab("tax_amount", 0, 2, false), {
      rowIndex: 1,
      field: "account_head",
    });
    assert.equal(nextTaxCellTab("tax_amount", 1, 2, false), null);
  });
});

describe("isTaxTableNavField", () => {
  it("includes account and amount only", () => {
    assert.equal(isTaxTableNavField("account_head"), true);
    assert.equal(isTaxTableNavField("tax_amount"), true);
    assert.equal(isTaxTableNavField("rate"), false);
  });
});

describe("per-row walk (DF-02: a % row tabs to Rate %, a fixed row to Amount)", () => {
  const rows = [{ charge_type: "On Net Total" }, { charge_type: "Actual" }, { charge_type: "On Net Total" }];
  const fieldsFor = (ri) => taxRowNavFields(rows[ri]);
  it("taxRowNavFields follows ERPNext's editable number", () => {
    assert.deepEqual([...taxRowNavFields(rows[0])], ["account_head", "rate"]);
    assert.deepEqual([...taxRowNavFields(rows[1])], ["account_head", "tax_amount"]);
  });
  it("Tab: account → rate on a % row, then the next row's account, then its amount", () => {
    assert.deepEqual(nextTaxCellTab("account_head", 0, 3, false, fieldsFor), { rowIndex: 0, field: "rate" });
    assert.deepEqual(nextTaxCellTab("rate", 0, 3, false, fieldsFor), { rowIndex: 1, field: "account_head" });
    assert.deepEqual(nextTaxCellTab("account_head", 1, 3, false, fieldsFor), { rowIndex: 1, field: "tax_amount" });
  });
  it("a mouse-reached Amount on a % row moves on like the walk's number", () => {
    assert.deepEqual(nextTaxCellTab("tax_amount", 0, 3, false, fieldsFor), { rowIndex: 1, field: "account_head" });
    assert.deepEqual(nextTaxCellTab("tax_amount", 0, 3, true, fieldsFor), { rowIndex: 0, field: "account_head" });
  });
  it("Shift+Tab from an account lands on the previous row's number", () => {
    assert.deepEqual(nextTaxCellTab("account_head", 2, 3, true, fieldsFor), { rowIndex: 1, field: "tax_amount" });
    assert.deepEqual(nextTaxCellTab("account_head", 1, 3, true, fieldsFor), { rowIndex: 0, field: "rate" });
  });
  it("arrows keep the column position across rows of different kinds", () => {
    assert.deepEqual(neighborTaxCell("rate", 0, 3, "down", fieldsFor), { rowIndex: 1, field: "tax_amount" });
    assert.deepEqual(neighborTaxCell("tax_amount", 1, 3, "down", fieldsFor), { rowIndex: 2, field: "rate" });
    assert.deepEqual(neighborTaxCell("rate", 0, 3, "left", fieldsFor), { rowIndex: 0, field: "account_head" });
  });
});
