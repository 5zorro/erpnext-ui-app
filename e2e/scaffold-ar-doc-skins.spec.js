/**
 * Scaffold — A/R Doc skins (plan 2026-09-26, stage A1): Estimate, Sales Order, Invoice,
 * Receive Payment. Opens each from its Home tile and drives the hidden ERP form through the
 * same preload calls the page uses. Never saves — nothing is written to the sandbox.
 *
 * Needs ERP up, a logged-in session, and the SAMPLE customers (SAMPLE Customer 01 has open
 * invoices; SKU005 has a current Standard Selling price).
 *
 * ⚠ Runs against the real userData folder: it leaves the payment direction on Receive. Back up
 * `payment-direction-prefs.json` / `lens-prefs.json` first (CLAUDE.md Layer-3 smoke).
 */
import { test, expect } from "@playwright/test";
import { launchShell, e2eCall, e2eGet, waitForE2eApi } from "./helpers.js";

/** @param {import('@playwright/test').ElectronApplication} app @param {string} js */
const inDoc = (app, js) => e2eCall(app, "execInView", "docForm", js);

/**
 * @param {import('@playwright/test').ElectronApplication} app
 * @param {string} tileId
 * @param {string} skin
 */
async function openFromHomeTile(app, tileId, skin) {
  await e2eCall(app, "showLauncher");
  await e2eCall(app, "execInView", "home", `document.querySelector('[data-testid="tile-${tileId}"]').click(); true`);
  await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("doc");
  await expect.poll(async () => e2eCall(app, "getActiveDocSkin"), { timeout: 10_000 }).toBe(skin);
  // The page has booted its layout and the hidden ERP form is loaded.
  await expect
    .poll(async () => inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); return !!(s && s.ok && s.doc); })()`), {
      timeout: 40_000,
    })
    .toBe(true);
}

/** @param {import('@playwright/test').ElectronApplication} app */
const docTabLit = (app) =>
  e2eCall(
    app,
    "execInView",
    "chrome",
    `(() => { const b = document.querySelector('[data-testid="lens-doc"]'); return !!b && !b.hidden; })()`,
  );

test.describe("scaffold: A/R Doc skins", () => {
  /** @type {import('@playwright/test').ElectronApplication | undefined} */
  let app;

  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
    app = undefined;
  });

  test("Estimate: Home tile → Doc skin; customer and a priced line fill from ERPNext", async () => {
    test.setTimeout(150_000);
    app = await launchShell();
    await waitForE2eApi(app);
    await openFromHomeTile(app, "estimate-new", "estimate");
    expect(await docTabLit(app)).toBe(true);
    expect(await inDoc(app, `document.getElementById("doc-title").textContent`)).toBe("Estimate");
    expect(await inDoc(app, `document.documentElement.dataset.docDesk`)).toBe("ar");

    const after = await inDoc(
      app,
      `(async () => {
        const h = await window.erpDoc.setHeader("party_name", "SAMPLE Customer 01");
        const items = (h.doc && h.doc.items) || [];
        const r = await window.erpDoc.setItem(0, "item_code", "SKU005");
        const row = (r.doc && r.doc.items && r.doc.items[0]) || {};
        return { ok: h.ok && r.ok, doctype: r.doc && r.doc.doctype, party: r.doc && r.doc.party_name, rows: items.length, rate: row.rate };
      })()`,
    );
    expect(after.ok).toBe(true);
    expect(after.doctype).toBe("Quotation");
    expect(after.party).toBe("SAMPLE Customer 01");
    expect(after.rows).toBeGreaterThanOrEqual(1);
    // SKU005's Standard Selling price (100) — not its Standard Buying cost (222).
    expect(after.rate).toBe(100);

    // Find Estimates… on the Doc skin lands on the Estimates Find page (F4 for A/R).
    await inDoc(app, `document.getElementById("btn-find").click(); true`);
    // If the page counts the typing as unsaved, its gate asks first: Discard.
    await expect
      .poll(
        async () => {
          if ((await e2eGet(app, "surfaceMode")) === "find-doc") return true;
          await inDoc(app, `(() => { const b = document.querySelector('[data-testid="doc-gate-discard"]'); if (b && b.offsetParent) b.click(); return true; })()`).catch(() => {});
          return false;
        },
        { timeout: 20_000 },
      )
      .toBe(true);
    await expect
      .poll(async () => e2eCall(app, "execInView", "findDoc", `document.querySelector('[data-testid="find-doc-title"]').textContent`))
      .toBe("Find Estimates");
  });

  test("Sales Order: header Ship by reaches lines, including a new one; progress strip shows", async () => {
    test.setTimeout(150_000);
    app = await launchShell();
    await waitForE2eApi(app);
    await openFromHomeTile(app, "so-new", "sales-order");
    const r = await inDoc(
      app,
      `(async () => {
        await window.erpDoc.setHeader("customer", "SAMPLE Customer 01");
        await window.erpDoc.setItem(0, "item_code", "SKU005");
        await window.erpDoc.setHeader("delivery_date", "2027-01-15");
        const added = await window.erpDoc.addItem();
        const items = (added.doc && added.doc.items) || [];
        return { dates: items.map((i) => i.delivery_date), doctype: added.doc && added.doc.doctype };
      })()`,
    );
    expect(r.doctype).toBe("Sales Order");
    expect(r.dates).toEqual(["2027-01-15", "2027-01-15"]);
    await inDoc(app, `(async () => { await new Promise((res) => setTimeout(res, 300)); return true; })()`);
    expect(await inDoc(app, `!document.getElementById("doc-progress").hidden`)).toBe(true);
  });

  test("Invoice and Receive Payment: tiles open their skins; a customer lists open invoices", async () => {
    test.setTimeout(180_000);
    app = await launchShell();
    await waitForE2eApi(app);
    await openFromHomeTile(app, "invoice-new", "invoice");
    expect(await inDoc(app, `document.getElementById("doc-title").textContent`)).toBe("Invoice");
    expect(await e2eCall(app, "currentRoute")).toMatch(/^\/app\/sales-invoice\//);

    // Leave the blank invoice without the unsaved-changes gate: nothing has been typed.
    await openFromHomeTile(app, "receive-pay", "receive-payment");
    // Frappe promotes `/new` to `/new-payment-entry-…` once the blank form exists.
    expect(await e2eCall(app, "currentRoute")).toMatch(/^\/app\/payment-entry\/new/);
    expect(await docTabLit(app)).toBe(true);
    const r = await inDoc(
      app,
      `(async () => {
        const s = await window.erpDoc.getSnapshot();
        const h = await window.erpDoc.setHeader("party", "SAMPLE Customer 01");
        const refs = (h.doc && h.doc.references) || [];
        return {
          type: s.doc.payment_type,
          partyType: s.doc.party_type,
          ok: h.ok,
          warning: h.warning || "",
          refs: refs.length,
          invoices: refs.every((x) => x.reference_doctype === "Sales Invoice"),
        };
      })()`,
    );
    expect(r.type).toBe("Receive");
    expect(r.partyType).toBe("Customer");
    expect(r.ok).toBe(true);
    expect(r.warning).toBe("");
    expect(r.refs).toBeGreaterThan(0);
    expect(r.invoices).toBe(true);
    await expect
      .poll(async () => inDoc(app, `document.querySelectorAll("#items-body tr").length`), { timeout: 10_000 })
      .toBeGreaterThan(0);
    expect(await inDoc(app, `document.getElementById("doc-lines-title").textContent`)).toBe("Open invoices");
    expect(await inDoc(app, `document.getElementById("btn-add-line").hidden`)).toBe(true);
  });
});
