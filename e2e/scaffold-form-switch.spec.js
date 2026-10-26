/**
 * One doc-form window, several forms in a row (a PO, then an Item Receipt, then a PO): main keeps the
 * page and only swaps its layout. Each table's header click must still sort once — wiring it again
 * on every switch ran one click twice, so a new sort came out ▼ and later clicks looked stuck
 * (found in the end-of-session review 2026-10-26, plan 10-25). Never saves.
 */
import { test, expect } from "@playwright/test";
import { launchShell, e2eCall, e2eGet, waitForE2eApi } from "./helpers.js";

/** @param {import('@playwright/test').ElectronApplication} app @param {string} js */
const inDoc = (app, js) => e2eCall(app, "execInView", "docForm", js);

/** @param {import('@playwright/test').ElectronApplication} app @param {string} hook @param {string} route @param {RegExp} name */
async function open(app, hook, route, name) {
  await e2eCall(app, hook, route);
  await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("doc");
  await expect
    .poll(async () => inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); return !!(s && s.ok && s.doc && ${name}.test(s.doc.name)); })()`), {
      timeout: 40_000,
    })
    .toBe(true);
}

/** Click a header and read it back once the table has repainted. */
const clickHeader = (sel) =>
  `(async () => { document.querySelector('${sel}').click(); await new Promise((r) => setTimeout(r, 300)); return document.querySelector('${sel}').textContent.trim(); })()`;

test.describe("scaffold: one window, several forms", () => {
  /** @type {import('@playwright/test').ElectronApplication | undefined} */
  let app;
  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
    app = undefined;
  });

  test("PO → Item Receipt → PO → Item Receipt: one header click sorts once, on the lines and on the taxes", async () => {
    test.setTimeout(180_000);
    app = await launchShell();
    await waitForE2eApi(app);
    await open(app, "openPo", "/app/purchase-order/new", /new-purchase-order/);
    await open(app, "openReceipt", "/app/purchase-receipt/new", /new-purchase-receipt/);
    await open(app, "openPo", "/app/purchase-order/new", /new-purchase-order/);
    const desc = `#items-head-row th[data-sort="description"]`;
    await expect.poll(async () => inDoc(app, `!!document.querySelector('${desc}')`), { timeout: 20_000 }).toBe(true);
    expect(await inDoc(app, clickHeader(desc))).toMatch(/^Description\s*▲$/);
    await open(app, "openReceipt", "/app/purchase-receipt/new", /new-purchase-receipt/);
    const acct = `#taxes-head-row th[data-tax-sort="account_head"]`;
    await expect.poll(async () => inDoc(app, `!!document.querySelector('${acct}')`), { timeout: 20_000 }).toBe(true);
    expect(await inDoc(app, clickHeader(acct))).toMatch(/^Account\s*▲$/);
  });
});
