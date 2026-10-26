/**
 * Writing a run into `test-logs/`, shared by `npm test` (`scripts/run-tests.js`) and the Playwright
 * runs — specs and probes (`scripts/playwright-run-log.js`): the code fingerprint, a line in
 * `runs.tsv`, and rotating the run logs (plan 2026-10-19 § Test-run log). `test-logs/` is untracked.
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runRowToTsv, RUN_COLUMNS, appendCapped, logsToRotate } from "../src/test-run-log.js";
import { flakyReport, LOG_DIR } from "./test-flaky.js";

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const RUNS_DIR = path.join(LOG_DIR, "runs");
const KEEP_LOGS = 50;
const HISTORY_MAX_BYTES = 64 * 1024;

const git = (...args) => {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "buffer", maxBuffer: 256 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : Buffer.alloc(0);
};

/** Commit + uncommitted diff + untracked files: two runs share it only if the code was the same. */
export function codeFingerprint() {
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

/** A run log's file name: the start time first, so names sort by time. */
export function runLogName(started, commit, ext) {
  return `${started.toISOString().replace(/[:.]/g, "-")}-${commit}.${ext}`;
}

/** Append rows to `runs.tsv` (its header first if new), then rotate the logs. */
export function recordRuns(rows) {
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  const tsvPath = path.join(LOG_DIR, "runs.tsv");
  if (!fs.existsSync(tsvPath)) fs.writeFileSync(tsvPath, RUN_COLUMNS.join("\t") + "\n");
  fs.appendFileSync(tsvPath, rows.map((r) => runRowToTsv(r) + "\n").join(""));
  try {
    rotateLogs();
  } catch (e) {
    console.error(`test-logs: rotation failed: ${e && e.message}`);
  }
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
