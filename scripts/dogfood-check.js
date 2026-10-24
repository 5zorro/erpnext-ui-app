#!/usr/bin/env node
/**
 * `npm run dogfood:check [-- <row> …]` — the check before 5zorro dogfoods (plan 10-19 § Dogfood
 * check and setup): runs every probe tagged `@dogfood <row>` (or only those for the rows named),
 * one at a time through `run-probe.js` (the app must be closed; prefs backed up and restored), then
 * prints the plan's *Dogfood residuals* table as pass / FAIL / yours. Probes that leave records run
 * too — this is for the sandbox (each one checks it is, before writing). Each probe's output goes to
 * `test-logs/dogfood-check/<stamp>/<probe>.log`, and the table to `…/table.md`.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { residualRows, dogfoodTags, checkTable } from "../src/dogfood-check.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLAN = path.join(ROOT, "docs", "implementation-plan-2026-10-19.md");
const PROBES = path.join(ROOT, "tests", "probes");

const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const rows = residualRows(fs.readFileSync(PLAN, "utf8"));

/** @type {Record<string, string[]>} */
const tagsByProbe = {};
for (const dir of [PROBES, path.join(PROBES, "leaves-records")]) {
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".probe.js"))) {
    const tags = dogfoodTags(fs.readFileSync(path.join(dir, f), "utf8"));
    if (tags.length) tagsByProbe[f.replace(/\.probe\.js$/, "")] = tags;
  }
}
const toRun = Object.keys(tagsByProbe).filter((p) => !only.length || tagsByProbe[p].some((t) => only.includes(t)));
if (!toRun.length) {
  console.error(only.length ? `no probe is tagged for: ${only.join(", ")}` : "no probe carries a @dogfood tag");
  process.exit(2);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = path.join(ROOT, "test-logs", "dogfood-check", stamp);
fs.mkdirSync(outDir, { recursive: true });

/** @type {Record<string, "pass"|"fail"|"not run">} */
const results = {};
for (const [i, probe] of toRun.entries()) {
  process.stdout.write(`[${i + 1}/${toRun.length}] ${probe} (${tagsByProbe[probe].join("; ")}) … `);
  const run = spawnSync(process.execPath, [path.join(ROOT, "scripts", "run-probe.js"), probe, "--leaves-records"], {
    cwd: ROOT,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  fs.writeFileSync(path.join(outDir, `${probe}.log`), `${run.stdout || ""}${run.stderr || ""}`);
  if (run.status === 3) {
    console.log("not run — the app is open; close it and run again");
    process.exit(3);
  }
  results[probe] = run.status === 0 ? "pass" : "fail";
  console.log(results[probe] === "pass" ? "pass" : `FAIL — ${path.relative(ROOT, path.join(outDir, `${probe}.log`))}`);
}

const shown = only.length ? rows.filter((r) => only.includes(r.id)) : rows;
const table = checkTable(shown, tagsByProbe, results);
// A tag that names no row is judged against the whole table, not the rows asked for.
table.orphanTags = checkTable(rows, tagsByProbe, results).orphanTags;
const c = table.counts;
const summary = `${c.pass} pass · ${c.fail} fail · ${c.yours} yours${c.notRun ? ` · ${c.notRun} not run` : ""}`;
const md = [`# Dogfood check ${stamp}`, "", summary, "", ...table.lines, ""];
if (table.orphanTags.length) md.push(`Tags naming no row in the plan: ${table.orphanTags.join(", ")}`, "");
md.push("*yours* = no probe: only a person can judge it (how it feels). A pass proves the behavior, not the feel.");
fs.writeFileSync(path.join(outDir, "table.md"), md.join("\n") + "\n");
console.log(`\n${md.join("\n")}\n\nWritten to ${path.relative(ROOT, outDir)}/`);
process.exit(c.fail ? 1 : 0);
