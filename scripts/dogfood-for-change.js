#!/usr/bin/env node
/**
 * What to test and what to dogfood for a change (plan 2026-10-03 stage C).
 *
 *   npm run dogfood:for-change              # changes since the upstream branch (or HEAD~1), plus uncommitted
 *   npm run dogfood:for-change -- <base>    # changes since <base>
 *
 * Prints, per architecture family the change touches: the unit tests that cover it (worked out from
 * what each test imports), the e2e specs, and the dogfood papers to type. A change to a `breaking`
 * family (the navigation spine, main.js) says so: that is the "possibly breaking" case where a broad
 * round is worth it. For main.js it also prints the functions the diff touched.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { planForChange } from "../src/architecture-families.js";

/**
 * The repo files a test file imports (`from "../src/x.js"`) or names (`"electron/main.js"`,
 * `../electron/home.html`) — how a test is tied to the families it covers.
 * @param {string} file absolute path of the test
 * @param {string} root repo root
 * @returns {string[]} repo-relative paths
 */
export function testImportsFor(file, root) {
  const text = fs.readFileSync(file, "utf8");
  const out = new Set();
  const dir = path.dirname(file);
  for (const m of text.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
    const abs = path.resolve(dir, m[1]);
    const rel = path.relative(root, abs);
    if (!rel.startsWith("..")) out.add(rel.split(path.sep).join("/"));
  }
  for (const m of text.matchAll(/["'`](?:\.\.\/)?((?:electron|src|ops|scripts|pwa)\/[\w./-]+)["'`]/g)) out.add(m[1]);
  // A test that names its files indirectly (a template string, a helper) says what it covers:
  //   // @covers electron/home.html electron/doc-wash.css
  for (const m of text.matchAll(/@covers\s+([^\n*]+)/g)) for (const p of m[1].trim().split(/\s+/)) out.add(p);
  return [...out];
}

function git(args) {
  try { return execFileSync("git", args, { encoding: "utf8" }).trim(); } catch { return ""; }
}

async function main() {
  const root = git(["rev-parse", "--show-toplevel"]) || process.cwd();
  const base = process.argv[2] || git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]) || "HEAD~1";
  const changed = [...new Set([
    ...git(["diff", "--name-only", `${base}...HEAD`]).split("\n"),
    ...git(["diff", "--name-only", "HEAD"]).split("\n"),
    ...git(["ls-files", "--others", "--exclude-standard"]).split("\n"),
  ].filter(Boolean))];
  const testImports = {};
  for (const t of fs.readdirSync(path.join(root, "tests")).filter((f) => f.endsWith(".test.js"))) {
    testImports[`tests/${t}`] = testImportsFor(path.join(root, "tests", t), root);
  }
  const { DOGFOOD_SOURCES } = await import(path.join(root, "src/sample-data/dogfood-ap-sources.js"));
  const plan = planForChange({ changed, testImports, papers: DOGFOOD_SOURCES });

  console.log(`Changes since ${base}: ${changed.length} file(s)\n`);
  if (!plan.families.length) console.log("No architecture family touched — nothing to dogfood.");
  for (const f of plan.families) {
    console.log(`■ ${f.label}${f.breaking ? "   ⚠ can break pages it does not own" : ""}`);
    console.log(`  files:  ${f.files.join(", ")}`);
    if (f.id === "wiring") {
      const fns = git(["diff", "-U0", `${base}`, "--", "electron/main.js"]).split("\n").filter((l) => l.startsWith("@@")).map((l) => l.replace(/^@@[^@]*@@\s*/, "")).filter(Boolean);
      if (fns.length) console.log(`  main.js functions changed: ${[...new Set(fns)].slice(0, 20).join(" · ")}`);
    }
    console.log(`  unit:   ${f.tests.length ? `node --test ${f.tests.join(" ")}` : "(none)"}`);
    console.log(`  e2e:    ${f.e2e.length ? f.e2e.join(", ") : "(none)"}`);
    if (f.papers.length) for (const p of f.papers) console.log(`  paper:  ${p.id} — ${p.scenario}`);
    else console.log(`  paper:  none${f.noPaper ? ` (${f.noPaper})` : ""}`);
    console.log("");
  }
  if (plan.testsChanged.length) console.log(`Tests changed (run them): node --test ${plan.testsChanged.join(" ")}\n`);
  if (plan.broad) console.log("⚠ A breaking family changed: worth a broad round — the papers above, plus one paper from each family you use daily.\n");
  if (plan.unmapped.length) console.log(`Not in any family (add them to src/architecture-families.js): ${plan.unmapped.join(", ")}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) await main();
