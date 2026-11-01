/**
 * The Bill's two payment paths, driven as the AP clerk (both were broken from 2026-10-23 until
 * 2026-10-31: an edit that made the refusal reader one shared script also cut the end of
 * `createDraftPaymentEntryForBill` and the start of `createJitPaymentEntryForBill`, so each path
 * threw "… is not defined" in the main process and no payment was made):
 * 1. **Add payment** on a submitted Bill with money owed: is a draft Payment Entry made against it?
 * 2. **Submit** on a draft Bill marked Already paid (Paid Amount + Cash / Bank Account): is the Bill
 *    submitted with Already paid cleared, and a submitted Payment Entry made for the paid amount?
 *
 * 🔴 LEAVES RECORDS (run with --leaves-records, sandbox only): two Purchase Invoices (bill no.
 * `ZZPAY-<n>-ADD` / `-JIT`) and their Payment Entries, cancelled at the end (the draft one is
 * deleted). The vendor and the payment method `ZZ PAY PATHS` (its account `ZZ DF Bank`) stay and
 * are reused; the scenes' item `ZZ-DF-SERVICE` and account `ZZ DF Bank` (left enabled) are made if
 * missing.
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi, e2eCall, e2eGet } from "../../../e2e/helpers.js";
import { sleep, inDoc, inErp, escPeek, assertSandboxSite, report, repaintDoc, closeSourcePickers } from "../probe-helpers.js";
import { loginAsProbeUser, AP_CLERK } from "../probe-user.js";
import { billCompareTotal } from "../../../src/bill-map.js";

const VENDOR = "ZZ PAY PATHS";
const TAG = `ZZPAY-${Date.now() % 100000}`;
const RATE = 10;
const serverWhy = `let why = (e && e.message) || ""; try { why = why || JSON.parse(JSON.parse(frappe.last_response._server_messages)[0]).message; } catch (e2) {} return { error: why || String(e) };`;

/** As Administrator: the vendor, the item, an enabled bank account, then the two bills. */
const MAKE = `(async () => {
  try {
    const x = (m, a) => frappe.xcall(m, a);
    const list = (doctype, filters, fields = ["name"]) => x("frappe.client.get_list", { doctype, filters, fields, limit_page_length: 0 });
    const one = async (doctype, filters) => ((await list(doctype, filters))[0] || {}).name || "";
    const company = frappe.defaults.get_user_default("Company") || (await list("Company", {}))[0].name;
    if (!(await one("Supplier", { supplier_name: ${JSON.stringify(VENDOR)} }))) {
      const g = await list("Supplier Group", { is_group: 0 });
      await x("frappe.client.insert", { doc: { doctype: "Supplier", supplier_name: ${JSON.stringify(VENDOR)}, supplier_group: g[0] && g[0].name } });
    }
    if (!(await one("Item", { item_code: "ZZ-DF-SERVICE" }))) {
      const g = await list("Item Group", { is_group: 0 });
      await x("frappe.client.insert", { doc: { doctype: "Item", item_code: "ZZ-DF-SERVICE", item_name: "ZZ DF service", item_group: g[0].name, stock_uom: "Nos", is_stock_item: 0 } });
    }
    let bank = await one("Account", { account_name: "ZZ DF Bank", company });
    if (!bank) {
      const parent = (await list("Account", { company, account_type: "Bank", is_group: 1 }))[0].name;
      bank = (await x("frappe.client.insert", { doc: { doctype: "Account", account_name: "ZZ DF Bank", parent_account: parent, company, account_type: "Bank" } })).name;
    }
    await x("frappe.client.set_value", { doctype: "Account", name: bank, fieldname: "disabled", value: 0 });
    // Its own payment method, with the bank as its account (ERPNext's get_payment_entry needs one).
    if (!(await one("Mode of Payment", { name: ${JSON.stringify(VENDOR)} })))
      await x("frappe.client.insert", { doc: { doctype: "Mode of Payment", mode_of_payment: ${JSON.stringify(VENDOR)}, type: "Bank", accounts: [{ company, default_account: bank }] } });
    const item = { item_code: "ZZ-DF-SERVICE", qty: 1, rate: ${RATE} };
    const add = await x("frappe.client.insert", { doc: { doctype: "Purchase Invoice", supplier: ${JSON.stringify(VENDOR)}, bill_no: ${JSON.stringify(TAG + "-ADD")}, items: [item] } });
    await x("frappe.client.submit", { doc: add });
    const jit = await x("frappe.client.insert", { doc: { doctype: "Purchase Invoice", supplier: ${JSON.stringify(VENDOR)}, bill_no: ${JSON.stringify(TAG + "-JIT")}, items: [item],
      is_paid: 1, mode_of_payment: ${JSON.stringify(VENDOR)}, cash_bank_account: bank, paid_amount: ${RATE} } });
    return { add: add.name, jit: jit.name, bank };
  } catch (e) { ${serverWhy} }
})()`;

/** Payment Entries that reference this bill (any state). */
const paymentsFor = (app, bill) =>
  inErp(
    app,
    `(async () => frappe.xcall("frappe.client.get_list", { doctype: "Payment Entry", fields: ["name", "docstatus", "paid_amount"],
      filters: [["Payment Entry Reference", "reference_name", "=", ${JSON.stringify(bill)}], ["docstatus", "<", 2]], limit_page_length: 0 }))()`,
    15_000,
  );
