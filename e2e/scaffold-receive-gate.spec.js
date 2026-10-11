/**
 * DF-02 hang (2026-10-10), against the live sandbox. Never saves.
 *
 * A dirty Doc Bill with a stock line, then Simplified: the unsaved-changes gate opens, the clerk
 * picks Save, and Save asks "Receive these items with this bill?". That question used to open
 * *behind* the gate (z-index 80 under 200), so the gate sat on "Saving…" with its buttons
 * disabled, waiting on a dialog nobody could see. Here the question must be the topmost thing on
 * the page, and answering it must hand control back to the gate.
 */
import { test, expect } from "@playwright/test";
import { launchShell, e2eCall, e2eGet, waitForE2eApi } from "./helpers.js";
import { billCompareTotal } from "../src/bill-map.js";

/** @param {import('@playwright/test').ElectronApplication} app @param {string} js */
const inErp = (app, js) => e2eCall(app, "execInView", "erp", js);
/** @param {import('@playwright/test').ElectronApplication} app @param {string} js */
const inDoc = (app, js) => e2eCall(app, "execInView", "docForm", js);

test.describe("scaffold: receive-with-bill question during the unsaved gate (DF-02)", () => {
  /** @type {import('@playwright/test').ElectronApplication | undefined} */
  let app;
  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
    app = undefined;
  });

  test("Save from the gate shows the question above the gate; Cancel gives the gate back", async () => {
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

    const facts = await inErp(
      app,
      `(async () => {
        const s = await frappe.db.get_list("Supplier", { limit: 1 });
        const i = await frappe.db.get_list("Item", { filters: { is_stock_item: 1, disabled: 0 }, limit: 1 });
        return { supplier: (s[0] && s[0].name) || "", item: (i[0] && i[0].name) || "" };
      })()`,
    );
    test.skip(!facts.supplier || !facts.item, "sandbox needs a Supplier and a stock Item");

    // The Bill's own write calls; each marks the draft edited in main.
    const filled = await inDoc(
      app,
      `(async () => {
        const d = window.erpDoc;
        await d.setHeader("supplier", ${JSON.stringify(facts.supplier)});
        let s = await d.getSnapshot();
        if (!(s.doc.items || []).length) await d.addItem();
        await d.setItem(0, "item_code", ${JSON.stringify(facts.item)});
        await d.setItem(0, "qty", 1);
        await d.setItem(0, "rate", 10);
        s = await d.getSnapshot();
        return { doc: s.doc, amountDue: s.amountDue };
      })()`,
    );
    expect(filled.doc.update_stock ? 1 : 0).toBe(0);

    // Repaint the page from that state, as main does after any write.
    await app.evaluate(({ webContents }, snap) => {
      const wc = webContents.getAllWebContents().find((w) => /doc-form\.html/.test(w.getURL()));
      if (!wc) throw new Error("doc-form view not found");
      wc.send("doc-snapshot", snap);
    }, filled);
    const total = billCompareTotal(filled.doc);
    // Amount Due typed like a clerk would: the checksum then matches and the page counts an edit.
    await inDoc(
      app,
      `(() => { const a = document.querySelector('[data-testid="bill-amount-due"]'); a.focus(); a.value = ${JSON.stringify(String(total))}; a.dispatchEvent(new Event("input", { bubbles: true })); a.blur(); return a.value; })()`,
    );

    // The clerk's path: Simplified from a dirty Doc Bill.
    await app.evaluate(({ ipcMain }) => ipcMain.emit("open-simplified-skin", {}));
    await expect
      .poll(async () => inDoc(app, `!document.querySelector('[data-testid="doc-commit-gate"]').hidden`), { timeout: 20_000 })
      .toBe(true);
    // Save waits for the gate's live preflight; poll until Save is clickable.
    await expect
      .poll(async () => inDoc(app, `(() => { const b = document.querySelector("#commit-gate [data-gate='save']"); return !!b && !b.disabled; })()`), {
        timeout: 20_000,
      })
      .toBe(true);
    await inDoc(app, `document.querySelector("#commit-gate [data-gate='save']").click()`);

    await expect
      .poll(async () => inDoc(app, `!!document.querySelector('[data-testid="bill-receive-ask"]')`), { timeout: 30_000 })
      .toBe(true);
    // Topmost: the point at the dialog's centre belongs to the dialog, not the gate.
    const onTop = await inDoc(
      app,
      `(() => {
        const box = document.querySelector('[data-testid="bill-receive-ask"] .addr-modal').getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return !!(hit && hit.closest('[data-testid="bill-receive-ask"]'));
      })()`,
    );
    expect(onTop).toBe(true);

    await inDoc(app, `document.querySelector('[data-testid="bill-receive-ask"] [data-act="cancel"]').click()`);
    await expect
      .poll(async () => inDoc(app, `!document.querySelector('[data-testid="bill-receive-ask"]')`), { timeout: 10_000 })
      .toBe(true);
    // The gate is usable again (not stuck busy), and nothing was saved.
    await expect
      .poll(async () => inDoc(app, `(() => { const b = document.querySelector("#commit-gate [data-gate='cancel']"); return !!b && !b.disabled; })()`), {
        timeout: 10_000,
      })
      .toBe(true);
    const still = await inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); return s.doc && s.doc.name; })()`);
    expect(String(still)).toMatch(/^new-purchase-invoice-/);
    await inDoc(app, `document.querySelector("#commit-gate [data-gate='cancel']").click()`);
    expect(await e2eGet(app, "surfaceMode")).toBe("doc");
  });
});
