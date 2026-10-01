/**
 * Dogfood round 2026-09-30 (plan 2026-09-26 § N2/N4), against the live sandbox. Never saves.
 *
 * N2 — a Vanilla form with unsaved changes used to make every shell navigation that reloads the
 * ERP view stall silently (Electron cancels the load on Frappe's `beforeunload` and asks no one).
 * Now the clerk is asked; both answers are driven here with the native box stubbed.
 *
 * N4 — leaving a new Doc Bill for a setup peek and pressing Esc must bring back *that* draft,
 * not a fresh blank one painted under the old copy.
 */
import { test, expect } from "@playwright/test";
import { launchShell, e2eCall, e2eGet, waitForE2eApi } from "./helpers.js";

/** @param {import('@playwright/test').ElectronApplication} app @param {string} js */
const inErp = (app, js) => e2eCall(app, "execInView", "erp", js);
/** @param {import('@playwright/test').ElectronApplication} app @param {string} js */
const inDoc = (app, js) => e2eCall(app, "execInView", "docForm", js);

/**
 * Replace the native "Unsaved changes" box with a fixed answer and count how often it is asked.
 * @param {import('@playwright/test').ElectronApplication} app
 * @param {number} answer 0 = stay, 1 = leave
 */
async function stubUnloadBox(app, answer) {
  await app.evaluate(({ dialog }, a) => {
    globalThis.__unloadAsked = 0;
    dialog.showMessageBoxSync = () => {
      globalThis.__unloadAsked += 1;
      return a;
    };
  }, answer);
}

/**
 * Chromium reports the beforeunload prompt to Playwright, which then tries to dismiss a dialog
 * the shell's `will-prevent-unload` handler already answered ("No dialog is showing"). A
 * listener of our own tells Playwright to leave it alone.
 * @param {import('@playwright/test').ElectronApplication} app
 */
function ignorePageDialogs(app) {
  for (const p of app.windows()) p.on("dialog", () => {});
  app.on("window", (p) => p.on("dialog", () => {}));
}

/** @param {import('@playwright/test').ElectronApplication} app */
async function openDirtyTermsTemplate(app) {
  ignorePageDialogs(app);
  await e2eCall(app, "openErp", "/app/payment-terms-template/new");
  await expect
    .poll(async () => inErp(app, `!!(window.cur_frm && cur_frm.doctype === "Payment Terms Template")`), {
      timeout: 40_000,
    })
    .toBe(true);
  const devMode = await inErp(app, `!!(frappe.boot && frappe.boot.developer_mode)`);
  test.skip(devMode, "developer_mode skips Frappe's beforeunload listener — nothing to block");
  // Real key events, not set_value: Chromium only honours a beforeunload block after a user
  // gesture on the page, so a form changed from code never blocks anything.
  await app.evaluate(async ({ webContents }) => {
    const wc = webContents
      .getAllWebContents()
      .find((w) => /payment-terms-template/.test(w.getURL()));
    if (!wc) throw new Error("ERP view not on the terms template");
    await wc.executeJavaScript(
      `document.querySelector('[data-fieldname="template_name"] input').focus()`,
    );
    for (const ch of "E2E unload probe") {
      wc.sendInputEvent({ type: "keyDown", keyCode: ch });
      wc.sendInputEvent({ type: "char", keyCode: ch });
      wc.sendInputEvent({ type: "keyUp", keyCode: ch });
    }
  });
  await expect
    .poll(async () => inErp(app, `!!(cur_frm.is_dirty() && cur_frm.doc.template_name === "E2E unload probe")`), {
      timeout: 10_000,
    })
    .toBe(true);
}

test.describe("scaffold: unsaved Vanilla page + resume (dogfood 2026-09-30)", () => {
  /** @type {import('@playwright/test').ElectronApplication | undefined} */
  let app;
  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
    app = undefined;
  });

  test("N2: Stay keeps the clerk on the unsaved Vanilla page, edits intact", async () => {
    test.setTimeout(120_000);
    app = await launchShell();
    await waitForE2eApi(app);
    await openDirtyTermsTemplate(app);
    await stubUnloadBox(app, 0);

    await e2eCall(app, "openBill", "/app/purchase-invoice/new");

    await expect.poll(async () => app.evaluate(() => globalThis.__unloadAsked), { timeout: 20_000 }).toBe(1);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 10_000 }).toBe("erp");
    expect(await e2eCall(app, "getErpUrl")).toContain("payment-terms-template");
    expect(await e2eCall(app, "currentRoute")).toContain("payment-terms-template");
    expect(await inErp(app, `cur_frm.doc.template_name`)).toBe("E2E unload probe");
  });

  test("N2: Leave discards the Vanilla edits and the Bill opens", async () => {
    test.setTimeout(120_000);
    app = await launchShell();
    await waitForE2eApi(app);
    await openDirtyTermsTemplate(app);
    await stubUnloadBox(app, 1);

    await e2eCall(app, "openBill", "/app/purchase-invoice/new");

    await expect.poll(async () => app.evaluate(() => globalThis.__unloadAsked), { timeout: 20_000 }).toBe(1);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("doc");
    await expect
      .poll(
        async () =>
          inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); return !!(s && s.ok && s.doc && s.doc.doctype === "Purchase Invoice"); })()`),
        { timeout: 40_000 },
      )
      .toBe(true);
  });

  test("N4: Esc from a setup peek brings back the same draft, vendor and all", async () => {
    test.setTimeout(150_000);
    app = await launchShell();
    await waitForE2eApi(app);
    await e2eCall(app, "openBill", "/app/purchase-invoice/new");
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("doc");
    await expect
      .poll(async () => inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); return !!(s && s.ok && s.doc); })()`), {
        timeout: 40_000,
      })
      .toBe(true);

    const supplier = await inErp(
      app,
      `(async () => { const r = await frappe.db.get_list("Supplier", { limit: 1 }); return (r[0] && r[0].name) || ""; })()`,
    );
    test.skip(!supplier, "sandbox has no Supplier");

    const before = await inDoc(
      app,
      `(async () => { const r = await window.erpDoc.setHeader("supplier", ${JSON.stringify(supplier)}); return { ok: r.ok, name: r.doc && r.doc.name, supplier: r.doc && r.doc.supplier }; })()`,
    );
    expect(before.ok).toBe(true);
    expect(before.supplier).toBe(supplier);
    const parkedFrom = await e2eCall(app, "currentRoute");
    test.info().annotations.push({ type: "parked-route", description: parkedFrom });

    await inDoc(app, `window.erpDoc.softPeekRoute(${JSON.stringify(`/app/supplier/${encodeURIComponent(supplier)}`)})`);
    // Let the peek finish rendering first — an Esc inside its own load races Frappe's router
    // (seen on this spec's first run), which is a separate, older question.
    await expect
      .poll(async () => inErp(app, `!!(window.cur_frm && cur_frm.doctype === "Supplier")`), { timeout: 20_000 })
      .toBe(true);

    await inErp(app, `window.erpUiShell.softPeekEsc()`);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("doc");
    await expect
      .poll(
        async () =>
          inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); return s && s.ok && s.doc ? { name: s.doc.name, supplier: s.doc.supplier } : null; })()`),
        { timeout: 30_000 },
      )
      .toEqual({ name: before.name, supplier });
  });
});
