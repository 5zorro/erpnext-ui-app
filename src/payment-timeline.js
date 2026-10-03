/**
 * The statement's Payment focus (plan 2026-10-03, the mockup's round 8): the answer to a vendor
 * who asks "what's outstanding, and is it in the mail?" — check number, date and amount
 * (5zorro 2026-09-30).
 *
 * One timeline, newest first:
 *   1. **planned checks** — every open bill on the check run that pays it, by the Pay Outstanding
 *      rule (src/check-run-schedule.js: a run pays everything that would be late if it waited for
 *      the run after it). Open credits come off the first planned check. Paid-in-full bills never
 *      appear here.
 *   2. **today**
 *   3. **checks written** — each with whether it has cleared the bank. A Payment Entry with no
 *      `clearance_date` has not been matched to a bank statement: "not cleared — in the mail?".
 *      Under each, the part of each bill it paid, and the other payments on that bill, so a bar can
 *      show this check's part against the whole.
 *
 * Pure: the caller supplies open invoices (with their pay-by date — the dashboard's
 * `derivePaymentDate`, or the due date), the payments, and the resolved check run.
 */

import { isIsoDate } from "./check-run-schedule.js";

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * @typedef {{ key: string, total: number, open: number, payBy?: string, date?: string, isCredit?: boolean }} OpenInvoice
 * @typedef {{ key: string, ref: string, date: string, total: number, cleared: string,
 *   refs: Array<{ invoiceKey: string, amount: number }> }} WrittenPayment
 * @typedef {{ state: string, runDate: string, intervalDays: number }} RunLike
 */

/**
 * The planned check an open bill lands on.
 *   - no run set → "unscheduled" (the board has no schedule to place it on)
 *   - pay-by before an upcoming run → "off-cycle": it cannot wait, a check goes out by hand now
 *   - otherwise the first run whose next run would be too late: payBy < run + interval
 * @param {string} payBy
 * @param {RunLike|null|undefined} run
 * @returns {{ kind: "unscheduled"|"off-cycle"|"run", date: string }}
 */
export function plannedCheckFor(payBy, run) {
  if (!run || run.state === "off" || !isIsoDate(run.runDate) || !(run.intervalDays > 0)) return { kind: "unscheduled", date: "" };
  if (!isIsoDate(payBy)) return { kind: "run", date: run.runDate };
  if (run.state === "upcoming" && payBy < run.runDate) return { kind: "off-cycle", date: payBy };
  let date = run.runDate;
  while (payBy >= addDays(date, run.intervalDays)) date = addDays(date, run.intervalDays);
  return { kind: "run", date };
}

/**
 * @param {{ invoices: OpenInvoice[], payments: WrittenPayment[], run?: RunLike|null, today: string }} input
 */
export function paymentTimeline({ invoices = [], payments = [], run = null, today }) {
  const bills = invoices.filter((i) => !i.isCredit && i.open > 0.005);
  const credits = invoices.filter((i) => i.isCredit || i.open < -0.005);

  /** @type {Map<string, { kind: string, date: string, items: Array<{ invoiceKey: string, amount: number }> }>} */
  const groups = new Map();
  for (const b of bills) {
    const p = plannedCheckFor(b.payBy || "", run);
    const k = `${p.kind}|${p.date}`;
    if (!groups.has(k)) groups.set(k, { kind: p.kind, date: p.date, items: [] });
    groups.get(k).items.push({ invoiceKey: b.key, amount: r2(b.open) });
  }
  // Open credits come off the first check that will be written.
  const ordered = [...groups.values()].sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  if (credits.length) {
    const first = ordered[0] || { kind: "unscheduled", date: "", items: [] };
    if (!ordered.length) { groups.set("unscheduled|", first); ordered.push(first); }
    for (const c of credits) first.items.push({ invoiceKey: c.key, amount: r2(-Math.abs(c.open)) });
  }
  const planned = ordered
    .map((g) => ({ ...g, total: r2(g.items.reduce((t, i) => t + i.amount, 0)) }))
    .sort((a, b) => (b.date || "9999").localeCompare(a.date || "9999"));

  // Every payment on an invoice, oldest first: a bar draws this check's part among them.
  const onInvoice = new Map();
  for (const p of payments) for (const r of p.refs) {
    if (!onInvoice.has(r.invoiceKey)) onInvoice.set(r.invoiceKey, []);
    onInvoice.get(r.invoiceKey).push({ paymentKey: p.key, date: p.date, amount: r2(r.amount) });
  }
  for (const list of onInvoice.values()) list.sort((a, b) => a.date.localeCompare(b.date) || a.paymentKey.localeCompare(b.paymentKey));

  const written = [...payments]
    .sort((a, b) => b.date.localeCompare(a.date) || b.key.localeCompare(a.key))
    .map((p) => ({
      key: p.key, ref: p.ref, date: p.date, total: r2(p.total),
      status: p.cleared ? "cleared" : "not-cleared",
      cleared: p.cleared || "",
      items: p.refs.map((r) => ({ invoiceKey: r.invoiceKey, amount: r2(r.amount), all: onInvoice.get(r.invoiceKey) || [] })),
    }));

  const outstanding = r2(bills.reduce((t, b) => t + b.open, 0) - credits.reduce((t, c) => t + Math.abs(c.open), 0));
  const notCleared = written.filter((w) => w.status === "not-cleared");
  return {
    planned,
    today,
    written,
    outstanding,
    notCleared: { count: notCleared.length, total: r2(notCleared.reduce((t, w) => t + w.total, 0)), refs: notCleared.map((w) => w.ref) },
  };
}

/**
 * Payment Entry documents (`/api/resource`) as the timeline reads them: the check number is
 * `reference_no`, its date the check date (`reference_date`, else posting), and `clearance_date`
 * says whether the bank has seen it.
 * @param {Array<Record<string, any>>} docs
 * @returns {WrittenPayment[]}
 */
export function writtenPaymentsFrom(docs) {
  return (docs || []).filter((d) => d && d.doctype === "Payment Entry" && Number(d.docstatus) === 1).map((d) => ({
    key: `Payment Entry::${d.name}`,
    ref: d.reference_no || d.name,
    date: String(d.reference_date || d.posting_date || "").slice(0, 10),
    total: Number(d.paid_amount) || 0,
    cleared: d.clearance_date ? String(d.clearance_date).slice(0, 10) : "",
    refs: (d.references || []).map((r) => ({ invoiceKey: `${r.reference_doctype}::${r.reference_name}`, amount: Number(r.allocated_amount) || 0 })),
  }));
}
