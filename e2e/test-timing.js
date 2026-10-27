/**
 * Where a spec's or probe's time goes (plan 2026-10-26 step 2). One `timing` annotation per test,
 * its description a JSON object of ms, added to as the test runs:
 * - stages: `launch` (start the app), `appReady` (main's test hooks up), `formLoaded` (a Doc form
 *   has ERPNext's document), `clerkLogin` (switching to a restricted probe user);
 * - `waits`: the test's own deliberate pauses (probe-helpers' `sleep`);
 * - `chaosMode`: "1200ms/100%" when the test ran under chaos mode, so its times are not mixed with
 *   the same test's plain runs.
 * The run-log reporter (scripts/playwright-run-log.js) adds `chaosClock` (the clock time a chaos
 * delay was running, from the app's spans), writes it on the test's line, and `npm run test:times`
 * summarises it (src/test-times.js).
 *
 * Step 2b: the same moments as spans (a `spans` annotation). The reporter adds the app's spans
 * (ERPNext calls, chaos delays: `test-spans.jsonl` in the run's profile folder) and writes the
 * test's timeline chart, `test-logs/traces/<test title>.json` — at the test's end, so a failed or
 * timed-out test gets one too. Open it in Chrome DevTools' Performance panel (Load profile…) or
 * Perfetto.
 */
import { test } from "@playwright/test";

function currentTest() {
  try {
    return test.info();
  } catch {
    return null;
  }
}

/** The test's annotation of this type, made on first use; null outside a test. */
function note(type, empty) {
  const info = currentTest();
  if (!info) return null;
  let n = info.annotations.find((a) => a.type === type);
  if (!n) {
    n = { type, description: empty };
    info.annotations.push(n);
  }
  return n;
}

/** A span on the test's timeline chart (ms since the epoch). */
export function addSpan(group, name, start, end) {
  const n = note("spans", "[]");
  if (!n) return;
  const spans = JSON.parse(n.description);
  spans.push({ group, name, start, end });
  n.description = JSON.stringify(spans);
}

/** A deliberate pause starting now: counted as the test's wait and charted. */
export function noteWait(ms) {
  addTiming("waits", ms);
  addSpan("waits", `sleep ${ms} ms`, Date.now(), Date.now() + ms);
}

/** Add `ms` to `key` (a restart's second launch adds to the first). */
export function addTiming(key, ms) {
  const n = note("timing", "{}");
  if (!n || !(ms >= 0)) return;
  const t = JSON.parse(n.description);
  t[key] = (t[key] || 0) + Math.round(ms);
  n.description = JSON.stringify(t);
}

/** Set a label on the test's timing (chaosMode). */
export function setTimingLabel(key, value) {
  const n = note("timing", "{}");
  if (!n) return;
  const t = JSON.parse(n.description);
  t[key] = value;
  n.description = JSON.stringify(t);
}

/** Run `fn`, adding its time to `key` and its span to the chart, pass or fail. */
export async function timed(key, fn) {
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    addTiming(key, Date.now() - t0);
    addSpan("test", key, t0, Date.now());
  }
}
