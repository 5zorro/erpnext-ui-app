import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const main = readFileSync(fileURLToPath(new URL("../electron/main.js", import.meta.url)), "utf8");

/** Each `webPreferences: { … }` object literal in main.js, by matching braces. */
function webPreferenceBlocks(src) {
  const out = [];
  let at = 0;
  for (;;) {
    const start = src.indexOf("webPreferences: {", at);
    if (start < 0) return out;
    let depth = 0;
    let i = src.indexOf("{", start);
    for (; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) break;
    }
    out.push(src.slice(start, i + 1));
    at = i + 1;
  }
}

/**
 * Architecture review 2026-10-19, R1: every view and window the shell makes is sandboxed, has
 * context isolation and no Node — said explicitly, not left to Electron's defaults. The ERP view
 * runs remote pages (and uploaded attachments), so it is the one that matters most.
 */
describe("view sandboxing", () => {
  const blocks = webPreferenceBlocks(main);

  it("finds the views", () => {
    assert.ok(blocks.length >= 10, `only ${blocks.length} webPreferences blocks found`);
  });

  it("every webPreferences is sandboxed, isolated and Node-free (directly or via the shared pref)", () => {
    for (const b of blocks) {
      if (/\.\.\.pref\b/.test(b)) continue;
      assert.match(b, /sandbox: true/, b);
      assert.match(b, /contextIsolation: true/, b);
      assert.match(b, /nodeIntegration: false/, b);
    }
    assert.match(main, /const pref = \{\s*contextIsolation: true,\s*nodeIntegration: false,\s*sandbox: true,/);
  });

  it("the ERP view says sandbox: true itself", () => {
    const erp = blocks.find((b) => b.includes("erp-preload.cjs"));
    assert.ok(erp, "ERP view not found");
    assert.match(erp, /sandbox: true/);
  });
});
