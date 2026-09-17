import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isIsoDate,
  resolveCheckRun,
  checkRunSplits,
  classifyForRun,
  describeRunPlacement,
  describeCheckRun,
  summarizeCheckRun,
} from "../src/check-run-schedule.js";

const TODAY = "2026-09-14"; // Monday
const sched = (over = {}) => ({ nextRunDate: "2026-09-28", runIntervalDays: 14, runEarlyOn: "", ...over });

describe("check-run schedule: when no run is set", () => {
  // 5zorro 2026-09-14: "what happens if there has never been a 'next check run' date added to it?"
  it("is off with no usable date, and changes nothing on the dashboard", () => {
    for (const nextRunDate of ["", undefined, null, "09/28/2026", "2026-02-30"]) {
      const run = resolveCheckRun(sched({ nextRunDate }), TODAY);
      assert.equal(run.state, "off", String(nextRunDate));
      assert.equal(run.reason, "no-date");
      assert.deepEqual(checkRunSplits(run), [], "the engine gets no boundaries");
      assert.equal(classifyForRun("2026-09-20", run), null, "nothing is shaded or flagged");
    }
  });

  it("is off when the interval is not a whole number of days", () => {
    for (const runIntervalDays of [0, -7, 1.5, NaN, undefined, null]) {
      const run = resolveCheckRun(sched({ runIntervalDays }), TODAY);
      assert.equal(run.state, "off", String(runIntervalDays));
      assert.equal(run.reason, "no-interval");
    }
  });

  it("survives missing prefs and a junk today", () => {
    assert.equal(resolveCheckRun(null, TODAY).state, "off");
    assert.equal(resolveCheckRun(sched(), "nope").state, "off");
  });

  it("recognises real calendar dates only", () => {
    assert.equal(isIsoDate("2026-09-14"), true);
    for (const bad of ["2026-9-14", "2026-02-30", "", null, 20260914]) assert.equal(isIsoDate(bad), false, String(bad));
  });
});

describe("check-run schedule: an upcoming run", () => {
  const run = resolveCheckRun(sched(), TODAY);

  it("pays everything that would be late if it waited for the run after it", () => {
    assert.equal(run.state, "upcoming");
    assert.equal(run.runDate, "2026-09-28");
    assert.equal(run.cutoff, "2026-10-12");
    assert.equal(run.early, false);
    assert.equal(run.rolledFrom, "");
    assert.deepEqual(checkRunSplits(run), ["2026-09-28", "2026-10-12"]);
  });

  it("places each payment", () => {
    assert.equal(classifyForRun("2026-09-14", run), "off-cycle");
    assert.equal(classifyForRun("2026-09-27", run), "off-cycle", "the day before the run cannot wait for it");
    assert.equal(classifyForRun("2026-09-28", run), "this-run", "payable on the run date itself makes it");
    assert.equal(classifyForRun("2026-10-11", run), "this-run");
    assert.equal(classifyForRun("2026-10-12", run), "later", "the next run pays it on time");
    assert.equal(classifyForRun("2026-12-01", run), "later");
    assert.equal(classifyForRun("not a date", run), null);
  });

  it("crosses month and year ends", () => {
    const yearEnd = resolveCheckRun(sched({ nextRunDate: "2026-12-28" }), "2026-12-01");
    assert.equal(yearEnd.cutoff, "2027-01-11");
  });
});

describe("check-run schedule: run day, a passed date, and running early", () => {
  it("on the run date itself nothing is off-cycle — today is the run", () => {
    const run = resolveCheckRun(sched(), "2026-09-28");
    assert.equal(run.state, "run-day");
    assert.deepEqual(checkRunSplits(run), ["2026-10-12"]);
    assert.equal(classifyForRun("2026-09-01", run), "this-run", "overdue, but today's run pays it");
    assert.equal(classifyForRun("2026-10-12", run), "later");
  });

  // "What happens if you pass that date?"
  it("rolls a passed date forward by the interval, assuming those runs happened", () => {
    const run = resolveCheckRun(sched({ nextRunDate: "2026-09-14" }), "2026-10-01");
    assert.equal(run.state, "upcoming");
    assert.equal(run.runDate, "2026-10-12");
    assert.equal(run.cutoff, "2026-10-26");
    assert.equal(run.rolledFrom, "2026-09-14");
  });

  it("rolls exactly onto today as a run day", () => {
    const run = resolveCheckRun(sched({ nextRunDate: "2026-08-31" }), "2026-09-28");
    assert.equal(run.state, "run-day");
    assert.equal(run.runDate, "2026-09-28");
    assert.equal(run.rolledFrom, "2026-08-31");
  });

  // "What happens if the date hasn't happened yet, but i want to do a full check run anyway?"
  it("'Do this run today' makes today that run's day, with its cutoff unchanged", () => {
    const run = resolveCheckRun(sched({ runEarlyOn: TODAY }), TODAY);
    assert.equal(run.state, "run-day");
    assert.equal(run.early, true);
    assert.equal(run.runDate, "2026-09-28");
    assert.equal(run.cutoff, "2026-10-12");
    assert.equal(classifyForRun("2026-09-20", run), "this-run", "nothing is off-cycle once the run is today");
    assert.deepEqual(checkRunSplits(run), ["2026-10-12"]);
  });

  it("forgets an early run the next day", () => {
    const run = resolveCheckRun(sched({ runEarlyOn: "2026-09-13" }), TODAY);
    assert.equal(run.state, "upcoming");
    assert.equal(run.early, false);
  });

  it("an early press on the scheduled day itself is just the run day", () => {
    const run = resolveCheckRun(sched({ runEarlyOn: "2026-09-28" }), "2026-09-28");
    assert.equal(run.state, "run-day");
    assert.equal(run.early, false);
  });
});

