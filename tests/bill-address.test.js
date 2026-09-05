import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  billAddressRoleMeta,
  billAddressLinkFields,
  isBillAddressLinkField,
  projectAddressPickerOption,
  addressPickerOpenDecision,
} from "../src/bill-address.js";

describe("bill-address (OI-136)", () => {
  it("maps roles to PI Link fields", () => {
    assert.equal(billAddressRoleMeta("billing").linkField, "supplier_address");
    assert.equal(billAddressRoleMeta("ship_from").linkField, "dispatch_address");
    assert.equal(billAddressRoleMeta("ship_to").linkField, "shipping_address");
    assert.deepEqual(billAddressLinkFields(), [
      "supplier_address",
      "dispatch_address",
      "shipping_address",
    ]);
    assert.equal(isBillAddressLinkField("dispatch_address"), true);
  });

  it("projects picker option lines", () => {
    const o = projectAddressPickerOption({
      name: "ADDR-1",
      address_title: "Alpine Dock",
      address_line1: "9 Pier",
      city: "Houston",
      state: "TX",
      pincode: "77002",
      address_type: "Shipping",
      is_primary_address: 1,
    });
    assert.equal(o.name, "ADDR-1");
    assert.equal(o.headline, "Alpine Dock");
    assert.match(o.body, /9 Pier/);
    assert.match(o.body, /Houston/);
    assert.match(o.meta, /Primary/);
  });

  it("addressPickerOpenDecision gates vendor/company", () => {
    assert.equal(
      addressPickerOpenDecision({ supplier: "" }, "billing", { editable: true }).open,
      false,
    );
    assert.equal(
      addressPickerOpenDecision({ supplier: "S" }, "billing", { editable: true }).open,
      true,
    );
    assert.equal(
      addressPickerOpenDecision({ company: "Co" }, "ship_to", { editable: true }).open,
      true,
    );
    assert.equal(
      addressPickerOpenDecision({ supplier: "S" }, "billing", { editable: false }).open,
      false,
    );
  });
});
