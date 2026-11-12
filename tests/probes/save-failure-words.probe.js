/**
 * A failed save says so the same way on every Doc form, loud and plain, with no dialog (plan
 * 2026-10-25 closeout, item 3; 5zorro: "fail loud and clearly", "i don't like blocking modals and
 * dialogues unless the gate is the point").
 *
 * ERPNext refuses a save for real here: the probe puts a Project that does not exist on the open
 * form (in ERPNext's page, as a client script could), and ERPNext's server answers "Could not find
 * Project: …". Then, on the Purchase Order, the save's request is held so no answer comes: the page
 * must say the save did not finish and may still save — never that it was rejected. The held
 * request goes on afterwards and ERPNext refuses it too (the same Project), so nothing is saved.
 *
 * Each form: the red status line starts "Save rejected — ERPNext says:" (or "Save did not finish
 * — ERPNext did not answer in 12 s"), a toast points at it, and the commit gate stays closed.
 * Acts as the AP clerk. Makes one draft PO and one draft Bill (ALPINE SUPPLY CO, SAMPLE-SKU-01;
 * bill no. `ZZ-SAVE-WORDS-…`) as Administrator, and deletes both at the end.
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi, e2eCall } from "../../e2e/helpers.js";
import { inDoc, inErp, openNewDoc, report, docQuiet, sleep, repaintDoc, closeSourcePickers, erpUp, holdRequests, heldCount, releaseHeld } from "./probe-helpers.js";
import { loginAsProbeUser, AP_CLERK } from "./probe-user.js";
import { billCompareTotal } from "../../src/bill-map.js";

const NO_PROJECT = "ZZ-NO-SUCH-PROJECT";

/** What the clerk sees after a save: the status line, the toast, whether the gate is open. */
const seen = (app) =>
  inDoc(
    app,
    `(() => { const s = document.getElementById("status"); const t = document.querySelector('[data-testid="bill-toast"]'); const g = document.querySelector('[data-testid="doc-commit-gate"]');
      return { status: s ? s.textContent : "", red: !!s && s.classList.contains("err"), toast: t && !t.hidden ? t.textContent : null, gateOpen: !!g && !g.hidden }; })()`,
    3000,
  );

/** A Project ERPNext does not have, put straight on ERPNext's open form. */
const breakProject = (app) => inErp(app, `(() => { cur_frm.doc.project = ${JSON.stringify(NO_PROJECT)}; return cur_frm.doc.name; })()`, 4000);

const clickSave = (app) => inDoc(app, `(() => { document.querySelector('[data-testid="doc-save"]').click(); return true; })()`);

/** Make a draft as Administrator (before the clerk signs in). */
const makeDraft = (app, doc) =>
  inErp(app, `frappe.xcall("frappe.client.insert", { doc: ${doc} }).then((d) => d.name)`, 30_000);

async function deleteDraft(app, doctype, name, leaveRoute, opener) {
  // Back as Administrator: the Doc page may hold the draft open, so leave it first.
  await e2eCall(app, opener, leaveRoute).catch(() => {});
  await sleep(3000);
  return inErp(app, `frappe.xcall("frappe.client.delete", { doctype: ${JSON.stringify(doctype)}, name: ${JSON.stringify(name)} }).then(() => "deleted", (e) => String(e && e.message || e))`, 20_000).catch((e) => String(e));
}

