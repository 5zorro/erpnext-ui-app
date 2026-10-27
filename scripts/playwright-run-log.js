/**
 * A Playwright reporter that logs every spec run (`playwright.config.js`) and probe run
 * (`tests/probes/playwright.config.js`) the way `npm test` logs its own: a run log in
 * `test-logs/runs/` and a line in `test-logs/runs.tsv` per repeat, so `npm run test:flaky` sees a
 * spec or probe that failed and passed on the same code. It prints nothing; the config's own
 * reporter does. A `--reporter=…` on the command line replaces the config's reporters, this one too.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { playwrightRunRows, playwrightScope } from "../src/test-run-log.js";
import { parseSpansFile, testChart, traceFileName } from "../src/test-trace.js";
import { ROOT, RUNS_DIR, codeFingerprint, recordRuns, runLogName } from "./test-run-record.js";

const sha1 = (text) => crypto.createHash("sha1").update(text).digest("hex");
const plain = (text) => String(text || "").replace(/\x1b\[[0-9;]*m/g, "");

/** `e2e/scaffold-bill.spec.js › scaffold: Doc Bill view › P1 / OI-171: …` */
function nameOf(test) {
  const titles = [];
  for (let s = test.parent; s && s.type === "describe"; s = s.parent) titles.unshift(s.title);
  return [path.relative(ROOT, test.location.file), ...titles, test.title].join(" › ");
}

const TRACES = path.join(ROOT, "test-logs", "traces");

/**
 * Plan 2026-10-26 step 2b, at the test's end (passed, failed or timed out): its timeline chart from
 * its own spans and the app's (`test-spans.jsonl` in the run's profile folder), written to
 * `test-logs/traces/` — never `test-results/`, which Playwright empties at the start of a spec run.
 * Returns the test's timing with `chaosClock` added when the test ran under chaos mode.
 */
function chartTest(test, result) {
  const notes = [...(result.annotations || []), ...(test.annotations || [])];
  const timingText = notes.find((a) => a.type === "timing")?.description || "";
  try {
    const testSpans = JSON.parse(notes.find((a) => a.type === "spans")?.description || "[]");
    const file = process.env.ERP_USER_DATA_DIR && path.join(process.env.ERP_USER_DATA_DIR, "test-spans.jsonl");
    const appSpans = file && fs.existsSync(file) ? parseSpansFile(fs.readFileSync(file, "utf8")) : [];
    if (!testSpans.length && !appSpans.length) return timingText;
    const start = new Date(result.startTime).getTime();
    const title = `${path.basename(test.location.file).replace(/\.(probe|spec)\.js$/, "")} ${test.title}`;
    const { trace, chaosClock } = testChart({ testSpans, appSpans, start, end: start + result.duration, title });
    fs.mkdirSync(TRACES, { recursive: true });
    fs.writeFileSync(path.join(TRACES, traceFileName(title)), JSON.stringify(trace));
    const timing = timingText ? JSON.parse(timingText) : {};
    if (timing.chaosMode) timing.chaosClock = chaosClock;
    return Object.keys(timing).length ? JSON.stringify(timing) : "";
  } catch {
    return timingText; // a chart is a convenience; never lose the run log over it
  }
}

export default class PlaywrightRunLog {
  /** @param {{ kind?: "e2e"|"probe" }} [opts] */
  constructor(opts = {}) {
    this.kind = opts.kind || "e2e";
    /** @type {Map<string, { name: string, repeat: number, status: string, ms: number, error: string }>} */
    this.results = new Map();
  }

  printsToStdio() {
    return false;
  }

  onBegin(config, suite) {
    this.started = new Date();
    this.code = codeFingerprint();
    this.scope = playwrightScope(this.kind, suite.allTests().map(nameOf), sha1);
  }

  onTestEnd(test, result) {
    // The last result is the test's outcome (a retry replaces the try before it).
    this.results.set(test.id, {
      name: nameOf(test),
      repeat: test.repeatEachIndex,
      status: result.status,
      ms: result.duration,
      // e2e/test-timing.js: stages, the test's own waits and chaos lag (plan 2026-10-26 step 2).
      timing: chartTest(test, result),
      error: plain(result.error && (result.error.message || result.error.value)).split("\n").slice(0, 6).join("\n"),
    });
  }

  onEnd(result) {
    if (!this.started) return;
    const results = [...this.results.values()];
    const log = runLogName(this.started, this.code.commit, `${this.kind}.log`);
    try {
      fs.mkdirSync(RUNS_DIR, { recursive: true });
      const lines = [`# ${this.kind} run ${this.started.toISOString()} at ${this.code.fingerprint}: ${result.status}`, `# scope: ${this.scope}`];
      for (const r of results) {
        lines.push(`${r.status.toUpperCase()} ${r.name}${r.repeat ? ` [repeat ${r.repeat}]` : ""} (${r.ms} ms)${r.timing ? ` timing=${r.timing}` : ""}`);
        if (r.error) lines.push(r.error.replace(/^/gm, "    "));
      }
      fs.writeFileSync(path.join(RUNS_DIR, log), lines.join("\n") + "\n");
      recordRuns(
        playwrightRunRows(results, {
          time: this.started.toISOString(),
          ...this.code,
          log,
          scope: this.scope,
          interrupted: result.status === "interrupted",
        }),
      );
      if (results.some((r) => r.status === "failed" || r.status === "timedOut")) console.log(`Run logged: test-logs/runs/${log}`);
    } catch (e) {
      console.error(`test-logs: could not log this run: ${e && e.message}`);
    }
  }
}
