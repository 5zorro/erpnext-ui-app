/**
 * Scaffold — Find pages (OI-056, implementation-plan-2026-09-26 stage F1).
 *
 * Drives the doors that lead to a Find page and the ways out of it, against the live sandbox.
 * The pure decisions are unit-tested (nav-destination, find-skin-registry); this proves the
 * wiring carries them out through real Electron views. Needs ERP up and a logged-in session.
 *
 * ⚠ Runs against the real userData folder like every scaffold here: it leaves the Bill *list*
 * lens on Vanilla (its last step). Back up `lens-prefs.json` first if that matters.
 */
import { test, expect } from "@playwright/test";
import { launchShell, e2eCall, e2eGet, waitForE2eApi } from "./helpers.js";

/** @param {import('@playwright/test').ElectronApplication} app */
const inFind = (app, js) => e2eCall(app, "execInView", "findDoc", js);
/** @param {import('@playwright/test').ElectronApplication} app */
const clickDocTab = (app) =>
  e2eCall(app, "execInView", "chrome", `document.querySelector('[data-testid="lens-doc"]').click(); true`);
/** @param {import('@playwright/test').ElectronApplication} app */
const docTabShown = (app) =>
  e2eCall(app, "execInView", "chrome", `!document.querySelector('[data-testid="lens-doc"]').hidden`);

/**
 * @param {import('@playwright/test').ElectronApplication} app
 * @param {string} route
 */
async function openVanillaList(app, route) {
  await e2eCall(app, "openErp", route);
  // v16 shows `/app/…` as `/desk/…`, and a list may restore its last saved filters (`?…`).
  const tail = route.replace(/^\/app/, "").replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  await expect
    .poll(async () => e2eCall(app, "getErpUrl"), { timeout: 20_000 })
    .toMatch(new RegExp(`/(app|desk)${tail}(\\?|$)`));
  await expect.poll(async () => e2eGet(app, "surfaceMode")).toBe("erp");
}

