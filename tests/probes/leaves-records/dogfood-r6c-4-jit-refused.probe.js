/**
 * @dogfood R6c-4
 * Plan 10-19 dogfood row R6c-4: a Bill's Submit that makes a just-in-time Item Receipt which
 * ERPNext saves but refuses to submit (its warehouse's stock account is disabled). Questions: does
 * the status give ERPNext's reason and say the bill is a draft, and is there no draft receipt left?
 *
 * 🔴 LEAVES RECORDS (run with --leaves-records, sandbox only): scene `jit-receipt-refused`
 * (tests/probes/dogfood-scenes.js) — the bill is saved as a draft (deleted after); nothing is
 * submitted. Vendor `ZZ DF RECEIVE`, warehouse `ZZ DF Stores`, account `ZZ DF Stock` and item
 * `ZZ-DF-STOCK` stay.
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../../e2e/helpers.js";
import { sleep, inDoc, openNewDoc, assertSandboxSite, keepScene, report } from "../probe-helpers.js";
import { SCENES, inPage } from "../dogfood-scenes.js";
import { billCompareTotal } from "../../../src/bill-map.js";

const scene = SCENES["jit-receipt-refused"];
const SNAP = `(async () => { const s = await window.erpDoc.getSnapshot(); return { doc: s.doc }; })()`;

test("R6c-4: a refused just-in-time receipt leaves no draft and says why", async () => {
  const app = await launchShell();
  try {
    await waitForE2eApi(app);
    await openNewDoc(app, "bill", "/app/purchase-invoice/new");
    await sleep(1500);
    report("site", { companies: await assertSandboxSite(app) });
    const made = await scene.make(app);
    report("scene", made);
    expect(made && made.error).toBeFalsy();

    await inDoc(
      app,
      `(async () => { const d = window.erpDoc;
        await d.setHeader("supplier", ${JSON.stringify(made.vendor)});
        await d.setHeader("bill_no", "ZZ-DF-RECEIVE-" + Date.now() % 100000);
        await d.setItem(0, "item_code", "ZZ-DF-STOCK");
        await d.setItem(0, "qty", 2);
        await d.setItem(0, "rate", 10);
        return true; })()`,
      30_000,
    );
    await sleep(2000);
    const line = (await inDoc(app, SNAP)).doc.items[0];
    report("line", { item: line.item_code, warehouse: line.warehouse });
    expect(line.warehouse).toBe(made.warehouse);
    // Repaint the page from ERPNext's document, as a snapshot from main does.
    const snap = await inDoc(app, SNAP);
    await app.evaluate(({ webContents }, s) => webContents.getAllWebContents().find((w) => /doc-form\.html/.test(w.getURL())).send("doc-snapshot", s), snap);
    await expect.poll(() => inDoc(app, `!!document.querySelector('[data-testid="bill-rec-0-by"]')`), { timeout: 10_000 }).toBe(true);
    await inDoc(app, `document.querySelector('[data-testid="bill-rec-0-by"]').closest("td").click()`);
    await expect.poll(() => inDoc(app, `!!document.querySelector('[data-testid="bill-rec-editor"]')`), { timeout: 10_000 }).toBe(true);
    await inDoc(app, `(() => { const e = document.querySelector('[data-testid="bill-rec-editor"]'); e.querySelector('[data-rec-by]').value = "Probe"; e.querySelector('[data-act="apply"]').click(); return true; })()`);
    await expect.poll(async () => /\[received\]/.test((await inDoc(app, SNAP)).doc.remarks || ""), { timeout: 15_000 }).toBe(true);
    const total = billCompareTotal((await inDoc(app, SNAP)).doc);
    await inDoc(app, `(() => { const a = document.querySelector('[data-testid="bill-amount-due"]'); a.focus(); a.value = ${JSON.stringify(String(total))}; a.dispatchEvent(new Event("input", { bubbles: true })); a.blur(); return true; })()`);
    await inDoc(app, `(() => { window.confirm = () => true; document.getElementById("btn-submit").click(); return true; })()`);
    await expect.poll(() => inDoc(app, `document.getElementById("status").textContent`), { timeout: 90_000 }).toMatch(/draft — fix this and Submit again/);
    const status = await inDoc(app, `document.getElementById("status").textContent`);
    report("status", { status });
    expect(status).toMatch(/^Cannot create accounting entries against disabled accounts: ZZ DF Stock - \w+\. The bill is saved as a draft/);
    const left = await inPage(app, async (v) => ({
      receipts: await frappe.xcall("frappe.client.get_list", { doctype: "Purchase Receipt", filters: { supplier: v, docstatus: ["<", 2] }, fields: ["name", "docstatus"] }),
      bills: await frappe.xcall("frappe.client.get_list", { doctype: "Purchase Invoice", filters: { supplier: v, docstatus: ["<", 2] }, fields: ["name", "docstatus"] }),
    }), made.vendor);
    report("left", left);
    expect(left.receipts).toEqual([]);
    expect(left.bills.map((b) => b.docstatus)).toEqual([0]);
  } finally {
    if (!keepScene()) report("clear", await scene.clear(app));
    await app.close().catch(() => {});
  }
});
