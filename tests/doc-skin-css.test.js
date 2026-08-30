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

describe("doc-form CAPS control", () => {
  it("exposes CAPS toggle in Navigate toolbar", () => {
    assert.match(docFormHtml, /id="btn-caps" data-testid="doc-caps"/);
  });
});
