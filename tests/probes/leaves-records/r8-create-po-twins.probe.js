/**
 * Review 10-19 R8-1 / R8-2: Create ▾ › Purchase Order on a submitted Sales Order whose first two
 * lines are the same item (2 and 3 of SAMPLE-SKU-01), and a third of another (4 of SAMPLE-SKU-02).
 *  1. R8-2: only line 1 ticked → is only line 1 ordered? ERPNext maps by item code, so the
 *     unticked twin used to come along.
 *  2. R8-1: line 3 ticked, Save, and while ERPNext is slow (its mapper call held 6 s in the page)
 *     Cancel, open the dialog again and Save again → one set of POs, or two?
 *  3. R8-1: line 2 ticked, Save, and the ERPNext page reloads mid-save → does the dialog close and
 *     say the POs may already exist, instead of offering the same Save again?
 * 🔴 LEAVES RECORDS per run: one **cancelled** Sales Order (customer PO `ZZ-R8-…`, customer ZZ DF CUSTOMER);
 * the draft POs it made are deleted. ERPNext's mapper call is held in the page by wrapping `frappe.call`
 * (undone in `finally`, and by the reload in part 3).
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi, e2eCall, e2eGet } from "../../../e2e/helpers.js";
import { sleep, inDoc, inErp, report, assertSandboxSite } from "../probe-helpers.js";

const VENDOR = "ALPINE SUPPLY CO";
const ITEM = "SAMPLE-SKU-01";
const RUN = String(Date.now() % 100000);

const MAKE = `(async () => {
  const x = (m, a) => frappe.xcall(m, a);
  const one = async (dt, f) => (await x("frappe.client.get_list", { doctype: dt, filters: f, fields: ["name"], limit_page_length: 1 }))[0];
  let cust = await one("Customer", { customer_name: "ZZ DF CUSTOMER" });
  if (!cust) {
    const g = await one("Customer Group", { is_group: 0 });
    const t = await one("Territory", { is_group: 0 });
    cust = await x("frappe.client.insert", { doc: { doctype: "Customer", customer_name: "ZZ DF CUSTOMER", customer_group: g && g.name, territory: t && t.name } });
  }
  const day = frappe.datetime.add_days(frappe.datetime.get_today(), 14);
  const d = await x("frappe.client.insert", { doc: { doctype: "Sales Order", customer: cust.name, po_no: "ZZ-R8-${RUN}", delivery_date: day,
    items: [{ item_code: ${JSON.stringify(ITEM)}, qty: 2, rate: 30, delivery_date: day }, { item_code: ${JSON.stringify(ITEM)}, qty: 3, rate: 30, delivery_date: day },
    { item_code: "SAMPLE-SKU-02", qty: 4, rate: 30, delivery_date: day }] } });
  const so = await x("frappe.client.submit", { doc: d });
  return { so: so.name, lines: so.items.map((i) => i.name) };
})()`;

/** Draft PO lines made for this order: [{ po, line, qty }]. */
const poLines = (app, so) =>
  inErp(app, `(async () => (await frappe.xcall("frappe.client.get_list", { doctype: "Purchase Order", filters: [["Purchase Order Item", "sales_order", "=", ${JSON.stringify(so)}], ["docstatus", "=", 0]],
    fields: ["name", "\`tabPurchase Order Item\`.sales_order_item as line", "\`tabPurchase Order Item\`.qty as qty"], limit_page_length: 0 })).map((r) => ({ po: r.name, line: r.line, qty: r.qty })))()`, 20_000);

/** Open Create ▾ › Purchase Order…, give every open row the vendor, tick only `tick` (row indexes). */
async function openDialog(app, tick) {
  await inDoc(app, `document.getElementById("btn-create").click(); true`);
  await sleep(500);
  await inDoc(app, `document.querySelector('[data-create="purchase-order"]').click(); true`);
  await expect.poll(async () => inDoc(app, `document.querySelectorAll('[data-testid="so-create-po"] tbody tr').length`), { timeout: 20_000 }).toBeGreaterThan(0);
  return inDoc(
    app,
    `(() => {
      const rows = [...document.querySelectorAll('[data-testid="so-create-po"] tbody tr')];
      rows.forEach((tr, i) => {
        const v = tr.querySelector('[data-sc="vendor"]'); const t = tr.querySelector('[data-sc="tick"]');
        if (v.disabled) return;
        v.value = ${JSON.stringify(VENDOR)}; v.dataset.linkCommitted = ${JSON.stringify(VENDOR)};
        t.checked = ${JSON.stringify(tick)}.includes(i) || (${JSON.stringify(tick)}.includes(-1) && i === rows.length - 1);
      });
      return rows.map((tr) => ({ disabled: tr.querySelector('[data-sc="tick"]').disabled, ticked: tr.querySelector('[data-sc="tick"]').checked }));
    })()`,
  );
}
const dialogOpen = (app) => inDoc(app, `!!document.querySelector('[data-testid="so-create-po"]')`);
const dialogMsg = (app) => inDoc(app, `(document.querySelector('[data-testid="so-create-msg"]') || {}).textContent || ""`);
const status = (app) => inDoc(app, `(document.getElementById("status") || {}).textContent || ""`);

