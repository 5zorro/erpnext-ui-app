import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { autoSizeItemColumns, mountColResize } from "../src/item-col-resize.js";

const src = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const resizeSrc = src("../src/item-col-resize.js");
const billFormPage = src("../src/bill-form-page.js");
const docFormPage = src("../src/doc-form-page.js");
const docFieldsCss = src("../electron/doc-fields.css");

describe("item-col-resize — total on a missing or empty table", () => {
  // These run in bare Node with no DOM at all, which is the harshest version of
  // "called before the table exists". Column sizing is presentation: it must
  // never be the reason a repaint throws.
  it("returns {} rather than throwing when there is no table", () => {
    assert.deepEqual(autoSizeItemColumns(null, { tableKey: "bill-items" }), {});
    assert.deepEqual(autoSizeItemColumns(undefined, { tableKey: "bill-items" }), {});
  });

  it("returns {} when no tableKey is supplied", () => {
    assert.deepEqual(autoSizeItemColumns({}, {}), {});
    assert.deepEqual(autoSizeItemColumns({}, null), {});
  });

  it("mountColResize is a no-op on junk instead of throwing", () => {
    assert.doesNotThrow(() => mountColResize(null, { tableKey: "bill-items" }));
    assert.doesNotThrow(() => mountColResize({}, {}));
  });
});

describe("item-col-resize — column identity", () => {
  it("prefers an explicit data-col-key over the sort key", () => {
    // PO/IR's "no sortable headers" branch emits no data-sort, so without an
    // explicit key those columns fall back to the generic rule -- which costs
    // Description its flex and leaves the bleed full of dead space.
    const fn = resizeSrc.slice(resizeSrc.indexOf("function colKeyFor"));
    const explicitAt = fn.indexOf('getAttribute("data-col-key")');
    const sortAt = fn.indexOf('getAttribute("data-sort")');
    assert.ok(explicitAt > -1, "data-col-key is not consulted");
    assert.ok(sortAt > -1, "data-sort is not consulted");
    assert.ok(explicitAt < sortAt, "data-sort is checked before data-col-key");
  });

  it("the PO/IR unsorted header branch emits a column key", () => {
    assert.match(docFormPage, /<th data-col-key="\$\{escapeHtml\(c\.field \|\| c\.label \|\| ""\)\}"/);
  });

  it("translates column rules (minPx/maxPx) into clamp bounds (min/max)", () => {
    // Passing colRuleFor() straight to draggedColWidthPx silently drops the
    // column's ceiling: the drag preview overshot and persisted 495px against a
    // 420px cap.
    assert.match(resizeSrc, /function boundsFor\(key\) \{[\s\S]*?min: rule\.minPx, max: rule\.maxPx/);
    assert.match(resizeSrc, /draggedColWidthPx\(startWidth, ev\.clientX - startX, boundsFor\(key\)\)/);
    assert.doesNotMatch(resizeSrc, /draggedColWidthPx\([^)]*colRuleFor\(/);
  });
});

describe("item-col-resize — width policy", () => {
  it("a fixed column still has to fit its own header", () => {
    // "PO line" in a 54px column renders "PO LI..." -- the exact unreadability
    // this packet exists to remove.
    assert.match(resizeSrc, /Math\.max\(rule\.fixedPx, headerPx\)/);
  });

  it("an empty header claims no width", () => {
    assert.match(resizeSrc, /label \? measureHead\(label\) \+ 14 : 0/);
  });

  it("the actions column gets no resize handle", () => {
    assert.match(resizeSrc, /if \(key === "__action" && index === heads\.length - 1\) return;/);
  });

  it("handles swallow click so resizing never re-sorts the grid", () => {
    const handleBlock = resizeSrc.slice(resizeSrc.indexOf("function mountColResize"));
    assert.match(handleBlock, /addEventListener\("click", \(ev\) => \{\s*ev\.preventDefault\(\);\s*ev\.stopPropagation\(\);/);
    assert.match(handleBlock, /addEventListener\("pointerdown"[\s\S]*?ev\.stopPropagation\(\);/);
  });
});

describe("item-col-resize — wiring into both row painters", () => {
  it("both pages size their item grid after painting rows", () => {
    for (const [label, page] of [["bill", billFormPage], ["doc", docFormPage]]) {
      assert.match(page, /function sizeItemColumns\(\)/, `${label} has no item sizer`);
      assert.match(page, /paintLineTotals\(doc\);\n\s*sizeItemColumns\(\);/, `${label} does not size after paint`);
    }
  });

  it("both pages size their tax grid too", () => {
    for (const [label, page] of [["bill", billFormPage], ["doc", docFormPage]]) {
      assert.match(page, /function sizeTaxColumns\(\)/, `${label} has no tax sizer`);
      assert.match(page, /\.join\(""\);\n\s*sizeTaxColumns\(\);/, `${label} does not size taxes after paint`);
    }
  });

  it("PO and Item Receipt keep independent widths", () => {
    assert.match(docFormPage, /\$\{\(ui && ui\.profileId\) \|\| "doc"\}-items/);
    assert.match(docFormPage, /\$\{\(ui && ui\.profileId\) \|\| "doc"\}-taxes/);
  });

  it("sizing failures cannot break a repaint", () => {
    for (const [label, page] of [["bill", billFormPage], ["doc", docFormPage]]) {
      const fn = page.slice(page.indexOf("function sizeItemColumns"));
      assert.match(fn.slice(0, 600), /try \{[\s\S]*?\} catch \{/, `${label} sizer is unguarded`);
    }
  });
});

describe("Packet T C — resize handle CSS", () => {
  it("handles are grabbable and do not scroll the panel on touch", () => {
    assert.match(docFieldsCss, /\.col-resize \{[^}]*cursor: col-resize;/s);
    assert.match(docFieldsCss, /\.col-resize \{[^}]*touch-action: none;/s);
  });

  it("header cells are positioned so a handle can anchor to them", () => {
    assert.match(docFieldsCss, /#panel-items thead th,\s*\n\.bill-section-taxes thead th \{\s*position: relative;/);
  });
});
