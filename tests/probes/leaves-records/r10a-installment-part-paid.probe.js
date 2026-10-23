/**
 * Plan 10-19 R10a-1: a bill in two installments (50 % / 50 %, no template, so ERPNext does not keep
 * the rows' own outstanding) part-paid 600 of 1000. Question: does Pay Outstanding's bill loader
 * say 400 is owed, or the stale 1000?
 *
 * 🔴 LEAVES RECORDS (run with --leaves-records, sandbox only): each run submits a Purchase Invoice
 * (bill no. `ZZR10A-<n>`) and a Payment Entry (reference `ZZR10A-<n>`), then cancels both —
 * ERPNext will not delete a cancelled document its ledger entries link to, so both stay, cancelled.
 * The vendor `ZZ R10A PART PAID` stays too (the bills link to it) and is reused by the next run.
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../../e2e/helpers.js";
import { sleep, inErp, openNewDoc, assertSandboxSite, report } from "../probe-helpers.js";

const VENDOR = "ZZ R10A PART PAID";
const TAG = `ZZR10A-${Date.now() % 100000}`;

const serverWhy = `let why = (e && e.message) || ""; try { why = why || JSON.parse(JSON.parse(frappe.last_response._server_messages)[0]).message; } catch (e2) {} return { error: why || String(e) };`;

const setup = (app) =>
  inErp(
    app,
    `(async () => {
      try {
        const today = frappe.datetime.get_today();
        const have = await frappe.xcall("frappe.client.get_list", { doctype: "Supplier", filters: { supplier_name: ${JSON.stringify(VENDOR)} }, fields: ["name"] });
        if (!have.length) {
          const g = await frappe.xcall("frappe.client.get_list", { doctype: "Supplier Group", fields: ["name"], limit_page_length: 1 });
          await frappe.xcall("frappe.client.insert", { doc: { doctype: "Supplier", supplier_name: ${JSON.stringify(VENDOR)}, supplier_group: g[0] && g[0].name } });
        }
        const pi = await frappe.xcall("frappe.client.insert", { doc: {
          doctype: "Purchase Invoice", supplier: ${JSON.stringify(VENDOR)}, bill_no: ${JSON.stringify(TAG)},
          items: [{ item_code: "SAMPLE-SKU-01", qty: 10, rate: 100 }],
          payment_schedule: [
            { due_date: frappe.datetime.add_days(today, 10), invoice_portion: 50, payment_amount: 500 },
            { due_date: frappe.datetime.add_days(today, 40), invoice_portion: 50, payment_amount: 500 },
          ],
        } });
        await frappe.xcall("frappe.client.submit", { doc: pi });
        // party_amount over xcall arrives as text and get_payment_entry's abs() throws: set the 600 here.
        const pe = await frappe.xcall("erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry", { dt: "Purchase Invoice", dn: pi.name });
        pe.paid_amount = 600; pe.received_amount = 600;
        pe.references = (pe.references || []).slice(0, 1).map((r) => ({ ...r, allocated_amount: 600 }));
        pe.reference_no = ${JSON.stringify(TAG)}; pe.reference_date = today;
        const peIns = await frappe.xcall("frappe.client.insert", { doc: pe });
        const peSub = await frappe.xcall("frappe.client.submit", { doc: peIns });
        const after = await frappe.xcall("frappe.client.get", { doctype: "Purchase Invoice", name: pi.name });
        return { pi: pi.name, pe: peSub.name, paid: peSub.paid_amount, invoiceOutstanding: after.outstanding_amount,
          scheduleOutstanding: (after.payment_schedule || []).map((r) => r.outstanding) };
      } catch (e) { ${serverWhy} }
    })()`,
    60_000,
  );

const cancelAll = (app) =>
  inErp(
    app,
    `(async () => {
      const done = [];
      try {
        const pes = await frappe.xcall("frappe.client.get_list", { doctype: "Payment Entry", filters: { reference_no: ${JSON.stringify(TAG)}, docstatus: 1 }, fields: ["name"] });
        const pis = await frappe.xcall("frappe.client.get_list", { doctype: "Purchase Invoice", filters: { bill_no: ${JSON.stringify(TAG)} }, fields: ["name", "docstatus"] });
        for (const d of pes) { await frappe.xcall("frappe.client.cancel", { doctype: "Payment Entry", name: d.name }); done.push("cancelled " + d.name); }
        for (const d of pis) {
          if (d.docstatus === 1) { await frappe.xcall("frappe.client.cancel", { doctype: "Purchase Invoice", name: d.name }); done.push("cancelled " + d.name); }
          else if (d.docstatus === 0) { await frappe.xcall("frappe.client.delete", { doctype: "Purchase Invoice", name: d.name }); done.push("deleted draft " + d.name); }
        }
        return done;
      } catch (e) { const r = (() => { ${serverWhy} })(); return { done, ...r }; }
    })()`,
    60_000,
  );

test("a part-paid installment bill shows what ERPNext says is owed", async () => {
  const app = await launchShell();
  try {
    await waitForE2eApi(app);
    await openNewDoc(app, "bill", "/app/purchase-invoice/new"); // the ERPNext page is logged in and ready
    await sleep(1500);
    report("site", { companies: await assertSandboxSite(app) });
    const made = await setup(app);
    report("setup", made);
    expect(made && made.error).toBeFalsy();
    const res = await app.evaluate(async ({ ipcMain }) => ipcMain._invokeHandlers.get("get-outstanding-bills")({}));
    const mine = (res.bills || []).filter((b) => b.invoice === made.pi);
    report("board", { ok: res.ok, reason: res.reason, mine: mine.map((b) => ({ key: b.installmentKey, due: b.dueDate, owed: b.outstanding })) });
    // On b7adae0: two rows of 500 — 1000 owed, as the stale schedule rows say.
    expect(mine.reduce((s, b) => s + b.outstanding, 0)).toBe(400);
    expect(mine.length).toBe(1);
  } finally {
    report("cleanup", await cancelAll(app));
    await app.close().catch(() => {});
  }
});
