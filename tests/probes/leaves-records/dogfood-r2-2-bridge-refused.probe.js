/**
 * @dogfood R2-2
 * Plan 10-19 dogfood row R2-2: a Bill line assigned to a Sales Order through the real Assign dialog,
 * where ERPNext saves the bridge Purchase Order but refuses its submit (an Authorization Rule: a PO
 * over 99,000 may only be approved by Guest). Questions: does the status line say the line is
 * assigned, the PO was not made, ERPNext's reason, and that nothing was left behind — and is there
 * really no draft PO? The Bill is never saved.
 *
 * 🔴 LEAVES RECORDS (run with --leaves-records, sandbox only): scene `bridge-po-refused`
 * (tests/probes/dogfood-scenes.js) — per run a Sales Order (cancelled and deleted after) and,
 * while it runs, the Authorization Rule (deleted after). The customer `ZZ DF CUSTOMER`, vendor
 * `ZZ DF BRIDGE` and item `ZZ-DF-SERVICE` stay.
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../../e2e/helpers.js";
import { sleep, inDoc, openNewDoc, assertSandboxSite, keepScene, report } from "../probe-helpers.js";
import { SCENES, inPage } from "../dogfood-scenes.js";
import { clickPrimary, assignToOrders } from "../assign-helpers.js";

const scene = SCENES["bridge-po-refused"];
const call = (app, js) => inDoc(app, `(async () => { try { const r = await ${js}; return r && typeof r === "object" ? JSON.parse(JSON.stringify(r)) : r; } catch (e) { return "ERR " + (e && e.message); } })()`, 90_000);

test("R2-2: a refused bridge PO says so, and leaves no draft", async () => {
  const app = await launchShell();
  try {
    await waitForE2eApi(app);
    await openNewDoc(app, "bill", "/app/purchase-invoice/new");
    await sleep(1500);
    report("site", { companies: await assertSandboxSite(app) });
    const made = await scene.make(app);
    report("scene", made);
    expect(made && made.error).toBeFalsy();

    await call(app, `window.erpDoc.setHeader("supplier", ${JSON.stringify(made.vendor)})`);
    await sleep(2500);
    await call(app, `window.erpDoc.setHeader("bill_no", "ZZ-DF-BRIDGE-BILL")`);
    await call(app, `window.erpDoc.setItem(0, "item_code", "ZZ-DF-SERVICE")`);
    await sleep(1500);
    await call(app, `window.erpDoc.setItem(0, "qty", 1)`);
    await call(app, `window.erpDoc.setItem(0, "rate", 100000)`);
    await sleep(1500);

    await assignToOrders(app, { vendor: made.vendor, salesOrders: [made.salesOrder] });
    await clickPrimary(app); // Apply — an exact fill, so no costing box
    await expect.poll(() => inDoc(app, `document.getElementById("status").textContent`), { timeout: 60_000 }).toMatch(/Purchase Order/);
    const status = await inDoc(app, `document.getElementById("status").textContent`);
    report("status", { status });
    expect(status).toMatch(/^Line 1 assigned\./);
    expect(status).toMatch(/The Purchase Order for it was not made: ERPNext refused to submit it \(Not authorized since Grand Total exceeds limits\)\. Nothing was left behind\./);
    const pos = await inPage(app, async (v) => frappe.xcall("frappe.client.get_list", { doctype: "Purchase Order", filters: { supplier: v }, fields: ["name", "docstatus"] }), made.vendor);
    report("pos", pos);
    expect(pos).toEqual([]);
  } finally {
    if (!keepScene()) report("clear", await scene.clear(app));
    await app.close().catch(() => {});
  }
});
