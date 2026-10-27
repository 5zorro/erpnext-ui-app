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
import { ROOT, RUNS_DIR, codeFingerprint, recordRuns, runLogName } from "./test-run-record.js";

const sha1 = (text) => crypto.createHash("sha1").update(text).digest("hex");
const plain = (text) => String(text || "").replace(/\x1b\[[0-9;]*m/g, "");

/** `e2e/scaffold-bill.spec.js › scaffold: Doc Bill view › P1 / OI-171: …` */
function nameOf(test) {
  const titles = [];
  for (let s = test.parent; s && s.type === "describe"; s = s.parent) titles.unshift(s.title);
  return [path.relative(ROOT, test.location.file), ...titles, test.title].join(" › ");
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
      timing: [...(result.annotations || []), ...(test.annotations || [])].find((a) => a.type === "timing")?.description || "",
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
