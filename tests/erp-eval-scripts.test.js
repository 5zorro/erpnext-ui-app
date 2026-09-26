import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * 🔴 `electron/main.js` is never imported by any unit test — it needs Electron — so a syntax error
 * in it leaves `npm test` completely green while the app will not start at all.
 *
 * That is not a theoretical gap. The `erpEval` write paths are JavaScript written *inside* a
 * template literal, and a comment there that names a function the ordinary way — with backticks —
 * silently ends the literal and inverts everything after it. It happened while building P1 stage 3
 * (2026-09-24): an unescaped `` `amendedName` `` in a comment broke the whole main process, and
 * the only symptom was an error 20 lines further down about a missing parenthesis.
 *
 * So: parse every shell entry point, and separately forbid the specific mistake, because the parse
 * error it produces points somewhere else entirely and costs more to read than to prevent.
 */

const files = [
  "../electron/main.js",
  "../electron/preload.cjs",
  "../electron/doc-form-preload.cjs",
  "../electron/payment-doc-preload.cjs",
  "../electron/pay-outstanding-preload.cjs",
  "../electron/bill-preload.cjs",
  "../electron/home-preload.cjs",
];

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("shell entry points parse", () => {
  // `node --check` picks its parser from the extension, so each file is written out under the one
  // that matches how the shell actually loads it. Nothing is executed.
  const dir = mkdtempSync(join(tmpdir(), "erp-syntax-"));
  for (const rel of files) {
    it(`${rel.replace("../", "")} is syntactically valid`, () => {
      const target = join(dir, rel.replace("../electron/", "").replace(/\.js$/, ".mjs"));
      writeFileSync(target, read(rel));
      assert.doesNotThrow(() => {
        execFileSync(process.execPath, ["--check", target], { stdio: "pipe" });
      });
    });
  }
});

describe("erpEval scripts do not end their own template literal", () => {
  /**
   * Walk `main.js` and, inside each `erpEval(\`…\`)` template, flag any unescaped backtick that is
   * not one of ours. The only legitimate backticks inside those scripts are escaped ones (`\``)
   * and the interpolations the template itself performs.
   */
  it("every backtick inside an erpEval template is escaped", () => {
    const src = read("../electron/main.js");
    const offenders = [];
    const lines = src.split("\n");
    let inTemplate = false;
    lines.forEach((line, i) => {
      const opens = /erpEval\(`/.test(line);
      if (opens) {
        inTemplate = true;
        return;
      }
      if (!inTemplate) return;
      // The closing line of these templates is `})()`)` — with `;`, `,` or nothing after it.
      if (/^\s*\}\)\(\)`\)[;,]?\s*$/.test(line)) {
        inTemplate = false;
        return;
      }
      // Strip escaped backticks, then anything left is a live one.
      if (line.replace(/\\`/g, "").includes("`")) {
        offenders.push(`${i + 1}: ${line.trim()}`);
      }
    });
    assert.deepEqual(
      offenders,
      [],
      "an unescaped backtick inside an erpEval template ends it early and breaks the whole main process:\n" +
        offenders.join("\n"),
    );
  });
});
