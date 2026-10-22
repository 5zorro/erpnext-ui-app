import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { missingVendorBannerText, lateVendorMayOpenSources } from "../src/bill-missing-vendor.js";

/** Plan 2026-10-21 D2. */

describe("missingVendorBannerText", () => {
  it("names the vendor and says what happens next", () => {
    assert.equal(
      missingVendorBannerText(" test add vendor ", "vendor"),
      "Vendor “test add vendor” is not in ERPNext — it may have been deleted or renamed. Pick another vendor; the bill keeps its old one.",
    );
    assert.match(missingVendorBannerText("X", "sources"), /Its sources \(and NIC\) cannot be chosen/);
  });
});

describe("lateVendorMayOpenSources", () => {
  const base = { wanted: "ALPINE SUPPLY CO", boxNow: "ALPINE SUPPLY CO", activeIsOtherField: false, modalOpen: false, typedElsewhere: false };
  it("opens when the clerk is still on that vendor — Tab into the next field included", () => {
    assert.deepEqual(lateVendorMayOpenSources(base), { open: true });
    assert.deepEqual(lateVendorMayOpenSources({ ...base, activeIsOtherField: true }), { open: true });
    assert.deepEqual(lateVendorMayOpenSources({ ...base, boxNow: "alpine supply co " }), { open: true });
  });
  it("not after the clerk changed the vendor, moved to another field, or another dialog is up", () => {
    assert.equal(lateVendorMayOpenSources({ ...base, boxNow: "SUMMIT" }).reason, "vendor_changed");
    assert.equal(lateVendorMayOpenSources({ ...base, activeIsOtherField: true, typedElsewhere: true }).reason, "moved_on");
    assert.equal(lateVendorMayOpenSources({ ...base, modalOpen: true }).reason, "modal_open");
  });
});
