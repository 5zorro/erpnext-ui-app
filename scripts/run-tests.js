#!/usr/bin/env node
/**
 * `npm test` — the unit tests as before, plus a TAP copy of the run and a line in
 * `test-logs/runs.tsv`, so a failure that does not come back is still there to read
 * (plan 2026-10-19 § Test-run log). `test-logs/` is untracked.
 *
 * Extra arguments are passed to `node --test` in place of the default file list.
 *
 * The whole run (no arguments) ends with the lint check, `npm run lint` (eslint.config.js; plan
 * 2026-10-31, Step 4): a lint error fails `npm test` the way a failing unit test does, here and in CI.
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

/**
 * The lint check (eslint.config.js), for the whole run only. Its report is printed and also kept
 * in the run's log, and a lint failure counts in the run's row of runs.tsv like a failed test, so
 * `npm run test:flaky` and a later reader see it too.
 * @returns {Promise<{ ok: boolean, text: string }>}
 */
function runLint() {
  return new Promise((resolve) => {
    console.log("\nLint (npm run lint):");
    const lint = spawn(process.execPath, [path.join(ROOT, "node_modules", "eslint", "bin", "eslint.js"), "."], { cwd: ROOT });
    let text = "";
    const keep = (chunk) => {
      process.stdout.write(chunk);
      text += String(chunk);
    };
    lint.stdout.on("data", keep);
    lint.stderr.on("data", keep);
    lint.on("error", (e) => resolve({ ok: false, text: `${text}\n${e.message}` }));
    lint.on("exit", (code) => resolve({ ok: code === 0, text }));
  });
}

child.on("exit", async (status, signal) => {
  let tap = "";
  try {
    tap = fs.readFileSync(logPath, "utf8");
  } catch {
    /* the run died before writing */
  }
  const run = parseTapRun(tap, { root: ROOT });
  const lint = !signal && scope === "all" ? await runLint() : null;
  const failures = [...run.failures];
  if (lint && !lint.ok) {
    const problems = (lint.text.match(/✖ (\d+) problems?/) || [])[1];
    failures.push(`lint (npm run lint) › ${problems ? `${problems} problem(s)` : "did not run"}`);
    try {
      fs.appendFileSync(logPath, `\n# lint (npm run lint) failed:\n${lint.text.replace(/^/gm, "# ")}\n`);
    } catch {
      /* the log is a copy; the report was printed */
    }
  }
  recordRuns([
    {
      time: started.toISOString(),
      ...code,
      pass: run.pass ?? "",
      fail: run.fail == null ? "" : run.fail + (lint && !lint.ok ? 1 : 0),
      ms: Date.now() - started.getTime(),
      log: logName,
      failures,
      scope,
    },
  ]);
  if (failures.length) console.log(`\nRun logged: test-logs/runs/${logName}`);
  if (lint) console.log(lint.ok ? "Lint: clean." : "Lint: FAILED — see above (eslint.config.js says what each rule is for).");
  if (signal) process.exit(1);
  process.exit(status || (lint && !lint.ok ? 1 : 0) || (status ?? 1));
});
