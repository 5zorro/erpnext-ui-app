/**
 * The unit-test run log (plan 2026-10-19 § Test-run log): read a run's TAP, find tests that both
 * failed and passed on the same code, and keep a capped history file.
 *
 * Pure — no fs, no git. `scripts/run-tests.js` and `scripts/test-flaky.js` do the I/O.
 */

/**
 * Failing tests in a Node TAP run, leaves only: a suite that failed because a test inside it did
 * (`failureType: 'subtestsFailed'`) is not a failure of its own.
 * @param {string} tap
 * @param {{ root?: string }} [opts] stripped from the front of each file path
 * @returns {{ pass: number|null, fail: number|null, failures: string[] }}
 */
export function parseTapRun(tap, opts = {}) {
  const lines = String(tap || "").split("\n");
  /** @type {string[]} */
  const stack = [];
  const failures = [];
  let pass = null;
  let fail = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sub = /^( *)# Subtest: (.*)$/.exec(line);
    if (sub) {
      const level = sub[1].length / 4;
      stack.length = level;
      stack[level] = sub[2];
      continue;
    }
    const notOk = /^( *)not ok \d+ - (.*?)(?: # .*)?$/.exec(line);
    if (notOk) {
      const indent = notOk[1].length;
      let location = "";
      let failureType = "";
      for (let j = i + 1; j < lines.length; j++) {
        const y = lines[j];
        if (y.trim() && !y.startsWith(" ".repeat(indent + 2))) break;
        const loc = /^\s*location: '(.*)'$/.exec(y);
        if (loc) location = loc[1];
        const ft = /^\s*failureType: '(.*)'$/.exec(y);
        if (ft) failureType = ft[1];
      }
      if (failureType === "subtestsFailed") continue;
      const file = fileOf(location, opts.root);
      const path = [...stack.slice(0, indent / 4), notOk[2]].map(unescapeTap);
      failures.push(file ? `${file} › ${path.join(" › ")}` : path.join(" › "));
      continue;
    }
    const total = /^# (pass|fail) (\d+)$/.exec(line);
    if (total) {
      if (total[1] === "pass") pass = Number(total[2]);
      else fail = Number(total[2]);
    }
  }
  return { pass, fail, failures };
}

/** @param {string} s */
function unescapeTap(s) {
  return s.replace(/\\#/g, "#").replace(/\\\\/g, "\\");
}

/** @param {string} location @param {string} [root] */
function fileOf(location, root) {
  const file = String(location || "").replace(/:\d+:\d+$/, "");
  if (!file) return "";
  const r = root ? String(root).replace(/\/?$/, "/") : "";
  return r && file.startsWith(r) ? file.slice(r.length) : file;
}

/** Columns of `runs.tsv`, in order. */
export const RUN_COLUMNS = Object.freeze([
  "time",
  "commit",
  "dirty",
  "fingerprint",
  "pass",
  "fail",
  "ms",
  "log",
  "failures",
  "scope",
]);

/** @param {Record<string, unknown>} row */
export function runRowToTsv(row) {
  return RUN_COLUMNS.map((c) => {
    const v = c === "failures" ? (row.failures || []).join(" | ") : row[c];
    return String(v ?? "").replace(/[\t\n]/g, " ");
  }).join("\t");
}

/** @param {string} text the whole `runs.tsv` @returns {Array<Record<string, any>>} */
export function parseRunsTsv(text) {
  return String(text || "")
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("time\t"))
    .map((l) => {
      const cells = l.split("\t");
      /** @type {Record<string, any>} */
      const row = {};
      RUN_COLUMNS.forEach((c, i) => {
        row[c] = cells[i] ?? "";
      });
      row.failures = row.failures ? String(row.failures).split(" | ") : [];
      row.fail = Number(row.fail) || 0;
      row.pass = Number(row.pass) || 0;
      return row;
    });
}

