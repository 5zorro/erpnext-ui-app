#!/usr/bin/env node
/**
 * `npm test` — the unit tests as before, plus a TAP copy of the run and a line in
 * `test-logs/runs.tsv`, so a failure that does not come back is still there to read
 * (plan 2026-10-19 § Test-run log). `test-logs/` is untracked.
 *
 * Extra arguments are passed to `node --test` in place of the default file list.
 */
import { spawnSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseTapRun,
  runRowToTsv,
  RUN_COLUMNS,
  appendCapped,
  logsToRotate,
} from "../src/test-run-log.js";
import { flakyReport, LOG_DIR } from "./test-flaky.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNS_DIR = path.join(LOG_DIR, "runs");
const KEEP_LOGS = 50;
const HISTORY_MAX_BYTES = 64 * 1024;

const git = (...args) => {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "buffer", maxBuffer: 256 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : Buffer.alloc(0);
};

/** Commit + uncommitted diff + untracked files: two runs share it only if the code was the same. */
function codeFingerprint() {
  const commit = git("rev-parse", "--short", "HEAD").toString().trim() || "nogit";
  const diff = git("diff", "HEAD", "--binary");
  const untracked = git("ls-files", "-o", "--exclude-standard", "-z").toString().split("\0").filter(Boolean);
  if (!diff.length && !untracked.length) return { commit, dirty: 0, fingerprint: commit };
  const h = crypto.createHash("sha1").update(diff);
  for (const f of untracked.sort()) {
    h.update(f);
    try {
      h.update(fs.readFileSync(path.join(ROOT, f)));
    } catch {
      /* gone since listed */
    }
  }
  return { commit, dirty: 1, fingerprint: `${commit}+${h.digest("hex").slice(0, 10)}+` };
}

function rotateLogs() {
  const gone = logsToRotate(fs.readdirSync(RUNS_DIR), KEEP_LOGS);
  if (!gone.length) return;
  // Before anything is deleted: what the flaky report says while these logs still exist.
  const historyPath = path.join(LOG_DIR, "flaky-history.md");
  let current = "";
  try {
    current = fs.readFileSync(historyPath, "utf8");
  } catch {
    /* first entry */
  }
  const entry = `## ${new Date().toISOString()} — rotating ${gone.length} log(s)\n\nRemoved: ${gone.join(", ")}\n\n${flakyReport()}`;
  fs.writeFileSync(historyPath, appendCapped(current, entry, HISTORY_MAX_BYTES));
  for (const f of gone) fs.rmSync(path.join(RUNS_DIR, f), { force: true });
}

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
const logName = `${started.toISOString().replace(/[:.]/g, "-")}-${code.commit}.tap`;
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

child.on("exit", (status, signal) => {
  let tap = "";
  try {
    tap = fs.readFileSync(logPath, "utf8");
  } catch {
    /* the run died before writing */
  }
  const run = parseTapRun(tap, { root: ROOT });
  const tsvPath = path.join(LOG_DIR, "runs.tsv");
  if (!fs.existsSync(tsvPath)) fs.writeFileSync(tsvPath, RUN_COLUMNS.join("\t") + "\n");
  fs.appendFileSync(
    tsvPath,
    runRowToTsv({
      time: started.toISOString(),
      ...code,
      pass: run.pass ?? "",
      fail: run.fail ?? "",
      ms: Date.now() - started.getTime(),
      log: logName,
      failures: run.failures,
      scope,
    }) + "\n",
  );
  try {
    rotateLogs();
  } catch (e) {
    console.error(`test-logs: rotation failed: ${e && e.message}`);
  }
  if (run.failures.length) console.log(`\nRun logged: test-logs/runs/${logName}`);
  process.exit(signal ? 1 : status ?? 1);
});
