import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addressRolesForProfile,
  addressRoleMeta,
  addressListParty,
  addressPickerOpenDecision,
  isAddressLinkField,
  profileHasPickableAddresses,
  BILL_ADDRESS_ROLES,
  PO_ADDRESS_ROLES,
} from "../src/doc-address.js";
import { DOC_SKIN_PROFILES } from "../src/doc-skin-registry.js";

describe("doc-address (tranche 6)", () => {
  it("Bill roles are pickable with PI link fields", () => {
    assert.equal(profileHasPickableAddresses(BILL_ADDRESS_ROLES), true);
    assert.equal(isAddressLinkField("bill", "supplier_address"), true);
    assert.equal(isAddressLinkField("bill", "dispatch_address"), true);
    assert.equal(addressRoleMeta("bill", "ship_to")?.party, "company");
  });

  it("PO roles are pickable with PO-specific link fields", () => {
    assert.equal(profileHasPickableAddresses(PO_ADDRESS_ROLES), true);
    assert.equal(addressRoleMeta("po", "billing")?.linkField, "billing_address");
    assert.equal(addressRoleMeta("po", "ship_from")?.linkField, "supplier_address");
    assert.equal(isAddressLinkField("po", "shipping_address"), true);
  });

  it("PO ship-to can use customer addresses when drop-ship customer set", () => {
    const party = addressListParty({ customer: "CUST-1", company: "Co" }, addressRoleMeta("po", "ship_to"));
    assert.equal(party?.partyDoctype, "Customer");
    assert.equal(party?.partyName, "CUST-1");
  });

  it("Receipt has no address roles", () => {
    assert.equal(addressRolesForProfile("receipt").length, 0);
  });

  it("registry addressPicker flags match profile intent", () => {
    assert.equal(DOC_SKIN_PROFILES.bill.features.addressPicker, true);
    assert.equal(DOC_SKIN_PROFILES.po.features.addressPicker, true);
    assert.equal(DOC_SKIN_PROFILES.receipt.features.addressPicker, false);
  });

  it("Bill picker gates vendor and company", () => {
    assert.equal(
      addressPickerOpenDecision({ supplier: "" }, "bill", "billing", { editable: true }).open,
      false,
    );
    assert.equal(
      addressPickerOpenDecision({ supplier: "S" }, "bill", "billing", { editable: true }).open,
      true,
    );
    assert.equal(
      addressPickerOpenDecision({ supplier: "S" }, "bill", "billing", { editable: false }).open,
      false,
    );
  });
});
