/**
 * End-of-session review 2026-10-31, S1: a second press on a dialog's Apply while the first is still
 * working. Questions, on an unsaved new Bill: Allocate's Apply pressed twice at once — is the charge
 * put into the item costs once, and does a toast say the second press was held back (5zorro: "I
 * don't want something silently ignored")? Clicking that toast — does it run it again (his
 * override)? Assign's Apply pressed twice — the same toast? Makes no records: the Bill is never
 * saved, and Assign runs with no Sales Order (so no bridge Purchase Order).
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../e2e/helpers.js";
import { sleep, inDoc, inErp, openNewDoc, assertSandboxSite, report, closeSourcePickers } from "./probe-helpers.js";

const VENDOR = "ZZ DF BRIDGE";
const status = (app) => inDoc(app, `document.getElementById("status").textContent`);
const toast = (app) => inDoc(app, `(() => { const t = document.querySelector('[data-testid="bill-toast"]'); return t && !t.hidden ? t.textContent : null; })()`);
const LINES = `(async () => { const s = await window.erpDoc.getSnapshot(); return { net: s.doc.net_total, gt: s.doc.grand_total, deducts: s.doc.taxes.filter((t) => t.add_deduct_tax === "Deduct").length }; })()`;

async function newBill(app) {
  await openNewDoc(app, "bill", "/app/purchase-invoice/new");
  await sleep(1500);
}

test("Allocate: a second Apply is held back and said; the toast runs it again", async () => {
  const app = await launchShell();
  try {
    await waitForE2eApi(app);
    await newBill(app);
    await assertSandboxSite(app);
    const items = await inErp(app, `(async () => (await frappe.db.get_list("Item", { filters: { is_stock_item: 1, disabled: 0 }, limit: 2 })).map((x) => x.name))()`);
    const acct = await inErp(app, `(async () => (await frappe.db.get_list("Account", { filters: { root_type: "Expense", is_group: 0, account_name: ["like", "%Freight%"] }, limit: 1 }))[0].name)()`);
    const built = await inDoc(app, `(async () => {
      const d = window.erpDoc;
      await d.setHeader("supplier", ${JSON.stringify(VENDOR)});
      await new Promise((r) => setTimeout(r, 2500));
      await d.setItem(0, "item_code", ${JSON.stringify(items[0])}); await d.setItem(0, "qty", 3); await d.setItem(0, "rate", 21);
      let s = await d.getSnapshot();
      if ((s.doc.items || []).length < 2) await d.addItem();
      await d.setItem(1, "item_code", ${JSON.stringify(items[1])}); await d.setItem(1, "qty", 4); await d.setItem(1, "rate", 26.5);
      const r = await d.addTax(${JSON.stringify(acct)}, 14.28, "");
      s = await d.getSnapshot();
      return JSON.parse(JSON.stringify({ ok: r && r.ok, doc: s.doc, amountDue: s.amountDue }));
    })()`, 120_000);
    expect(built.ok).toBe(true);
    await app.evaluate(({ webContents }, snap) => {
      webContents.getAllWebContents().find((w) => /doc-form\.html/.test(w.getURL())).send("doc-snapshot", snap);
    }, built);
    await closeSourcePickers(app);
    const ci = built.doc.taxes.findIndex((t) => Number(t.tax_amount) === 14.28);
    const open = async () => {
      await expect.poll(async () => inDoc(app, `!!document.querySelector('[data-tax-alloc="${ci}"]')`), { timeout: 10_000 }).toBe(true);
      await inDoc(app, `document.querySelector('[data-tax-alloc="${ci}"]').click(); true`);
      await expect.poll(async () => inDoc(app, `!!document.querySelector('[data-testid="bill-alloc-apply"]')`), { timeout: 10_000 }).toBe(true);
    };

    // Two presses in the same moment: the second comes while the first call is out.
    await open();
    const { shown, onTop } = await inDoc(app, `(() => { const b = document.querySelector('[data-testid="bill-alloc-apply"]'); b.click(); b.click();
      const t = document.querySelector('[data-testid="bill-toast"]'); if (!t || t.hidden) return { shown: null, onTop: false };
      const r = t.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { shown: t.textContent, onTop: !!hit && (hit === t || t.contains(hit)) }; })()`);
    report("toast", { shown, onTop });
    expect(onTop).toBe(true); // over the dialog's backdrop, so a real click reaches it
    expect(shown).toMatch(/Still working on "Apply to items" — your second press was held back\. Click here to run it again anyway\./);
    await expect.poll(() => status(app), { timeout: 30_000 }).toMatch(/^Allocated \$14\.28 into item costs, exactly/);
    const once = await inDoc(app, LINES);
    report("once", once);
    expect(once).toEqual({ net: 183.28, gt: 183.28, deducts: 1 });
    await expect.poll(() => toast(app), { timeout: 5_000 }).toBeNull(); // gone when the first call ended

    // The override: press, press again, click the toast — both run.
    await open();
    await inDoc(app, `(() => { const b = document.querySelector('[data-testid="bill-alloc-apply"]'); b.click(); b.click(); document.querySelector('[data-testid="bill-toast"]').click(); return true; })()`);
    await expect.poll(async () => (await inDoc(app, LINES)).deducts, { timeout: 30_000 }).toBe(3);
    report("override", await inDoc(app, LINES));
  } finally {
    await app.close().catch(() => {});
  }
});

test("Assign: a second Apply is held back and said", async () => {
  const app = await launchShell();
  try {
    await waitForE2eApi(app);
    await newBill(app);
    await assertSandboxSite(app);
    await inDoc(app, `(async () => { await window.erpDoc.setHeader("supplier", ${JSON.stringify(VENDOR)}); return true; })()`, 60_000);
    await sleep(2500);
    await inDoc(app, `(async () => { await window.erpDoc.setItem(0, "item_code", "ZZ-DF-SERVICE"); return true; })()`, 60_000);
    await sleep(1500);
    await inDoc(app, `(() => { document.querySelector('[data-testid="bill-vendor"]').value = ${JSON.stringify(VENDOR)}; return true; })()`);
    await closeSourcePickers(app);
    await sleep(1000);
    await inDoc(app, `(() => { document.querySelector('[data-testid="bill-assign-0"]').click(); return true; })()`);
    const title = () => inDoc(app, `(() => { const t = document.querySelector('[data-testid="bill-allocation-picker"] [data-alloc-title]'); return t ? t.textContent : null; })()`);
    const pick = `document.querySelector('[data-testid="bill-allocation-picker"] [data-act="pick"]')`;
    await expect.poll(title, { timeout: 10_000 }).toMatch(/pick customer/);
    await inDoc(app, `${pick}.click(); true`);
    await expect.poll(title, { timeout: 20_000 }).toMatch(/Sales order/);
    await inDoc(app, `${pick}.click(); true`);
    await expect.poll(title, { timeout: 20_000 }).toMatch(/— Project$/);
    const shown = await inDoc(app, `(() => { const b = ${pick}; b.click(); b.click();
      const t = document.querySelector('[data-testid="bill-toast"]'); return t && !t.hidden ? t.textContent : null; })()`);
    report("toast", { shown });
    expect(shown).toMatch(/Still working on "Apply to line" — your second press was held back/);
    await expect.poll(() => status(app), { timeout: 30_000 }).toMatch(/Line 1 assigned|Could not apply/);
    report("status", { status: await status(app) });
  } finally {
    await app.close().catch(() => {});
  }
});