test("R8: Create ▾ › Purchase Order orders only the ticked twin, and only once", async () => {
  test.setTimeout(6 * 60_000);
  const app = await launchShell();
  /** @type {{ so?: string, lines?: string[] }} */
  let made = {};
  try {
    await waitForE2eApi(app);
    await expect.poll(() => inErp(app, `!!(window.frappe && frappe.xcall)`), { timeout: 30_000 }).toBe(true);
    await assertSandboxSite(app);
    made = await inErp(app, MAKE, 60_000);
    report("made", made);
    await e2eCall(app, "openDocSkin", "sales-order", `/app/sales-order/${made.so}`);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("doc");
    await expect.poll(async () => inDoc(app, `(() => { const b = document.getElementById("btn-create"); return !!b && !b.hidden && !b.disabled; })()`), { timeout: 40_000 }).toBe(true);

    // 1. R8-2: line 1 only.
    report("dialog-1", await openDialog(app, [0]));
    await inDoc(app, `document.querySelector('[data-testid="so-create-save"]').click(); true`);
    await expect.poll(async () => !(await dialogOpen(app)), { timeout: 60_000 }).toBe(true);
    await sleep(1500);
    const afterOne = await poLines(app, made.so);
    report("after-line-1", { lines: afterOne, status: await status(app) });
    // R8-3: the Sources column (its reads now run at once) still shows the new PO on line 1.
    await expect
      .poll(async () => inDoc(app, `[...document.querySelectorAll('td[data-sources-line] .src-chip')].map((c) => c.textContent).join(" | ")`), { timeout: 30_000 })
      .toContain(afterOne[0] ? afterOne[0].po : "?");

    // 2. R8-1: line 3, with ERPNext's mapper held 6 s; Cancel mid-save, open again, Save again.
    //    The dialog's rows are the lines still to order, so line 3 is the last row.
    await inErp(app, `(() => { if (!window.__zzOrigCall) window.__zzOrigCall = frappe.call; const orig = window.__zzOrigCall;
      frappe.call = function (opts) { if (opts && /make_purchase_order/.test(String(opts.method || ""))) return new Promise((r) => setTimeout(r, 6000)).then(() => orig.call(frappe, opts)); return orig.apply(frappe, arguments); }; return true; })()`);
    report("dialog-2", await openDialog(app, [-1]));
    await inDoc(app, `document.querySelector('[data-testid="so-create-save"]').click(); true`);
    await sleep(1500);
    await inDoc(app, `document.querySelector('[data-testid="so-create-po"] [data-sc="cancel"]').click(); true`);
    await sleep(500);
    report("dialog-3", await openDialog(app, [-1]));
    await inDoc(app, `document.querySelector('[data-testid="so-create-save"]').click(); true`);
    await sleep(2500);
    const second = { open: await dialogOpen(app), msg: await dialogMsg(app) };
    report("second-save", second);
    await sleep(10_000); // both runs (if two) are done
    if (await dialogOpen(app)) await inDoc(app, `document.querySelector('[data-testid="so-create-po"] [data-sc="cancel"]').click(); true`);
    const afterTwo = await poLines(app, made.so);
    report("after-line-2", { lines: afterTwo, status: await status(app) });

    // 3. R8-1: a reload mid-save (the hold makes the window; the reload drops the held call).
    await inErp(app, `(() => { if (!window.__zzOrigCall) window.__zzOrigCall = frappe.call; const orig = window.__zzOrigCall;
      frappe.call = function (opts) { if (opts && /make_purchase_order/.test(String(opts.method || ""))) return new Promise((r) => setTimeout(r, 6000)).then(() => orig.call(frappe, opts)); return orig.apply(frappe, arguments); }; return true; })()`);
    report("dialog-4", await openDialog(app, [1]));
    await inDoc(app, `document.querySelector('[data-testid="so-create-save"]').click(); true`);
    await sleep(1500);
    await app.evaluate(({ webContents }) => { const w = webContents.getAllWebContents().find((x) => /\/(app|desk)\b/.test(x.getURL())); if (w) w.reload(); });
    await sleep(8000);
    const reloaded = { open: await dialogOpen(app), msg: await dialogMsg(app), status: await status(app) };
    report("reload-mid-save", reloaded);
    if (reloaded.open) await inDoc(app, `document.querySelector('[data-testid="so-create-po"] [data-sc="cancel"]').click(); true`);

    const qtyOn = (rows, line) => rows.filter((r) => r.line === line).reduce((s, r) => s + Number(r.qty), 0);
    expect({ line1: qtyOn(afterOne, made.lines[0]), line2: qtyOn(afterOne, made.lines[1]) }).toEqual({ line1: 2, line2: 0 });
    expect(qtyOn(afterTwo, made.lines[2])).toBe(4);
    expect(second.msg).toMatch(/Still making the purchase orders/);
    expect(reloaded.open).toBe(false);
    expect(reloaded.status).toMatch(/may already have been made/);
  } finally {
    await inErp(app, `(() => { if (window.__zzOrigCall) frappe.call = window.__zzOrigCall; return true; })()`).catch(() => {});
    const undone = await inErp(
      app,
      `(async () => { const out = []; const so = ${JSON.stringify(made.so || "")}; if (!so) return out;
        const pos = await frappe.xcall("frappe.client.get_list", { doctype: "Purchase Order", filters: [["Purchase Order Item", "sales_order", "=", so]], fields: ["name", "docstatus"], limit_page_length: 0 });
        for (const p of [...new Map(pos.map((r) => [r.name, r])).values()]) {
          try { if (p.docstatus === 1) await frappe.xcall("frappe.client.cancel", { doctype: "Purchase Order", name: p.name }); else await frappe.xcall("frappe.client.delete", { doctype: "Purchase Order", name: p.name }); out.push("gone " + p.name); } catch (e) { out.push("kept " + p.name + ": " + (e && e.message)); }
        }
        try { await frappe.xcall("frappe.client.cancel", { doctype: "Sales Order", name: so }); out.push("cancel " + so); } catch (e) { out.push("kept " + so + ": " + (e && e.message)); }
        return out; })()`,
      90_000,
    ).catch(() => "ERR");
    report("clear", undone);
    await app.close().catch(() => {});
  }
});
