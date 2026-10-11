/**
 * DF-02 (2026-10-10), against the live sandbox. The Item cases never save; the Customer case
 * (DF-03, 2026-10-11) saves one throwaway Customer and deletes it.
 *
 * Esc back from "create Item…" (picked in a Bill line's Item cell) must land the cursor in that
 * same cell. When the errand saved the Item, the cell holds it. Saving a real Item is a write, so
 * the "saved" case moves the peek onto an existing Item first, which is the route a just-saved
 * Item leaves the peek on (/app/item/<code>).
 */
import { test, expect } from "@playwright/test";
import { launchShell, e2eCall, e2eGet, waitForE2eApi } from "./helpers.js";

/** @param {import('@playwright/test').ElectronApplication} app @param {string} js */
const inErp = (app, js) => e2eCall(app, "execInView", "erp", js);
/** @param {import('@playwright/test').ElectronApplication} app @param {string} js */
const inDoc = (app, js) => e2eCall(app, "execInView", "docForm", js);

const ACTIVE = `(() => { const a = document.activeElement; return a ? { row: a.dataset.row, field: a.dataset.field, value: a.value } : null; })()`;

/** New Doc Bill, then "create Item…" from line 1's Item cell; resolves once Vanilla shows the Item form. */
async function openCreateItemPeek(app) {
  await e2eCall(app, "openBill", "/app/purchase-invoice/new");
  await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("doc");
  await expect
    .poll(async () => inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); return !!(s && s.ok && s.doc); })()`), {
      timeout: 40_000,
    })
    .toBe(true);
  await inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); if (!(s.doc.items || []).length) await window.erpDoc.addItem(); })()`);
  await expect
    .poll(async () => inDoc(app, `!!document.querySelector('input[data-row="0"][data-field="item_code"]')`), { timeout: 20_000 })
    .toBe(true);
  await inDoc(
    app,
    `(() => { const i = document.querySelector('input[data-row="0"][data-field="item_code"]'); i.focus(); i.value = "ZZ-NO-SUCH-ITEM-E2E"; i.dispatchEvent(new Event("input", { bubbles: true })); })()`,
  );
  await expect
    .poll(async () => inDoc(app, `!!document.querySelector('.link-dd:not([hidden]) [data-value="__doc_create_item__"]')`), { timeout: 15_000 })
    .toBe(true);
  await inDoc(app, `document.querySelector('.link-dd:not([hidden]) [data-value="__doc_create_item__"]').click()`);
  await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("erp");
  await expect
    .poll(async () => inErp(app, `!!(window.cur_frm && cur_frm.doctype === "Item")`), { timeout: 30_000 })
    .toBe(true);
}

