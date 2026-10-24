/**
 * @dogfood R6b-4
 * Plan 10-19 R6b-4 follow-up — split by need. Two Sales Orders for SAMPLE-SKU-01 (Nos): SO-A needs
 * 6, SO-B needs 2. A new Bill line of 5 is assigned to both through the real Assign dialog.
 * Questions: does the dialog stop on "Costing Assumptions!" with 4 / 1; does ticking SO-B "from
 * stock" make it 5 / 0; after Okay, is the bridge PO's line linked to SO-A's *line* (so ERPNext's
 * ordered qty on it is 5), and is the decision written on the PO and SO-A ("Costing assumptions:")?
 * A third order, SO-C (needs 3), is picked and then put On Hold before the costing step: does the box
 * show it "On Hold — not counted", taking nothing (ERPNext counts no need for a held order)?
 * Then the Sales Order's look-back (plan 10-19 R6b-4 step 8): opened in its Doc skin, does each
 * order's line show a *Costing* chip, and does it open the same box, read-only, this order in bold?
 * The Bill itself is never saved.
 *
 * 🔴 LEAVES RECORDS (run with --leaves-records, sandbox only): each run submits three Sales Orders
 * (customer `ZZ R6B4 CUSTOMER`, PO no. `ZZR6B4-<n>`) and the bridge Purchase Order, then cancels
 * and deletes them — on 2026-10-22 all three deleted cleanly (with their Comments), leaving only
 * Frappe's *Deleted Document* log and the next numbers used. Anything ERPNext refuses to delete
 * stays, cancelled. The customer stays and is reused.
 */
import { writeFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi, e2eCall } from "../../../e2e/helpers.js";
import { sleep, inDoc, inErp, keys, openNewDoc, assertSandboxSite, report } from "../probe-helpers.js";
import { parseCostingNote } from "../../../src/costing-assumptions.js";

const CUSTOMER = "ZZ R6B4 CUSTOMER";
const TAG = `ZZR6B4-${Date.now() % 100000}`;
const call = (app, js) => inDoc(app, `(async () => { try { const r = await ${js}; return r && typeof r === "object" ? JSON.parse(JSON.stringify(r)) : r; } catch (e) { return "ERR " + (e && e.message); } })()`, 90_000);
const why = `let w = (e && e.message) || ""; try { w = w || JSON.parse(JSON.parse(frappe.last_response._server_messages)[0]).message; } catch (e2) {} return { error: w || String(e) };`;

const makeOrders = (app) =>
  inErp(
    app,
    `(async () => {
      try {
        const today = frappe.datetime.get_today();
        const have = await frappe.xcall("frappe.client.get_list", { doctype: "Customer", filters: { customer_name: ${JSON.stringify(CUSTOMER)} }, fields: ["name"] });
        let customer = have[0] && have[0].name;
        if (!customer) {
          const g = await frappe.xcall("frappe.client.get_list", { doctype: "Customer Group", filters: { is_group: 0 }, fields: ["name"], limit_page_length: 1 });
          const t = await frappe.xcall("frappe.client.get_list", { doctype: "Territory", filters: { is_group: 0 }, fields: ["name"], limit_page_length: 1 });
          customer = (await frappe.xcall("frappe.client.insert", { doc: { doctype: "Customer", customer_name: ${JSON.stringify(CUSTOMER)}, customer_group: g[0] && g[0].name, territory: t[0] && t[0].name } })).name;
        }
        const out = [];
        for (const [suffix, qty] of [["A", 6], ["B", 2], ["C", 3]]) {
          const so = await frappe.xcall("frappe.client.insert", { doc: {
            doctype: "Sales Order", customer, po_no: ${JSON.stringify(TAG)} + "-" + suffix, delivery_date: frappe.datetime.add_days(today, 14),
            items: [{ item_code: "SAMPLE-SKU-01", qty, rate: 25, delivery_date: frappe.datetime.add_days(today, 14) }],
          } });
          const sub = await frappe.xcall("frappe.client.submit", { doc: so });
          out.push({ name: sub.name, line: sub.items[0].name, qty });
        }
        return { customer, orders: out };
      } catch (e) { ${why} }
    })()`,
    60_000,
  );

