/**
 * Plan 2026-10-26 step 2b: a test's timeline as a chart (5zorro: "a gantt chart works for me as i
 * understand shapes best"), in Chrome's trace event format so DevTools or Perfetto draws it.
 *
 * @covers src/test-trace.js e2e/test-timing.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assignLanes, traceEvents, traceFileName } from "../src/test-trace.js";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const span = (group, name, start, end) => ({ group, name, start, end });

describe("test trace: lanes", () => {
  it("overlapping delays go on extra lanes; one after another share a lane", () => {
    const lanes = assignLanes([span("chaos lag", "bridge", 0, 1000), span("chaos lag", "erpEval", 200, 1200), span("chaos lag", "bridge", 1100, 1500), span("chaos lag", "bridge", 1300, 1600)]);
    assert.deepEqual(lanes, [0, 1, 0, 1]);
  });

  it("a span wholly inside another stays on its lane (the viewer nests it)", () => {
    assert.deepEqual(assignLanes([span("test", "launch", 0, 1000), span("test", "x", 100, 200)]), [0, 0]);
  });
});

describe("test trace: the file", () => {
  it("names each lane, orders the groups, and gives times in µs from the first span", () => {
    const t = traceEvents(
      [span("chaos lag", "bridge", 1000, 2000), span("chaos lag", "bridge", 1500, 2500), span("test", "launch", 1000, 1500), span("waits", "sleep", 1500, 3000)],
      { title: "T-3 (bill)" },
    );
    const names = t.traceEvents.filter((e) => e.name === "thread_name").map((e) => [e.tid, e.args.name]);
    assert.deepEqual(names, [[1, "test"], [2, "waits"], [3, "chaos lag"], [4, "chaos lag 2"]]);
    const bars = t.traceEvents.filter((e) => e.ph === "X").map((e) => [e.name, e.tid, e.ts, e.dur]);
    assert.deepEqual(bars, [["launch", 1, 0, 500000], ["sleep", 2, 500000, 1500000], ["bridge", 3, 0, 1000000], ["bridge", 4, 500000, 1000000]]);
    assert.equal(t.traceEvents[0].args.name, "T-3 (bill)");
  });

  it("a file name from the test's title", () => {
    assert.equal(traceFileName("T-3 (bill): two quick Tabs"), "T-3-bill-two-quick-Tabs.json");
  });
});

describe("test trace: where the spans come from", () => {
  it("the app charts ERPNext calls and chaos delays in test runs only, and hands them over at close", () => {
    const main = read("../electron/main.js");
    assert.match(main, /function noteTestSpan\(group, name, start, end = Date\.now\(\)\) \{\n  if \(process\.env\.E2E !== "1"/);
    assert.match(main, /noteTestSpan\("chaos lag", channel, end - ms, end\)/);
    assert.match(main, /noteTestSpan\("ERPNext calls", method, start\)/);
    assert.match(main, /traceSpans: \(\) => testTraceSpans\.slice\(\)/);
    assert.match(read("../e2e/helpers.js"), /writeTrace\(got\.spans\)/);
    assert.match(read("../tests/probes/probe-helpers.js"), /noteWait\(ms\)/);
  });
});
