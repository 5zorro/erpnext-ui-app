/**
 * Plan 2026-10-26 step 2b: a test's timeline as a chart (5zorro: "a gantt chart works for me as i
 * understand shapes best"), in Chrome's trace event format so DevTools or Perfetto draws it.
 *
 * @covers src/test-trace.js e2e/test-timing.js scripts/playwright-run-log.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assignLanes, traceEvents, traceFileName, testChart, parseSpansFile } from "../src/test-trace.js";

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

describe("test trace: one test's chart, built at its end", () => {
  it("keeps the app's spans inside the test's time; the chaos clock counts overlap once, cut to the test", () => {
    const appSpans = [
      span("ERPNext calls", "before", 0, 900),
      span("chaos lag", "setRow (bridge)", 900, 1600),
      span("chaos lag", "loadLinkList (erpEval)", 1200, 2000),
      span("ERPNext calls", "setRow", 900, 2100),
      span("ERPNext calls", "next test", 6000, 7000),
    ];
    const { trace, chaosClock } = testChart({ testSpans: [span("test", "launch", 1000, 1200)], appSpans, start: 1000, end: 5000, title: "df03 T-3" });
    const bars = trace.traceEvents.filter((e) => e.ph === "X").map((e) => e.name);
    assert.deepEqual(bars.sort(), ["launch", "loadLinkList (erpEval)", "setRow", "setRow (bridge)"]);
    assert.equal(chaosClock, 1000); // 1000–2000, the part inside the test
  });

  it("reads the app's spans file, skipping a line torn by a crash", () => {
    assert.deepEqual(parseSpansFile('{"group":"chaos lag","name":"a","start":1,"end":2}\n{"group":"ERPN'), [{ group: "chaos lag", name: "a", start: 1, end: 2 }]);
  });
});

describe("test trace: where the spans come from", () => {
  it("the app appends its ERPNext calls and chaos delays to the run's folder, in test runs only; the reporter charts every test's end", () => {
    const main = read("../electron/main.js");
    assert.match(main, /function noteTestSpan\(group, name, start, end = Date\.now\(\)\) \{\n  if \(process\.env\.E2E !== "1" \|\| !process\.env\.ERP_USER_DATA_DIR\) return;/);
    assert.match(main, /"test-spans\.jsonl"/);
    assert.match(main, /noteTestSpan\("chaos lag", callName \? `\$\{callName\} \(\$\{channel\}\)` : channel, end - ms, end\)/);
    assert.match(main, /noteTestSpan\("ERPNext calls", method, start\)/);
    // An erpEval bar is named by its caller (a bridge call by its method), not just "erpEval".
    assert.match(main, /const caller = bridgeMethod \|\| testCallerName\(\);/);
    assert.match(main, /if \(!bridgeMethod\) noteTestSpan\("ERPNext calls", caller \|\| chaosChannel, start\);/);
    const reporter = read("../scripts/playwright-run-log.js");
    assert.match(reporter, /timing: chartTest\(test, result\)/);
    assert.match(reporter, /path\.join\(ROOT, "test-logs", "traces"\)/);
    assert.match(read("../tests/probes/probe-helpers.js"), /noteWait\(ms\)/);
  });
});
