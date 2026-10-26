/**
 * Typed dates (5zorro): an Item Receipt's typed Date is kept instead of being reset to today on save
 * (2026-09-26). A Bill's posting date is a stamp — the day it is saved or submitted (2026-10-10,
 * reversing 09-26's "posts on its Invoice date"); its Invoice date only drives the due date.
 * Drives the hidden ERP form; never saves.
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

  test("Bill: the Invoice date leaves the posting date on today (a stamp)", async () => {
    test.setTimeout(120_000);
    app = await launchShell();
    await waitForE2eApi(app);
    await e2eCall(app, "openBill", "/app/purchase-invoice/new");
    await waitLoaded(app);
    const r = await inDoc(
      app,
      `(async () => {
        const a = await window.erpDoc.setHeader("bill_date", "2026-08-03");
        return { bill: a.doc.bill_date, posting: a.doc.posting_date, tick: a.doc.set_posting_time };
      })()`,
    );
    const today = await e2eCall(app, "execInView", "erp", `frappe.datetime.get_today()`);
    expect(r).toEqual({ bill: "2026-08-03", posting: today, tick: 0 });
  });

  // 5zorro 2026-10-26: ALL CAPS is on by default on every entry form (OI-111), and the clerk may
  // turn it off. One layer does it: the toggle upper-cases text as it is typed (src/doc-caps-ui.js).
  test("Bill, PO and Item Receipt open with ALL CAPS on; typed line text comes out in capitals, and as typed once it is off", async () => {
    test.setTimeout(180_000);
    app = await launchShell();
    await waitForE2eApi(app);
    const typeKeys = (keys) =>
      app.evaluate(({ webContents }, ks) => {
        const w = webContents.getAllWebContents().find((x) => /doc-form\.html/.test(x.getURL()));
        w.focus();
        for (const k of ks) {
          w.sendInputEvent({ type: "keyDown", keyCode: k });
          w.sendInputEvent({ type: "char", keyCode: k });
          w.sendInputEvent({ type: "keyUp", keyCode: k });
        }
      }, keys);
    for (const [hook, route, prefix] of [
      ["openBill", "/app/purchase-invoice/new", "bill"],
      ["openPo", "/app/purchase-order/new", "doc"],
      ["openReceipt", "/app/purchase-receipt/new", "doc"],
    ]) {
      const box = `document.querySelector('[data-testid="${prefix}-cell-0-description"]')`;
      await e2eCall(app, hook, route);
      await waitLoaded(app);
      await expect.poll(async () => inDoc(app, `!!${box}`), { timeout: 20_000 }).toBe(true);
      expect(await inDoc(app, `document.querySelector('[data-testid="doc-caps"]').textContent.trim()`), route).toBe("⇪ CAPS: ON");
      await inDoc(app, `(() => { const i = ${box}; i.value = ""; i.focus(); return true; })()`);
      await typeKeys([..."bolt kit"]);
      expect(await inDoc(app, `${box}.value`), route).toBe("BOLT KIT");
      // The clerk's choice: off for this page, and typing keeps its case.
      await inDoc(app, `document.querySelector('[data-testid="doc-caps"]').click(); true`);
      expect(await inDoc(app, `document.querySelector('[data-testid="doc-caps"]').textContent.trim()`), route).toBe("⇪ caps: off");
      await inDoc(app, `(() => { const i = ${box}; i.value = ""; i.focus(); return true; })()`);
      await typeKeys([..."Bolt kit"]);
      expect(await inDoc(app, `${box}.value`), route).toBe("Bolt kit");
      await inDoc(app, `document.querySelector('[data-testid="doc-caps"]').click(); true`);
    }
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
