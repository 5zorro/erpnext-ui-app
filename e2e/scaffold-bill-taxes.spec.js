/**
 * DF-02 taxes and charges (2026-10-10), against the live sandbox. Never saves.
 *
 * A new Doc Bill with one stock line picks up the site's Default purchase template (a 6% "On Net
 * Total" row on the blank bench). When the Default has no percentage row (5zorro later made TAX
 * FREE the Default), the unsaved bill is given a template that has one — the site is not changed. Each test checks one thing 5zorro hit or asked for:
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
      const pct = await frappe.call({ method: "frappe.client.get_list", args: { doctype: "Purchase Taxes and Charges",
        parent: "Purchase Taxes and Charges Template", filters: { charge_type: "On Net Total", parenttype: "Purchase Taxes and Charges Template" },
        fields: ["parent"], limit_page_length: 1 } });
      const pctTmpl = (pct.message && pct.message[0] && pct.message[0].parent) || "";
      return { suppliers: s.map((x) => x.name), item: (i[0] && i[0].name) || "", tmpl: (d[0] && d[0].name) || "", pctTmpl };
    })()`,
  );
  test.skip(!facts.suppliers.length || !facts.item || !facts.tmpl || !facts.pctTmpl, "sandbox needs a Supplier, a stock Item, a Default purchase tax template and one with a % row");
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
      const pctRow = (s.doc.taxes || []).some((t) => t.charge_type === "On Net Total");
      if (!pctRow) {
        await d.setHeader("taxes_and_charges", ${JSON.stringify(facts.pctTmpl)});
        s = await d.getSnapshot();
      }
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
    const refilled = await inDoc(app, `(async () => { const s = await window.erpDoc.setHeader("taxes_and_charges", ${JSON.stringify(facts.pctTmpl)}); return ((s.doc && s.doc.taxes) || []).length; })()`);
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
    // A reload (a fresh copy of the document from main) starts with the note closed (5zorro DF-02).
    const snap = await inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); return { doc: s.doc, amountDue: s.amountDue }; })()`);
    await app.evaluate(({ webContents }, s) => {
      webContents.getAllWebContents().find((w) => /doc-form\.html/.test(w.getURL())).send("doc-snapshot", s);
    }, snap);
    await expect
      .poll(async () => inDoc(app, `document.querySelector('[data-testid="bill-tax-default-note"]').hidden`), { timeout: 10_000 })
      .toBe(true);
  });

  // 5zorro 2026-10-11: `169.00*1.0845` in the Add tax/charge Amount — no calculator, and Add did nothing.
  test("Add tax/charge Amount: the shared calculator works out a sum; Add takes a typed sum", async () => {
    test.setTimeout(150_000);
    const { doc } = await billWithDefaultTax(app);
    const acct = doc.taxes[0].account_head;
    await inDoc(app, `(() => { const a = document.querySelector('#f-tax-account'); a.value = ${JSON.stringify(acct)}; a.dataset.linkCommitted = a.value; return true; })()`);
    // Real keys, so the calculator sees them like a clerk's.
    await inDoc(app, `(() => { const i = document.querySelector('[data-testid="bill-tax-amount"]'); i.value = ""; i.focus(); return true; })()`);
    await app.evaluate(({ webContents }, keys) => {
      const w = webContents.getAllWebContents().find((x) => /doc-form\.html/.test(x.getURL()));
      w.focus();
      for (const k of keys) {
        w.sendInputEvent({ type: "keyDown", keyCode: k });
        w.sendInputEvent({ type: "char", keyCode: k });
        w.sendInputEvent({ type: "keyUp", keyCode: k });
      }
    }, [..."169*1.0845", "Enter"]);
    await expect.poll(async () => inDoc(app, `document.querySelector('[data-testid="bill-tax-amount"]').value`), { timeout: 10_000 }).toBe("183.28");
    // A sum the calculator never saw (pasted): Add works it out.
    const before = (await inDoc(app, TAXES)).rows.length;
    await inDoc(app, `(() => { const i = document.querySelector('[data-testid="bill-tax-amount"]'); i.value = "169.00*1.0845"; return true; })()`);
    await inDoc(app, `document.querySelector('[data-testid="bill-add-tax"]').click(); true`);
    await expect.poll(async () => (await inDoc(app, TAXES)).rows.length, { timeout: 20_000 }).toBe(before + 1);
    expect((await inDoc(app, TAXES)).rows[before]).toMatchObject({ type: "Actual", amount: 183.28 });
  });

  // The PO Doc skin has no taxes section; the Item Receipt is the other page with an Add box.
  test("the Item Receipt's Add tax/charge Amount has the same calculator", async () => {
    test.setTimeout(150_000);
    await e2eCall(app, "openReceipt", "/app/purchase-receipt/new");
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("doc");
    await expect
      .poll(async () => inDoc(app, `(() => { const i = document.querySelector('[data-testid="doc-tax-amount"]'); return !!i && !i.disabled && i.getClientRects().length > 0; })()`), { timeout: 40_000 })
      .toBe(true);
    await inDoc(app, `(() => { const i = document.querySelector('[data-testid="doc-tax-amount"]'); i.value = ""; i.focus(); return true; })()`);
    await app.evaluate(({ webContents }, keys) => {
      const w = webContents.getAllWebContents().find((x) => /doc-form\.html/.test(x.getURL()));
      w.focus();
      for (const k of keys) {
        w.sendInputEvent({ type: "keyDown", keyCode: k });
        w.sendInputEvent({ type: "char", keyCode: k });
        w.sendInputEvent({ type: "keyUp", keyCode: k });
      }
    }, [..."169*1.0845", "Enter"]);
    await expect.poll(async () => inDoc(app, `document.querySelector('[data-testid="doc-tax-amount"]').value`), { timeout: 10_000 }).toBe("183.28");
  });

  // Plan 10-25 step 3 (5zorro 2026-10-26): one taxes table for every form, the Bill's way.
  test("the Item Receipt's taxes act like the Bill's: Rate % from the net total, the Tab walk, a Rate works out the Amount", async () => {
    test.setTimeout(150_000);
    await e2eCall(app, "openReceipt", "/app/purchase-receipt/new");
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
        const t = await frappe.call({ method: "frappe.client.get_list", args: { doctype: "Purchase Taxes and Charges",
          parent: "Purchase Taxes and Charges Template", filters: { parenttype: "Purchase Taxes and Charges Template" },
          fields: ["account_head"], limit_page_length: 1 } });
        return { supplier: (s[0] && s[0].name) || "", item: (i[0] && i[0].name) || "", acct: (t.message && t.message[0] && t.message[0].account_head) || "" };
      })()`,
    );
    test.skip(!facts.supplier || !facts.item || !facts.acct, "sandbox needs a Supplier, a stock Item and a purchase tax template");
    const built = await inDoc(
      app,
      `(async () => {
        const d = window.erpDoc;
        await d.setHeader("supplier", ${JSON.stringify(facts.supplier)});
        let s = await d.getSnapshot();
        if (!(s.doc.items || []).length) await d.addItem();
        await d.setItem(0, "item_code", ${JSON.stringify(facts.item)});
        await d.setItem(0, "qty", 10);
        await d.setItem(0, "rate", 40);
        const r = await d.addTax(${JSON.stringify(facts.acct)}, 20, "");
        s = await d.getSnapshot();
        return { ok: !!(r && r.ok), snap: s, n: (s.doc.taxes || []).length - 1, net: s.doc.net_total };
      })()`,
    );
    expect(built.ok).toBe(true);
    expect(Number(built.net)).toBe(400);
    await app.evaluate(({ webContents }, snap) => {
      webContents.getAllWebContents().find((w) => /doc-form\.html/.test(w.getURL())).send("doc-snapshot", snap);
    }, built.snap);
    const n = built.n;
    // A fixed 20.00 on a 400.00 net shows as 5% (the Bill's displayTaxRateForRow).
    await expect
      .poll(async () => inDoc(app, `(document.querySelector('[data-testid="doc-tax-${n}-rate"]') || {}).value`), { timeout: 10_000 })
      .toBe("5.00");
    // The walk on a fixed row: Account → Amount.
    await inDoc(app, `(() => { const i = document.querySelector('[data-testid="doc-tax-${n}-account"]'); i.focus(); i.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })); })()`);
    await expect
      .poll(async () => inDoc(app, `document.activeElement && document.activeElement.getAttribute("data-testid")`), { timeout: 10_000 })
      .toBe(`doc-tax-${n}-amount`);
    // A Rate typed on the fixed row works out its Amount from the net total, and the row stays fixed.
    await inDoc(app, typeThenKey(`doc-tax-${n}-rate`, "10", "Tab"));
    await expect
      .poll(async () => (await inDoc(app, TAXES)).rows[n], { timeout: 20_000 })
      .toMatchObject({ type: "Actual", amount: 40 });
  });

  // 5zorro 2026-10-11, DF-02: 14.28 of tax allocated, the lines rose 14.27 (submitted with a hardcode).
  test("Allocate puts exactly the charge into the lines: 3 @ 21.00 + 4 @ 26.50, 14.28 → +14.28", async () => {
    test.setTimeout(150_000);
    const { doc } = await billWithDefaultTax(app);
    const acct = doc.taxes[0].account_head;
    const items = await inErp(app, `(async () => (await frappe.db.get_list("Item", { filters: { is_stock_item: 1, disabled: 0 }, limit: 2 })).map((x) => x.name))()`);
    test.skip(items.length < 2, "sandbox needs two stock Items");
    await inDoc(app, `document.querySelector('[data-testid="bill-remove-all-tax"]').click(); true`);
    await expect.poll(async () => (await inDoc(app, TAXES)).rows.length, { timeout: 20_000 }).toBe(0);
    const built = await inDoc(
      app,
      `(async () => {
        const d = window.erpDoc;
        await d.setItem(0, "item_code", ${JSON.stringify(items[0])});
        await d.setItem(0, "qty", 3);
        await d.setItem(0, "rate", 21);
        let s = await d.getSnapshot();
        if ((s.doc.items || []).length < 2) await d.addItem();
        await d.setItem(1, "item_code", ${JSON.stringify(items[1])});
        await d.setItem(1, "qty", 4);
        await d.setItem(1, "rate", 26.5);
        const r = await d.addTax(${JSON.stringify(acct)}, 14.28, "");
        s = await d.getSnapshot();
        return { ok: r && r.ok, doc: s.doc, amountDue: s.amountDue };
      })()`,
    );
    expect(built.ok).toBe(true);
    expect(Number(built.doc.net_total)).toBe(169);
    await app.evaluate(({ webContents }, snap) => {
      webContents.getAllWebContents().find((w) => /doc-form\.html/.test(w.getURL())).send("doc-snapshot", snap);
    }, built);
    const ci = built.doc.taxes.findIndex((t) => Number(t.tax_amount) === 14.28);
    await expect.poll(async () => inDoc(app, `!!document.querySelector('[data-tax-alloc="${ci}"]')`), { timeout: 10_000 }).toBe(true);
    await inDoc(app, `document.querySelector('[data-tax-alloc="${ci}"]').click(); true`);
    await expect.poll(async () => inDoc(app, `!!document.querySelector('[data-testid="bill-alloc-apply"]')`), { timeout: 10_000 }).toBe(true);
    await inDoc(app, `document.querySelector('[data-testid="bill-alloc-apply"]').click(); true`);
    const LINES = `(async () => { const s = await window.erpDoc.getSnapshot(); return { net: s.doc.net_total, gt: s.doc.grand_total, amounts: s.doc.items.map((i) => i.amount), taxes: s.doc.taxes.map((t) => [t.add_deduct_tax, t.tax_amount]) }; })()`;
    await expect.poll(async () => (await inDoc(app, LINES)).net, { timeout: 20_000 }).toBe(183.28);
    const after = await inDoc(app, LINES);
    expect(after.taxes).toContainEqual(["Deduct", 14.28]);
    expect(after.gt).toBe(183.28); // charge in, offset out: the vendor total stays 169 + the 14.28 charge row
    expect(await inDoc(app, `document.getElementById("status").textContent`)).toMatch(/exactly/);
  });

  // 5zorro 2026-10-11: the ribbon was exactly the field's width; a long tape in a narrow cell spilled.
  test("the calculator ribbon in a narrow Qty cell grows to fit its tape, lined up with the cell", async () => {
    test.setTimeout(150_000);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1400, 1000));
    await billWithDefaultTax(app);
    await inDoc(app, `(() => { const i = document.querySelector('input[data-row="0"][data-field="qty"]'); i.scrollIntoView({ block: "center" }); i.focus(); i.select(); return true; })()`);
    await app.evaluate(({ webContents }, keys) => {
      const w = webContents.getAllWebContents().find((x) => /doc-form\.html/.test(x.getURL()));
      w.focus();
      for (const k of keys) {
        w.sendInputEvent({ type: "keyDown", keyCode: k });
        w.sendInputEvent({ type: "char", keyCode: k });
        w.sendInputEvent({ type: "keyUp", keyCode: k });
      }
    }, [..."12345.678*3+98765.4"]);
    await expect.poll(async () => inDoc(app, `(() => { const o = document.getElementById("calc-overlay"); return !!o && !o.hidden; })()`), { timeout: 10_000 }).toBe(true);
    const m = await inDoc(
      app,
      `(() => {
        const o = document.getElementById("calc-overlay");
        const i = document.querySelector('input[data-row="0"][data-field="qty"]');
        const ro = o.getBoundingClientRect(), ri = i.getBoundingClientRect();
        const spill = [...o.querySelectorAll(".calc-expr, .calc-result")].some((e) => e.scrollWidth > e.clientWidth + 1);
        const right = /right|end/.test(getComputedStyle(i).textAlign);
        return { ribbon: Math.round(ro.width), cell: Math.round(ri.width), right, edgeGap: Math.round(right ? ro.right - ri.right : ro.left - ri.left), spill };
      })()`,
    );
    expect(m.ribbon).toBeGreaterThan(m.cell);
    expect(Math.abs(m.edgeGap)).toBeLessThanOrEqual(1); // lined up with the field's own aligned edge
    expect(m.spill).toBe(false);
    await app.evaluate(({ webContents }) => {
      const w = webContents.getAllWebContents().find((x) => /doc-form\.html/.test(x.getURL()));
      w.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
      w.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
    });
  });
});

