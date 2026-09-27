/**
 * Scaffold — Find pages (OI-056, implementation-plan-2026-09-26 stages F1–F3; rows are live since F3).
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

    // 2. Live rows (F3): a real Bill opens the read-only peek with its lines read from ERPNext;
    //    Esc closes it.
    await expect
      .poll(async () => inFind(app, `document.querySelectorAll("tr.row").length`), { timeout: 20_000 })
      .toBeGreaterThan(0);
    expect(await inFind(app, `document.querySelector("tr.row").dataset.name`)).toMatch(/^ACC-PINV-/);
    await inFind(app, `document.querySelector("tr.row").click(); true`);
    expect(await inFind(app, `document.getElementById("peek").hidden`)).toBe(false);
    await expect
      .poll(async () => inFind(app, `document.querySelectorAll('[data-testid="find-doc-peek-lines"] tr').length`), {
        timeout: 15_000,
      })
      .toBeGreaterThan(0);
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

  test("F3: a search narrows live rows; the peek's Open lands on that document's Doc skin", async () => {
    test.setTimeout(150_000);
    app = await launchShell();
    await waitForE2eApi(app);
    await openVanillaList(app, "/app/sales-invoice");
    await clickDocTab(app);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 10_000 }).toBe("find-doc");
    await expect
      .poll(async () => inFind(app, `document.querySelectorAll("tr.row").length`), { timeout: 20_000 })
      .toBeGreaterThan(0);
    const before = await inFind(app, `document.querySelectorAll("tr.row").length`);

    // Search by one customer — every card left is that customer.
    await inFind(
      app,
      `(() => { const i = document.querySelector('input[data-field="customer"]'); i.value = "SAMPLE Customer 01"; i.dispatchEvent(new Event("input")); return true; })()`,
    );
    await expect
      .poll(async () => inFind(app, `[...document.querySelectorAll(".card-head h2")].map((h) => h.textContent).join("|")`), {
        timeout: 15_000,
      })
      .toBe("SAMPLE Customer 01");
    expect(await inFind(app, `document.querySelectorAll("tr.row").length`)).toBeLessThan(before);

    const name = await inFind(app, `document.querySelector("tr.row").dataset.name`);
    await inFind(app, `document.querySelector("tr.row").click(); true`);
    await inFind(app, `document.getElementById("peek-open").click(); true`);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("doc");
    expect(await e2eCall(app, "getActiveDocSkin")).toBe("invoice");
    expect(await e2eCall(app, "currentRoute")).toBe(`/app/sales-invoice/${name}`);
  });

  test("sort by a column across every match, page on from an offset, and remember the search", async () => {
    test.setTimeout(180_000);
    app = await launchShell();
    await waitForE2eApi(app);
    await openVanillaList(app, "/app/purchase-invoice");
    await clickDocTab(app);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 10_000 }).toBe("find-doc");
    await expect
      .poll(async () => inFind(app, `document.querySelectorAll("tr.row").length`), { timeout: 20_000 })
      .toBeGreaterThan(0);

    // Sort by Amount: the first card's first row is the biggest bill of all.
    await inFind(app, `document.querySelector('th[data-sort="grand_total"]').click(); true`);
    await expect
      .poll(async () => inFind(app, `document.querySelector("th.sorted") && document.querySelector("th.sorted").dataset.sort`), { timeout: 15_000 })
      .toBe("grand_total");
    const amounts = await inFind(
      app,
      `(async () => { const r = await window.erpFindDoc.list("purchase-invoice", { sort: { field: "grand_total", dir: "desc" } }); return r.rows.map((x) => x.grand_total); })()`,
    );
    for (let i = 1; i < amounts.length; i++) expect(amounts[i - 1]).toBeGreaterThanOrEqual(amounts[i]);

    // The next page starts after the rows already shown (the "Show more" button asks for this).
    const paged = await inFind(
      app,
      `(async () => { const all = await window.erpFindDoc.list("purchase-invoice", {}); const rest = await window.erpFindDoc.list("purchase-invoice", { start: 10 }); return { all: all.rows.map((r) => r.name), rest: rest.rows.map((r) => r.name) }; })()`,
    );
    // Both answers are capped at the page size, so compare where they overlap.
    expect(paged.rest.slice(0, paged.all.length - 10)).toEqual(paged.all.slice(10));

    // With more than a page of bills, "Show more" appends the next page below the first.
    const firstPage = await inFind(app, `document.querySelectorAll("tr.row").length`);
    if (!(await inFind(app, `document.getElementById("more-row").hidden`))) {
      await inFind(app, `document.getElementById("btn-more").click(); true`);
      await expect
        .poll(async () => inFind(app, `document.querySelectorAll("tr.row").length`), { timeout: 15_000 })
        .toBeGreaterThan(firstPage);
    }

    // Remember: type a vendor, restart the app, come back — the search is still there.
    await inFind(
      app,
      `(() => { const i = document.querySelector('input[data-field="supplier"]'); i.value = "SAMPLE Vendor 01"; i.dispatchEvent(new Event("input")); return true; })()`,
    );
    await expect
      .poll(async () => inFind(app, `[...document.querySelectorAll(".card-head h2")].map((h) => h.textContent).join("|")`), { timeout: 15_000 })
      .toBe("SAMPLE Vendor 01");
    await app.close();
    app = await launchShell();
    await waitForE2eApi(app);
    await openVanillaList(app, "/app/purchase-invoice");
    await clickDocTab(app);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 10_000 }).toBe("find-doc");
    await expect
      .poll(async () => inFind(app, `document.querySelector('input[data-field="supplier"]').value`), { timeout: 15_000 })
      .toBe("SAMPLE Vendor 01");
    expect(await inFind(app, `document.querySelector("th.sorted") && document.querySelector("th.sorted").dataset.sort`)).toBe("grand_total");

    // Clear puts the page back to every bill, newest first — and leaves it that way for the clerk.
    await inFind(app, `document.getElementById("btn-clear").click(); true`);
    await expect
      .poll(async () => inFind(app, `document.querySelector('input[data-field="supplier"]').value`), { timeout: 10_000 })
      .toBe("");
    await expect.poll(async () => inFind(app, `document.getElementById("btn-clear").hidden`), { timeout: 15_000 }).toBe(true);
  });
});
