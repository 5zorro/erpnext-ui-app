/**
 * Who is a peek parent, and the Recent dropdown (plan 2026-09-26 N1), against the live sandbox.
 * Drives Frappe's own router inside the ERP view, so the page's hop reports are the real ones.
 * Never saves.
 */
import { test, expect } from "@playwright/test";
import { launchShell, e2eCall, waitForE2eApi } from "./helpers.js";

/** @param {import('@playwright/test').ElectronApplication} app @param {string} js */
const inErp = (app, js) => e2eCall(app, "execInView", "erp", js);

/** @param {import('@playwright/test').ElectronApplication} app */
function ignorePageDialogs(app) {
  for (const p of app.windows()) p.on("dialog", () => {});
  app.on("window", (p) => p.on("dialog", () => {}));
}

/** @param {import('@playwright/test').ElectronApplication} app @param {string} doctype */
async function waitForm(app, doctype) {
  await expect
    .poll(async () => inErp(app, `!!(window.cur_frm && cur_frm.doctype === ${JSON.stringify(doctype)})`), {
      timeout: 40_000,
    })
    .toBe(true);
}

/**
 * Any Supplier and any Address — they need not belong together, the test only follows links.
 * @param {import('@playwright/test').ElectronApplication} app
 */
async function firstAddress(app) {
  return inErp(
    app,
    `(async () => {
      const a = await frappe.db.get_list("Address", { fields: ["name"], limit: 1 });
      const s = await frappe.db.get_list("Supplier", { fields: ["name"], limit: 1 });
      if (!a[0] || !s[0]) return null;
      return { address: a[0].name, supplier: s[0].name };
    })()`,
  );
}

const enc = (s) => encodeURIComponent(s);
/** @param {import('@playwright/test').ElectronApplication} app */
const peek = (app) => e2eCall(app, "getPeekStack");

test.describe("scaffold: peek parents and the Recent dropdown (N1)", () => {
  /** @type {import('@playwright/test').ElectronApplication | undefined} */
  let app;
  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
    app = undefined;
  });

  test("unsaved Vanilla Bill → Supplier → Address: Esc returns to the Bill, never ping-pongs; Recent folds both under it; a dropdown child reopens with Esc back", async () => {
    test.setTimeout(180_000);
    app = await launchShell();
    await waitForE2eApi(app);
    ignorePageDialogs(app);

    await e2eCall(app, "openErp", "/app/purchase-invoice/new");
    await waitForm(app, "Purchase Invoice");
    const found = await firstAddress(app);
    test.skip(!found || !found.supplier, "sandbox has no Supplier or no Address");
    const { supplier, address } = found;
    const billName = await inErp(app, `cur_frm.doc.name`);
    const billRoute = `/app/purchase-invoice/${billName}`;

    // The clerk follows links out of an unsaved draft: Frappe routes, the page reports the hop.
    await inErp(app, `frappe.set_route("Form", "Supplier", ${JSON.stringify(supplier)})`);
    await waitForm(app, "Supplier");
    await expect.poll(async () => (await peek(app))?.parent?.route, { timeout: 10_000 }).toBe(billRoute);

    await inErp(app, `frappe.set_route("Form", "Address", ${JSON.stringify(address)})`);
    await waitForm(app, "Address");
    await expect
      .poll(async () => ((await peek(app))?.children || []).map((c) => c.dt), { timeout: 10_000 })
      .toEqual(["supplier", "address"]);

    // Esc on a child → the Bill (the parent), not the sibling.
    await inErp(app, `window.erpUiShell.softPeekEsc()`);
    await waitForm(app, "Purchase Invoice");
    expect(await inErp(app, `cur_frm.doc.name`)).toBe(billName);
    expect((await peek(app))?.parent?.route).toBe(billRoute);

    // Esc on the parent ends the session — and stays on the Bill (the old bug bounced on).
    await inErp(app, `window.erpUiShell.softPeekEsc()`);
    await expect.poll(async () => peek(app), { timeout: 10_000 }).toBe(null);
    await new Promise((r) => setTimeout(r, 1500));
    expect(await e2eCall(app, "getErpUrl")).toContain(`/purchase-invoice/${billName}`);

    // Recent: one row for the Bill with both peeks folded under it, none as rows of their own.
    const rows = await e2eCall(app, "getRecentRows");
    const billRow = rows.find((r) => r.dt === "purchase-invoice");
    expect(billRow.treeRole).toBe("parent");
    expect(billRow.peekLive).toBe(false);
    expect(billRow.peekChildren.map((c) => c.dt)).toEqual(["address", "supplier"]); // newest first
    expect(rows.some((r) => r.dt === "supplier" || r.dt === "address")).toBe(false);

    // Leave the Bill (in place, so the draft stays in Frappe's memory), then pick the Address
    // from the Bill's dropdown: it opens as a peek of the Bill, and Esc goes back to that draft.
    await inErp(app, `frappe.set_route("List", "Supplier")`);
    await expect.poll(async () => e2eCall(app, "getErpUrl"), { timeout: 10_000 }).toMatch(/\/supplier(\?|$|\/view)/);
    const addressRoute = `/app/address/${enc(address)}`;
    await app.evaluate(
      ({ ipcMain }, a) => ipcMain.emit("open-peek-child", {}, a.child, a.parent),
      { child: addressRoute, parent: billRoute },
    );
    await waitForm(app, "Address");
    await expect.poll(async () => (await peek(app))?.parent?.reopen, { timeout: 10_000 }).toBe(true);

    await inErp(app, `window.erpUiShell.softPeekEsc()`);
    await expect
      .poll(async () => e2eCall(app, "getErpUrl"), { timeout: 20_000 })
      .toContain(`/purchase-invoice/${billName}`);
    await waitForm(app, "Purchase Invoice");
    expect(await inErp(app, `cur_frm.doc.name`)).toBe(billName);
  });

  test("a clean saved form left for a setup record is plain navigation, not a peek", async () => {
    test.setTimeout(120_000);
    app = await launchShell();
    await waitForE2eApi(app);
    ignorePageDialogs(app);
    await e2eCall(app, "openErp", "/app/purchase-invoice/new");
    await waitForm(app, "Purchase Invoice");
    const found = await firstAddress(app);
    test.skip(!found || !found.supplier, "sandbox has no Supplier or no Address");

    await e2eCall(app, "openErp", `/app/supplier/${enc(found.supplier)}`);
    await waitForm(app, "Supplier");
    expect(await inErp(app, `!!cur_frm.doc.__unsaved`)).toBe(false);

    await inErp(app, `frappe.set_route("Form", "Address", ${JSON.stringify(found.address)})`);
    await waitForm(app, "Address");
    await new Promise((r) => setTimeout(r, 1000));
    expect(await peek(app)).toBe(null);
  });
});
