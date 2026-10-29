#!/usr/bin/env node
/**
 * `npm run nav:check [-- <start> …]` — the navigation spine (plan 2026-10-24): runs every
 * `tests/probes/nav-spine-<start>.probe.js` (or only the starts named: home, lens, rail, drafts,
 * erp-link, find, board), one at a time through `run-probe.js` (each run in its own profile folder, so
 * the app may stay open), then prints the matrix — start × state × move, pass / FAIL / skipped — and each
 * failure's reasons (`src/nav-spine.js`). A change to navigation runs this before and after.
 * Each probe's output goes to `test-logs/nav-check/<stamp>/<probe>.log`, the matrix to `…/matrix.md`.
 * `NAV_ONLY=<cell id>,…` passes through to run single cells. `-- --ongoing` adds the long-session
 * run (`nav-spine-ongoing`: a scripted day, then the Drafts / Recent cells and the cruft check).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STARTS, parseCellLines, matrixMarkdown } from "../src/nav-spine.js";
import { parseCruftLines, cruftMarkdown } from "../src/nav-cruft.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const asked = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const unknown = asked.filter((s) => !STARTS.includes(s));
if (unknown.length) {
  console.error(`no such start: ${unknown.join(", ")} (starts: ${STARTS.join(", ")})`);
  process.exit(2);
}
const starts = asked.length ? asked : STARTS;
const ongoing = process.argv.includes("--ongoing");

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = path.join(ROOT, "test-logs", "nav-check", stamp);
fs.mkdirSync(outDir, { recursive: true });

const results = {};
let cruft = [];
const probes = [...starts.map((s) => `nav-spine-${s}`), ...(ongoing ? ["nav-spine-ongoing"] : [])];
for (const [i, probe] of probes.entries()) {
  process.stdout.write(`[${i + 1}/${probes.length}] ${probe} … `);
  const t0 = Date.now();
  const run = spawnSync(process.execPath, [path.join(ROOT, "scripts", "run-probe.js"), probe], {
    cwd: ROOT,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const log = `${run.stdout || ""}${run.stderr || ""}`;
  fs.writeFileSync(path.join(outDir, `${probe}.log`), log);
  const cells = parseCellLines(log);
  Object.assign(results, cells);
  cruft = cruft.concat(parseCruftLines(log));
  console.log(`${run.status === 0 ? "pass" : "FAIL"} — ${Object.keys(cells).length} cell(s), ${Math.round((Date.now() - t0) / 60000)} min`);
}

const { counts, markdown } = matrixMarkdown(results, { starts });
const summary = `${counts.pass} pass · ${counts.fail} fail · ${counts.skipped} skipped${counts.notRun ? ` · ${counts.notRun} not run` : ""}`;
const parts = [`# Nav check ${stamp}`, "", summary, "", markdown, ""];
if (ongoing) {
  const o = matrixMarkdown(results, { starts: ["drafts", "rail"], prefix: "ongoing:" });
  counts.fail += o.counts.fail;
  counts.notRun += o.counts.notRun;
  parts.push("## After a long session", "", `${o.counts.pass} pass · ${o.counts.fail} fail${o.counts.notRun ? ` · ${o.counts.notRun} not run` : ""}`, "", o.markdown, "", cruftMarkdown(cruft) || "No cruft check ran.", "");
  if (cruft.some((c) => c.label === "after a restart" && c.found.length)) counts.fail += 1;
}
const md = parts.join("\n");
fs.writeFileSync(path.join(outDir, "matrix.md"), md);
console.log(`\n${md}\nWritten to ${path.relative(ROOT, outDir)}/`);
process.exit(counts.fail || counts.notRun ? 1 : 0);
