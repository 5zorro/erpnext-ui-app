import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DOC_WASH_BY_PROFILE,
  DOC_WASH_COLORS,
  DEFAULT_PATTERN_PREF,
  normalizePatternPref,
  patternAppliesToDesk,
  washForProfile,
  washRoleForSourceKind,
  applyDocWashToDocument,
  persistPatternPref,
  setWashSourceAttr,
  PATTERN_PREF_STORAGE_KEY,
} from "../src/doc-wash.js";

describe("doc-wash (OI-125)", () => {
  it("maps AP profiles to role + desk", () => {
    assert.deepEqual(washForProfile("bill"), { role: "invoice", desk: "ap" });
    assert.deepEqual(washForProfile("po"), { role: "order", desk: "ap" });
    assert.deepEqual(washForProfile("receipt"), { role: "fulfill", desk: "ap" });
    assert.equal(washForProfile("missing"), null);
    assert.equal(DOC_WASH_BY_PROFILE.bill.role, "invoice");
  });

  it("maps source kinds to upstream wash roles", () => {
    assert.equal(washRoleForSourceKind("po"), "order");
    assert.equal(washRoleForSourceKind("purchase_order"), "order");
    assert.equal(washRoleForSourceKind("pr"), "fulfill");
    assert.equal(washRoleForSourceKind("material_request"), "request");
    assert.equal(washRoleForSourceKind("sales_order"), "order");
    assert.equal(washRoleForSourceKind("nope"), null);
  });

  it("exposes Okabe–Ito wash hexes", () => {
    assert.equal(DOC_WASH_COLORS.invoice, "#f6eaf2");
    assert.equal(DOC_WASH_COLORS.order, "#e8f4fc");
    assert.equal(DOC_WASH_COLORS.fulfill, "#fff4e0");
  });

  it("normalizes pattern preference (default A/R)", () => {
    assert.equal(normalizePatternPref(null), DEFAULT_PATTERN_PREF);
    assert.equal(normalizePatternPref("AP"), "ap");
    assert.equal(normalizePatternPref("both"), "both");
    assert.equal(normalizePatternPref("weird"), "ar");
  });

  it("patternAppliesToDesk respects preference", () => {
    assert.equal(patternAppliesToDesk("ar", "ar"), true);
    assert.equal(patternAppliesToDesk("ar", "ap"), false);
    assert.equal(patternAppliesToDesk("ap", "ap"), true);
    assert.equal(patternAppliesToDesk("both", "ap"), true);
    assert.equal(patternAppliesToDesk("none", "ar"), false);
  });

  it("applyDocWashToDocument sets data attrs", () => {
    const store = new Map();
    const storage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
    };
    const fakeDoc = {
      documentElement: { dataset: /** @type {Record<string, string>} */ ({}) },
    };
    const out = applyDocWashToDocument(fakeDoc, {
      profileId: "bill",
      storage,
    });
    assert.equal(out.role, "invoice");
    assert.equal(out.desk, "ap");
    assert.equal(out.patternPref, "ar");
    assert.equal(fakeDoc.documentElement.dataset.docRole, "invoice");
    assert.equal(fakeDoc.documentElement.dataset.docDesk, "ap");
    assert.equal(fakeDoc.documentElement.dataset.pattern, "ar");
  });

  it("persistPatternPref + apply reads storage", () => {
    const store = new Map();
    const storage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
    };
    assert.equal(persistPatternPref("ap", storage), "ap");
    assert.equal(store.get(PATTERN_PREF_STORAGE_KEY), "ap");
    const fakeDoc = { documentElement: { dataset: {} } };
    const out = applyDocWashToDocument(fakeDoc, { profileId: "po", storage });
    assert.equal(out.patternPref, "ap");
    assert.equal(fakeDoc.documentElement.dataset.pattern, "ap");
  });

  it("setWashSourceAttr writes or clears dataset", () => {
    const el = { dataset: /** @type {Record<string, string>} */ ({}) };
    setWashSourceAttr(el, "order");
    assert.equal(el.dataset.washSource, "order");
    setWashSourceAttr(el, null);
    assert.equal(el.dataset.washSource, undefined);
  });
});