test.describe("scaffold: find pages", () => {
  /** @type {import('@playwright/test').ElectronApplication | undefined} */
  let app;

  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
    app = undefined;
  });

  test("Doc tab on a list, Find button on a Bill, peek, and out to Vanilla with filters", async () => {
    test.setTimeout(150_000);
    app = await launchShell();
    await waitForE2eApi(app);

    // 1. Vanilla Bill list earns the Doc tab, and it opens Find Bills (list lens → Doc).
    await openVanillaList(app, "/app/purchase-invoice");
    await expect.poll(async () => docTabShown(app), { timeout: 10_000 }).toBe(true);
    await clickDocTab(app);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 10_000 }).toBe("find-doc");
    expect(await e2eCall(app, "currentRoute")).toBe("/app/purchase-invoice");
    await expect
      .poll(async () => inFind(app, `document.querySelector('[data-testid="find-doc-title"]').textContent`))
      .toBe("Find Bills");
    const history = await e2eCall(app, "getHistory");
    expect(history.some((h) => h.label === "Find Bills")).toBe(true);

    // 2. A sample row opens the read-only peek; Esc closes it.
    await inFind(app, `document.querySelector("tr.row").click(); true`);
    expect(await inFind(app, `document.getElementById("peek").hidden`)).toBe(false);
    await inFind(app, `document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); true`);
    expect(await inFind(app, `document.getElementById("peek").hidden`)).toBe(true);

    // 3. Find Bill… on a Doc Bill lands on the Find page with the cursor in the Ref No. box.
    await e2eCall(app, "openBill", "/app/purchase-invoice/new");
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("doc");
    await expect
      .poll(
        async () =>
          e2eCall(app, "execInView", "docForm", `(() => { const b = document.getElementById("btn-find"); return !!(b && !b.disabled); })()`),
        { timeout: 30_000 },
      )
      .toBe(true);
    await e2eCall(app, "execInView", "docForm", `document.getElementById("btn-find").click(); true`);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 15_000 }).toBe("find-doc");
    await expect
      .poll(async () => inFind(app, `document.activeElement && document.activeElement.dataset.id`))
      .toBe("ref");

    // 4. Search in Vanilla list carries the typed boxes as ?field=value filters.
    await inFind(
      app,
      `(() => { const i = document.querySelector('input[data-field="supplier"]'); i.value = "SAMPLE Vendor 01"; i.dispatchEvent(new Event("input")); document.getElementById("btn-vanilla").click(); return true; })()`,
    );
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 15_000 }).toBe("erp");
    await expect
      .poll(async () => e2eCall(app, "getErpUrl"), { timeout: 20_000 })
      .toMatch(/\/(app|desk)\/purchase-invoice\?(.*&)?supplier=SAMPLE(%20|\+)Vendor(%20|\+)01/);
  });

  test("Report view and A/R lists reach their Find pages", async () => {
    test.setTimeout(120_000);
    app = await launchShell();
    await waitForE2eApi(app);

    await openVanillaList(app, "/app/purchase-invoice/view/report");
    await expect.poll(async () => docTabShown(app), { timeout: 10_000 }).toBe(true);
    await clickDocTab(app);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 10_000 }).toBe("find-doc");
    expect(await e2eCall(app, "currentRoute")).toBe("/app/purchase-invoice");

    for (const [route, title] of [
      ["/app/payment-entry", "Find Payments"],
      ["/app/sales-order", "Find Sales Orders"],
    ]) {
      await openVanillaList(app, route);
      await expect.poll(async () => docTabShown(app), { timeout: 10_000 }).toBe(true);
      await clickDocTab(app);
      await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 10_000 }).toBe("find-doc");
      await expect
        .poll(async () => inFind(app, `document.querySelector('[data-testid="find-doc-title"]').textContent`))
        .toBe(title);
    }
  });

  test("F2 doors: Home Enter tile, and Find with the list lens on Vanilla", async () => {
    test.setTimeout(150_000);
    app = await launchShell();
    await waitForE2eApi(app);

    // Home's Enter Bills goes through the shared door and still lands on the Doc Bill.
    await e2eCall(app, "showLauncher");
    await e2eCall(app, "execInView", "home", `document.querySelector('[data-testid="tile-bill-new"]').click(); true`);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("doc");

    // Put the Bill list lens on Vanilla the way a clerk does: Find page → Search in Vanilla list.
    await openVanillaList(app, "/app/purchase-invoice");
    await clickDocTab(app);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 10_000 }).toBe("find-doc");
    await inFind(app, `document.getElementById("btn-vanilla").click(); true`);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 15_000 }).toBe("erp");

    // Find Bill… from a Doc Bill now opens the Vanilla list, not the Find page.
    await e2eCall(app, "openBill", "/app/purchase-invoice/new");
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("doc");
    await expect
      .poll(
        async () =>
          e2eCall(app, "execInView", "docForm", `(() => { const b = document.getElementById("btn-find"); return !!(b && !b.disabled); })()`),
        { timeout: 30_000 },
      )
      .toBe(true);
    await e2eCall(app, "execInView", "docForm", `document.getElementById("btn-find").click(); true`);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 15_000 }).toBe("erp");
    await expect
      .poll(async () => e2eCall(app, "getErpUrl"), { timeout: 20_000 })
      .toMatch(/\/(app|desk)\/purchase-invoice(\?|$)/);
    // The one focus step that survives: the cursor lands in the Ref No. filter.
    await expect
      .poll(
        async () =>
          e2eCall(app, "execInView", "erp", `(() => { const a = document.activeElement; const w = a && a.closest("[data-fieldname]"); return w ? w.getAttribute("data-fieldname") : ""; })()`),
        { timeout: 15_000 },
      )
      .toBe("bill_no");

    // Leave the list lens on Doc for whoever runs next.
    await clickDocTab(app);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 10_000 }).toBe("find-doc");
  });
});
