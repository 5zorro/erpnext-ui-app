import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyVendorActivity,
  rankSupplierLinkOptions,
  vendorActivitySuffix,
  VENDOR_ACTIVITY_ACTIVE,
  VENDOR_ACTIVITY_IDLE,
  VENDOR_ACTIVITY_NEVER,
} from "../src/vendor-activity.js";

describe("classifyVendorActivity", () => {
  it("never when there is no submitted PO", () => {
    assert.equal(classifyVendorActivity(null, { asOf: "2026-08-21" }), VENDOR_ACTIVITY_NEVER);
    assert.equal(classifyVendorActivity("", { asOf: "2026-08-21" }), VENDOR_ACTIVITY_NEVER);
  });

  it("uses company FY start when provided", () => {
    const opts = { asOf: "2026-08-21", fyStart: "2026-01-01" };
    assert.equal(classifyVendorActivity("2026-02-01", opts), VENDOR_ACTIVITY_ACTIVE);
    assert.equal(classifyVendorActivity("2025-06-01", opts), VENDOR_ACTIVITY_IDLE);
  });

  it("falls back to trailing 365 days", () => {
    const opts = { asOf: "2026-08-21" };
    assert.equal(classifyVendorActivity("2026-07-01", opts), VENDOR_ACTIVITY_ACTIVE);
    assert.equal(classifyVendorActivity("2025-06-01", opts), VENDOR_ACTIVITY_IDLE);
  });
});

describe("rankSupplierLinkOptions", () => {
  it("sorts active then idle then never; keeps them visible", () => {
    const rows = [
      { value: "SAMPLE Vendor Never", description: "Never" },
      { value: "SAMPLE Vendor Idle", description: "Idle" },
      { value: "SAMPLE Vendor 01", description: "Active" },
    ];
    const lastPo = {
      "SAMPLE Vendor 01": "2026-07-15",
      "SAMPLE Vendor Idle": "2025-03-01",
    };
    const out = rankSupplierLinkOptions(rows, lastPo, {
      asOf: "2026-08-21",
      fyStart: "2026-01-01",
    });
    assert.deepEqual(
      out.map((r) => r.activity),
      [VENDOR_ACTIVITY_ACTIVE, VENDOR_ACTIVITY_IDLE, VENDOR_ACTIVITY_NEVER],
    );
    assert.equal(out.length, 3);
  });

  it("suffix is text, not color-only", () => {
    assert.equal(vendorActivitySuffix("idle"), "idle");
    assert.equal(vendorActivitySuffix("never"), "no PO");
    assert.equal(vendorActivitySuffix("active"), "");
  });
});
