import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LENS,
  preferredLens,
  rememberLens,
  resolveEntryOpen,
  normalizeDoctypeKey,
} from "../src/lens-prefs.js";

describe("normalizeDoctypeKey", () => {
  it("normalizes title and slug", () => {
    assert.equal(normalizeDoctypeKey("Purchase Invoice"), "purchase-invoice");
    assert.equal(normalizeDoctypeKey("purchase_invoice"), "purchase-invoice");
  });
});

describe("preferredLens", () => {
  it("defaults to doc when no history", () => {
    assert.equal(preferredLens("purchase-invoice", {}), DEFAULT_LENS);
    assert.equal(preferredLens("purchase-invoice", {}), "doc");
  });

  it("returns last remembered lens", () => {
    assert.equal(preferredLens("purchase-invoice", { "purchase-invoice": "vanilla" }), "vanilla");
    assert.equal(
      preferredLens("Purchase Invoice", { "purchase-invoice": "simplified" }),
      "simplified",
    );
  });
});

describe("rememberLens", () => {
  it("stores immutably by doctype key", () => {
    const prev = { item: "vanilla" };
    const next = rememberLens(prev, "purchase-invoice", "simplified");
    assert.deepEqual(next, { item: "vanilla", "purchase-invoice": "simplified" });
    assert.equal(prev["purchase-invoice"], undefined);
  });
});

describe("resolveEntryOpen", () => {
  it("opens Doc form by default", () => {
    const t = resolveEntryOpen("purchase-invoice", {});
    assert.equal(t.lens, "doc");
    assert.equal(t.surface, "doc-form");
    assert.equal(t.route, "/app/purchase-invoice/new");
  });

  it("opens ERP form when last lens was vanilla", () => {
    const t = resolveEntryOpen("purchase-invoice", { "purchase-invoice": "vanilla" });
    assert.equal(t.surface, "erp-form");
    assert.equal(t.lens, "vanilla");
  });
});
