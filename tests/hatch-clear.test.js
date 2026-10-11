/**
 * Text on a hatch gets a hatch-free box (5zorro DF-02, 2026-10-10). The desk hatch running
 * through letters adds lines and makes them harder to read; it was caught on Home but lived on
 * every hatched surface. This file is the list of those surfaces: a new page that paints a hatch
 * fails the first test until it is added here with the text it clears.
 *
 * @covers electron/doc-wash.css electron/home.html electron/find-doc.html electron/doc-chrome.fragment.html electron/bill-shell.fragment.html electron/doc-form-body.fragment.html electron/bill-dashboard.css
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const electronDir = fileURLToPath(new URL("../electron/", import.meta.url));
const read = (f) => readFileSync(join(electronDir, f), "utf8");

/** Generated pages repeat their sources; only the sources are listed. */
const GENERATED = new Set(["doc-form.html", "pay-outstanding.html", "payment-doc.html"]);

/** Each surface that paints --hatch-desk, and the text on it that must carry .hatch-clear. */
const SURFACES = {
  "doc-wash.css": [], // Doc skins' toolbar groups and card; their text is in the fragments below
  "home.html": [/<div class="ic hatch-clear">/, /<span class="lbl hatch-clear">\$\{t\.label\}<\/span>/],
  "find-doc.html": [/<h1 id="title" class="hatch-clear"/],
  // The Bill's Customer / Sales order(s) cells (5zorro 2026-10-11); their text is in bill-form-page.js.
  "bill-dashboard.css": [/td\.so-cell \.hatch-clear \{ background-color: var\(--hatch-base\)/],
};

describe("text on a desk hatch sits in a hatch-free box", () => {
  it("every file that paints the desk hatch is listed here", () => {
    const painters = readdirSync(electronDir)
      .filter((f) => /\.(css|html)$/.test(f) && !GENERATED.has(f))
      .filter((f) => /background-image:[^;]*var\(--hatch-desk\)/.test(read(f)));
    assert.deepEqual(painters.sort(), Object.keys(SURFACES).sort());
  });

  it("each hatched surface names its solid colour, and its text opts in", () => {
    for (const [file, marks] of Object.entries(SURFACES)) {
      assert.match(read(file), /--hatch-base:/, `${file} sets --hatch-base`);
      for (const m of marks) assert.match(read(file), m, `${file}: ${m}`);
    }
  });

  it("the shared rule paints the surface colour behind the characters only", () => {
    const css = read("doc-wash.css");
    assert.match(css, /\.hatch-clear\s*\{[^}]*background-color:\s*var\(--hatch-base, transparent\)[^}]*box-decoration-break:\s*clone/s);
  });

  it("Doc-skin toolbar labels and footer hints carry it", () => {
    const chrome = read("doc-chrome.fragment.html");
    assert.doesNotMatch(chrome, /class="tb-group-label"/);
    assert.match(chrome, /class="tb-group-label hatch-clear"/);
    assert.match(read("bill-shell.fragment.html"), /<p class="hint hatch-clear">/);
    assert.match(read("doc-form-body.fragment.html"), /<p class="hint hatch-clear" id="doc-hint">/);
  });

  it("a sourced read-only field keeps its hatch to a band at the left edge, clear of its text", () => {
    assert.match(read("doc-wash.css"), /background-image:\s*var\(--hatch-lighten\);\s*background-size:\s*6px 100%;\s*background-repeat:\s*no-repeat;/);
  });

  it("the Bill's Customer / Sales order(s) cell text carries it", () => {
    const page = readFileSync(fileURLToPath(new URL("../src/bill-form-page.js", import.meta.url)), "utf8");
    assert.match(page, /<td class="alloc-so so-cell"><span class="ro alloc-so-text hatch-clear">/);
    assert.match(page, /<td class="so-cell"><span class="ro hatch-clear">/);
  });
});
