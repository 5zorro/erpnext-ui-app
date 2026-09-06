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
