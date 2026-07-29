import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LENS,
  preferredLens,
  rememberLens,
  resolveEntryOpen,
  shouldOpenDocLens,
  normalizeDoctypeKey,
} from "../src/lens-prefs.js";
import { DOC_SKIN_PROFILES, profileByDoctypeKey } from "../src/doc-skin-registry.js";

describe("normalizeDoctypeKey", () => {
  it("normalizes title and slug", () => {
    assert.equal(normalizeDoctypeKey("Purchase Invoice"), "purchase-invoice");
    assert.equal(normalizeDoctypeKey("purchase_invoice"), "purchase-invoice");
  });
});

describe("preferredLens / DEFAULT_LENS", () => {
  it("defaults to doc when no history (installer gets Doc experience)", () => {
    assert.equal(DEFAULT_LENS, "doc");
    assert.equal(preferredLens("purchase-invoice", {}), "doc");
    assert.equal(preferredLens("purchase-order", {}), "doc");
    assert.equal(preferredLens("purchase-receipt", {}), "doc");
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

describe("lens preference scenarios (5zorro)", () => {
  it("1) no history → Enter / form → Doc (default)", () => {
    for (const key of ["purchase-invoice", "purchase-order", "purchase-receipt"]) {
      const t = resolveEntryOpen(key, {});
      assert.equal(t.lens, "doc", key);
      assert.equal(t.surface, "doc-form", key);
      assert.equal(shouldOpenDocLens(key, "new", {}), true, key);
    }
  });

  it("2) previous-session prefs prefer vanilla → opposite of default from any entry", () => {
    // Simulates lens-prefs.json loaded after restart (main loadPrefs).
    const fromPriorSession = {
      "purchase-invoice": "vanilla",
      "purchase-order": "vanilla",
      "purchase-receipt": "vanilla",
    };
    for (const key of Object.keys(fromPriorSession)) {
      const t = resolveEntryOpen(key, fromPriorSession);
      assert.equal(t.lens, "vanilla", key);
      assert.equal(t.surface, "erp-form", key);
      assert.equal(shouldOpenDocLens(key, "new", fromPriorSession), false, key);
      assert.equal(shouldOpenDocLens(key, "ACC-1", fromPriorSession), false, key);
      // Lists still never Doc-hijack
      assert.equal(shouldOpenDocLens(key, "", fromPriorSession), false, key);
    }
  });

  it("3) opening Vanilla form sticks; Doc form restores Doc", () => {
    let prefs = rememberLens({}, "purchase-invoice", "doc");
    prefs = rememberLens(prefs, "purchase-invoice", "vanilla");
    assert.equal(resolveEntryOpen("purchase-invoice", prefs).surface, "erp-form");
    prefs = rememberLens(prefs, "purchase-invoice", "doc");
    assert.equal(resolveEntryOpen("purchase-invoice", prefs).surface, "doc-form");
  });

  it("prefs are per-doctype (Bill Doc does not force PO Doc)", () => {
    const prefs = rememberLens(
      rememberLens({}, "purchase-invoice", "doc"),
      "purchase-order",
      "vanilla",
    );
    assert.equal(resolveEntryOpen("purchase-invoice", prefs).surface, "doc-form");
    assert.equal(resolveEntryOpen("purchase-order", prefs).surface, "erp-form");
  });
});

describe("doc-skin registry extensibility", () => {
  it("every ready Doc skin profile has a doctypeKey resolvable for lens routing", () => {
    for (const p of Object.values(DOC_SKIN_PROFILES)) {
      assert.ok(p.doctypeKey, p.id);
      assert.ok(p.shell === "bill" || p.shell === "doc-form", `${p.id} shell`);
      assert.equal(profileByDoctypeKey(p.doctypeKey)?.id, p.id);
      // Default path uses shared helpers — no per-skin lens branch required
      assert.equal(resolveEntryOpen(p.doctypeKey, {}).surface, "doc-form");
    }
  });
});
