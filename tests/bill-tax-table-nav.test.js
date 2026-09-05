import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  neighborTaxCell,
  nextTaxAddRowTabTarget,
  nextTaxCellTab,
  isTaxTableNavField,
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
