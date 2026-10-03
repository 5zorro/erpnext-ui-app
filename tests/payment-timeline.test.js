import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { plannedCheckFor, paymentTimeline, writtenPaymentsFrom } from "../src/payment-timeline.js";
import { resolveCheckRun } from "../src/check-run-schedule.js";

// Fortnightly runs from Fri Oct 2, seen on Mon Sep 28 — the mockup's setting.
const run = resolveCheckRun({ nextRunDate: "2026-10-02", runIntervalDays: 14 }, "2026-09-28");

describe("plannedCheckFor — the Pay Outstanding rule", () => {
  it("puts a bill on the first run whose next run would be too late", () => {
    assert.deepEqual(plannedCheckFor("2026-10-05", run), { kind: "run", date: "2026-10-02" });
    assert.deepEqual(plannedCheckFor("2026-10-15", run), { kind: "run", date: "2026-10-02" });
    assert.deepEqual(plannedCheckFor("2026-10-16", run), { kind: "run", date: "2026-10-16" }, "due on the next run day waits for it");
    assert.deepEqual(plannedCheckFor("2026-10-24", run), { kind: "run", date: "2026-10-16" });
  });
  it("calls a bill that cannot wait for the run off-cycle", () => {
    assert.deepEqual(plannedCheckFor("2026-09-30", run), { kind: "off-cycle", date: "2026-09-30" });
  });
  it("is unscheduled when no run is set", () => {
    assert.equal(plannedCheckFor("2026-10-05", resolveCheckRun({}, "2026-09-28")).kind, "unscheduled");
  });
});

describe("paymentTimeline", () => {
  const invoices = [
    { key: "PI::276", total: 1480, open: 980, payBy: "2026-10-05" },
    { key: "PI::284", total: 820, open: 820, payBy: "2026-10-15" },
    { key: "PI::290", total: 1150, open: 1150, payBy: "2026-10-24" },
    { key: "PI::273", total: -45, open: -45, isCredit: true },
    { key: "PI::268", total: 888, open: 0, payBy: "2026-09-19" },
  ];
  const payments = [
    { key: "PE::4", ref: "Check 10452", date: "2026-08-27", total: 5000, cleared: "2026-09-03", refs: [{ invoiceKey: "PI::268", amount: 888 }] },
    { key: "PE::7", ref: "Check 10511", date: "2026-09-26", total: 500, cleared: "", refs: [{ invoiceKey: "PI::276", amount: 500 }] },
  ];
  const t = paymentTimeline({ invoices, payments, run, today: "2026-09-28" });

  it("lists planned checks newest first, without the paid-in-full bill", () => {
    assert.deepEqual(t.planned.map((p) => [p.date, p.items.map((i) => i.invoiceKey)]), [
      ["2026-10-16", ["PI::290"]],
      ["2026-10-02", ["PI::276", "PI::284", "PI::273"]],
    ]);
  });
  it("takes open credits off the first planned check", () => {
    assert.equal(t.planned[1].total, 1755);
  });
  it("lists checks written newest first, with whether the bank has seen them", () => {
    assert.deepEqual(t.written.map((w) => [w.ref, w.status]), [["Check 10511", "not-cleared"], ["Check 10452", "cleared"]]);
    assert.deepEqual(t.notCleared, { count: 1, total: 500, refs: ["Check 10511"] });
  });
  it("totals what is outstanding now", () => {
    assert.equal(t.outstanding, 2905);
  });
  it("gives each bill line every payment on it, oldest first, for the bar", () => {
    const docs = [{ ...payments[0] }, { key: "PE::9", ref: "Check 9", date: "2026-09-01", total: 100, cleared: "", refs: [{ invoiceKey: "PI::268", amount: 100 }] }];
    const t2 = paymentTimeline({ invoices: [], payments: docs, run, today: "2026-09-28" });
    assert.deepEqual(t2.written[1].items[0].all.map((x) => x.paymentKey), ["PE::4", "PE::9"]);
  });
});

describe("writtenPaymentsFrom", () => {
  it("reads a Payment Entry as a check: number, check date, clearance", () => {
    const [p] = writtenPaymentsFrom([{ doctype: "Payment Entry", name: "ACC-PAY-1", docstatus: 1, reference_no: "Check 10452", reference_date: "2026-08-27",
      posting_date: "2026-08-28", clearance_date: "2026-09-03", paid_amount: 5000,
      references: [{ reference_doctype: "Purchase Invoice", reference_name: "ACC-PINV-1", allocated_amount: 888 }] }]);
    assert.deepEqual(p, { key: "Payment Entry::ACC-PAY-1", ref: "Check 10452", date: "2026-08-27", total: 5000, cleared: "2026-09-03",
      refs: [{ invoiceKey: "Purchase Invoice::ACC-PINV-1", amount: 888 }] });
  });
  it("skips drafts and cancelled payments", () => {
    assert.equal(writtenPaymentsFrom([{ doctype: "Payment Entry", name: "x", docstatus: 0, references: [] }]).length, 0);
  });
});
