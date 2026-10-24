/**
 * @dogfood R2-1
 * Plan 10-19 dogfood row R2-1: Save on a new Bill, and the ERPNext page reloads while the save is
 * in flight (as a browser-tab logout or a Docker restart does) — the save call is held 5 s in the
 * ERPNext page so the reload lands inside it. Questions: does Save come back — not spin for ever — saying the ERPNext page reloaded
 * before the step finished, and does New still work without restarting? A draft bill the save may
 * have made (bill no. `ZZ-DF-RELOAD-<n>`) is deleted after.
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi, e2eCall } from "../../e2e/helpers.js";
import { sleep, inDoc, inErp, openNewDoc, report, closeSourcePickers, repaintDoc } from "./probe-helpers.js";
import { billCompareTotal } from "../../src/bill-map.js";

const TAG = `ZZ-DF-RELOAD-${Date.now() % 100000}`;
const SNAP = `(async () => { const s = await window.erpDoc.getSnapshot(); return { doc: s.doc }; })()`;

test("R2-1: a reload mid-save ends the wait and New still works", async () => {
  const app = await launchShell();
  try {
    await waitForE2eApi(app);
    await openNewDoc(app, "bill", "/app/purchase-invoice/new");
    await sleep(2000);
    await inDoc(
      app,
      `(async () => { const d = window.erpDoc; await d.setHeader("supplier", "ALPINE SUPPLY CO"); await d.setHeader("bill_no", ${JSON.stringify(TAG)});
        await d.setItem(0, "item_code", "SAMPLE-SKU-01"); await d.setItem(0, "qty", 1); await d.setItem(0, "rate", 10); return true; })()`,
      90_000,
    );
    await sleep(3000);
    const snap = await repaintDoc(app);
    report("before-save", { supplier: snap.doc.supplier, items: (snap.doc.items || []).map((i) => i.item_code) });
    // The page reads the vendor from its box; the API write does not repaint it.
    await inDoc(app, `(() => { document.querySelector('[data-testid="bill-vendor"]').value = "ALPINE SUPPLY CO"; return true; })()`);
    await closeSourcePickers(app);
    await sleep(500);

    const total = billCompareTotal(snap.doc);
    await inDoc(app, `(() => { const a = document.querySelector('[data-testid="bill-amount-due"]'); a.focus(); a.value = ${JSON.stringify(String(total))}; a.dispatchEvent(new Event("input", { bubbles: true })); a.blur(); return true; })()`);
    // Hold ERPNext's save call 5 s, so the reload below lands while the step is running.
    await inErp(app, `(() => { const orig = frappe.call; frappe.call = function (opts) { const m = String((opts && opts.method) || opts || ""); if (/savedocs|frappe\.client\.(save|insert)/.test(m)) return new Promise((r) => setTimeout(r, 5000)).then(() => orig.apply(this, arguments)); return orig.apply(this, arguments); }; return true; })()`);
    await inDoc(app, `(() => { document.getElementById("btn-save").click(); return true; })()`);
    // Save asks first whether the goods came with the bill: Bill only.
    await expect.poll(() => inDoc(app, `!!document.querySelector('[data-testid="bill-receive-bill-only"]')`), { timeout: 10_000 }).toBe(true);
    await inDoc(app, `(() => { document.querySelector('[data-testid="bill-receive-bill-only"]').click(); return true; })()`);
    await sleep(2000);
    report("saving", { status: await inDoc(app, `document.getElementById("status").textContent`) });
    await e2eCall(app, "reloadErp");
    const t0 = Date.now();
    await expect.poll(() => inDoc(app, `document.getElementById("status").textContent`), { timeout: 60_000 }).toMatch(/reloaded before the step finished/);
    const after = await inDoc(app, `({ status: document.getElementById("status").textContent, saveDisabled: document.getElementById("btn-save").disabled })`);
    report("after-reload", { ...after, ms: Date.now() - t0 });
    expect(after.saveDisabled).toBe(false);

    await inDoc(app, `(() => { window.confirm = () => true; document.getElementById("btn-new").click(); return true; })()`);
    await sleep(1000);
    await inDoc(app, `(() => { const b = document.querySelector('[data-testid="doc-gate-discard"]'); if (b && b.offsetParent) b.click(); return true; })()`);
    await expect
      .poll(async () => { const s = await inDoc(app, SNAP, 15_000); return s && s.doc ? String(s.doc.name) : "TIMEOUT"; }, { timeout: 90_000 })
      .toMatch(/^new-purchase-invoice/);
    report("new", { ok: true });
  } finally {
    report("cleanup", await inErp(app, `(async () => { try { const b = await frappe.xcall("frappe.client.get_list", { doctype: "Purchase Invoice", filters: { bill_no: ${JSON.stringify(TAG)}, docstatus: 0 }, fields: ["name"] }); for (const r of b) await frappe.xcall("frappe.client.delete", { doctype: "Purchase Invoice", name: r.name }); return b.map((r) => r.name); } catch (e) { return "ERR " + (e && e.message); } })()`, 30_000).catch(() => "ERR"));
    await app.close().catch(() => {});
  }
});
