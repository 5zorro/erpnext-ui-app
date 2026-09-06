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

/**
 * Extract top-level rule selectors from a CSS source (comments stripped, one level of
 * @media descended into, other at-rules skipped as non-selector). Used to compare the
 * *actual selector vocabulary* of two files generically, rather than hardcoding a list
 * that would silently stop covering new rules as doc-fields.css grows (Packet 4b step 2+
 * will add the check/ACH document's own shared classes to it).
 */
function extractSelectors(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors = [];
  function scan(str) {
    let i = 0;
    while (i < str.length) {
      while (i < str.length && /\s/.test(str[i])) i++;
      if (i >= str.length) break;
      const brace = str.indexOf("{", i);
      if (brace === -1) break;
      const head = str.slice(i, brace).trim();
      let depth = 1;
      let j = brace + 1;
      while (depth > 0 && j < str.length) {
        if (str[j] === "{") depth++;
        else if (str[j] === "}") depth--;
        j++;
      }
      if (head.startsWith("@media")) {
        scan(str.slice(brace + 1, j - 1));
      } else if (!head.startsWith("@")) {
        selectors.push(head.replace(/\s+/g, " "));
      }
      i = j;
    }
  }
  scan(text);
  return selectors;
}

describe("doc-fields.css shared field/layout CSS (Packet 4b step 1, 2026-09-05)", () => {
  it("is linked from doc-form shell, after bill-dashboard.css (load-order fix, 2026-09-06)", () => {
    // Deliberately last: bill-dashboard.css used to load after doc-fields.css's
    // predecessor (the inline <style> block), so when it silently redefined 96 of
    // those rules, its copy won every conflict without anyone noticing (6 of the 96
    // had drifted before this was caught -- see the Packet 4b step-1 commit). Loading
    // doc-fields.css last means any future accidental re-declaration in
    // bill-dashboard.css is now the one that loses, not the one that silently wins.
    // This does not license bill-dashboard.css to override doc-fields.css on purpose
    // either -- see the next test, which still fails on any redefinition, win or lose.
    const links = [...docFormHtml.matchAll(/href="([\w.-]+\.css)"/g)].map((m) => m[1]);
    assert.deepEqual(links, ["doc-wash.css", "doc-skin.css", "bill-dashboard.css", "doc-fields.css"]);
  });

  it("no doc-fields.css selector is ever redefined in bill-dashboard.css", () => {
    // Comprehensive version of the old 4-selector spot check: walks every selector
    // doc-fields.css actually defines (114 today) rather than a hand-picked handful,
    // so a future duplicate can't slip in just because nobody thought to name it here.
    const fieldsSelectors = extractSelectors(docFieldsCss);
    assert.ok(fieldsSelectors.length > 100, `expected 100+ selectors, got ${fieldsSelectors.length}`);
    const bdSelectors = new Set(extractSelectors(billDashboardCss));
    const reintroduced = fieldsSelectors.filter((s) => bdSelectors.has(s));
    assert.deepEqual(
      reintroduced,
      [],
      `bill-dashboard.css must never redefine a doc-fields.css selector (found: ${reintroduced.join(", ")})`,
    );
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
