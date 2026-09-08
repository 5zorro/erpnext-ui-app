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

  it("maps Debit Note to Vendor Credit (OI-082 AP return)", () => {
    assert.equal(relabelTerm("Debit Note"), "Vendor Credit");
    assert.equal(relabelTerm("Is Return (Debit Note)"), "Is Return (Vendor Credit)");
  });
});

describe("erpTerm", () => {
  it("reverses Bill and Vendor", () => {
    assert.equal(erpTerm("Bill"), "Purchase Invoice");
    assert.equal(erpTerm("Vendor"), "Supplier");
  });

  it("reverses Vendor Credit to Debit Note", () => {
    assert.equal(erpTerm("Vendor Credit"), "Debit Note");
  });
});
