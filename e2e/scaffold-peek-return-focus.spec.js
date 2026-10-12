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

  // DF-01: "the dropdown box was constrained by the same width restriction of the item number column".
  test("the Item dropdown is wider than its column and nothing clips it", async () => {
    test.setTimeout(150_000);
    app = await launchShell();
    await waitForE2eApi(app);
    // The default test window is short enough that line 1 sits below the fold.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1400, 1000));
    await e2eCall(app, "openBill", "/app/purchase-invoice/new");
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("doc");
    await expect
      .poll(async () => inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); return !!(s && s.ok && s.doc); })()`), { timeout: 40_000 })
      .toBe(true);
    await inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); if (!(s.doc.items || []).length) await window.erpDoc.addItem(); })()`);
    await expect
      .poll(async () => inDoc(app, `!!document.querySelector('input[data-row="0"][data-field="item_code"]')`), { timeout: 20_000 })
      .toBe(true);
    await inDoc(
      app,
      `(() => { const i = document.querySelector('input[data-row="0"][data-field="item_code"]'); i.scrollIntoView({ block: "center" }); i.focus(); i.value = "ZZ"; i.dispatchEvent(new Event("input", { bubbles: true })); })()`,
    );
    await expect.poll(async () => inDoc(app, `!!document.querySelector('.link-dd:not([hidden]) .link-opt')`), { timeout: 15_000 }).toBe(true);
    const m = await inDoc(
      app,
      `(() => {
        const dd = document.querySelector('.link-dd:not([hidden])');
        const td = dd.closest("td");
        const r = dd.getBoundingClientRect();
        const hit = document.elementFromPoint(r.right - 8, r.top + 8);
        return { dd: Math.round(r.width), cell: Math.round(td.getBoundingClientRect().width), right: r.right, vw: window.innerWidth, visible: !!hit && dd.contains(hit) };
      })()`,
    );
    expect(m.dd).toBeGreaterThanOrEqual(Math.min(360, m.vw - 32));
    expect(m.dd).toBeGreaterThan(m.cell);
    expect(m.right).toBeLessThanOrEqual(m.vw - 16 + 1);
    expect(m.visible).toBe(true);
  });

  // 5zorro 2026-10-11: "SAMPLE" found two items, neither right; Create Item only showed once nothing matched.
  test("Create Item is the last row even when the search has hits; Enter still takes the first hit", async () => {
    test.setTimeout(150_000);
    app = await launchShell();
    await waitForE2eApi(app);
    const hits = await inErp(
      app,
      `(async () => (await frappe.db.get_list("Item", { filters: { disabled: 0, name: ["like", "%SAMPLE%"] }, limit: 5 })).length)()`,
    );
    test.skip(hits < 1, "sandbox has no SAMPLE item");
    await e2eCall(app, "openBill", "/app/purchase-invoice/new");
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("doc");
    await expect
      .poll(async () => inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); return !!(s && s.ok && s.doc); })()`), { timeout: 40_000 })
      .toBe(true);
    await inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); if (!(s.doc.items || []).length) await window.erpDoc.addItem(); })()`);
    await expect
      .poll(async () => inDoc(app, `!!document.querySelector('input[data-row="0"][data-field="item_code"]')`), { timeout: 20_000 })
      .toBe(true);
    const cell = `document.querySelector('input[data-row="0"][data-field="item_code"]')`;
    await inDoc(app, `(() => { const i = ${cell}; i.focus(); i.value = "SAMPLE"; i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
    const ROWS = `[...document.querySelectorAll('.link-dd:not([hidden]) .link-opt')].map((b) => ({ v: b.dataset.value, t: b.textContent }))`;
    await expect.poll(async () => (await inDoc(app, ROWS)).length, { timeout: 15_000 }).toBeGreaterThan(1);
    const rows = await inDoc(app, ROWS);
    expect(rows.at(-1)).toEqual({ v: "__doc_create_item__", t: "Create a new Item…" });
    expect(rows.slice(0, -1).every((r) => /SAMPLE/i.test(r.v))).toBe(true);
    // Enter picks the highlighted first hit, never the create row.
    const first = rows[0].v;
    await app.evaluate(({ webContents }) => {
      const w = webContents.getAllWebContents().find((x) => /doc-form\.html/.test(x.getURL()));
      w.focus();
      w.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
      w.sendInputEvent({ type: "char", keyCode: "Enter" });
      w.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
    });
    await expect.poll(async () => inDoc(app, `${cell}.value`), { timeout: 15_000 }).toBe(first);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 5_000 }).toBe("doc");
    // And the create row, clicked under the hits, opens a new Item with what was typed.
    // The pick repaints the line (item name, rate), which can replace the cell: type until the
    // dropdown opens on the cell that is there now.
    await expect
      .poll(
        async () =>
          inDoc(
            app,
            `(async () => { const i = ${cell}; i.focus(); i.value = "SAMPLE"; i.dispatchEvent(new Event("input", { bubbles: true }));
              await new Promise((r) => setTimeout(r, 1500));
              return document.querySelectorAll('.link-dd:not([hidden]) .link-opt').length; })()`,
          ),
        { timeout: 30_000 },
      )
      .toBeGreaterThan(1);
    await inDoc(app, `document.querySelector('.link-dd:not([hidden]) [data-value="__doc_create_item__"]').click()`);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("erp");
    await expect
      .poll(async () => inErp(app, `!!(window.cur_frm && cur_frm.doctype === "Item" && cur_frm.is_new())`), { timeout: 30_000 })
      .toBe(true);
    await inErp(app, `window.erpUiShell.softPeekEsc()`);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("doc");
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

// 5zorro 2026-10-11: the Bill's Customer / Sales order(s) columns — PO wash on the header, Sales
// Order wash (+ A/R hatch) on the cells, and a peek for the PO the link lives on. Never saves: the
// line's PO is set in the hidden form only (this site has no POs), so the peek lands on "not found".
test.describe("scaffold: Bill line order peeks", () => {
  /** @type {import('@playwright/test').ElectronApplication | undefined} */
  let app;
  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
    app = undefined;
  });

  test("Customer / Sales order(s): washes, and the PO peek opens the PO", async () => {
    test.setTimeout(150_000);
    app = await launchShell();
    await waitForE2eApi(app);
    await e2eCall(app, "openBill", "/app/purchase-invoice/new");
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("doc");
    await expect
      .poll(async () => inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); return !!(s && s.ok && s.doc); })()`), { timeout: 40_000 })
      .toBe(true);
    await inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); if (!(s.doc.items || []).length) await window.erpDoc.addItem(); })()`);
    await inErp(app, `(() => { cur_frm.doc.items[0].purchase_order = "PUR-ORD-E2E-NONE"; return true; })()`);
    const snap = await inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); return { ok: true, doc: s.doc, amountDue: s.amountDue }; })()`);
    await app.evaluate(({ webContents }, sn) => {
      webContents.getAllWebContents().find((w) => /doc-form\.html/.test(w.getURL())).send("doc-snapshot", sn);
    }, snap);
    await expect.poll(async () => inDoc(app, `!!document.querySelector('[data-testid="bill-peek-0-po"]')`), { timeout: 15_000 }).toBe(true);
    const look = await inDoc(
      app,
      `(() => {
        const th = document.querySelector('#items-head-row th.so-col');
        const td = document.querySelector('[data-testid="bill-peek-0-po"]').closest("td");
        const css = (e) => getComputedStyle(e);
        return { pattern: document.documentElement.dataset.pattern || "", th: css(th).backgroundColor, td: css(td).backgroundColor,
          tdImage: css(td).backgroundImage, headers: document.querySelectorAll('#items-head-row th.so-col').length, so: !!document.querySelector('[data-testid="bill-peek-0-so"]') };
      })()`,
    );
    expect(look.headers).toBe(2);
    expect(look.th).toBe(look.td); // both the order wash
    expect(look.so).toBe(false); // no Sales Order on this line
    if (look.pattern === "ar" || look.pattern === "both") expect(look.tdImage).toMatch(/repeating-linear-gradient/);
    else expect(look.tdImage).toBe("none");
    await inDoc(app, `document.querySelector('[data-testid="bill-peek-0-po"]').click(); true`);
    await expect.poll(async () => e2eCall(app, "currentRoute"), { timeout: 20_000 }).toContain("/purchase-order/PUR-ORD-E2E-NONE");
    // The way back from a clean bill's errand is the next describe's job (an unsaved new bill like
    // this one has no saved address to come back to).
  });
});

