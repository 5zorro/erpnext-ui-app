/**
 * DF-02 J (2026-10-10) — just-in-time Item Receipts from Bill lines, against the live sandbox.
 *
 * Never submits: a real Submit makes submitted receipts and a submitted bill, which cannot be
 * cleaned off the site (5zorro dogfoods that). What runs here: the Rec'd by / Rec'd Date editor
 * writes the Remarks block; the memo box hides it and keeps it; Submit with an unfilled line asks
 * and Cancel saves nothing; ERPNext accepts the receipt document the shell builds (inserted as a
 * draft, then deleted).
 */
import { test, expect } from "@playwright/test";
import { launchShell, e2eCall, e2eGet, waitForE2eApi } from "./helpers.js";
import { billCompareTotal } from "../src/bill-map.js";
import { receiptDocFor } from "../src/jit-receipt.js";

/** @param {import('@playwright/test').ElectronApplication} app @param {string} js */
const inErp = (app, js) => e2eCall(app, "execInView", "erp", js);
/** @param {import('@playwright/test').ElectronApplication} app @param {string} js */
const inDoc = (app, js) => e2eCall(app, "execInView", "docForm", js);
const SNAP = `(async () => { const s = await window.erpDoc.getSnapshot(); return { doc: s.doc, amountDue: s.amountDue }; })()`;

async function repaint(app) {
  const snap = await inDoc(app, SNAP);
  await app.evaluate(({ webContents }, s) => {
    webContents.getAllWebContents().find((w) => /doc-form\.html/.test(w.getURL())).send("doc-snapshot", s);
  }, snap);
  return snap;
}