const billFields = (app, bill) =>
  inErp(app, `(async () => frappe.xcall("frappe.client.get_value", { doctype: "Purchase Invoice", filters: { name: ${JSON.stringify(bill)} }, fieldname: ["docstatus", "is_paid", "outstanding_amount"] }))()`, 15_000);

async function openBillInDoc(app, name) {
  await e2eCall(app, "openBill", `/app/purchase-invoice/${encodeURIComponent(name)}`);
  await expect
    .poll(async () => ((await e2eGet(app, "surfaceMode")) === "doc" ? inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); return s && s.doc ? s.doc.name : ""; })()`, 10_000) : ""), { timeout: 40_000 })
    .toBe(name);
  await sleep(2500);
}

test("the Bill's Add payment and Already-paid Submit each make their Payment Entry", async () => {
  test.setTimeout(8 * 60_000);
  const app = await launchShell();
  let made = null;
  let clerk = null;
  try {
    await waitForE2eApi(app);
    await expect.poll(() => e2eCall(app, "getErpUrl"), { timeout: 30_000 }).toMatch(/\/(app|desk)\b/);
    report("site", { companies: await assertSandboxSite(app) });
    await e2eCall(app, "setLensPref", "purchase-invoice", "doc");
    await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; });
    made = await inErp(app, MAKE, 90_000);
    report("made", made);
    expect(made && made.error).toBeFalsy();

    clerk = await loginAsProbeUser(app, AP_CLERK.roles, { as: AP_CLERK.name });

    // 1. Add payment on the submitted bill.
    await openBillInDoc(app, made.add);
    await expect.poll(() => inDoc(app, `(() => { const b = document.querySelector('[data-testid="bill-add-payment"]'); return !!(b && !b.hidden && !b.disabled); })()`), { timeout: 20_000 }).toBe(true);
    await inDoc(app, `(() => { document.querySelector('[data-testid="bill-add-payment"]').click(); return true; })()`);
    await expect.poll(async () => (await paymentsFor(app, made.add)).length, { timeout: 60_000 }).toBe(1);
    const added = await paymentsFor(app, made.add);
    report("add-payment", added);
    expect(added[0].docstatus).toBe(0);
    await escPeek(app);
    await sleep(2000);

    // 2. Submit the Already-paid draft.
    await openBillInDoc(app, made.jit);
    const snap = await repaintDoc(app);
    await closeSourcePickers(app);
    const total = billCompareTotal(snap.doc);
    await inDoc(app, `(() => { const a = document.querySelector('[data-testid="bill-amount-due"]'); a.focus(); a.value = ${JSON.stringify(String(total))}; a.dispatchEvent(new Event("input", { bubbles: true })); a.blur(); return true; })()`);
    await inDoc(app, `(() => { window.confirm = () => true; document.getElementById("btn-submit").click(); return true; })()`);
    await expect.poll(async () => (await billFields(app, made.jit)).docstatus, { timeout: 90_000 }).toBe(1);
    await expect.poll(async () => (await paymentsFor(app, made.jit)).filter((p) => p.docstatus === 1).length, { timeout: 60_000 }).toBe(1);
    const jit = { bill: await billFields(app, made.jit), payments: await paymentsFor(app, made.jit) };
    report("jit", jit);
    expect(jit.bill.is_paid).toBe(0);
    expect(jit.payments[0].paid_amount).toBe(RATE);
    expect(jit.bill.outstanding_amount).toBe(0);
  } finally {
    if (clerk) await clerk.retire().catch((e) => report("retire-failed", String(e)));
    if (made && !made.error) {
      const cleared = await inErp(
        app,
        `(async () => {
          const x = (m, a) => frappe.xcall(m, a), done = [];
          for (const bill of ${JSON.stringify([made.add, made.jit])}) {
            const pes = await x("frappe.client.get_list", { doctype: "Payment Entry", fields: ["name", "docstatus"], filters: [["Payment Entry Reference", "reference_name", "=", bill], ["docstatus", "<", 2]], limit_page_length: 0 });
            for (const pe of pes) {
              try { await x(pe.docstatus === 1 ? "frappe.client.cancel" : "frappe.client.delete", { doctype: "Payment Entry", name: pe.name }); done.push((pe.docstatus === 1 ? "cancel " : "delete ") + pe.name); }
              catch (e) { done.push("FAILED " + pe.name + ": " + ((e && e.message) || "")); }
            }
            const d = await x("frappe.client.get_value", { doctype: "Purchase Invoice", filters: { name: bill }, fieldname: "docstatus" });
            try { await x(d.docstatus === 1 ? "frappe.client.cancel" : "frappe.client.delete", { doctype: "Purchase Invoice", name: bill }); done.push((d.docstatus === 1 ? "cancel " : "delete ") + bill); }
            catch (e) { done.push("FAILED " + bill + ": " + ((e && e.message) || "")); }
          }
          return done;
        })()`,
        60_000,
      ).catch((e) => String(e));
      report("cleared", cleared);
    }
    await app.close().catch(() => {});
  }
});
