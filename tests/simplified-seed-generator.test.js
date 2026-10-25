/**
 * Simplified's Doc-skin defaults are generated (5zorro 2026-10-10). The drift test fails when the
 * committed src/simplified-seed-profiles.generated.js disagrees with the rule applied to the
 * snapshot — a Doc skin changed what it shows or asks, the rule changed, or the snapshot was
 * refreshed after an ERPNext upgrade. Fix: `npm run seeds:simplified`.
 *
 * @covers scripts/generate-simplified-seeds.js src/simplified-seed-profiles.generated.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deriveSeed, deriveAllSeeds, SEED_RULE_CONFIG, isSeedWritePath } from "../src/simplified-seed-rule.js";
import { readMeta, renderGenerated } from "../scripts/generate-simplified-seeds.js";

const generatedPath = fileURLToPath(new URL("../src/simplified-seed-profiles.generated.js", import.meta.url));

describe("simplified seeds — drift", () => {
  it("the committed defaults are what the rule makes (else: npm run seeds:simplified)", () => {
    const { fieldsByDoctype, refs } = readMeta();
    assert.equal(readFileSync(generatedPath, "utf8"), renderGenerated(deriveAllSeeds(fieldsByDoctype), refs));
  });

  it("every recorded exception still matters: the field exists and the rule would otherwise lock it", () => {
    const { fieldsByDoctype } = readMeta();
    for (const [dt, cfg] of Object.entries(SEED_RULE_CONFIG)) {
      for (const fn of Object.keys(cfg.keepNormal || {})) {
        const f = fieldsByDoctype[dt].find((x) => x.fieldname === fn);
        assert.ok(f, `${dt}.${fn}: not in the snapshot — drop the stale exception`);
        const without = deriveSeed([f], { ...cfg, keepNormal: {} });
        assert.equal(without.placements[fn], "L2", `${dt}.${fn}: an earlier rule step already leaves it alone — drop the exception`);
      }
    }
  });
});

describe("simplified seeds — the rule, step by step", () => {
  const cfg = {
    surfaced: (fn) => fn === "bill_no",
    quietClickable: ["update_stock"],
    derived: { posting_date: { valueSource: "expr", expr: { base: "today", offset: 0 } }, set_posting_time: null },
    keepNormal: { title: "why" },
  };
  const out = deriveSeed(
    [
      { fieldname: "sec", fieldtype: "Section Break" },
      { fieldname: "posting_date", fieldtype: "Date", reqd: 1 },
      { fieldname: "set_posting_time", fieldtype: "Check" },
      { fieldname: "clearance_date", fieldtype: "Date", read_only: 1 },
      { fieldname: "update_stock", fieldtype: "Check" },
      { fieldname: "credit_to", fieldtype: "Link", reqd: 1 },
      { fieldname: "supplier_address", fieldtype: "Link" },
      { fieldname: "bill_no", fieldtype: "Data" },
      { fieldname: "title", fieldtype: "Data" },
      { fieldname: "cost_center", fieldtype: "Link" },
    ],
    cfg,
  );
  it("places each field by the first step that answers", () => {
    assert.deepEqual(out.placements, { posting_date: "L2", set_posting_time: "L2", update_stock: "L1", cost_center: "L2" });
  });
  it("a derived required field carries its value (Posting Date: Today)", () => {
    assert.deepEqual(out.values, { posting_date: { valueSource: "expr", expr: { base: "today", offset: 0 } } });
  });
  it("write paths every skin owns", () => {
    for (const fn of ["company", "shipping_address", "taxes_and_charges", "status", "naming_series"]) assert.ok(isSeedWritePath(fn), fn);
    assert.equal(isSeedWritePath("cost_center"), false);
  });
});
