import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DOC_WASH_BY_PROFILE,
  DOC_WASH_COLORS,
  DOC_PAGE_CANVAS,
  DEFAULT_PATTERN_PREF,
  normalizePatternPref,
  patternAppliesToDesk,
  washForProfile,
  washRoleForSourceKind,
  applyDocWashToDocument,
  persistPatternPref,
  setWashSourceAttr,
  PATTERN_PREF_STORAGE_KEY,
  DOC_WASH_VARIANTS,
  normalizeDocWashVariant,
  setDocWashVariant,
} from "../src/doc-wash.js";

const docWashCss = readFileSync(new URL("../electron/doc-wash.css", import.meta.url), "utf8");

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

  it("page canvas is neutral grey (layer 1); role wash is on chrome not body", () => {
    assert.equal(DOC_PAGE_CANVAS, "#eef2f5");
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

  it("normalizes the return variant, rejecting anything else", () => {
    assert.deepEqual(DOC_WASH_VARIANTS, ["return"]);
    assert.equal(normalizeDocWashVariant("return"), "return");
    assert.equal(normalizeDocWashVariant("RETURN"), "return");
    assert.equal(normalizeDocWashVariant(" return "), "return");
    assert.equal(normalizeDocWashVariant("credit"), null);
    assert.equal(normalizeDocWashVariant(null), null);
  });

  it("setDocWashVariant writes and clears data-doc-variant", () => {
    const fakeDoc = { documentElement: { dataset: /** @type {Record<string, string>} */ ({}) } };
    assert.equal(setDocWashVariant(fakeDoc, "return"), "return");
    assert.equal(fakeDoc.documentElement.dataset.docVariant, "return");
    assert.equal(setDocWashVariant(fakeDoc, null), null);
    assert.equal(fakeDoc.documentElement.dataset.docVariant, undefined);
  });

  it("a return keeps its role wash — the variant is additive, not a replacement", () => {
    const fakeDoc = { documentElement: { dataset: /** @type {Record<string, string>} */ ({}) } };
    const out = applyDocWashToDocument(fakeDoc, {
      profileId: "bill",
      variant: "return",
      storage: null,
    });
    assert.equal(out.role, "invoice");
    assert.equal(out.variant, "return");
    assert.equal(fakeDoc.documentElement.dataset.docRole, "invoice");
    assert.equal(fakeDoc.documentElement.dataset.docVariant, "return");
  });

  it("CSS ships vertical white stripes for the return variant", () => {
    assert.match(docWashCss, /--stripe-return:\s*repeating-linear-gradient\(\s*90deg/);
    assert.match(
      docWashCss,
      /html\[data-doc-variant="return"\] \.card \{\s*background-image: var\(--stripe-return\);/,
    );
  });

  it("stripes out-specify the pattern hatch so a patterned desk keeps both", () => {
    // The hatch block is html + 3 attrs + class; a bare variant rule (html + 1 attr + class)
    // would silently lose to it on a patterned desk. Guard the compound selectors instead.
    assert.match(
      docWashCss,
      /html\[data-doc-variant="return"\]\[data-pattern="both"\]\[data-doc-desk="ap"\] \.card/,
    );
    assert.match(docWashCss, /background-image: var\(--stripe-return\), var\(--hatch-desk\);/);
  });

  it("setWashSourceAttr writes or clears dataset", () => {
    const el = { dataset: /** @type {Record<string, string>} */ ({}) };
    setWashSourceAttr(el, "order");
    assert.equal(el.dataset.washSource, "order");
    setWashSourceAttr(el, null);
    assert.equal(el.dataset.washSource, undefined);
  });
});

describe("desk hatch — one global setting (5zorro 2026-09-26)", () => {
  it("merges a stored setting, falling back to the A/R default", async () => {
    const { mergeDocWashPrefs, PATTERN_PREF_LABELS } = await import("../src/doc-wash.js");
    assert.deepEqual(mergeDocWashPrefs({ pattern: "both" }), { pattern: "both" });
    assert.deepEqual(mergeDocWashPrefs({ pattern: "stripes" }), { pattern: "ar" });
    assert.deepEqual(mergeDocWashPrefs(null), { pattern: "ar" });
    assert.deepEqual(Object.keys(PATTERN_PREF_LABELS), ["ar", "ap", "both", "none"]);
  });

  it("the sync script mirrors, applies and announces the normalized value", async () => {
    const { washPatternSyncScript, PATTERN_PREF_STORAGE_KEY } = await import("../src/doc-wash.js");
    const js = washPatternSyncScript("AP");
    assert.match(js, new RegExp(`localStorage\\.setItem\\("${PATTERN_PREF_STORAGE_KEY}", "ap"\\)`));
    assert.match(js, /dataset\.pattern = "ap"/);
    assert.match(js, /new CustomEvent\("doc-wash-pattern"/);
    // Runs: a fake page sees the attribute and the event.
    const seen = [];
    const root = { dataset: {} };
    const store = {};
    new Function("document", "localStorage", "window", "CustomEvent", `return ${js};`)(
      { documentElement: root },
      { setItem: (k, v) => (store[k] = v) },
      { dispatchEvent: (e) => seen.push(e.detail) },
      class { constructor(_t, o) { this.detail = o.detail; } },
    );
    assert.equal(root.dataset.pattern, "ap");
    assert.equal(store[PATTERN_PREF_STORAGE_KEY], "ap");
    assert.deepEqual(seen, ["ap"]);
  });

  it("the desk hatch is drawn in the role accent, not white (white was invisible)", () => {
    assert.match(docWashCss, /--hatch-desk:[^;]*var\(--role-accent/);
    assert.match(docWashCss, /html\[data-doc-role="order"\] \{ --role-accent: var\(--accent-order\); \}/);
    assert.match(
      docWashCss,
      /html\[data-pattern="ar"\]\[data-doc-desk="ar"\] \.card,[^{]*\{\s*background-image: var\(--hatch-desk\);/,
    );
  });
});
