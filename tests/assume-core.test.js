import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PLACEMENTS,
  DEFAULT_PLACEMENT,
  BUILTIN_PRESETS,
  lsKey,
  normExpr,
  normalizeProfile,
  isAssumed,
  placementFor,
  valueFor,
  assumedFields,
  tabSkips,
  checkProfile,
  setAssumption,
  resolveExpr,
  presetLabel,
  resolveFieldValue,
  addPreset,
  isEffectivelyEmpty,
} from "../src/assume-core.js";

describe("assume-core", () => {
  describe("lsKey", () => {
    it("returns prefixed key", () => {
      assert.equal(lsKey("Purchase Invoice"), "secondskin:Purchase Invoice");
    });
    it("handles empty", () => {
      assert.equal(lsKey(""), "secondskin:");
    });
  });

  describe("normExpr", () => {
    it("normalizes valid expr", () => {
      assert.deepEqual(normExpr({ base: "today", offset: 7 }), { base: "today", offset: 7 });
    });
    it("defaults offset to 0 for non-numeric", () => {
      assert.deepEqual(normExpr({ base: "som", offset: "bad" }), { base: "som", offset: 0 });
    });
    it("returns null for invalid base", () => {
      assert.equal(normExpr({ base: "week", offset: 0 }), null);
    });
    it("returns null for null", () => {
      assert.equal(normExpr(null), null);
    });
  });

  describe("normalizeProfile", () => {
    it("returns empty profile for null", () => {
      const p = normalizeProfile(null, "purchase-invoice");
      assert.equal(p.doctype, "purchase-invoice");
      assert.deepEqual(p.fields, {});
      assert.deepEqual(p.presets, []);
    });
    it("normalizes field placements", () => {
      const p = normalizeProfile(
        { fields: { company: { placement: "L3", value: "ACME", valueSource: "literal" } } },
        "PI",
      );
      assert.equal(p.fields.company.placement, "L3");
      assert.equal(p.fields.company.value, "ACME");
    });
    it("defaults invalid placement to DEFAULT_PLACEMENT", () => {
      const p = normalizeProfile({ fields: { company: { placement: "X99" } } }, "PI");
      assert.equal(p.fields.company.placement, DEFAULT_PLACEMENT);
    });
    it("normalizes presets", () => {
      const p = normalizeProfile(
        { presets: [{ id: "t", label: "T", base: "today", offset: 0 }] },
        "PI",
      );
      assert.equal(p.presets.length, 1);
      assert.equal(p.presets[0].id, "t");
    });
    it("drops preset with invalid base", () => {
      const p = normalizeProfile({ presets: [{ base: "week", offset: 0 }] }, "PI");
      assert.equal(p.presets.length, 0);
    });
  });

  describe("isAssumed / placementFor / valueFor", () => {
    const profile = normalizeProfile(
      {
        fields: {
          company: { placement: "L3", value: "ACME", valueSource: "literal" },
          currency: { placement: "vanilla", value: "USD", valueSource: "literal" },
        },
      },
      "PI",
    );
    it("isAssumed true for non-vanilla", () => {
      assert.equal(isAssumed(profile, "company"), true);
    });
    it("isAssumed false for vanilla", () => {
      assert.equal(isAssumed(profile, "currency"), false);
    });
    it("isAssumed false for missing", () => {
      assert.equal(isAssumed(profile, "posting_date"), false);
    });
    it("placementFor returns L3", () => {
      assert.equal(placementFor(profile, "company"), "L3");
    });
    it("placementFor returns vanilla for vanilla field", () => {
      assert.equal(placementFor(profile, "currency"), "vanilla");
    });
    it("valueFor returns value", () => {
      assert.equal(valueFor(profile, "company"), "ACME");
    });
    it("valueFor returns null for missing", () => {
      assert.equal(valueFor(profile, "posting_date"), null);
    });
  });

  describe("assumedFields / tabSkips", () => {
    const profile = normalizeProfile(
      {
        fields: {
          company: { placement: "L3" },
          currency: { placement: "vanilla" },
          set_posting_time: { placement: "L1" },
        },
      },
      "PI",
    );
    it("assumedFields returns only non-vanilla", () => {
      assert.deepEqual(assumedFields(profile).sort(), ["company", "set_posting_time"]);
    });
    it("tabSkips matches assumedFields", () => {
      assert.deepEqual(tabSkips(profile).sort(), ["company", "set_posting_time"]);
    });
  });

  describe("checkProfile", () => {
    const metaFields = [
      { fieldname: "company", reqd: 1 },
      { fieldname: "posting_date", reqd: 0 },
      { fieldname: "supplier", reqd: 1 },
    ];
    it("ok when mandatory field has a value", () => {
      const profile = normalizeProfile(
        { fields: { company: { placement: "L3", value: "ACME" } } },
        "PI",
      );
      const r = checkProfile(profile, metaFields);
      assert.equal(r.ok, true);
      assert.equal(r.problems.length, 0);
    });
    it("problem when mandatory field assumed with no value", () => {
      const profile = normalizeProfile(
        { fields: { company: { placement: "L3", value: null } } },
        "PI",
      );
      const r = checkProfile(profile, metaFields);
      assert.equal(r.ok, false);
      assert.equal(r.problems[0].field, "company");
    });
    it("no problem when non-mandatory field assumed with no value", () => {
      const profile = normalizeProfile(
        { fields: { posting_date: { placement: "L2", value: null } } },
        "PI",
      );
      const r = checkProfile(profile, metaFields);
      assert.equal(r.ok, true);
    });
  });

  describe("setAssumption", () => {
    it("merges placement patch immutably", () => {
      const p1 = normalizeProfile({ fields: { company: { placement: "L2" } } }, "PI");
      const p2 = setAssumption(p1, "company", { placement: "L3" });
      assert.equal(p2.fields.company.placement, "L3");
      assert.equal(p1.fields.company.placement, "L2"); // original unchanged
    });
    it("creates new field entry if missing", () => {
      const p1 = normalizeProfile({}, "PI");
      const p2 = setAssumption(p1, "company", { placement: "L1", value: "X" });
      assert.equal(p2.fields.company.placement, "L1");
      assert.equal(p2.fields.company.value, "X");
    });
    it("ignores invalid placement", () => {
      const p1 = normalizeProfile({ fields: { company: { placement: "L2" } } }, "PI");
      const p2 = setAssumption(p1, "company", { placement: "X99" });
      assert.equal(p2.fields.company.placement, "L2");
    });
  });

  describe("resolveExpr", () => {
    it("resolves today+0 to today", () => {
      const r = resolveExpr({ base: "today", offset: 0 }, "2026-09-02");
      assert.equal(r, "2026-09-02");
    });
    it("resolves today+7", () => {
      const r = resolveExpr({ base: "today", offset: 7 }, "2026-09-02");
      assert.equal(r, "2026-09-09");
    });
    it("resolves som", () => {
      const r = resolveExpr({ base: "som", offset: 0 }, "2026-09-02");
      assert.equal(r, "2026-09-01");
    });
    it("resolves eom", () => {
      const r = resolveExpr({ base: "eom", offset: 0 }, "2026-09-02");
      assert.equal(r, "2026-09-30");
    });
    it("returns empty for invalid", () => {
      assert.equal(resolveExpr(null, "2026-09-02"), "");
    });
  });

  describe("presetLabel", () => {
    it("returns Today for today+0", () => {
      assert.equal(presetLabel({ base: "today", offset: 0 }), "Today");
    });
    it("returns Today + 7 days", () => {
      assert.equal(presetLabel({ base: "today", offset: 7 }), "Today + 7 days");
    });
    it("uses singular 'day' for offset=1", () => {
      assert.equal(presetLabel({ base: "today", offset: 1 }), "Today + 1 day");
    });
    it("handles negative offset", () => {
      assert.equal(presetLabel({ base: "today", offset: -1 }), "Today − 1 day");
    });
  });

  describe("resolveFieldValue", () => {
    it("literal always applies", () => {
      const f = { value: "ACME", valueSource: "literal", placement: "L2", expr: null };
      assert.deepEqual(resolveFieldValue(f, {}), { apply: true, value: "ACME" });
    });
    it("expr applies on new doc", () => {
      const f = {
        value: null,
        valueSource: "expr",
        placement: "L2",
        expr: { base: "today", offset: 0 },
      };
      const r = resolveFieldValue(f, { isNew: true, today: "2026-09-02" });
      assert.equal(r.apply, true);
      assert.equal(r.value, "2026-09-02");
    });
    it("expr does not apply on saved doc (sticky rule)", () => {
      const f = {
        value: null,
        valueSource: "expr",
        placement: "L2",
        expr: { base: "today", offset: 0 },
      };
      const r = resolveFieldValue(f, { isNew: false });
      assert.equal(r.apply, false);
    });
    it("null field returns apply true with null value", () => {
      assert.deepEqual(resolveFieldValue(null, {}), { apply: true, value: null });
    });
  });

  describe("addPreset", () => {
    it("adds a new preset", () => {
      const p = normalizeProfile({}, "PI");
      const p2 = addPreset(p, "today", 14);
      assert.equal(p2.presets.length, 1);
      assert.equal(p2.presets[0].id, "today_14");
    });
    it("does not add duplicate preset", () => {
      const p = normalizeProfile({}, "PI");
      const p2 = addPreset(p, "today", 14);
      const p3 = addPreset(p2, "today", 14);
      assert.equal(p3.presets.length, 1);
    });
  });

  describe("BUILTIN_PRESETS", () => {
    it("has 6 entries", () => {
      assert.equal(BUILTIN_PRESETS.length, 6);
    });
    it("all have valid base", () => {
      for (const p of BUILTIN_PRESETS) {
        assert.ok(["today", "som", "eom"].includes(p.base), `bad base: ${p.base}`);
      }
    });
  });

  describe("isEffectivelyEmpty", () => {
    it("null field is empty", () => assert.equal(isEffectivelyEmpty(null), true));
    it("value=null is empty", () => {
      assert.equal(isEffectivelyEmpty({ value: null, valueSource: "literal" }), true);
    });
    it("value='ACME' is not empty", () => {
      assert.equal(isEffectivelyEmpty({ value: "ACME", valueSource: "literal" }), false);
    });
    it("expr with valid expr is not empty", () => {
      assert.equal(
        isEffectivelyEmpty({ valueSource: "expr", expr: { base: "today", offset: 0 } }),
        false,
      );
    });
    it("expr with null expr is empty", () => {
      assert.equal(isEffectivelyEmpty({ valueSource: "expr", expr: null }), true);
    });
  });
});