describe("check-run schedule: what the clerk reads", () => {
  const run = resolveCheckRun(sched(), TODAY);

  it("an off-cycle payment says what to do, and by when", () => {
    const p = describeRunPlacement("off-cycle", run, { payOn: "2026-09-20", reason: "batch" });
    assert.equal(p.kind, "off-cycle");
    assert.equal(p.chip, "Off-cycle");
    assert.equal(
      p.line,
      "Off-cycle: it has to go out by 2026-09-20, before the 2026-09-28 check run. Cut it by hand, or it will be late.",
    );
  });

  it("says so when the payment date has already passed", () => {
    const p = describeRunPlacement("off-cycle", run, { payOn: "2026-09-10", reason: "pay-alone" });
    assert.match(p.line, /its 2026-09-10 payment date has already passed/);
  });

  it("names the discount when that is what is at stake", () => {
    const p = describeRunPlacement("off-cycle", run, { payOn: "2026-09-20", reason: "discount-capture" });
    assert.match(p.line, /or the discount is lost/);
  });

  it("a later-run payment is marked, with why its grouping is provisional", () => {
    const p = describeRunPlacement("later", run, { payOn: "2026-10-20" });
    assert.equal(p.chip, "Later run");
    assert.match(p.line, /on or after 2026-10-12/);
    assert.match(p.line, /can still change/);
  });

  it("the run's own payments carry no chip", () => {
    const p = describeRunPlacement("this-run", run, { payOn: "2026-09-30" });
    assert.equal(p.chip, "");
    assert.equal(p.line, "In the 2026-09-28 check run.");
    assert.equal(describeRunPlacement("this-run", resolveCheckRun(sched(), "2026-09-28"), {}).line, "In today's check run.");
    assert.match(describeRunPlacement("this-run", resolveCheckRun(sched({ runEarlyOn: TODAY }), TODAY), {}).line, /being done today \(scheduled for 2026-09-28\)/);
  });

  it("returns null when there is no placement", () => {
    assert.equal(describeRunPlacement(null, run, {}), null);
    assert.equal(describeRunPlacement("later", resolveCheckRun({}, TODAY), {}), null);
  });

  it("states the schedule in one sentence", () => {
    assert.equal(describeCheckRun(run), "Next check run 2026-09-28 pays everything due before 2026-10-12.");
    assert.equal(describeCheckRun(resolveCheckRun(sched(), "2026-09-28")), "Check run today pays everything due before 2026-10-12.");
    assert.equal(
      describeCheckRun(resolveCheckRun(sched({ runEarlyOn: TODAY }), TODAY)),
      "Doing the 2026-09-28 check run today — it pays everything due before 2026-10-12.",
    );
    assert.match(describeCheckRun(resolveCheckRun(sched({ nextRunDate: "2026-09-14" }), "2026-10-01")), /Rolled forward from 2026-09-14/);
    assert.match(describeCheckRun(resolveCheckRun({}, TODAY)), /No check run set/);
    assert.match(describeCheckRun(resolveCheckRun(sched({ runIntervalDays: 0 }), TODAY)), /how many days apart/);
  });

  it("counts and totals each placement", () => {
    const groups = [
      { payOn: "2026-09-20", totalAmount: 100.1 },
      { payOn: "2026-09-30", totalAmount: 200 },
      { payOn: "2026-09-29", totalAmount: 50.25 },
      { payOn: "2026-10-20", totalAmount: 5 },
    ];
    assert.deepEqual(summarizeCheckRun(groups, run), {
      offCycle: { count: 1, amount: 100.1 },
      thisRun: { count: 2, amount: 250.25 },
      later: { count: 1, amount: 5 },
    });
    assert.deepEqual(summarizeCheckRun(groups, resolveCheckRun({}, TODAY)).offCycle, { count: 0, amount: 0 });
  });
});