const afterFacts = (app, po, soA) =>
  inErp(
    app,
    `(async () => {
      try {
        const p = await frappe.xcall("frappe.client.get", { doctype: "Purchase Order", name: ${JSON.stringify(po)} });
        const a = await frappe.xcall("frappe.client.get", { doctype: "Sales Order", name: ${JSON.stringify(soA)} });
        const notes = await frappe.xcall("frappe.client.get_list", { doctype: "Comment", filters: [["reference_name", "in", [${JSON.stringify(po)}, ${JSON.stringify(soA)}]], ["content", "like", "%Costing assumptions:%"]], fields: ["reference_doctype", "reference_name", "content"] });
        return { poLines: p.items.map((i) => ({ qty: i.qty, so: i.sales_order, soLine: i.sales_order_item })), soAOrdered: a.items[0].ordered_qty, notes };
      } catch (e) { ${why} }
    })()`,
    30_000,
  );

const cleanup = (app) =>
  inErp(
    app,
    `(async () => {
      const done = [];
      const tryDo = async (label, fn) => { try { await fn(); done.push(label); } catch (e) { done.push(label + " FAILED: " + ((e && e.message) || "")); } };
      const sos = await frappe.xcall("frappe.client.get_list", { doctype: "Sales Order", filters: [["po_no", "like", ${JSON.stringify(TAG + "%")}]], fields: ["name", "docstatus"] });
      const lines = await frappe.xcall("frappe.client.get_list", { doctype: "Purchase Order Item", parent: "Purchase Order", filters: [["sales_order", "in", sos.map((s) => s.name).concat(["-"])]], fields: ["parent"] });
      const pos = [...new Set(lines.map((l) => l.parent))];
      for (const po of pos) {
        await tryDo("cancel " + po, () => frappe.xcall("frappe.client.cancel", { doctype: "Purchase Order", name: po }));
        await tryDo("delete " + po, () => frappe.xcall("frappe.client.delete", { doctype: "Purchase Order", name: po }));
      }
      for (const so of sos) {
        // A held or closed order cannot be cancelled until it is resumed.
        if (so.docstatus === 1) await tryDo("resume " + so.name, () => frappe.xcall("erpnext.selling.doctype.sales_order.sales_order.update_status", { status: "Draft", name: so.name }));
        if (so.docstatus === 1) await tryDo("cancel " + so.name, () => frappe.xcall("frappe.client.cancel", { doctype: "Sales Order", name: so.name }));
        await tryDo("delete " + so.name, () => frappe.xcall("frappe.client.delete", { doctype: "Sales Order", name: so.name }));
      }
      return done;
    })()`,
    90_000,
  );

const inDialog = (app, js) => inDoc(app, `(() => { const d = document.querySelector('[data-testid="bill-allocation-picker"]'); if (!d) return "NO DIALOG"; ${js} })()`);
const clickPrimary = (app) => inDialog(app, `d.querySelector('[data-act="pick"]').click(); return true;`);
const title = (app) => inDialog(app, `return d.querySelector("[data-alloc-title]").textContent;`);
/** Click the dialog's main button, then wait until its title says the next step. */
async function next(app, want) {
  await clickPrimary(app);
  await expect.poll(() => title(app), { timeout: 20_000 }).toMatch(want);
  report("step", { title: await title(app) });
}

