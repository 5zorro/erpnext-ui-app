/**
 * Plan 2026-10-26 step 2: where spec and probe time goes (`npm run test:times`). Each test's time
 * splits into work, its own waits and chaos lag (5zorro 2026-10-26: "can a certain part be classed
 * as 'intentional slowness' or 'performance processing slowness'").
 *
 * @covers src/test-times.js scripts/test-times.js e2e/test-timing.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseRunLogTimes, summarizeTimes, timesReportText, workMs } from "../src/test-times.js";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

const LOG_PLAIN = `# probe run 2026-10-26T05:05:01.116Z at abc: passed
# scope: probe tests/probes/df03-item-table.probe.js #70409d4d
PASSED t.probe.js › T-2 (bill) (22000 ms) timing={"launch":3000,"appReady":1000,"formLoaded":6000,"waits":5000}
FAILED t.probe.js › T-1 (bill) (30000 ms)
    Error: expected 3
PASSED t.probe.js › T-3 (bill) (80000 ms) timing={"chaosMode":"1200ms/100%","launch":3000,"waits":15000,"chaosClock":60000}
`;

describe("test:times — reading the run logs", () => {
  it("reads each test's line with its timing; an older line without one still counts", () => {
    const rows = parseRunLogTimes(LOG_PLAIN);
    assert.deepEqual(rows.map((r) => [r.status, r.name, r.ms]), [
      ["passed", "t.probe.js › T-2 (bill)", 22000],
      ["failed", "t.probe.js › T-1 (bill)", 30000],
      ["passed", "t.probe.js › T-3 (bill)", 80000],
    ]);
    assert.equal(rows[0].timing.formLoaded, 6000);
    assert.equal(rows[1].timing, null);
  });

  it("a plain run's work is the total less the test's own waits", () => {
    assert.equal(workMs(22000, { waits: 5000 }), 17000);
    assert.equal(workMs(10000, null), 10000);
  });
});

describe("test:times — the summary", () => {
  it("a chaos-mode run is its own row, so its times are not mixed with the plain runs", () => {
    const chaosT2 = `PASSED t.probe.js › T-2 (bill) (60000 ms) timing={"chaosMode":"1200ms/100%","waits":5000,"chaosClock":50000}`;
    const rows = summarizeTimes([parseRunLogTimes(LOG_PLAIN), parseRunLogTimes(chaosT2)]);
    assert.deepEqual(rows.map((r) => r.name), [
      "t.probe.js › T-3 (bill) [chaos 1200ms/100%]",
      "t.probe.js › T-2 (bill) [chaos 1200ms/100%]",
      "t.probe.js › T-1 (bill)",
      "t.probe.js › T-2 (bill)",
    ]);
    const plain = rows.find((r) => r.name === "t.probe.js › T-2 (bill)");
    assert.deepEqual(plain.split, { runs: 1, waits: 5000, work: 17000, stages: { launch: 3000, appReady: 1000, formLoaded: 6000 } });
    // Chaos is compared with the plain runs, not subtracted: some delay runs nearly all the time.
    const chaos = rows.find((r) => r.name === "t.probe.js › T-2 (bill) [chaos 1200ms/100%]");
    assert.equal(chaos.vsPlain, 38000);
    assert.equal(chaos.split.chaosClock, 50000);
  });

  it("an untimed run (logged before the split) is not taken for a plain run", () => {
    const old = parseRunLogTimes("PASSED t › T-3 (70000 ms)");
    const chaos = parseRunLogTimes(`PASSED t › T-3 (80000 ms) timing={"chaosMode":"1200ms/100%","waits":15000}`);
    const row = summarizeTimes([old, chaos]).find((r) => r.chaos);
    assert.equal(row.vsPlain, null);
    assert.match(timesReportText([row]), /chaos delays not measured · waits 15\.0 s · no plain run logged to compare/);
  });

  it("medians over the runs; latest is the newest", () => {
    const run = (ms) => parseRunLogTimes(`PASSED a › b (${ms} ms) timing={"waits":1000}`);
    const [row] = summarizeTimes([run(10000), run(30000), run(20000)]);
    assert.equal(row.median, 20000);
    assert.equal(row.latest, 20000);
    assert.equal(row.runs, 3);
  });

  it("the report gives the split, and says what has no split yet", () => {
    const text = timesReportText(summarizeTimes([parseRunLogTimes(LOG_PLAIN)]));
    assert.match(text, /80\.0 s {2}t\.probe\.js › T-3 \(bill\) \[chaos 1200ms\/100%\]/);
    assert.match(text, /work 17\.0 s · waits 5\.0 s — stages: launch 3\.0 s, appReady 1\.0 s, formLoaded 6\.0 s/);
    assert.match(text, /a chaos delay running 60\.0 s of it · waits 15\.0 s · no plain run logged to compare/);
    assert.match(text, /T-1 \(bill\) {2}\(1 run, latest 30\.0 s\)\n {8}\(no split logged yet\)/);
  });
});

describe("test:times — where the numbers come from", () => {
  it("launch, app ready, a form loading, the clerk's login and a probe's sleep are timed; chaos lag is one delay per call", () => {
    assert.match(read("../e2e/helpers.js"), /setTimingLabel\("chaosMode"[\s\S]*timed\("launch"[\s\S]*timed\("appReady"/);
    assert.match(read("../tests/probes/probe-helpers.js"), /noteWait\(ms\)[\s\S]*timed\("formLoaded"/);
    assert.match(read("../tests/probes/probe-user.js"), /timed\("clerkLogin"/);
    const main = read("../electron/main.js");
    // One chaos delay per call (museum OI-191): erpEval's, which a bridge call ends in.
    assert.equal(main.match(/await maybeChaosLag\(/g).length, 1);
    assert.match(main, /noteChaosLag\(chaosChannel, await maybeChaosLag\(chaosChannel\), caller\);/);
    // The reporter adds the chaos clock from the app's spans and writes the timing on the line.
    const reporter = read("../scripts/playwright-run-log.js");
    assert.match(reporter, /if \(timing\.chaosMode\) timing\.chaosClock = chaosClock;/);
    assert.match(reporter, /timing=\$\{r\.timing\}/);
  });
});
