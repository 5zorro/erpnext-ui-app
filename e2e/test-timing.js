/**
 * Where a spec's or probe's time goes (plan 2026-10-26 step 2). One `timing` annotation per test,
 * its description a JSON object of ms, added to as the test runs:
 * - stages: `launch` (start the app), `appReady` (main's test hooks up), `formLoaded` (a Doc form
 *   has ERPNext's document), `clerkLogin` (switching to a restricted probe user);
 * - `waits`: the test's own deliberate pauses (probe-helpers' `sleep`);
 * - `chaosClock`: the clock time chaos mode spent delaying calls in the app (main's running total,
 *   read at close; overlapping delays count once);
 * - `chaosMode`: "1200ms/100%" when the test ran under chaos mode, so its times are not mixed with
 *   the same test's plain runs.
 * The run-log reporter (scripts/playwright-run-log.js) writes it on the test's line;
 * `npm run test:times` summarises it (src/test-times.js).
 */
import { test } from "@playwright/test";

/** The test's `timing` annotation, made on first use; null outside a test. */
function timingNote() {
  let info;
  try {
    info = test.info();
  } catch {
    return null;
  }
  let note = info.annotations.find((a) => a.type === "timing");
  if (!note) {
    note = { type: "timing", description: "{}" };
    info.annotations.push(note);
  }
  return note;
}

/** Add `ms` to `key` (a restart's second launch adds to the first). */
export function addTiming(key, ms) {
  const note = timingNote();
  if (!note || !(ms >= 0)) return;
  const t = JSON.parse(note.description);
  t[key] = (t[key] || 0) + Math.round(ms);
  note.description = JSON.stringify(t);
}

/** Set a label on the test's timing (chaosMode). */
export function setTimingLabel(key, value) {
  const note = timingNote();
  if (!note) return;
  const t = JSON.parse(note.description);
  t[key] = value;
  note.description = JSON.stringify(t);
}

/** Run `fn`, adding its time to `key`, pass or fail. */
export async function timed(key, fn) {
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    addTiming(key, Date.now() - t0);
  }
}
