/**
 * DF-02 taxes and charges (2026-10-10), against the live sandbox. Never saves.
 *
 * A new Doc Bill with one stock line picks up the site's Default purchase template (a 6% "On Net
 * Total" row on the blank bench). Each test checks one thing 5zorro hit or asked for:
 * Tab out of a typed Amount commits it; the Tab walk follows ERPNext's rule; Rate % on a % row
 * keeps it a % row; Remove all stays removed through a vendor change; the table never scrolls
 * sideways; the ⓘ explains the default.
 */
import { test, expect } from "@playwright/test";
import { launchShell, e2eCall, e2eGet, waitForE2eApi } from "./helpers.js";

/** @param {import('@playwright/test').ElectronApplication} app @param {string} js */
const inErp = (app, js) => e2eCall(app, "execInView", "erp", js);
/** @param {import('@playwright/test').ElectronApplication} app @param {string} js */
const inDoc = (app, js) => e2eCall(app, "execInView", "docForm", js);
const TAXES = `(async () => { const s = await window.erpDoc.getSnapshot(); return { tmpl: s.doc.taxes_and_charges || "", gt: s.doc.grand_total, rows: (s.doc.taxes || []).map((t) => ({ type: t.charge_type, rate: t.rate, amount: t.tax_amount })) }; })()`;