test("Purchase Order: a refused save and an unanswered one each say what happened, with no dialog", async () => {
  test.setTimeout(180_000);
  let app = null;
  let clerk = null;
  let po = "";
  try {
    app = await launchShell();
    await waitForE2eApi(app);
    await expect.poll(() => inErp(app, `!!(window.frappe && frappe.xcall)`), { timeout: 30_000 }).toBe(true);
    po = await makeDraft(
      app,
      `{ doctype: "Purchase Order", supplier: "ALPINE SUPPLY CO", schedule_date: frappe.datetime.get_today(), items: [{ item_code: "SAMPLE-SKU-01", qty: 1, rate: 10, schedule_date: frappe.datetime.get_today() }] }`,
    );
    report("draft PO", po);
    clerk = await loginAsProbeUser(app, AP_CLERK.roles, { as: AP_CLERK.name });

    await openNewDoc(app, "po", `/app/purchase-order/${encodeURIComponent(po)}`);
    await docQuiet(app);
    expect(await breakProject(app), "ERPNext shows the draft PO").toBe(po);

    // 1. ERPNext refuses.
    await clickSave(app);
    await expect.poll(async () => (await seen(app)).status, { timeout: 30_000, message: "the save's answer" }).toMatch(/^Save rejected|^Can't save|did not finish|ERPNext/);
    const refused = await seen(app);
    report("refused", refused);
    expect(refused.status).toMatch(new RegExp(`^Save rejected — ERPNext says: .*${NO_PROJECT}`));
    expect(refused.red, "the status line is red").toBe(true);
    expect(refused.toast, "a toast points at it").toMatch(/^Save rejected by ERPNext/);
    expect(refused.gateOpen, "no dialog").toBe(false);

    // 2. No answer: the save's request is held past the bridge's 12 s wait.
    await inDoc(app, `(() => { document.getElementById("status").textContent = ""; return true; })()`);
    await holdRequests(app, "savedocs", "");
    await clickSave(app);
    await expect.poll(() => heldCount(app), { timeout: 15_000, message: "the save's request was held" }).toBeGreaterThan(0);
    // "Saving draft…" until the bridge's 12 s wait runs out.
    await expect.poll(async () => (await seen(app)).status, { timeout: 30_000, message: "the page gave up waiting" }).toMatch(/^(?!Saving)\S/);
    const unanswered = await seen(app);
    report("unanswered", unanswered);
    await releaseHeld(app);
    await erpUp(app);
    expect(unanswered.status).toMatch(/^Save did not finish — ERPNext did not answer in 12 s and may still save it; reload before trying again\.$/);
    expect(unanswered.status, "never called a rejection").not.toMatch(/rejected/i);
    expect(unanswered.red).toBe(true);
    expect(unanswered.toast).toMatch(/^Save did not finish/);
    expect(unanswered.gateOpen, "no dialog").toBe(false);

    // The held save went on; ERPNext refused it too: the draft is unchanged.
    await sleep(3000);
    const modifiedProject = await inErp(app, `frappe.xcall("frappe.client.get_value", { doctype: "Purchase Order", filters: { name: ${JSON.stringify(po)} }, fieldname: "project" }).then((r) => r && r.project || "")`, 15_000);
    expect(modifiedProject, "nothing saved").toBe("");
  } finally {
    if (app) await releaseHeld(app).catch(() => {});
    if (app) await erpUp(app).catch(() => {});
    if (clerk) await clerk.retire().catch((e) => report("retire-failed", String(e)));
    if (app && po) report("draft PO deleted", await deleteDraft(app, "Purchase Order", po, "/app/purchase-order/new", "openPo"));
    if (app) await app.close().catch(() => {});
  }
});

test("Bill: a refused save says ERPNext's reason the same way", async () => {
  test.setTimeout(180_000);
  let app = null;
  let clerk = null;
  let bill = "";
  try {
    app = await launchShell();
    await waitForE2eApi(app);
    await expect.poll(() => inErp(app, `!!(window.frappe && frappe.xcall)`), { timeout: 30_000 }).toBe(true);
    bill = await makeDraft(
      app,
      `{ doctype: "Purchase Invoice", supplier: "ALPINE SUPPLY CO", bill_no: "ZZ-SAVE-WORDS-" + Date.now(), items: [{ item_code: "SAMPLE-SKU-01", qty: 1, rate: 10 }] }`,
    );
    report("draft Bill", bill);
    clerk = await loginAsProbeUser(app, AP_CLERK.roles, { as: AP_CLERK.name });

    await openNewDoc(app, "bill", `/app/purchase-invoice/${encodeURIComponent(bill)}`);
    await docQuiet(app);
    await closeSourcePickers(app);
    const snap = await repaintDoc(app);
    // The Bill's own check: the Amount Due typed must match the lines.
    const total = billCompareTotal(snap.doc);
    await inDoc(app, `(() => { const a = document.querySelector('[data-testid="bill-amount-due"]'); a.focus(); a.value = ${JSON.stringify(String(total))}; a.dispatchEvent(new Event("input", { bubbles: true })); a.blur(); return true; })()`);
    await docQuiet(app);
    expect(await breakProject(app), "ERPNext shows the draft Bill").toBe(bill);

    await clickSave(app);
    // Save may first ask whether the goods came with the bill: Bill only.
    for (let i = 0; i < 50; i += 1) {
      const s = await seen(app);
      if (/^Save rejected|^Can't save|did not finish/.test(s.status)) break;
      await inDoc(app, `(() => { const b = document.querySelector('[data-testid="bill-receive-bill-only"]'); if (b && b.offsetParent) b.click(); return true; })()`);
      await sleep(400);
    }
    const refused = await seen(app);
    report("refused", refused);
    expect(refused.status).toMatch(new RegExp(`^Save rejected — ERPNext says: .*${NO_PROJECT}`));
    expect(refused.red).toBe(true);
    expect(refused.toast).toMatch(/^Save rejected by ERPNext/);
    expect(refused.gateOpen, "no dialog").toBe(false);
  } finally {
    if (clerk) await clerk.retire().catch((e) => report("retire-failed", String(e)));
    if (app && bill) report("draft Bill deleted", await deleteDraft(app, "Purchase Invoice", bill, "/app/purchase-invoice/new", "openBill"));
    if (app) await app.close().catch(() => {});
  }
});