/** New Doc Bill, invoice date 2026-10-05, `lines` stock lines; painted. */
async function billWithStockLines(app, lines) {
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
      const s = await frappe.db.get_list("Supplier", { limit: 1 });
      const i = await frappe.db.get_list("Item", { filters: { is_stock_item: 1, disabled: 0 }, limit: 2 });
      return { supplier: (s[0] && s[0].name) || "", items: i.map((x) => x.name) };
    })()`,
  );
  test.skip(!facts.supplier || facts.items.length < lines, `sandbox needs a Supplier and ${lines} stock Items`);
  await inDoc(
    app,
    `(async () => {
      const d = window.erpDoc;
      await d.setHeader("supplier", ${JSON.stringify(facts.supplier)});
      await d.setHeader("bill_date", "2026-10-05");
      const codes = ${JSON.stringify(facts.items.slice(0, lines))};
      for (let k = 0; k < codes.length; k++) {
        let s = await d.getSnapshot();
        if ((s.doc.items || []).length <= k) await d.addItem();
        await d.setItem(k, "item_code", codes[k]);
        await d.setItem(k, "qty", 2);
        await d.setItem(k, "rate", 10);
      }
    })()`,
  );
  const snap = await repaint(app);
  await expect.poll(async () => inDoc(app, `!!document.querySelector('[data-testid="bill-rec-0-by"]')`), { timeout: 10_000 }).toBe(true);
  return { facts, snap };
}

/** The editor on line `ri`: type who, keep the default date unless given, Apply. */
async function receiveLine(app, ri, by, all = false) {
  await inDoc(app, `document.querySelector('[data-testid="bill-rec-${ri}-by"]').click()`);
  await expect.poll(async () => inDoc(app, `!!document.querySelector('[data-testid="bill-rec-editor"]')`), { timeout: 10_000 }).toBe(true);
  const shownDate = await inDoc(app, `document.querySelector('[data-testid="bill-rec-editor-on"]').value`);
  await inDoc(
    app,
    `(() => { const e = document.querySelector('[data-testid="bill-rec-editor"]'); e.querySelector('[data-rec-by]').value = ${JSON.stringify(by)}; e.querySelector('[data-rec-all]').checked = ${all}; e.querySelector('[data-act="apply"]').click(); })()`,
  );
  return shownDate;
}

test.describe("scaffold: just-in-time receipts from Bill lines (DF-02 J)", () => {
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

  test("the editor writes the Remarks block; the memo box hides it and keeps it", async () => {
    test.setTimeout(150_000);
    const { facts } = await billWithStockLines(app, 1);
    const shownDate = await receiveLine(app, 0, "Jason");
    expect(shownDate).toBe("2026-10-04"); // the day before the invoice date
    await expect
      .poll(async () => (await inDoc(app, SNAP)).doc.remarks || "", { timeout: 15_000 })
      .toBe(`[received]\n1 | ${facts.items[0]} | Jason | 2026-10-04\n[/received]`);
    await expect.poll(async () => inDoc(app, `document.querySelector('[data-testid="bill-rec-0-by"]').textContent`), { timeout: 10_000 }).toBe("Jason");
    expect(await inDoc(app, `document.querySelector('[data-testid="bill-rec-0-on"]').textContent`)).toBe("10/04/2026");
    expect(await inDoc(app, `document.querySelector('[data-testid="bill-memo"]').value`)).toBe("");
    await inDoc(app, `(() => { const m = document.querySelector('[data-testid="bill-memo"]'); m.focus(); m.value = "Freight to follow"; m.dispatchEvent(new Event("change", { bubbles: true })); })()`);
    await expect
      .poll(async () => (await inDoc(app, SNAP)).doc.remarks || "", { timeout: 15_000 })
      .toBe(`Freight to follow\n\n[received]\n1 | ${facts.items[0]} | Jason | 2026-10-04\n[/received]`);
  });

  test("Submit with an unfilled line asks; Cancel saves nothing", async () => {
    test.setTimeout(150_000);
    await billWithStockLines(app, 2);
    await receiveLine(app, 0, "Jason");
    await expect.poll(async () => /\[received\]/.test((await inDoc(app, SNAP)).doc.remarks || ""), { timeout: 15_000 }).toBe(true);
    const snap = await repaint(app);
    const total = billCompareTotal(snap.doc);
    await inDoc(
      app,
      `(() => { const a = document.querySelector('[data-testid="bill-amount-due"]'); a.focus(); a.value = ${JSON.stringify(String(total))}; a.dispatchEvent(new Event("input", { bubbles: true })); a.blur(); })()`,
    );
    await inDoc(app, `document.getElementById("btn-submit").click()`);
    await expect.poll(async () => inDoc(app, `!!document.querySelector('[data-testid="bill-rec-missing"]')`), { timeout: 30_000 }).toBe(true);
    expect(await inDoc(app, `document.querySelector('[data-testid="bill-rec-missing-on"]').value`)).toBe("2026-10-04");
    expect(await inDoc(app, `document.querySelector('#rec-missing-title').textContent`)).toMatch(/^1 stock line has no Rec'd by/);
    await inDoc(app, `document.querySelector('[data-testid="bill-rec-missing"] [data-act="cancel"]').click()`);
    await expect.poll(async () => inDoc(app, `!document.querySelector('[data-testid="bill-rec-missing"]')`), { timeout: 10_000 }).toBe(true);
    expect(String((await inDoc(app, SNAP)).doc.name)).toMatch(/^new-purchase-invoice-/);
  });

  test("ERPNext accepts the receipt the shell builds (draft insert, then deleted)", async () => {
    test.setTimeout(150_000);
    const { snap } = await billWithStockLines(app, 1);
    const wh = await inErp(app, `(async () => (await frappe.db.get_single_value("Stock Settings", "default_warehouse")) || "")()`);
    const built = receiptDocFor({ bill: snap.doc, group: { by: "E2E probe", on: "2026-10-04", rows: [0] }, defaultWarehouse: wh });
    test.skip(!built.ok, built.ok ? "" : built.reason);
    const res = await inErp(
      app,
      `(async () => {
        try {
          const ins = await frappe.call({ method: "frappe.client.insert", args: { doc: ${JSON.stringify(built.doc)} } });
          const d = ins.message;
          const out = { ok: true, name: d.name, posting_date: d.posting_date, remarks: d.remarks, qty: d.items[0].qty, rate: d.items[0].rate, warehouse: d.items[0].warehouse };
          await frappe.call({ method: "frappe.client.delete", args: { doctype: "Purchase Receipt", name: d.name } });
          return out;
        } catch (e) { return { ok: false, reason: String((e && e.message) || e) }; }
      })()`,
    );
    expect(res).toMatchObject({ ok: true, posting_date: "2026-10-04", remarks: "Received by: E2E probe", qty: 2, rate: 10 });
  });
});