/** A real Esc keypress on the Doc page. */
async function escOnDocPage(app) {
  await app.evaluate(({ webContents }) => {
    const w = webContents.getAllWebContents().find((x) => /doc-form\.html/.test(x.getURL()));
    w.focus();
    w.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
    w.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  });
}
const backLabel = (app) =>
  e2eCall(app, "execInView", "chrome", `(() => { const b = document.querySelector('[data-testid="btn-detour-back"]'); return b && !b.hidden ? b.textContent : ""; })()`);

// 5zorro 2026-10-11: from a bill to a document with its own Doc skin — ask at the door when the bill
// is unsaved, then "← Back to Bill …" / Esc. Read-only: test A uses an existing submitted bill, test B
// cancels the gate.
test.describe("scaffold: errand from a bill to another Doc-skinned document", () => {
  /** @type {import('@playwright/test').ElectronApplication | undefined} */
  let app;
  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
    app = undefined;
  });

  test("clean bill → its Item Receipt: no question, then Back to Bill and Esc return", async () => {
    test.setTimeout(150_000);
    app = await launchShell();
    await waitForE2eApi(app);
    const bill = await inErp(
      app,
      `(async () => {
        const r = await frappe.call({ method: "frappe.client.get_list", args: { doctype: "Purchase Invoice Item", parent: "Purchase Invoice",
          filters: [["purchase_receipt", "is", "set"], ["docstatus", "=", 1]], fields: ["parent"], limit_page_length: 1 } });
        return ((r.message || [])[0] || {}).parent || "";
      })()`,
    );
    test.skip(!bill, "no submitted bill with an Item Receipt line on this site");
    await e2eCall(app, "openBill", `/app/purchase-invoice/${bill}`);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("doc");
    await expect.poll(async () => inDoc(app, `!!document.querySelector('[data-testid="bill-linked-pr-peek-0"]')`), { timeout: 40_000 }).toBe(true);
    await inDoc(app, `document.querySelector('[data-testid="bill-linked-pr-peek-0"]').click(); true`);
    await expect.poll(async () => e2eCall(app, "currentRoute"), { timeout: 20_000 }).toContain("/purchase-receipt/");
    expect(await inDoc(app, `!document.querySelector('[data-testid="doc-commit-gate"]').hidden`)).toBe(false);
    await expect.poll(async () => backLabel(app), { timeout: 15_000 }).toBe(`← Back to Bill ${bill}`);
    await new Promise((r) => setTimeout(r, 1000));
    await escOnDocPage(app);
    await expect.poll(async () => e2eCall(app, "currentRoute"), { timeout: 20_000 }).toBe(`/app/purchase-invoice/${bill}`);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("doc");
    await expect.poll(async () => backLabel(app), { timeout: 15_000 }).toBe("");
  });

  test("unsaved bill → a PO: the unsaved-changes gate asks first; Cancel stays on the bill", async () => {
    test.setTimeout(150_000);
    app = await launchShell();
    await waitForE2eApi(app);
    await e2eCall(app, "openBill", "/app/purchase-invoice/new");
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("doc");
    await expect
      .poll(async () => inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); return !!(s && s.ok && s.doc); })()`), { timeout: 40_000 })
      .toBe(true);
    await inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); if (!(s.doc.items || []).length) await window.erpDoc.addItem(); })()`);
    await inErp(app, `(() => { cur_frm.doc.items[0].purchase_order = "PUR-ORD-E2E-NONE"; return true; })()`);
    const snap = await inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); return { ok: true, doc: s.doc, amountDue: s.amountDue }; })()`);
    await app.evaluate(({ webContents }, sn) => {
      webContents.getAllWebContents().find((w) => /doc-form\.html/.test(w.getURL())).send("doc-snapshot", sn);
    }, snap);
    await expect.poll(async () => inDoc(app, `!!document.querySelector('[data-testid="bill-peek-0-po"]')`), { timeout: 15_000 }).toBe(true);
    // A clerk's edit: Amount Due typed.
    await inDoc(
      app,
      `(() => { const a = document.querySelector('[data-testid="bill-amount-due"]'); a.focus(); a.value = "12.34"; a.dispatchEvent(new Event("input", { bubbles: true })); a.blur(); return true; })()`,
    );
    const before = await e2eCall(app, "currentRoute");
    await inDoc(app, `document.querySelector('[data-testid="bill-peek-0-po"]').click(); true`);
    await expect
      .poll(async () => inDoc(app, `!document.querySelector('[data-testid="doc-commit-gate"]').hidden`), { timeout: 20_000 })
      .toBe(true);
    expect(await e2eCall(app, "currentRoute")).toBe(before);
    await inDoc(app, `document.querySelector("#commit-gate [data-gate='cancel']").click()`);
    await expect.poll(async () => inDoc(app, `document.querySelector('[data-testid="doc-commit-gate"]').hidden`), { timeout: 10_000 }).toBe(true);
    await new Promise((r) => setTimeout(r, 1500));
    expect(await e2eCall(app, "currentRoute")).toBe(before);
    expect(String((await inDoc(app, `(async () => (await window.erpDoc.getSnapshot()).doc.name)()`)))).toMatch(/^new-purchase-invoice-/);
    expect(await backLabel(app)).toBe("");
  });
});

// 5zorro focus incident 2026-10-11T21:14:44Z: pick an Item on a line, Tab from Description to Qty —
// yanked back to Description ~150 ms later, when the pick's own post-ERPNext move landed. Run it
// with ERP_CHAOS_LAG_MS / ERP_CHAOS_LAG_PCT to widen the race the way 5zorro's session had it.
test.describe("scaffold: a late post-edit move never overrides the clerk's Tab", () => {
  /** @type {import('@playwright/test').ElectronApplication | undefined} */
  let app;
  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
    app = undefined;
  });

  test("Tab-pick an Item, Tab on from Description to Qty, and stay on Qty", async () => {
    test.setTimeout(150_000);
    app = await launchShell();
    await waitForE2eApi(app);
    const item = await inErp(app, `(async () => { const r = await frappe.db.get_list("Item", { filters: { disabled: 0 }, limit: 1 }); return (r[0] && r[0].name) || ""; })()`);
    test.skip(!item, "sandbox has no Item");
    await e2eCall(app, "openBill", "/app/purchase-invoice/new");
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("doc");
    await expect
      .poll(async () => inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); return !!(s && s.ok && s.doc); })()`), { timeout: 40_000 })
      .toBe(true);
    await inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); if (!(s.doc.items || []).length) await window.erpDoc.addItem(); })()`);
    await expect.poll(async () => inDoc(app, `!!document.querySelector('input[data-row="0"][data-field="item_code"]')`), { timeout: 20_000 }).toBe(true);
    // A new bill settles first (its opening focus lands on Vendor); this test is about what follows.
    await expect.poll(async () => inDoc(app, `document.activeElement && document.activeElement.id`), { timeout: 20_000 }).toBe("f-vendor");
    await new Promise((r) => setTimeout(r, 2000));
    await inDoc(
      app,
      `(() => { const i = document.querySelector('input[data-row="0"][data-field="item_code"]'); i.focus(); i.value = ${JSON.stringify(item)}; i.dispatchEvent(new Event("input", { bubbles: true })); })()`,
    );
    await expect.poll(async () => inDoc(app, `!!document.querySelector('.link-dd:not([hidden]) .link-opt:not(.link-action)')`), { timeout: 15_000 }).toBe(true);
    const key = (k) =>
      app.evaluate(({ webContents }, kk) => {
        const w = webContents.getAllWebContents().find((x) => /doc-form\.html/.test(x.getURL()));
        w.focus();
        w.sendInputEvent({ type: "keyDown", keyCode: kk });
        w.sendInputEvent({ type: "keyUp", keyCode: kk });
      }, k);
    // Tab accepts the highlighted Item and moves to Description at once; the pick's update is still
    // on its way to ERPNext (5zorro's trail: Description at +0.1 s, ERPNext's answer at +0.9 s).
    await key("Tab");
    // As soon as the clerk is on Description, Tab on.
    await expect.poll(async () => inDoc(app, ACTIVE), { timeout: 15_000, intervals: [50] }).toMatchObject({ field: "description" });
    await key("Tab");
    await expect.poll(async () => inDoc(app, ACTIVE), { timeout: 5_000, intervals: [50] }).toMatchObject({ field: "qty" });
    // Long enough for ERPNext's answer and any late move.
    await new Promise((r) => setTimeout(r, 3000));
    expect(await inDoc(app, ACTIVE)).toMatchObject({ row: "0", field: "qty" });
  });

  // Same family: a new bill's opening "focus Vendor" retries for half a second while it loads; a clerk
  // who has already clicked into a line keeps their place.
  test("clicking into a line while a new bill loads keeps the clerk there", async () => {
    test.setTimeout(150_000);
    app = await launchShell();
    await waitForE2eApi(app);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1400, 1000));
    await e2eCall(app, "openBill", "/app/purchase-invoice/new");
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("doc");
    await expect.poll(async () => inDoc(app, `!!document.querySelector('input[data-row="0"][data-field="qty"]')`), { timeout: 40_000, intervals: [50] }).toBe(true);
    // Click into Qty like a clerk — again if the loading page moved under the pointer.
    const clickQty = async () => {
      const box = await inDoc(app, `(() => { const i = document.querySelector('input[data-row="0"][data-field="qty"]'); if (!i) return null; i.scrollIntoView({ block: "center" }); const r = i.getBoundingClientRect(); return { x: Math.round(r.left + 8), y: Math.round(r.top + r.height / 2) }; })()`);
      if (!box) return false;
      await app.evaluate(({ webContents }, p) => {
        const w = webContents.getAllWebContents().find((x) => /doc-form\.html/.test(x.getURL()));
        w.focus();
        w.sendInputEvent({ type: "mouseDown", x: p.x, y: p.y, button: "left", clickCount: 1 });
        w.sendInputEvent({ type: "mouseUp", x: p.x, y: p.y, button: "left", clickCount: 1 });
      }, box);
      await new Promise((r) => setTimeout(r, 150));
      return ((await inDoc(app, ACTIVE)) || {}).field === "qty";
    };
    let inQty = false;
    for (let k = 0; k < 10 && !inQty; k++) inQty = await clickQty();
    expect(inQty).toBe(true);
    await new Promise((r) => setTimeout(r, 4000));
    // Still in Qty: not pulled to Vendor, and not dropped by a loading repaint that skipped putting
    // the clerk back because it expected Vendor to take focus.
    expect(await inDoc(app, ACTIVE)).toMatchObject({ row: "0", field: "qty" });
  });
});

// 5zorro 2026-10-11: Attach in the same spot on Bill, PO and Item Receipt — beside the notes. The PO has
// no Remarks; its terms box ("Freeform comments") is the stand-in, so Attach sits there.
test.describe("scaffold: Attach sits beside the notes on every A/P Doc skin", () => {
  test("PO beside Freeform comments, Item Receipt beside its Remarks; no toolbar copy", async () => {
    test.setTimeout(150_000);
    const app = await launchShell();
    try {
      await waitForE2eApi(app);
      const want = { openPo: ["/app/purchase-order/new", "terms-head", "Freeform comments", "purchase order"], openReceipt: ["/app/purchase-receipt/new", "memo-entry", "Remarks", "item receipt"] };
      for (const [hook, [route, home, label, noun]] of Object.entries(want)) {
        await e2eCall(app, hook, route);
        await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("doc");
        await expect
          .poll(async () => inDoc(app, `(() => { const b = document.getElementById("btn-attach"); return b ? b.textContent.trim() : ""; })()`), { timeout: 40_000 })
          .toBe(`Attach file to this ${noun}`);
        const at = await inDoc(
          app,
          `(() => { const b = document.getElementById("btn-attach"); const t = document.getElementById("btn-attach-toolbar");
            return { visible: b.getClientRects().length > 0, home: b.closest("#terms-head, #memo-entry") && b.closest("#terms-head, #memo-entry").id,
              label: (b.parentElement.querySelector("label") || {}).textContent || "", toolbar: !!t && !t.hidden }; })()`,
        );
        expect(at).toMatchObject({ visible: true, home, toolbar: false });
        expect(at.label).toContain(label);
      }
    } finally {
      await app.close().catch(() => {});
    }
  });
});

// 5zorro nav incident 2026-10-12: a new Item Receipt (Doc), then Home, then the Material Request tile.
// The Material Request has no Doc skin; the hidden untouched Item Receipt became its "peek parent" and
// the Doc tab lit up as "back to" it. Opened from Home, it has no parent — the Doc tab stays hidden.
test.describe("scaffold: a page opened from Home has no peek parent", () => {
  test("Material Request from Home after a new Item Receipt: no Doc tab, no parent", async () => {
    test.setTimeout(150_000);
    const app = await launchShell();
    try {
      await waitForE2eApi(app);
      await e2eCall(app, "openReceipt", "/app/purchase-receipt/new");
      await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("doc");
      await expect.poll(async () => inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); return !!(s && s.ok && s.doc); })()`), { timeout: 40_000 }).toBe(true);
      await e2eCall(app, "showLauncher");
      await e2eCall(app, "execInView", "home", `document.querySelector('[data-testid="tile-mr-new"]').click(); true`);
      await expect.poll(async () => inErp(app, `!!(window.cur_frm && cur_frm.doctype === "Material Request")`), { timeout: 30_000 }).toBe(true);
      await new Promise((r) => setTimeout(r, 1500));
      const docTab = await e2eCall(app, "execInView", "chrome", `(() => { const b = document.querySelector('[data-testid="lens-doc"]'); return { shown: !!b && !b.hidden, title: b ? b.title : "" }; })()`);
      expect(docTab.shown, `Doc tab should be hidden (title: ${docTab.title})`).toBe(false);
    } finally {
      await app.close().catch(() => {});
    }
  });
});

