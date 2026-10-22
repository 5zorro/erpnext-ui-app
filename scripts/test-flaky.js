#!/usr/bin/env node
/**
 * `npm run test:flaky` — tests that both failed and passed on the same code, from
 * `test-logs/runs.tsv` (plan 2026-10-19 § Test-run log).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseRunsTsv, findFlakyTests, flakyReportText } from "../src/test-run-log.js";

export const LOG_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "test-logs");

/** The report as text, read fresh from `runs.tsv`. */
export function flakyReport() {
  let text = "";
  try {
    text = fs.readFileSync(path.join(LOG_DIR, "runs.tsv"), "utf8");
  } catch {
    /* no runs logged yet */
  }
  const rows = parseRunsTsv(text);
  return flakyReportText(findFlakyTests(rows), rows.length);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  console.log(flakyReport());
}
