import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseTapRun,
  runRowToTsv,
  parseRunsTsv,
  findFlakyTests,
  flakyReportText,
  appendCapped,
  logsToRotate,
  playwrightRunRows,
  playwrightScope,
  RUN_COLUMNS,
} from "../src/test-run-log.js";

/** Plan 2026-10-19 § Test-run log. */

// Shape of Node 24's TAP reporter: a suite that fails because a test inside it did.
const TAP = `TAP version 13
# Subtest: outer
    # Subtest: good
    ok 1 - good
      ---
      type: 'test'
      ...
    # Subtest: bad \\# one
    not ok 2 - bad \\# one
      ---
      type: 'test'
      location: '/repo/tests/a.test.js:3:49'
      failureType: 'testCodeFailure'
      ...
    1..2
not ok 1 - outer
  ---
  type: 'suite'
  location: '/repo/tests/a.test.js:3:1'
  failureType: 'subtestsFailed'
  ...
# Subtest: top bad
not ok 2 - top bad
  ---
  location: '/repo/tests/b.test.js:4:1'
  failureType: 'testCodeFailure'
  ...
1..2
# tests 3
# pass 1
# fail 2
`;

describe("parseTapRun", () => {
  it("names leaf failures with their file and suites, not the suite that only contains one", () => {
    const run = parseTapRun(TAP, { root: "/repo" });
    assert.deepEqual(run.failures, ["tests/a.test.js › outer › bad # one", "tests/b.test.js › top bad"]);
    assert.equal(run.pass, 1);
    assert.equal(run.fail, 2);
  });
  it("a run that never finished has no counts", () => {
    assert.deepEqual(parseTapRun("TAP version 13\n# Subtest: x\n"), { pass: null, fail: null, failures: [] });
  });
});

const row = (time, fingerprint, failures, extra = {}) => ({
  time,
  commit: fingerprint.split("+")[0],
  dirty: fingerprint.includes("+") ? 1 : 0,
  fingerprint,
  pass: 10,
  fail: failures.length,
  ms: 100,
  log: `${time}.tap`,
  failures,
  ...extra,
});

describe("runs.tsv", () => {
  it("round-trips a row, failures included", () => {
    const r = row("t1", "abc", ["a › b", "c"]);
    const text = RUN_COLUMNS.join("\t") + "\n" + runRowToTsv(r) + "\n";
    const back = parseRunsTsv(text);
    assert.equal(back.length, 1);
    assert.deepEqual(back[0].failures, ["a › b", "c"]);
    assert.equal(back[0].fingerprint, "abc");
  });
});

describe("findFlakyTests", () => {
  it("failed once and passed once on the same code is flaky", () => {
    const f = findFlakyTests([row("t1", "abc", ["x"]), row("t2", "abc", [])]);
    assert.equal(f.length, 1);
    assert.equal(f[0].test, "x");
    assert.equal(f[0].failed, 1);
    assert.equal(f[0].runs, 2);
  });
  it("failed, then passed after the code changed, is a fix, not flaky", () => {
    assert.deepEqual(findFlakyTests([row("t1", "abc+111+", ["x"]), row("t2", "abc+222+", [])]), []);
  });
  it("failing every run on the same code is broken, not flaky", () => {
    assert.deepEqual(findFlakyTests([row("t1", "abc", ["x"]), row("t2", "abc", ["x"])]), []);
  });
  it("a run of other test files says nothing about a test it did not run", () => {
    assert.deepEqual(findFlakyTests([row("t1", "abc", ["x"]), row("t2", "abc", [], { scope: "tests/y.test.js" })]), []);
    assert.equal(findFlakyTests([row("t1", "abc", ["x"]), row("t2", "abc", [], { scope: "all" })]).length, 1);
  });
  it("a run that never finished counts for nothing", () => {
    assert.deepEqual(findFlakyTests([row("t1", "abc", ["x"]), row("t2", "abc", [], { pass: 0, fail: 0 })]), []);
  });
  it("the report says when the code had uncommitted changes, and when nothing is flaky", () => {
    const text = flakyReportText(findFlakyTests([row("t1", "abc+1+", ["x"]), row("t2", "abc+1+", [])]), 2);
    assert.match(text, /1 flaky test\(s\) in 2 logged run\(s\)/);
    assert.match(text, /failed 1 of 2 runs at abc \(with changes\)/);
    assert.equal(flakyReportText([], 5), "No flaky tests in 5 logged run(s).");
  });
});

