/**
 * @dogfood R2-7
 * Plan 10-19 dogfood row R2-7: a charge allocated to stock on a two-line Bill, where ERPNext's form
 * will not take line 2's raised rate. 🔴 SIMULATED: no plain-bill path in ERPNext refuses a line
 * rate, so the ERPNext page's bridge is made to refuse that one call (line 2's first rate write).
 * Questions: is the answer "… Nothing was changed.", does line 1 keep its old rate, and is no offset
 * row added? Saves nothing; makes no records.
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../e2e/helpers.js";
import { sleep, inDoc, inErp, openNewDoc, report } from "./probe-helpers.js";

const call = (app, js) => inDoc(app, `(async () => { try { const r = await ${js}; return r && typeof r === "object" ? JSON.parse(JSON.stringify(r)) : r; } catch (e) { return "ERR " + (e && e.message); } })()`, 60_000);
const SNAP = `window.erpDoc.getSnapshot()`;

test("R2-7: a refused line rate puts the other lines back and adds no offset", async () => {
  const app = await launchShell();
  try {
    await waitForE2eApi(app);
    await openNewDoc(app, "bill", "/app/purchase-invoice/new");
    await sleep(1500);
    const account = await inErp(app, `(async () => ((await frappe.xcall("frappe.client.get_list", { doctype: "Account", filters: { root_type: "Expense", is_group: 0, account_type: ["in", ["Chargeable", "Expense Account", ""]] }, fields: ["name"], limit_page_length: 1 }))[0] || {}).name)()`, 15_000);
    report("charge-account", { account });
    await call(app, `window.erpDoc.setHeader("supplier", "ALPINE SUPPLY CO")`);
    await sleep(2500);
    await call(app, `(async () => { const d = window.erpDoc;
      await d.setItem(0, "item_code", "SAMPLE-SKU-01"); await d.setItem(0, "qty", 2); await d.setItem(0, "rate", 10);
      let s = await d.getSnapshot(); if ((s.doc.items || []).length < 2) await d.addItem();
      await d.setItem(1, "item_code", "SAMPLE-SKU-02"); await d.setItem(1, "qty", 3); await d.setItem(1, "rate", 10);
      return true; })()`);
    await sleep(1500);
    const added = await call(app, `window.erpDoc.addTax(${JSON.stringify(account)}, 10, "ZZ DF freight")`);
    report("tax", { ok: added && added.ok, reason: added && added.reason });
    const before = await call(app, SNAP);
    const taxIdx = before.doc.taxes.findIndex((t) => t.description === "ZZ DF freight");
    report("before", { rates: before.doc.items.map((i) => i.rate), taxes: before.doc.taxes.map((t) => [t.description, t.tax_amount]) });
    expect(taxIdx).toBeGreaterThanOrEqual(0);

    // Line 2's first rate write is refused by the bridge in the ERPNext page; everything else goes through.
    await inErp(app, `(() => { const b = window.__docFormBridge; const orig = b.setRow; let refused = false;
      b.setRow = function (ri, field) { if (!refused && ri === 1 && field === "rate") { refused = true; return Promise.resolve({ ok: false, reason: "Line 2: the probe refused this rate." }); } return orig.apply(this, arguments); };
      return true; })()`);
    const res = await call(app, `window.erpDoc.allocateCharge(${taxIdx}, "amount")`);
    report("allocate", { ok: res && res.ok, partial: res && res.partial, reason: res && res.reason });
    const after = await call(app, SNAP);
    report("after", { rates: after.doc.items.map((i) => i.rate), taxes: after.doc.taxes.map((t) => [t.description, t.tax_amount, t.add_deduct_tax]) });
    expect(res.ok).toBe(false);
    expect(res.partial).toBeFalsy();
    expect(res.reason).toBe("Line 2: the probe refused this rate. Nothing was changed.");
    expect(after.doc.items.map((i) => i.rate)).toEqual([10, 10]);
    expect(after.doc.taxes.length).toBe(before.doc.taxes.length);
  } finally {
    await app.close().catch(() => {});
  }
});
