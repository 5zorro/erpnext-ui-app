/**
 * Peek buttons on the Bill and doc-form pages are mouse only (5zorro DF-03: the ↗ next to each
 * linked PO took Tab while he typed the invoice). Tab moves from box to box; a peek on the way is a
 * stop with nothing to type. Dialogs (the costing box) keep theirs in Tab: there the buttons are
 * what the clerk acts on.
 *
 * @covers src/bill-form-page.js src/doc-form-page.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const PAGES = ["../src/bill-form-page.js", "../src/doc-form-page.js"];

describe("peek buttons stay out of Tab", () => {
  for (const page of PAGES) {
    const src = read(page);
    it(`${page}: every peek button template has tabindex="-1"`, () => {
      const buttons = src.match(/<button[^>]*class="[^"]*peek[^"]*"[^>]*>/g) || [];
      for (const b of buttons) assert.match(b, /tabindex="-1"/, b);
    });
    it(`${page}: every peek button built in code sets tabIndex = -1`, () => {
      for (const m of src.matchAll(/(\w+)\.className = "[^"]*peek[^"]*";/g)) {
        // The button's set-up, up to its click wiring.
        const end = src.indexOf(`${m[1]}.addEventListener(`, m.index);
        assert.ok(end > m.index, `${m[0]}: no click wiring found after it`);
        assert.match(src.slice(m.index, end), new RegExp(`${m[1]}\\.tabIndex = -1;`), m[0]);
      }
    });
  }
});
