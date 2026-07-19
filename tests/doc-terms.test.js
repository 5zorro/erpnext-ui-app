import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { relabelTerm, erpTerm } from "../src/doc-terms.js";

describe("relabelTerm", () => {
  it("maps Purchase Invoice to Bill", () => {
    assert.equal(relabelTerm("Purchase Invoice"), "Bill");
    assert.equal(relabelTerm("New Purchase Invoice"), "New Bill");
  });

  it("maps Supplier to Vendor", () => {
    assert.equal(relabelTerm("Supplier"), "Vendor");
    assert.equal(relabelTerm("Supplier Name"), "Vendor Name");
  });
});

describe("erpTerm", () => {
  it("reverses Bill and Vendor", () => {
    assert.equal(erpTerm("Bill"), "Purchase Invoice");
    assert.equal(erpTerm("Vendor"), "Supplier");
  });
});
