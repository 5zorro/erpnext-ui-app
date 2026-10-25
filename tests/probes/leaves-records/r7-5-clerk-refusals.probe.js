/**
 * Review 10-19 R7-5: the shell's ERPNext-page scripts no longer call `frappe.db.*`.
 * 1. The trap, live, as a Purchase User (who may not read Sales Orders): ERPNext's own
 *    `frappe.db.get_list` on that list never settles; the shell's `xList` comes back refused, with
 *    ERPNext's reason, at once.
 * 2. A child table's rows, as the AP clerk: `xList("Purchase Order Item")` answers when it names
 *    its parent (`parent_doctype`) — the form the swept scripts now use.
 * 3. The Bill's applied payments, as the AP clerk: one payment of two bills (60 + 40). Each bill
 *    lists what the payment allocated to it — the old script called `frappe.db.get_all`, which v16
 *    does not have, so it fell back to the whole payment (100) on both.
 * 🔴 LEAVES RECORDS (--leaves-records, sandbox only): two Purchase Invoices (bill no.
 * `ZZR75-<n>-A/B`) and one Payment Entry (reference `ZZR75-<n>`), all cancelled at the end, for
 * the vendor `ZZ R10A PART PAID` (made by the R10a probe, reused).
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../../e2e/helpers.js";
import { sleep, inDoc, inErp, openNewDoc, assertSandboxSite, report } from "../probe-helpers.js";
import { loginAsProbeUser, AP_CLERK } from "../probe-user.js";
import { ERP_LIST_JS, PE_REASON_FROM_JS } from "../../../src/erp-refusal-reason.js";

const VENDOR = "ZZ R10A PART PAID";
const TAG = `ZZR75-${Date.now() % 100000}`;
const serverWhy = `let why = (e && e.message) || ""; try { why = why || JSON.parse(JSON.parse(frappe.last_response._server_messages)[0]).message; } catch (e2) {} return { error: why || String(e) };`;

const MAKE = `(async () => {
  try {
    const have = await frappe.xcall("frappe.client.get_list", { doctype: "Supplier", filters: { supplier_name: ${JSON.stringify(VENDOR)} }, fields: ["name"] });
    if (!have.length) {
      const g = await frappe.xcall("frappe.client.get_list", { doctype: "Supplier Group", fields: ["name"], limit_page_length: 1 });
      await frappe.xcall("frappe.client.insert", { doc: { doctype: "Supplier", supplier_name: ${JSON.stringify(VENDOR)}, supplier_group: g[0] && g[0].name } });
    }
    const bill = async (tag, rate) => {
      const d = await frappe.xcall("frappe.client.insert", { doc: { doctype: "Purchase Invoice", supplier: ${JSON.stringify(VENDOR)},
        bill_no: ${JSON.stringify(TAG)} + "-" + tag, items: [{ item_code: "SAMPLE-SKU-01", qty: 1, rate }] } });
      return frappe.xcall("frappe.client.submit", { doc: d });
    };
    const a = await bill("A", 60), b = await bill("B", 40);
    const pe = await frappe.xcall("erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry", { dt: "Purchase Invoice", dn: a.name });
    const ref = (pe.references || [])[0];
    pe.references = [{ ...ref, allocated_amount: a.grand_total },
      { ...ref, name: undefined, reference_name: b.name, total_amount: b.grand_total, outstanding_amount: b.grand_total, allocated_amount: b.grand_total }];
    pe.paid_amount = a.grand_total + b.grand_total; pe.received_amount = pe.paid_amount;
    pe.reference_no = ${JSON.stringify(TAG)}; pe.reference_date = frappe.datetime.get_today();
    const ins = await frappe.xcall("frappe.client.insert", { doc: pe });
    const sub = await frappe.xcall("frappe.client.submit", { doc: ins });
    return { a: a.name, b: b.name, pe: sub.name, paid: sub.paid_amount };
  } catch (e) { ${serverWhy} }
})()`;

const CANCEL = (made) => `(async () => {
  const done = [];
  for (const [dt, n] of [["Payment Entry", ${JSON.stringify(made.pe || "")}], ["Purchase Invoice", ${JSON.stringify(made.a || "")}], ["Purchase Invoice", ${JSON.stringify(made.b || "")}]]) {
    if (!n) continue;
    try { await frappe.xcall("frappe.client.cancel", { doctype: dt, name: n }); done.push("cancelled " + n); } catch (e) { done.push("could not cancel " + n); }
  }
  return done;
})()`;

/** The Bill's applied-payments rows: [payment, allocated]. */
const applied = (app) =>
  inDoc(app, `[...document.querySelectorAll('[data-testid="bill-applied-payments-body"] tr')].map((tr) => [tr.cells[0].textContent.trim(), tr.cells[3].textContent.trim()])`);