describe("appendCapped", () => {
  it("appends entries under one header", () => {
    const one = appendCapped("", "## e1\n\nfirst", 10_000);
    const two = appendCapped(one, "## e2\n\nsecond", 10_000);
    assert.equal(two.match(/^# Flaky-test history/gm).length, 1);
    assert.match(two, /## e1\n\nfirst\n\n## e2\n\nsecond\n$/);
  });
  it("past the cap, drops whole entries from the top, never part of one", () => {
    let text = "";
    for (let i = 1; i <= 20; i++) text = appendCapped(text, `## e${i}\n\n${"x".repeat(100)}`, 1000);
    assert.ok(Buffer.byteLength(text) <= 1000);
    assert.match(text, /## e20\n/);
    assert.doesNotMatch(text, /## e1\n/);
    const kept = text.match(/^## e\d+$/gm);
    for (const h of kept) assert.match(text, new RegExp(`${h}\\n\\nx{100}`));
  });
  it("keeps the newest entry even when it alone is over the cap", () => {
    const text = appendCapped("", `## big\n\n${"y".repeat(500)}`, 100);
    assert.match(text, /## big/);
  });
});

describe("logsToRotate", () => {
  it("removes the oldest past the newest `keep`, by name (ISO time first)", () => {
    const names = ["2026-10-21T10-00-00-000Z-a.tap", "2026-10-20T09-00-00-000Z-a.tap", "2026-10-21T11-00-00-000Z-b.tap", "notes.txt"];
    assert.deepEqual(logsToRotate(names, 2), ["2026-10-20T09-00-00-000Z-a.tap"]);
    assert.deepEqual(logsToRotate(names, 5), []);
  });
  it("Playwright's run logs (.log) rotate with npm test's (.tap)", () => {
    const names = ["2026-10-26T01-00-00-000Z-a.e2e.log", "2026-10-26T02-00-00-000Z-a.tap", "2026-10-26T03-00-00-000Z-a.probe.log"];
    assert.deepEqual(logsToRotate(names, 2), ["2026-10-26T01-00-00-000Z-a.e2e.log"]);
  });
});

describe("Playwright runs (specs and probes) in runs.tsv", () => {
  const fakeHash = (text) => String(text.length).padStart(8, "0") + "ffff";
  const A = "e2e/scaffold-bill.spec.js › Doc Bill view › void and amend";
  const B = "e2e/scaffold-bill.spec.js › Doc Bill view › mounts";
  const run = { time: "t1", commit: "abc", dirty: 0, fingerprint: "abc", log: "t1-abc.e2e.log", scope: "e2e x" };

  it("the scope names the kind and the spec files, and tells a -g run from a whole-file run", () => {
    const whole = playwrightScope("e2e", [B, A], fakeHash);
    assert.match(whole, /^e2e e2e\/scaffold-bill\.spec\.js #\w{8}$/);
    assert.equal(playwrightScope("e2e", [A, B], fakeHash), whole);
    assert.notEqual(playwrightScope("e2e", [A], fakeHash), whole);
  });

  it("one row per repeat: a test that fails in one repeat and passes in another is flaky", () => {
    const rows = playwrightRunRows(
      [
        { name: A, repeat: 0, status: "failed", ms: 20 },
        { name: B, repeat: 0, status: "passed", ms: 5 },
        { name: A, repeat: 1, status: "passed", ms: 18 },
        { name: B, repeat: 1, status: "skipped", ms: 0 },
      ],
      run,
    );
    assert.deepEqual(
      rows.map((r) => [r.pass, r.fail, r.ms, r.failures]),
      [
        [1, 1, 25, [A]],
        [1, 0, 18, []],
      ],
    );
    const back = parseRunsTsv(rows.map(runRowToTsv).join("\n"));
    assert.equal(findFlakyTests(back)[0].test, A);
  });

  it("a timeout is a failure; failing every repeat is broken, not flaky", () => {
    const rows = playwrightRunRows(
      [
        { name: A, repeat: 0, status: "timedOut", ms: 60_000 },
        { name: A, repeat: 1, status: "failed", ms: 20 },
      ],
      run,
    );
    assert.deepEqual(rows.map((r) => r.failures), [[A], [A]]);
    assert.deepEqual(findFlakyTests(parseRunsTsv(rows.map(runRowToTsv).join("\n"))), []);
  });

  it("an interrupted run has no counts, so it counts for nothing", () => {
    const [r] = playwrightRunRows([{ name: A, repeat: 0, status: "failed", ms: 1 }], { ...run, interrupted: true });
    assert.deepEqual([r.pass, r.fail], ["", ""]);
    assert.equal("interrupted" in r, false);
  });
});
