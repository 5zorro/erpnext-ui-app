/**
 * `npm run test:times` (plan 2026-10-26 step 2): where spec and probe time goes, read from the run
 * logs in `test-logs/runs/` (scripts/playwright-run-log.js writes each test's line with its timing,
 * e2e/test-timing.js). Each test's time splits (5zorro 2026-10-26: "intentional slowness" apart
 * from "performance processing slowness", so a chaos-mode run's cause is easier to see):
 * - **waits** — the test's own deliberate pauses;
 * - **work** — the rest of a plain run: the app and ERPNext actually working, the part worth
 *   making faster;
 * - a **chaos-mode run is its own row**: how much of it a chaos delay was running (clock time,
 *   overlapping delays once: `addLagInterval` in src/erp-chaos-lag.js), and how much longer it
 *   took than the same test's plain runs. Work is not worked out there: under 100% chaos some
 *   delay is running nearly all the time (measured 2026-10-26: 75 s of a 78 s run), so subtracting
 *   it says nothing; the plain row is the comparison.
 * Plus the stages known so far: launch, appReady, formLoaded, clerkLogin.
 */

const LINE = /^(PASSED|FAILED|TIMEDOUT|SKIPPED|INTERRUPTED) (.+?)(?: \[repeat \d+\])? \((\d+) ms\)(?: timing=(\{.*\}))?$/;

/**
 * @param {string} text one run log
 * @returns {{ status: string, name: string, ms: number, timing: Record<string, any> | null }[]}
 */
export function parseRunLogTimes(text) {
  const out = [];
  for (const line of String(text || "").split("\n")) {
    const m = line.match(LINE);
    if (!m) continue;
    let timing = null;
    try {
      timing = m[4] ? JSON.parse(m[4]) : null;
    } catch {
      timing = null;
    }
    out.push({ status: m[1].toLowerCase(), name: m[2], ms: Number(m[3]), timing });
  }
  return out;
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

export const STAGES = ["launch", "appReady", "formLoaded", "clerkLogin"];

/** Work in a plain run = total − the test's own waits. */
export const workMs = (ms, timing) => Math.max(0, ms - ((timing && timing.waits) || 0));

/**
 * One row per test and mode (a chaos-mode run is its own row: "name [chaos 1200ms/100%]"), from the
 * passed and failed runs in log order (oldest first). Medians over the runs that carried a timing
 * for the split; the total's median over all.
 * @param {{ status: string, name: string, ms: number, timing: Record<string, any> | null }[][]} runs
 */
export function summarizeTimes(runs) {
  /** @type {Map<string, { name: string, base: string, chaos: boolean, totals: number[], timed: { ms: number, timing: Record<string, any> }[] }>} */
  const by = new Map();
  for (const run of runs) {
    for (const t of run) {
      if (t.status !== "passed" && t.status !== "failed") continue;
      const chaos = !!(t.timing && t.timing.chaosMode);
      const key = chaos ? `${t.name} [chaos ${t.timing.chaosMode}]` : t.name;
      if (!by.has(key)) by.set(key, { name: key, base: t.name, chaos, totals: [], timed: [] });
      const row = by.get(key);
      row.totals.push(t.ms);
      if (t.timing) row.timed.push({ ms: t.ms, timing: t.timing });
    }
  }
  const rows = [...by.values()].map((r) => {
    const of = (fn) => median(r.timed.map(fn));
    const stages = {};
    for (const s of STAGES) {
      const v = median(r.timed.filter((x) => x.timing[s] != null).map((x) => x.timing[s]));
      if (v != null) stages[s] = v;
    }
    const split = !r.timed.length
      ? null
      : r.chaos
        ? { runs: r.timed.length, waits: of((x) => x.timing.waits || 0), chaosClock: median(r.timed.filter((x) => x.timing.chaosClock != null).map((x) => x.timing.chaosClock)), stages }
        : { runs: r.timed.length, waits: of((x) => x.timing.waits || 0), work: of((x) => workMs(x.ms, x.timing)), stages };
    return { name: r.name, base: r.base, chaos: r.chaos, runs: r.totals.length, latest: r.totals[r.totals.length - 1], median: median(r.totals), split, vsPlain: null };
  });
  for (const r of rows) {
    if (!r.chaos) continue;
    // A run with no timing logged (before 2026-10-26) may have been chaos too: only timed runs count as plain.
    const plain = rows.find((p) => !p.chaos && p.name === r.base && p.split);
    r.vsPlain = plain ? r.median - plain.median : null;
  }
  return rows.sort((a, b) => b.median - a.median);
}

const sec = (ms) => `${(ms / 1000).toFixed(1)} s`;

/** @param {ReturnType<typeof summarizeTimes>} rows @param {{ top?: number }} [opts] */
export function timesReportText(rows, { top = 20 } = {}) {
  if (!rows.length) return "No spec or probe runs logged yet (test-logs/runs/).";
  const lines = [`Slowest first — median of the logged runs (${rows.length} test${rows.length === 1 ? "" : "s"}; showing ${Math.min(top, rows.length)}).`, ""];
  for (const r of rows.slice(0, top)) {
    lines.push(`${sec(r.median)}  ${r.name}  (${r.runs} run${r.runs === 1 ? "" : "s"}, latest ${sec(r.latest)})`);
    if (!r.split) {
      lines.push("        (no split logged yet)");
      continue;
    }
    const stages = Object.entries(r.split.stages).map(([k, v]) => `${k} ${sec(v)}`).join(", ");
    const tail = stages ? ` — stages: ${stages}` : "";
    if (r.chaos) {
      const vs = r.vsPlain == null ? "no plain run logged to compare" : `${r.vsPlain >= 0 ? "+" : "−"}${sec(Math.abs(r.vsPlain))} vs its plain runs`;
      const clock = r.split.chaosClock == null ? "chaos delays not measured" : `a chaos delay running ${sec(r.split.chaosClock)} of it`;
      lines.push(`        ${clock} · waits ${sec(r.split.waits)} · ${vs}${tail}`);
    } else {
      lines.push(`        work ${sec(r.split.work)} · waits ${sec(r.split.waits)}${tail}`);
    }
  }
  return lines.join("\n");
}
