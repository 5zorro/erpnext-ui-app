/**
 * A test's timeline in Chrome's trace event format (plan 2026-10-26 step 2b), for 5zorro's Gantt
 * view: open the file in Chrome DevTools' Performance panel (Load profile…) or Perfetto. Spans come
 * from the test side (e2e/test-timing.js: stages, deliberate waits) and the app (main.js, in test
 * runs only: ERPNext calls, chaos delays). Names only — never document contents or scripts.
 *
 * The viewers need spans on one lane to nest, so overlapping spans of a group (parallel calls,
 * parallel chaos delays) are spread over extra lanes: "chaos lag", "chaos lag 2", …
 */

/** @typedef {{ group: string, name: string, start: number, end: number }} Span  ms since the epoch */

/** Lane order, top to bottom; a group not listed goes after. */
export const TRACE_GROUPS = ["test", "waits", "ERPNext calls", "chaos lag"];

/**
 * Spread one group's spans over lanes: each goes on the first lane that is free when it starts.
 * Spans that only nest are not split (a viewer draws a span inside another).
 * @param {Span[]} spans
 * @returns {number[]} lane per span, same order
 */
export function assignLanes(spans) {
  const order = spans.map((s, i) => i).sort((a, b) => spans[a].start - spans[b].start || spans[b].end - spans[a].end);
  /** @type {number[][]} each lane's open spans' ends, innermost last */
  const lanes = [];
  const out = new Array(spans.length);
  for (const i of order) {
    const s = spans[i];
    let lane = 0;
    for (; lane < lanes.length; lane += 1) {
      const open = lanes[lane];
      while (open.length && open[open.length - 1] <= s.start) open.pop();
      if (!open.length || s.end <= open[open.length - 1]) break; // free, or fully inside: nests
    }
    if (lane === lanes.length) lanes.push([]);
    lanes[lane].push(s.end);
    out[i] = lane;
  }
  return out;
}

/**
 * @param {Span[]} spans
 * @param {{ title?: string }} [opts]
 * @returns {{ traceEvents: object[], displayTimeUnit: "ms" }}
 */
export function traceEvents(spans, { title = "test" } = {}) {
  const t0 = spans.length ? Math.min(...spans.map((s) => s.start)) : 0;
  const groups = [...new Set(spans.map((s) => s.group))].sort((a, b) => rank(a) - rank(b));
  const events = [{ ph: "M", name: "process_name", pid: 1, tid: 0, args: { name: title } }];
  let tid = 0;
  for (const g of groups) {
    const mine = spans.filter((s) => s.group === g);
    const lanes = assignLanes(mine);
    const count = Math.max(0, ...lanes) + 1;
    for (let l = 0; l < count; l += 1) {
      const id = tid + l + 1;
      events.push({ ph: "M", name: "thread_name", pid: 1, tid: id, args: { name: l ? `${g} ${l + 1}` : g } });
      events.push({ ph: "M", name: "thread_sort_index", pid: 1, tid: id, args: { sort_index: id } });
    }
    mine.forEach((s, i) => {
      events.push({ ph: "X", name: s.name, cat: g, pid: 1, tid: tid + lanes[i] + 1, ts: Math.round((s.start - t0) * 1000), dur: Math.max(1, Math.round((s.end - s.start) * 1000)) });
    });
    tid += count;
  }
  return { traceEvents: events, displayTimeUnit: "ms" };
}

function rank(group) {
  const i = TRACE_GROUPS.indexOf(group);
  return i < 0 ? TRACE_GROUPS.length : i;
}

/** A file name from a test's title: letters, digits and dashes. */
export const traceFileName = (title) =>
  `${String(title || "test").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "test"}.json`;