/** A new Doc Bill with a vendor and one 10 × 40.00 stock line, painted; returns the taxes it got. */
async function billWithDefaultTax(app) {
  await e2eCall(app, "openBill", "/app/purchase-invoice/new");
  await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("doc");
  await expect
    .poll(async () => inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); return !!(s && s.ok && s.doc); })()`), {
      timeout: 40_000,
    })
    .toBe(true);
  const facts = await inErp(
    app,
    `(async () => {
      const s = await frappe.db.get_list("Supplier", { limit: 2 });
      const i = await frappe.db.get_list("Item", { filters: { is_stock_item: 1, disabled: 0 }, limit: 1 });
      const d = await frappe.db.get_list("Purchase Taxes and Charges Template", { filters: { is_default: 1 }, limit: 1 });
      return { suppliers: s.map((x) => x.name), item: (i[0] && i[0].name) || "", tmpl: (d[0] && d[0].name) || "" };
    })()`,
  );
  test.skip(!facts.suppliers.length || !facts.item || !facts.tmpl, "sandbox needs a Supplier, a stock Item and a Default purchase tax template");
  const filled = await inDoc(
    app,
    `(async () => {
      const d = window.erpDoc;
      await d.setHeader("supplier", ${JSON.stringify(facts.suppliers[0])});
      let s = await d.getSnapshot();
      if (!(s.doc.items || []).length) await d.addItem();
      await d.setItem(0, "item_code", ${JSON.stringify(facts.item)});
      await d.setItem(0, "qty", 10);
      await d.setItem(0, "rate", 40);
      s = await d.getSnapshot();
      return { doc: s.doc, amountDue: s.amountDue };
    })()`,
  );
  test.skip(!(filled.doc.taxes || []).length || filled.doc.taxes[0].charge_type === "Actual", "Default template has no percentage row");
  await app.evaluate(({ webContents }, snap) => {
    webContents.getAllWebContents().find((w) => /doc-form\.html/.test(w.getURL())).send("doc-snapshot", snap);
  }, filled);
  await expect
    .poll(async () => inDoc(app, `!!document.querySelector('[data-testid="bill-tax-0-amount"]')`), { timeout: 10_000 })
    .toBe(true);
  return { facts, doc: filled.doc };
}

/** Type into a tax cell like a clerk (value + input), then press a key in it. */
const typeThenKey = (testid, value, key) =>
  `(() => { const i = document.querySelector('[data-testid="${testid}"]'); i.focus(); i.value = ${JSON.stringify(value)}; i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true })); })()`;

test.describe("scaffold: Bill taxes and charges (DF-02)", () => {
  /** @type {import('@playwright/test').ElectronApplication | undefined} */
  let app;
  test.beforeEach(async () => {
    app = await launchShell();
    await waitForE2eApi(app);
  });
  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
    app = undefined;
  });

  test("Tab out of a typed Amount commits it; the row becomes fixed and says it was a %", async () => {
    test.setTimeout(150_000);
    const { doc } = await billWithDefaultTax(app);
    const net = Number(doc.net_total);
    await inDoc(app, typeThenKey("bill-tax-0-amount", "0", "Tab"));
    await expect.poll(async () => inDoc(app, TAXES), { timeout: 20_000 }).toMatchObject({ gt: net, rows: [{ type: "Actual", amount: 0 }] });
    await expect.poll(async () => inDoc(app, `!!document.querySelector('[data-testid="bill-tax-0-fixed"]')`), { timeout: 10_000 }).toBe(true);
  });

  test("Tab walk: Account → Rate % on a percentage row; Rate % keeps it a percentage row", async () => {
    test.setTimeout(150_000);
    await billWithDefaultTax(app);
    await inDoc(app, `(() => { const i = document.querySelector('[data-testid="bill-tax-0-account"]'); i.focus(); i.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })); })()`);
    await expect
      .poll(async () => inDoc(app, `document.activeElement && document.activeElement.getAttribute("data-testid")`), { timeout: 10_000 })
      .toBe("bill-tax-0-rate");
    await inDoc(app, typeThenKey("bill-tax-0-rate", "5", "Tab"));
    await expect
      .poll(async () => inDoc(app, TAXES), { timeout: 20_000 })
      .toMatchObject({ rows: [{ type: "On Net Total", rate: 5, amount: 20 }] });
  });

  test("Remove all clears rows and template, and stays removed through a vendor change", async () => {
    test.setTimeout(150_000);
    const { facts } = await billWithDefaultTax(app);
    await inDoc(app, `document.querySelector('[data-testid="bill-remove-all-tax"]').click()`);
    await expect.poll(async () => inDoc(app, TAXES), { timeout: 20_000 }).toMatchObject({ tmpl: "", rows: [] });
    const other = facts.suppliers[1] || facts.suppliers[0];
    test.skip(other === facts.suppliers[0], "needs a second Supplier to change to");
    // A vendor change runs ERPNext's party defaults, which set the Default template again.
    const changed = await inDoc(app, `(async () => { const s = await window.erpDoc.setHeader("supplier", ${JSON.stringify(other)}); return { ok: !!s.ok, tmpl: (s.doc && s.doc.taxes_and_charges) || "", rows: ((s.doc && s.doc.taxes) || []).length }; })()`);
    expect(changed.ok).toBe(true);
    // Whether the vendor change refilled them depends on the site's Tax Rules; a refill is the
    // template coming back, so put it back the way ERPNext would and expect them gone again.
    const refilled = await inDoc(app, `(async () => { const s = await window.erpDoc.setHeader("taxes_and_charges", ${JSON.stringify(facts.tmpl)}); return ((s.doc && s.doc.taxes) || []).length; })()`);
    expect(refilled).toBeGreaterThan(0);
    const snap = await inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); return { doc: s.doc, amountDue: s.amountDue }; })()`);
    await app.evaluate(({ webContents }, s) => {
      webContents.getAllWebContents().find((w) => /doc-form\.html/.test(w.getURL())).send("doc-snapshot", s);
    }, snap);
    await expect.poll(async () => inDoc(app, TAXES), { timeout: 30_000 }).toMatchObject({ rows: [] });
  });

  test("the table never scrolls sideways and 🗑 is in view; the ⓘ names the Default template", async () => {
    test.setTimeout(150_000);
    const { facts } = await billWithDefaultTax(app);
    const box = await inDoc(
      app,
      `(() => {
        const p = document.querySelector('[data-testid="bill-tax-panel"]');
        const del = document.querySelector('[data-testid="bill-tax-del-0"]').getBoundingClientRect();
        const pr = p.getBoundingClientRect();
        return { overflow: p.scrollWidth - p.clientWidth, delInside: del.right <= pr.right + 0.5 && del.width > 0 };
      })()`,
    );
    expect(box.overflow).toBeLessThanOrEqual(0);
    expect(box.delInside).toBe(true);
    await inDoc(app, `document.querySelector('[data-testid="bill-tax-default"]').click()`);
    await expect
      .poll(async () => inDoc(app, `document.querySelector('[data-testid="bill-tax-default-note"]').textContent`), { timeout: 15_000 })
      .toContain(`${facts.tmpl}, the template marked Default`);
  });
});
