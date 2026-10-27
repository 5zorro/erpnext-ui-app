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
 *
 * Step 2b: the same moments as spans, with the app's (ERPNext calls, chaos delays), make the test's
 * timeline chart: `test-results/traces/<test title>.json`, written each time the test closes its
 * app (e2e/helpers.js). Open it in Chrome DevTools' Performance panel (Load profile…) or Perfetto.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "@playwright/test";
import { traceEvents, traceFileName } from "../src/test-trace.js";

const TRACES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "test-results", "traces");
/** @type {Map<string, { group: string, name: string, start: number, end: number }[]>} by test id */
const spansByTest = new Map();

function currentTest() {
  try {
    return test.info();
  } catch {
    return null;
  }
}

/** A span on the test's timeline chart. */
export function addSpan(group, name, start, end) {
  const info = currentTest();
  if (!info) return;
  if (!spansByTest.has(info.testId)) spansByTest.set(info.testId, []);
  spansByTest.get(info.testId).push({ group, name, start, end });
}

/** A deliberate pause starting now: counted as the test's wait and charted. */
export function noteWait(ms) {
  addTiming("waits", ms);
  addSpan("waits", `sleep ${ms} ms`, Date.now(), Date.now() + ms);
}

/**
 * Write the test's chart with the app's spans so far (`appSpans`, read as the app closes). A restart
 * closes twice: the second write has both apps' spans.
 */
export function writeTrace(appSpans) {
  const info = currentTest();
  if (!info) return;
  const mine = spansByTest.get(info.testId) || [];
  mine.push(...appSpans);
  spansByTest.set(info.testId, mine);
  try {
    fs.mkdirSync(TRACES, { recursive: true });
    fs.writeFileSync(path.join(TRACES, traceFileName(info.title)), JSON.stringify(traceEvents(mine, { title: info.title })));
  } catch {
    /* a chart is a convenience; never fail a test over it */
  }
}

/** The test's `timing` annotation, made on first use; null outside a test. */
function timingNote() {
  const info = currentTest();
  if (!info) return null;
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
    addSpan("test", key, t0, Date.now());
  }
}
