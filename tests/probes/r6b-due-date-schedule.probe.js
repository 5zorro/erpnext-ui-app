/**
 * @dogfood R6b-1 / R6b-2
 * Plan 10-19 R6b: a Bill with no payment terms and a typed due date. The bridge adds the schedule
 * row itself (`syncScheduleFromHeaderDueDate`) with a fixed amount and no portion; ERPNext only
 * rescales rows that have a portion (`set_payment_schedule`). Question: does a second save, after
 * the lines change, still go through? Makes a vendor with no terms (`ZZ R6B NO TERMS`) and one
 * draft Bill (bill no. `ZZR6B…`), both deleted after.
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../e2e/helpers.js";
import { sleep, inDoc, inErp, openNewDoc, deleteZzSuppliers, report } from "./probe-helpers.js";

const VENDOR = "ZZ R6B NO TERMS";
const BILL_NO = `ZZR6B-${Date.now() % 100000}`;
const call = (app, js) => inDoc(app, `(async () => { try { const r = await ${js}; return r && typeof r === "object" ? JSON.parse(JSON.stringify(r)) : r; } catch (e) { return "ERR " + (e && e.message); } })()`, 60_000);
const schedule = (app) =>
  inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); const d = (s && s.doc) || {}; return { name: d.name, docstatus: d.docstatus, terms: d.payment_terms_template || "", due: d.due_date, grand: d.grand_total, rounded: d.rounded_total, rows: (d.payment_schedule || []).map((r) => ({ due: r.due_date, portion: r.invoice_portion, amount: r.payment_amount })) }; })()`, 15_000);
const brief = (r) => (r && typeof r === "object" ? { ok: r.ok, reason: r.reason, name: r.name || (r.doc && r.doc.name) } : r);

test("Bill without terms: typed due date, save, change a line, save again", async () => {
  const app = await launchShell();
  let name = "";
  /** @type {any} */ let save1;
  /** @type {any} */ let save2;
  try {
    await waitForE2eApi(app);
    await openNewDoc(app, "bill", "/app/purchase-invoice/new");
    report(
      "make-vendor",
      await inErp(app, `(async () => { try { const g = await frappe.xcall("frappe.client.get_list", { doctype: "Supplier Group", fields: ["name"], limit_page_length: 1 }); const d = await frappe.xcall("frappe.client.insert", { doc: { doctype: "Supplier", supplier_name: ${JSON.stringify(VENDOR)}, supplier_group: g[0] && g[0].name } }); return d.name; } catch (e) { return "ERR " + (e && e.message); } })()`, 20_000),
    );
    await sleep(2000);
    report("set-vendor", brief(await call(app, `window.erpDoc.setHeader("supplier", ${JSON.stringify(VENDOR)})`)));
    await sleep(2000);
    await call(app, `window.erpDoc.setHeader("bill_no", ${JSON.stringify(BILL_NO)})`);
    report("due", brief(await call(app, `window.erpDoc.setHeader("due_date", "2026-12-15")`)));
    report("after-due", await schedule(app));
    await call(app, `window.erpDoc.setItem(0, "item_code", "SAMPLE-SKU-01")`);
    await sleep(1500);
    await call(app, `window.erpDoc.setItem(0, "qty", 1)`);
    await call(app, `window.erpDoc.setItem(0, "rate", 10)`);
    save1 = await call(app, `window.erpDoc.save({})`);
    report("save1", brief(save1));
    const s1 = await schedule(app);
    name = s1.name || "";
    report("after-save1", s1);
    await call(app, `window.erpDoc.setItem(0, "qty", 3)`);
    save2 = await call(app, `window.erpDoc.save({})`);
    report("save2", brief(save2));
    report("after-save2", await schedule(app));
    // A refusal reads as ERPNext's one line, never a traceback or a dialog's chrome (R6b-2).
    for (const r of [save1, save2]) if (r && !r.ok) expect(String(r.reason || "")).not.toMatch(/Traceback|Confirm$|Expense Head changed/);
    // Failed on adcf495 (R6b-1): the first save was refused — the bridge's row was 0.00 and never rescaled.
    expect(save1 && save1.ok).toBe(true);
    expect(save2 && save2.ok).toBe(true);
  } finally {
    const del = await inErp(
      app,
      `(async () => { try { const n = await frappe.xcall("frappe.client.get_list", { doctype: "Purchase Invoice", filters: { bill_no: ["like", "ZZR6B%"], docstatus: 0 }, fields: ["name"] }); for (const r of n) await frappe.xcall("frappe.client.delete", { doctype: "Purchase Invoice", name: r.name }); return n.map((r) => r.name); } catch (e) { return "ERR " + (e && e.message); } })()`,
      20_000,
    );
    report("cleanup", { name, deleted: del, vendors: await deleteZzSuppliers(app) });
    await app.close().catch(() => {});
  }
});
