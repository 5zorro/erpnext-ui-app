import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DOGFOOD_AP_SOURCES,
  listDogfoodSourceIndex,
  sourceGrandTotal,
  sourceSubtotal,
} from "../src/sample-data/dogfood-ap-sources.js";
import { renderDogfoodSourceHtml } from "../src/sample-data/render-dogfood-html.js";

describe("dogfood AP sources", () => {
  it("covers OI-103 scenarios 1–8 at least once", () => {
    const hit = new Set(
      DOGFOOD_AP_SOURCES.map((d) => d.oi103).filter((n) => n != null)
    );
    for (let i = 1; i <= 8; i++) {
      assert.equal(hit.has(i), true, `missing oi103=${i}`);
    }
  });

  it("has unique ids and required fields", () => {
    const ids = new Set();
    for (const d of DOGFOOD_AP_SOURCES) {
      assert.ok(d.id && d.kind && d.docNo && d.lines?.length);
      assert.equal(ids.has(d.id), false, `duplicate ${d.id}`);
      ids.add(d.id);
    }
  });

  it("multi-PO pack references shared invoice POs", () => {
    const inv = DOGFOOD_AP_SOURCES.find((d) => d.id === "DF-03c");
    assert.deepEqual(inv.poNos, ["PO-DOG-2001", "PO-DOG-2002"]);
  });

  it("totals match line math", () => {
    const d = DOGFOOD_AP_SOURCES.find((d) => d.id === "DF-01");
    assert.equal(sourceSubtotal(d), 10 * 40 + 5 * 25);
    const expectedTax = Math.round(sourceSubtotal(d) * 0.0725 * 100) / 100;
    assert.equal(d.taxAmount, expectedTax);
    assert.equal(sourceGrandTotal(d), sourceSubtotal(d) + expectedTax);
  });

  it("includes T0 multi-source and prepay paper (DF-14…16)", () => {
    assert.ok(DOGFOOD_AP_SOURCES.some((d) => d.id === "DF-14"));
    assert.ok(DOGFOOD_AP_SOURCES.some((d) => d.id === "DF-15"));
    assert.ok(DOGFOOD_AP_SOURCES.some((d) => d.id === "DF-16"));
    const df14 = DOGFOOD_AP_SOURCES.find((d) => d.id === "DF-14");
    assert.match(df14.dogfoodHint, /PO-MN/);
  });

  it("index length matches catalog", () => {
    assert.equal(listDogfoodSourceIndex().length, DOGFOOD_AP_SOURCES.length);
  });
});

describe("renderDogfoodSourceHtml", () => {
  it("escapes and includes dogfood id", () => {
    const d = DOGFOOD_AP_SOURCES[0];
    const html = renderDogfoodSourceHtml({
      ...d,
      vendor: { ...d.vendor, legalName: 'A & B <Co>"' },
    });
    assert.match(html, /DF-01/);
    assert.match(html, /A &amp; B &lt;Co&gt;/);
    assert.doesNotMatch(html, /<Co>/);
  });

  it("renders each template without throwing", () => {
    for (const d of DOGFOOD_AP_SOURCES) {
      const html = renderDogfoodSourceHtml(d);
      assert.match(html, /<!DOCTYPE html>/);
      assert.match(html, new RegExp(d.docNo));
    }
  });
});