/**
 * A test is flaky when, on the same code (one fingerprint) and the same set of test files (one
 * scope), it failed in one run and passed in another. A run of other files never ran the test, so
 * it says nothing about it; a run whose counts are missing did not finish, so neither does it.
 * @param {Array<Record<string, any>>} rows
 * @returns {Array<{ test: string, fingerprint: string, commit: string, failed: number, runs: number, lastFailed: string, logs: string[] }>}
 */
export function findFlakyTests(rows) {
  /** @type {Map<string, Array<Record<string, any>>>} */
  const byPrint = new Map();
  for (const r of rows) {
    if (!r.fingerprint || !(r.pass > 0 || r.fail > 0)) continue;
    const key = `${r.fingerprint}\t${r.scope || "all"}`;
    if (!byPrint.has(key)) byPrint.set(key, []);
    byPrint.get(key).push(r);
  }
  const out = [];
  for (const [key, runs] of byPrint) {
    const fingerprint = key.split("\t")[0];
    if (runs.length < 2) continue;
    const names = new Set(runs.flatMap((r) => r.failures));
    for (const test of names) {
      const failedIn = runs.filter((r) => r.failures.includes(test));
      if (failedIn.length === runs.length) continue; // failed every time: broken, not flaky
      out.push({
        test,
        fingerprint,
        commit: runs[0].commit,
        failed: failedIn.length,
        runs: runs.length,
        lastFailed: failedIn[failedIn.length - 1].time,
        logs: failedIn.map((r) => r.log).filter(Boolean),
      });
    }
  }
  return out.sort((a, b) => String(b.lastFailed).localeCompare(String(a.lastFailed)));
}

/**
 * The `test:flaky` report as plain text.
 * @param {ReturnType<typeof findFlakyTests>} flaky
 * @param {number} runCount
 */
export function flakyReportText(flaky, runCount) {
  if (!flaky.length) return `No flaky tests in ${runCount} logged run(s).`;
  const lines = [`${flaky.length} flaky test(s) in ${runCount} logged run(s):`];
  for (const f of flaky) {
    lines.push(
      `- ${f.test}\n  failed ${f.failed} of ${f.runs} runs at ${f.commit}${f.fingerprint.endsWith("+") ? " (with changes)" : ""}; last ${f.lastFailed}; logs: ${f.logs.join(", ") || "(rotated away)"}`,
    );
  }
  return lines.join("\n");
}

/** Marks where each history entry starts, so the cap can drop whole entries. */
export const HISTORY_ENTRY_MARK = "\n## ";

/**
 * Append one entry and cut whole entries off the top until the text fits in `maxBytes`. The
 * newest entry is always kept, even if it alone is over the cap.
 * @param {string} current
 * @param {string} entry starts with "## "
 * @param {number} maxBytes
 */
export function appendCapped(current, entry, maxBytes) {
  const header = "# Flaky-test history\n\nOne entry each time run logs are rotated away: the `npm run test:flaky` report just before. Oldest entries are cut first.\n";
  const text = "\n" + String(current || "");
  const first = text.indexOf(HISTORY_ENTRY_MARK);
  const body = first >= 0 ? text.slice(first + 1) : "";
  const entries = body.split(/\n(?=## )/).map((e) => e.trim()).filter(Boolean);
  entries.push(String(entry).trim());
  const size = (list) => Buffer.byteLength(header + "\n" + list.join("\n\n") + "\n");
  while (entries.length > 1 && size(entries) > maxBytes) entries.shift();
  return header + "\n" + entries.join("\n\n") + "\n";
}

/**
 * Which run logs to delete: everything past the newest `keep`. Names sort by time (they start
 * with an ISO timestamp).
 * @param {string[]} names @param {number} keep
 */
export function logsToRotate(names, keep) {
  const sorted = [...names].filter((n) => n.endsWith(".tap")).sort();
  return sorted.slice(0, Math.max(0, sorted.length - keep));
}
