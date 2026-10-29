#!/usr/bin/env node
/**
 * `npm test` — the unit tests as before, plus a TAP copy of the run and a line in
 * `test-logs/runs.tsv`, so a failure that does not come back is still there to read
 * (plan 2026-10-19 § Test-run log). `test-logs/` is untracked.
 *
 * Extra arguments are passed to `node --test` in place of the default file list.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseTapRun } from "../src/test-run-log.js";
import { ROOT, RUNS_DIR, codeFingerprint, recordRuns, runLogName } from "./test-run-record.js";

const scope = process.argv.slice(2).length ? process.argv.slice(2).join(" ") : "all";
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs
      .readdirSync(path.join(ROOT, "tests"))
      .filter((f) => f.endsWith(".test.js"))
      .sort()
      .map((f) => path.join("tests", f));

fs.mkdirSync(RUNS_DIR, { recursive: true });
const code = codeFingerprint();
const started = new Date();
const logName = runLogName(started, code.commit, "tap");
const logPath = path.join(RUNS_DIR, logName);

const child = spawn(
  process.execPath,
  [
    "--test",
    "--test-reporter=spec",
    "--test-reporter-destination=stdout",
    "--test-reporter=tap",
    `--test-reporter-destination=${logPath}`,
    ...files,
  ],
  { cwd: ROOT, stdio: "inherit" },
);

// Ctrl+C reaches the test process too (same terminal); this one stays up to log the run as aborted.
process.on("SIGINT", () => {});

child.on("exit", (status, signal) => {
  let tap = "";
  try {
    tap = fs.readFileSync(logPath, "utf8");
  } catch {
    /* the run died before writing */
  }
  const run = parseTapRun(tap, { root: ROOT });
  recordRuns([
    {
      time: started.toISOString(),
      ...code,
      pass: run.pass ?? "",
      fail: run.fail ?? "",
      ms: Date.now() - started.getTime(),
      log: logName,
      failures: run.failures,
      scope,
    },
  ]);
  if (run.failures.length) console.log(`\nRun logged: test-logs/runs/${logName}`);
  process.exit(signal ? 1 : status ?? 1);
});
