import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeDoc,
  captureBaseline,
  docMatchesBaseline,
  wasClean,
  shouldGateNavigation,
  finishLensApply,
  markUserEdited,
  normalizeEditableText,
  valuesMeaningfullyEqual,
  dirtyCompareKindForField,
  shouldGateSurfaceNavigation,
} from "../src/dirty-gate.js";

describe("sanitizeDoc", () => {
  it("drops __unsaved", () => {
    const s = sanitizeDoc({ a: 1, __unsaved: 1 });
    assert.equal(s.a, 1);
    assert.equal(s.__unsaved, undefined);
  });
});

describe("wasClean", () => {
  it("treats dirty new doc without user edit as clean", () => {
    assert.equal(wasClean({ isDirty: true, isNew: true, userEdited: false }), true);
    assert.equal(wasClean({ isDirty: true, isNew: false, userEdited: false }), true);
    assert.equal(wasClean({ isDirty: false, userEdited: true }), false);
  });
});

describe("valuesMeaningfullyEqual", () => {
  it("trims text so whitespace-only equals empty", () => {
    assert.equal(valuesMeaningfullyEqual("", "   "), true);
    assert.equal(valuesMeaningfullyEqual("alp", " alp "), true);
    assert.equal(valuesMeaningfullyEqual("a", "b"), false);
  });

  it("compares numbers with formatting noise", () => {
    assert.equal(valuesMeaningfullyEqual("10", "10.00", { kind: "number" }), true);
    assert.equal(valuesMeaningfullyEqual("$10.00", "10", { kind: "number" }), true);
    assert.equal(valuesMeaningfullyEqual("", "  ", { kind: "number" }), true);
    assert.equal(valuesMeaningfullyEqual("10", "11", { kind: "number" }), false);
  });

  it("maps Bill fields to compare kinds", () => {
    assert.equal(dirtyCompareKindForField("qty"), "number");
    assert.equal(dirtyCompareKindForField("__amount_due"), "number");
    assert.equal(dirtyCompareKindForField("posting_date"), "date");
    assert.equal(dirtyCompareKindForField("bill_date"), "date");
    assert.equal(dirtyCompareKindForField("supplier"), "text");
  });

  it("normalizeEditableText trims", () => {
    assert.equal(normalizeEditableText("  x  "), "x");
    assert.equal(normalizeEditableText(null), "");
  });
});

describe("shouldGateNavigation", () => {
  it("false when not userEdited — even if ERP dirty", () => {
    assert.equal(shouldGateNavigation({ isDirty: false }), false);
    assert.equal(
      shouldGateNavigation({
        isDirty: true,
        isNew: true,
        userEdited: false,
        doc: { doctype: "Purchase Invoice" },
      }),
      false,
    );
  });

  it("false when ERP dirty, baseline drifted, no Doc edit (OI-033)", () => {
    const opened = { doctype: "Purchase Invoice", naming_series: "ACC-PINV-.YYYY.-" };
    const later = { ...opened, title: "Draft", modified: "2026-07-18 12:00:00" };
    assert.equal(
      shouldGateNavigation({
        isDirty: true,
        isNew: true,
        userEdited: false,
        baselineJson: captureBaseline(opened),
        doc: later,
      }),
      false,
    );
  });

  it("false for existing draft ERP-dirty without Doc edit", () => {
    assert.equal(
      shouldGateNavigation({
        isDirty: true,
        isNew: false,
        userEdited: false,
        baselineJson: captureBaseline({ name: "PINV-1" }),
        doc: { name: "PINV-1", modified: "later" },
      }),
      false,
    );
  });

  it("true only after markUserEdited", () => {
    const doc = { doctype: "Purchase Invoice", items: [] };
    let state = finishLensApply({ isDirty: true, isNew: true, doc }, true);
    assert.equal(shouldGateNavigation(state), false);
    state = markUserEdited(state);
    assert.equal(shouldGateNavigation({ ...state, isDirty: true }), true);
  });

  it("baseline match still irrelevant without userEdited", () => {
    const doc = { doctype: "Purchase Invoice", items: [] };
    const baselineJson = captureBaseline(doc);
    assert.equal(
      shouldGateNavigation({
        isDirty: true,
        userEdited: false,
        baselineJson,
        doc,
      }),
      false,
    );
  });
});

describe("finishLensApply", () => {
  it("captures baseline when wasClean", () => {
    const doc = { name: "PINV-1", __unsaved: 1 };
    const next = finishLensApply({ doc, userEdited: true }, true);
    assert.equal(next.userEdited, false);
    assert.ok(docMatchesBaseline({ name: "PINV-1" }, next.baselineJson));
  });
});

describe("shouldGateSurfaceNavigation (Packet 4b step 3)", () => {
  it("gates only when on the target surface AND dirty", () => {
    assert.equal(shouldGateSurfaceNavigation("pay-outstanding", "pay-outstanding", true), true);
  });

  it("does not gate when dirty but on a different surface", () => {
    assert.equal(shouldGateSurfaceNavigation("home", "pay-outstanding", true), false);
    assert.equal(shouldGateSurfaceNavigation("doc", "pay-outstanding", true), false);
  });

  it("does not gate when on the target surface but clean", () => {
    assert.equal(shouldGateSurfaceNavigation("pay-outstanding", "pay-outstanding", false), false);
  });

  it("a stale dirty flag never blocks navigation once the surface changed", () => {
    // Simulates: drawer left dirty, user already navigated to Home some other way.
    assert.equal(shouldGateSurfaceNavigation("home", "pay-outstanding", true), false);
  });

  it("junk dirty values coerce rather than throw", () => {
    assert.equal(shouldGateSurfaceNavigation("pay-outstanding", "pay-outstanding", "yes"), true);
    assert.equal(shouldGateSurfaceNavigation("pay-outstanding", "pay-outstanding", 0), false);
    assert.equal(shouldGateSurfaceNavigation("pay-outstanding", "pay-outstanding", undefined), false);
  });
});