test("R7-5: refusals settle with a reason; child lists name their parent; a bill shows its share of a payment", async () => {
  test.setTimeout(6 * 60_000);
  const app = await launchShell();
  let clerk = null;
  let made = {};
  try {
    await waitForE2eApi(app);
    await expect.poll(() => inErp(app, `!!(window.frappe && frappe.xcall)`), { timeout: 30_000 }).toBe(true);
    await assertSandboxSite(app);
    await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; });
    made = await inErp(app, MAKE, 90_000);
    report("made", made);
    expect(made && made.pe).toBeTruthy();

    // 1. The trap and the fix, side by side, as a Purchase User.
    clerk = await loginAsProbeUser(app, ["Purchase User"]);
    const trap = await inErp(app, `(async () => {
      ${ERP_LIST_JS}
      ${PE_REASON_FROM_JS}
      const late = (ms) => new Promise((r) => setTimeout(() => r("never settled"), ms));
      const old = await Promise.race([frappe.db.get_list("Sales Order", { limit: 1 }).then((r) => "settled: " + JSON.stringify(r)), late(8000)]);
      const t0 = Date.now();
      const now = await Promise.race([xList("Sales Order", { limit: 1 }).then((r) => "listed " + r.length, (e) => "refused: " + reasonFrom(e)), late(8000)]);
      return { old, now, ms: Date.now() - t0 };
    })()`, 30_000);
    report("trap", trap);
    await clerk.retire();
    clerk = null;
    expect(trap.old).toBe("never settled");
    expect(trap.now).toMatch(/^refused: .*(Permission|permitted)/i);
    expect(trap.ms).toBeLessThan(8000);

    // 2 + 3 as the AP clerk.
    clerk = await loginAsProbeUser(app, AP_CLERK.roles, { as: AP_CLERK.name });
    const child = await inErp(app, `(async () => {
      ${ERP_LIST_JS}
      ${PE_REASON_FROM_JS}
      const ask = (args) => xList("Purchase Invoice Item", Object.assign({ fields: ["name", "parent"], filters: [["parent", "=", ${JSON.stringify(made.a)}]], limit: 5 }, args))
        .then((r) => "listed " + r.length, (e) => "refused: " + reasonFrom(e));
      return { withParent: await ask({ parent_doctype: "Purchase Invoice" }), without: await ask({}) };
    })()`, 30_000);
    report("child", child);
    expect(child.withParent).toBe("listed 1");

    // Each bill's table, once it shows that bill's share (the page keeps the last bill's rows
    // until its own list is back); the old script gave both the whole payment, $100.00.
    const shares = {};
    for (const [bill, want] of [[made.a, "$60.00"], [made.b, "$40.00"]]) {
      await openNewDoc(app, "bill", `/app/purchase-invoice/${bill}`);
      await expect
        .poll(async () => JSON.stringify(await applied(app)), { timeout: 30_000 })
        .toBe(JSON.stringify([[made.pe, want]]))
        .catch(() => {});
      shares[bill] = await applied(app);
    }
    report("applied", shares);
    expect(shares[made.a]).toEqual([[made.pe, "$60.00"]]);
    expect(shares[made.b]).toEqual([[made.pe, "$40.00"]]);
  } finally {
    if (clerk) await clerk.retire();
    if (made && made.pe) report("cleanup", await inErp(app, CANCEL(made), 60_000).catch((e) => String(e)));
    await app.close().catch(() => {});
  }
});