test.describe("scaffold: Esc back from create Item lands in the Item cell (DF-02)", () => {
  /** @type {import('@playwright/test').ElectronApplication | undefined} */
  let app;
  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
    app = undefined;
  });

  test("abandoned: cursor back in line 1's Item cell", async () => {
    test.setTimeout(150_000);
    app = await launchShell();
    await waitForE2eApi(app);
    await openCreateItemPeek(app);
    await inErp(app, `window.erpUiShell.softPeekEsc()`);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("doc");
    await expect.poll(async () => inDoc(app, ACTIVE), { timeout: 15_000 }).toMatchObject({ row: "0", field: "item_code" });
  });

  test("saved: the cell holds the new Item, cursor on it", async () => {
    test.setTimeout(150_000);
    app = await launchShell();
    await waitForE2eApi(app);
    const item = await inErp(
      app,
      `(async () => { const r = await frappe.db.get_list("Item", { filters: { disabled: 0 }, limit: 1 }); return (r[0] && r[0].name) || ""; })()`,
    );
    test.skip(!item, "sandbox has no Item");
    await openCreateItemPeek(app);
    // Stand-in for Save on the new Item: Frappe then shows /app/item/<code>.
    await inErp(app, `frappe.set_route("Form", "Item", ${JSON.stringify(item)})`);
    await expect
      .poll(async () => inErp(app, `!!(window.cur_frm && cur_frm.doc.name === ${JSON.stringify(item)})`), { timeout: 20_000 })
      .toBe(true);
    await expect.poll(async () => e2eCall(app, "currentRoute"), { timeout: 10_000 }).toContain("/item/");
    await inErp(app, `window.erpUiShell.softPeekEsc()`);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("doc");
    await expect
      .poll(async () => inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); return s.doc.items[0] && s.doc.items[0].item_code; })()`), {
        timeout: 20_000,
      })
      .toBe(item);
    await expect.poll(async () => inDoc(app, ACTIVE), { timeout: 15_000 }).toMatchObject({ row: "0", field: "item_code", value: item });
  });
});

/** New Doc Sales Order, then "create Customer…" from its Customer box. */
async function openCreateCustomerPeek(app, typed) {
  await e2eCall(app, "showLauncher");
  await e2eCall(app, "execInView", "home", `document.querySelector('[data-testid="tile-so-new"]').click(); true`);
  await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("doc");
  await expect
    .poll(async () => inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); return !!(s && s.ok && s.doc); })()`), {
      timeout: 40_000,
    })
    .toBe(true);
  await inDoc(
    app,
    `(() => { const i = document.querySelector('input[data-field="customer"]'); i.focus(); i.value = ${JSON.stringify(typed)}; i.dispatchEvent(new Event("input", { bubbles: true })); })()`,
  );
  await expect
    .poll(async () => inDoc(app, `!!document.querySelector('.link-dd:not([hidden]) [data-value="__doc_create_customer__"]')`), { timeout: 15_000 })
    .toBe(true);
  await inDoc(app, `document.querySelector('.link-dd:not([hidden]) [data-value="__doc_create_customer__"]').click()`);
  await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("erp");
  await expect
    .poll(async () => inErp(app, `!!(window.cur_frm && cur_frm.doctype === "Customer")`), { timeout: 30_000 })
    .toBe(true);
}

test.describe("scaffold: create Customer from the Sales Order's Customer box (DF-03)", () => {
  /** @type {import('@playwright/test').ElectronApplication | undefined} */
  let app;
  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
    app = undefined;
  });

  test("abandoned: the new Customer form had the typed name; cursor back in the Customer box", async () => {
    test.setTimeout(150_000);
    app = await launchShell();
    await waitForE2eApi(app);
    await openCreateCustomerPeek(app, "ZZ NO SUCH CUSTOMER E2E");
    expect(await inErp(app, `cur_frm.doc.customer_name`)).toBe("ZZ NO SUCH CUSTOMER E2E");
    await inErp(app, `window.erpUiShell.softPeekEsc()`);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("doc");
    await expect.poll(async () => inDoc(app, ACTIVE), { timeout: 15_000 }).toMatchObject({ field: "customer" });
  });

  test("saved: the Sales Order holds the new Customer (then it is deleted)", async () => {
    test.setTimeout(180_000);
    app = await launchShell();
    await waitForE2eApi(app);
    const typed = `ZZ E2E CUSTOMER ${Date.now()}`;
    await openCreateCustomerPeek(app, typed);
    let saved = "";
    try {
      saved = await inErp(app, `(async () => { await cur_frm.save(); return cur_frm.doc.name; })()`);
      expect(saved).toBeTruthy();
      await expect.poll(async () => e2eCall(app, "currentRoute"), { timeout: 10_000 }).toContain("/customer/");
      await inErp(app, `window.erpUiShell.softPeekEsc()`);
      await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("doc");
      await expect
        .poll(async () => inDoc(app, `(async () => (await window.erpDoc.getSnapshot()).doc.customer)()`), { timeout: 20_000 })
        .toBe(saved);
      await expect.poll(async () => inDoc(app, ACTIVE), { timeout: 15_000 }).toMatchObject({ field: "customer" });
    } finally {
      if (saved) {
        // Drop the unsaved order's hold on it, then delete the Customer.
        await inErp(app, `(async () => { if (window.cur_frm && cur_frm.doctype === "Sales Order") cur_frm.doc.customer = ""; })()`).catch(() => {});
        await inErp(app, `frappe.call({ method: "frappe.client.delete", args: { doctype: "Customer", name: ${JSON.stringify(saved)} } }).then(() => true)`);
      }
    }
  });
});

