import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const electronDir = fileURLToPath(new URL("../electron/", import.meta.url));
const docFormHtml = readFileSync(join(electronDir, "doc-form.html"), "utf8");
const billFormPage = readFileSync(
  join(fileURLToPath(new URL("../src/bill-form-page.js", import.meta.url))),
  "utf8",
);
const docFormPage = readFileSync(
  join(fileURLToPath(new URL("../src/doc-form-page.js", import.meta.url))),
  "utf8",
);
const docSkinCss = readFileSync(join(electronDir, "doc-skin.css"), "utf8");
const billDashboardCss = readFileSync(join(electronDir, "bill-dashboard.css"), "utf8");
const docFieldsCss = readFileSync(join(electronDir, "doc-fields.css"), "utf8");

describe("doc-skin.css shared chrome", () => {
  it("is linked from doc-form shell (Bill + PO/IR)", () => {
    assert.match(docFormHtml, /href="doc-skin\.css"/);
    assert.match(docFormHtml, /href="bill-dashboard\.css"/);
  });

  it("defines toolbar, dirty pill, commit gate, memo, and link picker", () => {
    assert.match(docSkinCss, /\.toolbar\s*\{/);
    assert.match(docSkinCss, /\.dirty-pill\s*\{/);
    assert.match(docSkinCss, /\.commit-gate\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;/s);
    assert.match(docSkinCss, /\.memo-head\s*\{/);
    assert.match(docSkinCss, /\.link-dd\s*\{/);
    assert.match(docSkinCss, /\.blocked input:not\(\[readonly\]\)/);
  });

  it("does not duplicate commit-gate rules inline in shells", () => {
    assert.doesNotMatch(docFormHtml, /\.commit-gate\s*\{[^}]*position:\s*fixed;/s);
    assert.doesNotMatch(billDashboardCss, /\.commit-gate\s*\{[^}]*position:\s*fixed;/s);
    assert.doesNotMatch(docFormHtml, /\.src-back\s*\{/);
  });
});

describe("doc-fields.css shared field/layout CSS (Packet 4b step 1, 2026-09-05)", () => {
  it("is linked from doc-form shell, before bill-dashboard.css (business logic, 2026-09-06)", () => {
    // bill-dashboard.css loads LAST, deliberately: it is not only a Doc skin for a
    // transaction-entry form, it is also the dashboard for the individual voucher-packet
    // controls (the Bill is the final approval act of that packet) -- 5zorro's framing.
    // That role means it is *expected* to override a shared doc-fields.css rule on
    // purpose sometimes, not just inherit it. (An earlier pass here flipped this order
    // to make redefinition impossible, treating any override as a bug to prevent --
    // wrong call, reverted the same day once the actual business rule was stated.)
    // What still isn't licensed is *undocumented* drift (a rule silently diverging
    // because nobody knew there were two copies) -- that's a review/authorship problem,
    // not a cascade-order one, and doesn't have an automated guard here; see the
    // Packet 4b step-1 commit's 6-selector drift for what that looked like in practice.
    const links = [...docFormHtml.matchAll(/href="([\w.-]+\.css)"/g)].map((m) => m[1]);
    assert.deepEqual(links, ["doc-wash.css", "doc-skin.css", "doc-fields.css", "bill-dashboard.css"]);
  });

  it("defines the component vocabulary the check/ACH document (Packet 4b) will reuse", () => {
    assert.match(docFieldsCss, /\.card\s*\{/);
    assert.match(docFieldsCss, /\.field\s*\{/);
    assert.match(docFieldsCss, /\.cols\s*\{/);
    assert.match(docFieldsCss, /\.taxes-table\s*\{/);
    assert.match(docFieldsCss, /\.money-stack\s*\{/);
  });

  it("keeps its two responsive rules media-scoped, not promoted to unconditional overrides", () => {
    // Regression guard: an earlier consolidation pass extracted these two rules'
    // inner text without their @media wrapper, which would have made .addr-grid
    // and .cols permanently single-column at every viewport width, not just narrow
    // ones. Caught by parse-back verification before it ever reached this file.
    assert.match(
      docFieldsCss,
      /@media \(max-width:\s*900px\)\s*\{\s*\.addr-grid\s*\{\s*grid-template-columns:\s*1fr;\s*\}\s*\}/,
    );
    assert.match(
      docFieldsCss,
      /@media \(max-width:\s*720px\)\s*\{\s*\.cols\s*\{\s*grid-template-columns:\s*1fr;\s*\}\s*\}/,
    );
    // And the un-scoped, multi-column base rules must still stand alone (not
    // themselves accidentally wrapped in a media query).
    assert.match(docFieldsCss, /^\.cols \{ display: grid;/m);
    assert.match(docFieldsCss, /^\.addr-grid \{\n {2}display: grid;/m);
  });

  it("does not duplicate the field/card/cols vocabulary inline in doc-form.html", () => {
    assert.doesNotMatch(docFormHtml, /<style>/);
  });
});

describe("Packet T — line-grid readability CSS (2026-09-06)", () => {
  it("A1: line + tax sections bleed to the viewport, scrollbar-safe", () => {
    // The document column (.wrap, max-width 1100px) still governs header /
    // addresses / totals / notes; only the two line grids break out.
    assert.match(docFieldsCss, /\.bill-section-lines,\s*\n\.bill-section-taxes \{/);
    assert.match(docFieldsCss, /width: calc\(100vw - var\(--doc-bleed-gutter\)\);/);
    assert.match(
      docFieldsCss,
      /margin-inline: calc\(50% - 50vw \+ \(var\(--doc-bleed-gutter\) \/ 2\)\);/,
    );
  });

  it("A1: the gutter variable has a 0px fallback so CSS alone stays correct", () => {
    // If the JS wiring never runs (or throws), the bleed must still be sane --
    // 0px just means it reaches the scrollbar edge instead of stopping short.
    assert.match(docFieldsCss, /--doc-bleed-gutter:\s*0px;/);
  });

  it("A1: does not disturb the padding .line-tabs' negative pull depends on", () => {
    // .bill-section .line-tabs uses margin: -12px -14px 0 to reach the section
    // edges. Changing the sections' inline padding would silently unhook that.
    assert.match(billDashboardCss, /\.bill-section \{[^}]*padding: 12px 14px 14px;/s);
    assert.doesNotMatch(docFieldsCss, /\.bill-section-(lines|taxes)[^{]*\{[^}]*padding-inline:/s);
  });
});

describe("Packet T step B — display layer (2026-09-06)", () => {
  it("gives the resting text layer a real break opportunity", () => {
    // A long unbroken item code has none of its own; without `anywhere` it
    // would dictate the column width instead of wrapping inside it.
    assert.match(docFieldsCss, /td\.cell-wrap > \.cell-text \{[^}]*overflow-wrap: anywhere;/s);
    assert.match(docFieldsCss, /td\.cell-wrap > \.cell-text \{[^}]*white-space: pre-wrap;/s);
  });

  it("sizes the text layer border-box so short rows keep their height", () => {
    // Regression: with content-box, min-height + padding stack and every short
    // row grows ~11px. Measured 40 -> 51 -> 40 when this was added.
    assert.match(docFieldsCss, /td\.cell-wrap > \.cell-text \{[^}]*box-sizing: border-box;/s);
  });

  it("overlays both editor shapes — a bare input and the picker's .link-wrap", () => {
    // mountLinkPicker() inserts a positioned .link-wrap between the td and the
    // input for item_code, so targeting only `input` would miss precisely the
    // column with the worst readability problem.
    assert.match(docFieldsCss, /td\.cell-wrap > input,\s*\ntd\.cell-wrap > \.link-wrap \{/);
    assert.match(
      docFieldsCss,
      /td\.cell-wrap:focus-within > input,\s*\ntd\.cell-wrap:focus-within > \.link-wrap \{\s*opacity: 1;/,
    );
  });

  it("keeps the wrapped text readable in nav mode", () => {
    // Nav mode is for moving, not typing: the editor stays transparent so you
    // can still read the cell you are sitting on.
    assert.match(
      docFieldsCss,
      /\[data-cell-mode="nav"\] td\.cell-wrap:focus-within > input,[\s\S]*?opacity: 0;/,
    );
  });

  it("makes the cell mode visible (the old dead data-nav-focus job)", () => {
    assert.match(docFieldsCss, /td\.cell-wrap:focus-within \{[^}]*outline: 2px solid/s);
    assert.match(docFieldsCss, /\[data-cell-mode="nav"\] td\.cell-wrap:focus-within \{[^}]*background:/s);
  });

  it("both row builders emit the display layer, and keep their testids", () => {
    for (const [label, src] of [["bill", billFormPage], ["doc", docFormPage]]) {
      const prefix = label === "bill" ? "bill" : "doc";
      assert.match(
        src,
        new RegExp(`<td class="cell-wrap"><span class="cell-text">\\$\\{escapeHtml\\(val\\)\\}</span>`),
        `${label} row builder lost its text layer`,
      );
      assert.match(
        src,
        new RegExp(`data-testid="${prefix}-cell-\\$\\{ri\\}-\\$\\{col\\.field\\}"`),
        `${label} row builder lost its cell testid`,
      );
    }
  });

  it("read-only cells wrap too — reading a submitted doc is still reading", () => {
    for (const [label, src] of [["bill", billFormPage], ["doc", docFormPage]]) {
      assert.match(
        src,
        /<td class="cell-wrap"><span class="cell-text ro">/,
        `${label} read-only branch does not wrap`,
      );
    }
  });

  it("mirrors the cell mode to the DOM through a single setter", () => {
    // The mode used to live only in a module-local variable, so no stylesheet
    // could see it. Every assignment must go through the setter or the CSS
    // silently desyncs from the real mode.
    for (const [label, src] of [["bill", billFormPage], ["doc", docFormPage]]) {
      assert.match(src, /function setItemCellMode\(mode\) \{/, `${label} has no setter`);
      assert.match(src, /el\.items\.dataset\.cellMode = itemCellMode;/, `${label} does not mirror`);
      // Only the setter itself may assign the variable directly.
      const direct = [...src.matchAll(/^\s*itemCellMode = /gm)];
      assert.equal(direct.length, 1, `${label} has ${direct.length} raw itemCellMode assignments`);
    }
  });
});

describe("Packet T step D — frozen columns and density CSS (2026-09-06)", () => {
  it("frozen cells get an opaque ground", () => {
    // Without one the scrolled columns show straight through the frozen group.
    assert.match(
      docFieldsCss,
      /#panel-items table\[data-sticky-count\] tbody td:nth-child\(-n \+ 3\) \{\s*background: #fff;/,
    );
    assert.match(
      docFieldsCss,
      /#panel-items table\[data-sticky-count\] thead th:nth-child\(-n \+ 3\) \{\s*background: #f8fafc;/,
    );
  });

  it("each frozen column reads its offset from step C, falling back to auto", () => {
    for (const n of [1, 2, 3]) {
      assert.match(
        docFieldsCss,
        new RegExp(`left: var\\(--sticky-${n}, auto\\);`),
        `column ${n} has no sticky offset`,
      );
    }
  });

  it("standard density is the unstyled default", () => {
    // Only compact and comfortable override anything; "standard" existing as a
    // rule would mean the default path could drift from the default look.
    assert.doesNotMatch(docFieldsCss, /\[data-density="standard"\]/);
    assert.match(docFieldsCss, /\[data-density="compact"\]/);
    assert.match(docFieldsCss, /\[data-density="comfortable"\]/);
  });

  it("every density still wraps — the toggle is never needed to read", () => {
    // The wrap rules live on td.cell-wrap > .cell-text unconditionally; density
    // may only change padding/min-height/line-height.
    const densityRules = docFieldsCss.match(/\[data-density="(compact|comfortable)"\][^{]*\{[^}]*\}/gs) || [];
    assert.ok(densityRules.length > 0, "no density rules found");
    for (const rule of densityRules) {
      assert.doesNotMatch(rule, /white-space:/, `a density rule changes wrapping: ${rule}`);
      assert.doesNotMatch(rule, /overflow-wrap:/, `a density rule changes wrapping: ${rule}`);
    }
  });

  it("the density control ships in the generated shell for both bodies", () => {
    assert.match(docFormHtml, /data-testid="bill-density"/);
    assert.match(docFormHtml, /data-testid="doc-density"/);
  });
});

describe("doc-form CAPS control", () => {
  it("exposes CAPS toggle in Navigate toolbar", () => {
    assert.match(docFormHtml, /id="btn-caps" data-testid="doc-caps"/);
  });
});

describe("bill-dashboard subsection chrome", () => {
  it("defines borderless subsection inset on white bill-sections", () => {
    assert.match(billDashboardCss, /\.bill-section \.field input\.addr-pick/);
    assert.match(billDashboardCss, /box-shadow:/);
  });

  it("PO doc-form shell uses bill-section doc header wrapper", () => {
    assert.match(docFormHtml, /data-testid="doc-header-section"/);
    assert.match(docFormHtml, /bill-section-doc/);
    assert.match(docFormHtml, /data-testid="doc-notes-section"/);
  });
});
