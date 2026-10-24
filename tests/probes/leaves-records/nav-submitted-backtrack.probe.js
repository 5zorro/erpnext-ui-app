/**
 * @nav submitted
 * Plan 2026-10-24, 5zorro's answer 4: Recent keeps one row per doctype (a feature); the way back
 * to a submitted document is the rail's **Submitted** section — *"if I submit then open a new
 * bill, there should be a 'submitted' section … I can go to if I wanted to backtrack … the correct
 * order of deduplicated stuff I worked on recently should be at the top."* On a fresh rail: submit
 * two `ZZ-NAV-S…` Bills in the Doc page, open a new Bill and another document, then open Submitted.
 * Questions: are both there, newest first, once each? Does the older one open again in the Doc
 * lens from there? What order is Submitted in after that reopen? Leaves two **cancelled** Bills
 * (submitted, then cancelled at the end so the books are as before).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi, e2eCall, e2eGet } from "../../../e2e/helpers.js";
import { sleep, inDoc, inErp, report, closeSourcePickers, repaintDoc, assertSandboxSite } from "../probe-helpers.js";
import { billCompareTotal } from "../../../src/bill-map.js";

const VENDOR = "ALPINE SUPPLY CO";
const ITEM = "SAMPLE-SKU-01";
const RUN = String(Date.now() % 100000);
const surface = (app) => e2eGet(app, "surfaceMode");
const docName = (app) => inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); return s && s.doc ? s.doc.name : ""; })()`, 10_000);

/** The Submitted flyout's rows, top first (it is its own window). */
async function submittedRows(app) {
  await e2eCall(app, "execInView", "hist", `(() => { document.querySelector('[data-testid="submitted-history-open"]').click(); return true; })()`);
  await sleep(1500);
  return app.evaluate(async ({ webContents }) => {
    const wc = webContents.getAllWebContents().find((w) => /submitted-dropdown\.html/.test(w.getURL()));
    if (!wc) return null;
    return wc.executeJavaScript(`[...document.querySelectorAll('[data-testid="submitted-row"]')].map((b) => b.title)`);
  });
}
const clickSubmitted = (app, name) =>
  app.evaluate(async ({ webContents }, n) => {
    const wc = webContents.getAllWebContents().find((w) => /submitted-dropdown\.html/.test(w.getURL()));
    return wc.executeJavaScript(`(() => { const b = [...document.querySelectorAll('[data-testid="submitted-row"]')].find((x) => x.title.endsWith("/" + ${JSON.stringify(n)})); if (!b) return false; b.click(); return true; })()`);
  }, name);

async function submitInDoc(app, name) {
  await e2eCall(app, "openBill", `/app/purchase-invoice/${encodeURIComponent(name)}`);
  await expect.poll(async () => ((await surface(app)) === "doc" ? docName(app) : ""), { timeout: 40_000 }).toBe(name);
  await sleep(2500);
  const snap = await repaintDoc(app);
  await closeSourcePickers(app);
  const total = billCompareTotal(snap.doc);
  await inDoc(app, `(() => { const a = document.querySelector('[data-testid="bill-amount-due"]'); a.focus(); a.value = ${JSON.stringify(String(total))}; a.dispatchEvent(new Event("input", { bubbles: true })); a.blur(); return true; })()`);
  await inDoc(app, `(() => { window.confirm = () => true; document.getElementById("btn-submit").click(); return true; })()`);
  await expect
    .poll(async () => {
      await inDoc(app, `(() => { const b = document.querySelector('[data-testid="bill-receive-bill-only"]'); if (b && b.offsetParent) b.click(); return true; })()`);
      return inErp(app, `(async () => (await frappe.xcall("frappe.client.get_value", { doctype: "Purchase Invoice", filters: { name: ${JSON.stringify(name)} }, fieldname: "docstatus" })).docstatus)()`, 10_000);
    }, { timeout: 90_000 })
    .toBe(1);
  await sleep(2000);
}

test("answer 4: a submitted Bill is found again under Submitted, newest first, once", async () => {
  test.setTimeout(10 * 60_000);
  if (!process.env.ERP_PROBE_PREFS_BACKUP) throw new Error("run through `npm run probe` (it backs up the prefs this empties)");
  fs.rmSync(path.join(os.homedir(), ".config", "erpnext-ui-app", "nav-state.json"), { force: true });
  const app = await launchShell();
  const made = [];
  try {
    await waitForE2eApi(app);
    await expect.poll(() => e2eCall(app, "getErpUrl"), { timeout: 30_000 }).toMatch(/\/(app|desk)\b/);
    await assertSandboxSite(app);
    await e2eCall(app, "setLensPref", "purchase-invoice", "doc");
    await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; });
    for (const k of ["S1", "S2"]) {
      made.push(await inErp(app, `(async () => (await frappe.xcall("frappe.client.insert", { doc: { doctype: "Purchase Invoice", supplier: ${JSON.stringify(VENDOR)}, bill_no: "ZZ-NAV-${k}-${RUN}", items: [{ item_code: ${JSON.stringify(ITEM)}, qty: 1, rate: 10 }] } })).name)()`, 30_000));
    }
    report("made", made);
    for (const name of made) await submitInDoc(app, name);

    // Move on: a new Bill, then Desk — Recent's Bill row now points at the new Bill.
    await e2eCall(app, "execInView", "home", `(() => { document.querySelector('[data-testid="tile-bill-new"]').click(); return true; })()`).catch(() => {});
    await e2eCall(app, "goHome");
    await e2eCall(app, "execInView", "home", `(() => { document.querySelector('[data-testid="tile-bill-new"]').click(); return true; })()`);
    await expect.poll(async () => ((await surface(app)) === "doc" ? docName(app) : ""), { timeout: 40_000 }).toMatch(/^new-purchase-invoice/);
    await sleep(2000);
    const recent = await e2eCall(app, "getHistory");
    report("recent", recent.map((h) => h.route));

    const rows = await submittedRows(app);
    report("submitted", rows);
    const names = (rows || []).map((t) => decodeURIComponent(String(t).split("/").pop()));
    expect(names.slice(0, 2)).toEqual([made[1], made[0]]);
    expect(new Set(names).size).toBe(names.length);

    expect(await clickSubmitted(app, made[0])).toBe(true);
    await expect.poll(async () => ((await surface(app)) === "doc" ? docName(app) : ""), { timeout: 40_000 }).toBe(made[0]);
    report("reopened", { name: made[0], surface: await surface(app) });

    const after = await submittedRows(app);
    report("submitted-after-reopen", after);
  } finally {
    const undone = await inErp(app, `(async () => { const out = []; for (const n of ${JSON.stringify(made)}) { try { const d = await frappe.xcall("frappe.client.get_value", { doctype: "Purchase Invoice", filters: { name: n }, fieldname: "docstatus" }); if (d.docstatus === 1) { await frappe.xcall("frappe.client.cancel", { doctype: "Purchase Invoice", name: n }); out.push("cancel " + n); } else if (d.docstatus === 0) { await frappe.xcall("frappe.client.delete", { doctype: "Purchase Invoice", name: n }); out.push("delete " + n); } } catch (e) { out.push("kept " + n); } } return out; })()`, 60_000).catch(() => "ERR");
    report("clear", undone);
    await app.close().catch(() => {});
  }
});