test("a Bill line split by need, with the costing box and a fill from stock", async () => {
  const app = await launchShell();
  try {
    await waitForE2eApi(app);
    await openNewDoc(app, "bill", "/app/purchase-invoice/new");
    await sleep(1500);
    report("site", { companies: await assertSandboxSite(app) });
    const made = await makeOrders(app);
    report("orders", made);
    expect(made && made.error).toBeFalsy();
    const [A, B, C] = made.orders;

    await call(app, `window.erpDoc.setHeader("supplier", "ALPINE SUPPLY CO")`);
    await sleep(2500);
    await call(app, `window.erpDoc.setHeader("bill_no", ${JSON.stringify(TAG)})`);
    await call(app, `window.erpDoc.setItem(0, "item_code", "SAMPLE-SKU-01")`);
    await sleep(1500);
    await call(app, `window.erpDoc.setItem(0, "qty", 5)`);
    await call(app, `window.erpDoc.setItem(0, "rate", 10)`);
    await sleep(1500);

    // The page's own planner, straight: 4 / 1 and an Okay needed.
    const plan = await call(app, `window.erpDoc.planLineAllocation(0, { salesOrders: [${JSON.stringify(A.name)}, ${JSON.stringify(B.name)}] })`);
    report("plan", plan && plan.plan ? { gets: plan.plan.rows.map((r) => r.gets), needsConfirm: plan.plan.needsConfirm } : plan);
    expect(plan.plan.rows.map((r) => r.gets)).toEqual([4, 1]);

    // The real dialog: Assign → customer → Sales Orders → Project → costing.
    // The vendor was set through the page's API, which does not repaint the page: show it in the box
    // as a repaint would, since Assign reads the vendor from there.
    await inDoc(app, `(() => { document.querySelector('[data-testid="bill-vendor"]').value = "ALPINE SUPPLY CO"; return true; })()`);
    // The vendor's source picker may still be open (a PO's sources): close it first.
    report("modals-before", await inDoc(app, `[...document.querySelectorAll(".src-back")].map((b) => b.dataset.testid || b.className)`));
    await inDoc(app, `(() => { for (const b of document.querySelectorAll(".src-back")) { const c = b.querySelector('[data-act="cancel"], [data-act="close"], .src-close'); if (c) c.click(); } return true; })()`);
    await sleep(1000);
    const opened = await inDoc(app, `(() => { const b = document.querySelector('[data-testid="bill-assign-0"]'); if (!b) return false; b.click(); return true; })()`);
    await sleep(1000);
    report("assign-button", { opened, status: await inDoc(app, `document.getElementById("status").textContent`), modals: await inDoc(app, `[...document.querySelectorAll(".src-back")].map((b) => b.dataset.testid || b.className)`) });
    expect(opened).toBe(true);
    await sleep(1500);
    await expect.poll(() => title(app), { timeout: 10_000 }).toMatch(/pick customer/);
    await next(app, /Sales order/); // all customers → Sales Orders
    await sleep(500);
    const picked = await inDialog(
      app,
      `const want = [${JSON.stringify(A.name)}, ${JSON.stringify(B.name)}, ${JSON.stringify(C.name)}]; let n = 0; for (const b of d.querySelectorAll(".src-item")) { if (want.some((w) => b.textContent.includes(w))) { b.click(); n++; } } return n;`,
    );
    report("picked", { picked });
    await sleep(500);
    // The list redraws on each click; pick again any that a redraw lost.
    const selected = await inDialog(app, `return [...d.querySelectorAll(".src-item.selected")].map((b) => b.textContent);`);
    report("selected", selected);
    // SO-C is paused after it was picked (the list offers no held order).
    report("hold-c", await inErp(app, `(async () => { try { await frappe.xcall("erpnext.selling.doctype.sales_order.sales_order.update_status", { status: "On Hold", name: ${JSON.stringify(C.name)} }); return "held"; } catch (e) { ${why} } })()`, 20_000));
    await next(app, /Project/);
    await next(app, /check the costing/); // "Apply to line" stops on the costing box
    const box = await inDialog(app, `const c = d.querySelector('[data-testid="costing-box"]'); return c ? { text: c.textContent, primary: d.querySelector('[data-act="pick"]').textContent } : null;`);
    report("costing", box);
    expect(box && box.text).toMatch(/Costing Assumptions!/);
    expect(box.primary).toBe("Okay, I still want to do this");

    // Fill SO-B from stock: the box redraws 5 / 0.
    await inDialog(app, `const tr = [...d.querySelectorAll(".costing-table tbody tr")].find((r) => r.dataset.so === ${JSON.stringify(B.name)}); tr.querySelector('[data-testid="costing-from-stock"]').click(); return true;`);
    await sleep(2500);
    const rows = await inDialog(app, `return [...d.querySelectorAll(".costing-table tbody tr")].map((r) => [...r.cells].slice(0, 4).map((c) => c.textContent));`);
    report("after-tick", rows);
    const getsBySo = Object.fromEntries(rows.map((r) => [r[0], r[2]]));
    expect(getsBySo).toEqual({ [A.name]: "5", [B.name]: "0", [C.name]: "0" });
    expect(rows.find((r) => r[0] === C.name)).toEqual([C.name, "3", "0", "On Hold — not counted"]);
    expect(await inDialog(app, `return !!d.querySelector('.costing-table tbody tr[data-so=${JSON.stringify(C.name)}] [data-testid="costing-from-stock"]');`)).toBe(false);

    await clickPrimary(app); // Okay
    await sleep(8000);
    const status = await inDoc(app, `document.getElementById("status").textContent`);
    report("status", { status });
    const snap = await call(app, `window.erpDoc.getSnapshot()`);
    const po = snap && snap.doc && snap.doc.items && snap.doc.items[0] && snap.doc.items[0].purchase_order;
    report("bill-line", { po });
    expect(po).toBeTruthy();
    const facts = await afterFacts(app, po, A.name);
    report("after", { ...facts, notes: (facts.notes || []).map((n) => ({ on: n.reference_name, starts: String(n.content).slice(0, 80) })) });
    expect(facts.poLines).toEqual([{ qty: 5, so: A.name, soLine: A.line }]);
    expect(facts.soAOrdered).toBe(5);
    expect((facts.notes || []).map((n) => n.reference_name).sort()).toEqual([A.name, po].sort());
    // The Sales Order's look-back draws the box again from the note as ERPNext stored it.
    const back = parseCostingNote(facts.notes.find((n) => n.reference_name === A.name).content);
    report("read-back", back && { po: back.po, rows: back.rows.map((r) => [r.salesOrder, r.open, r.gets, r.fromStock]), toStock: back.toStock });
    expect(back && back.po).toBe(po);
    expect(back.rows.map((r) => r.gets).sort()).toEqual([0, 0, 5]);

    // The look-back: each Sales Order in its Doc skin; the Bill is left unsaved.
    for (const [so, gets, note] of [[A, "5", "1 from stock"], [B, "0", "all from stock (ticked)"], [C, "0", "On Hold — not counted"]]) {
      await e2eCall(app, "openDocSkin", "sales-order", `/app/sales-order/${so.name}`, { skipDirtyGate: true });
      await expect
        .poll(() => inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); return (s && s.doc && s.doc.name) || ""; })()`), { timeout: 40_000 })
        .toBe(so.name);
      await expect.poll(() => inDoc(app, `document.querySelectorAll('[data-testid="so-costing-chip"]').length`), { timeout: 20_000 }).toBe(1);
      const chipLine = await inDoc(app, `document.querySelector('[data-testid="so-costing-chip"]').closest("td").dataset.sourcesLine`);
      expect(chipLine).toBe(so.line);
      await inDoc(app, `(() => { document.querySelector('[data-testid="so-costing-chip"]').click(); return true; })()`);
      await sleep(300);
      const look = await inDoc(
        app,
        `(() => { const d = document.querySelector('[data-testid="costing-lookback"]'); if (!d) return null;
          return { head: d.querySelector("h2").textContent, caption: d.querySelector(".costing-caption").textContent,
            here: [...d.querySelectorAll(".costing-here td")].map((c) => c.textContent), ticks: d.querySelectorAll('input[type="checkbox"]').length,
            focus: document.activeElement && document.activeElement.dataset.testid }; })()`,
      );
      report("look-back", { so: so.name, ...look });
      // PROBE_SHOTS=<dir>: a picture of the look-back, to see it without opening a window.
      if (process.env.PROBE_SHOTS) {
        const png = await app.evaluate(async ({ webContents }) => {
          const wc = webContents.getAllWebContents().find((w) => /doc-form\.html/.test(w.getURL()));
          return (await wc.capturePage()).toPNG().toString("base64");
        });
        writeFileSync(`${process.env.PROBE_SHOTS}/costing-lookback-${so.name}.png`, Buffer.from(png, "base64"));
      }
      expect(look && look.caption).toContain(`Bill ${TAG} line 1: SAMPLE-SKU-01 × 5 Nos → ${po}`);
      expect(look.here.slice(0, 4)).toEqual([so.name, String(so.qty), gets, note]);
      expect(look.ticks).toBe(0);
      expect(look.focus).toBe("costing-lookback-close");
      await keys(app, "\x1b");
      await sleep(300);
      const after = await inDoc(app, `({ open: !!document.querySelector('[data-testid="costing-lookback"]'), focus: document.activeElement && document.activeElement.dataset.testid })`);
      report("look-back-esc", after);
      expect(after.open).toBe(false);
      expect(after.focus).toBe("so-costing-chip");
      // Esc closed the box only — it did not also take the page back (the detour's Esc).
      expect(await inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); return (s && s.doc && s.doc.name) || ""; })()`)).toBe(so.name);
    }
  } finally {
    report("cleanup", await cleanup(app));
    await app.close().catch(() => {});
  }
});
