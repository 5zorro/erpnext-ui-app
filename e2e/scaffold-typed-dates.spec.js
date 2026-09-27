/**
 * Typed dates stick (5zorro 2026-09-26): a Bill's Invoice date is also its posting date ("use
 * typed date and if not exists, then posted date"); an Item Receipt's typed Date is kept instead of
 * being reset to today on save. Drives the hidden ERP form; never saves.
 */
import { test, expect } from "@playwright/test";
import { launchShell, e2eCall, e2eGet, waitForE2eApi } from "./helpers.js";

/** @param {import('@playwright/test').ElectronApplication} app @param {string} js */
const inDoc = (app, js) => e2eCall(app, "execInView", "docForm", js);

/** @param {import('@playwright/test').ElectronApplication} app */
async function waitLoaded(app) {
  await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("doc");
  await expect
    .poll(async () => inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); return !!(s && s.ok && s.doc); })()`), {
      timeout: 40_000,
    })
    .toBe(true);
}

test.describe("scaffold: typed dates stick", () => {
  /** @type {import('@playwright/test').ElectronApplication | undefined} */
  let app;
  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
    app = undefined;
  });

  test("Bill: Invoice date is the posting date; clearing it goes back to today", async () => {
    test.setTimeout(120_000);
    app = await launchShell();
    await waitForE2eApi(app);
    await e2eCall(app, "openBill", "/app/purchase-invoice/new");
    await waitLoaded(app);
    const r = await inDoc(
      app,
      `(async () => {
        const a = await window.erpDoc.setHeader("bill_date", "2026-08-03");
        const typed = { bill: a.doc.bill_date, posting: a.doc.posting_date, tick: a.doc.set_posting_time };
        const b = await window.erpDoc.setHeader("bill_date", "");
        return { typed, cleared: { bill: b.doc.bill_date || "", posting: b.doc.posting_date, tick: b.doc.set_posting_time } };
      })()`,
    );
    expect(r.typed).toEqual({ bill: "2026-08-03", posting: "2026-08-03", tick: 1 });
    const today = await e2eCall(app, "execInView", "erp", `frappe.datetime.get_today()`);
    expect(r.cleared).toEqual({ bill: "", posting: today, tick: 0 });
  });

  test("Item Receipt: a typed Date ticks Edit Posting Date, so save keeps it", async () => {
    test.setTimeout(120_000);
    app = await launchShell();
    await waitForE2eApi(app);
    await e2eCall(app, "openReceipt", "/app/purchase-receipt/new");
    await waitLoaded(app);
    const r = await inDoc(
      app,
      `(async () => {
        const a = await window.erpDoc.setHeader("posting_date", "2026-08-03");
        return { posting: a.doc.posting_date, tick: a.doc.set_posting_time };
      })()`,
    );
    expect(r).toEqual({ posting: "2026-08-03", tick: 1 });
  });
});
