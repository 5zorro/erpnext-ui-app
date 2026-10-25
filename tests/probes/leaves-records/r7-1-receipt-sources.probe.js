/**
 * Review 10-19 R7-1: the Item Receipt's Select PO listed POs with the Bill's filter ("still to
 * bill"). Two submitted POs for one vendor: A is received in full but not billed, B is billed but
 * not received. Questions, on a new Item Receipt in the Doc lens: does Select PO list B (goods still
 * to come) and not A? Picking A anyway (its mapper brings no lines): is it refused, with the
 * receipt's lines kept, instead of the lines cleared and "Pulled from"? And R7-3: on a new Bill,
 * does the receipt made from A name A (every receipt row used to read "no PO")?
 * 🔴 LEAVES RECORDS per run: two **cancelled** POs (titled `ZZ-R7-…`), one cancelled receipt and one
 * cancelled bill (bill no. `ZZ-R7-B-…`), all for ALPINE SUPPLY CO.
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../../e2e/helpers.js";
import { sleep, inDoc, inErp, openNewDoc, report, assertSandboxSite, repaintDoc } from "../probe-helpers.js";

const VENDOR = "ALPINE SUPPLY CO";
const ITEM = "SAMPLE-SKU-01";
const RUN = String(Date.now() % 100000);

/** Make the two POs (in the ERPNext page). Returns { a, b, pr, pi }. */
const MAKE = `(async () => {
  const x = (m, a) => frappe.xcall(m, a);
  const day = frappe.datetime.add_days(frappe.datetime.get_today(), 7);
  const submit = async (doc) => { const d = await x("frappe.client.insert", { doc }); return x("frappe.client.submit", { doc: d }); };
  const po = (tag) => submit({ doctype: "Purchase Order", supplier: ${JSON.stringify(VENDOR)}, title: "ZZ-R7-" + tag + "-${RUN}", schedule_date: day,
    items: [{ item_code: ${JSON.stringify(ITEM)}, qty: 1, rate: 10, schedule_date: day }] });
  const a = await po("A");
  const b = await po("B");
  const pr = await submit(await x("erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_receipt", { source_name: a.name }));
  const piDoc = await x("erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_invoice", { source_name: b.name });
  piDoc.bill_no = "ZZ-R7-B-${RUN}";
  const pi = await submit(piDoc);
  return { a: a.name, b: b.name, pr: pr.name, pi: pi.name };
})()`;

test("R7-1: the Item Receipt offers the PO still to receive, and refuses one with nothing left", async () => {
  test.setTimeout(6 * 60_000);
  const app = await launchShell();
  /** @type {{ a?: string, b?: string, pr?: string, pi?: string }} */
  let made = {};
  try {
    await waitForE2eApi(app);
    await expect.poll(() => inErp(app, `!!(window.frappe && frappe.xcall)`), { timeout: 30_000 }).toBe(true);
    await assertSandboxSite(app);
    await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; });
    made = await inErp(app, MAKE, 60_000);
    report("made", made);
    expect(made && made.a && made.b).toBeTruthy();

    await openNewDoc(app, "receipt", "/app/purchase-receipt/new");
    await sleep(2500);
    const set = await inDoc(app, `(async () => { const r = await window.erpDoc.setHeader("supplier", ${JSON.stringify(VENDOR)}); return !!(r && r.ok); })()`, 30_000);
    expect(set).toBe(true);
    await sleep(3000);
    await repaintDoc(app); // the page's own API writes do not repaint it
    await sleep(1000);
    // Any picker the vendor write opened: close it, then ask for it from the toolbar, as a clerk would.
    await inDoc(app, `(() => { for (const b of document.querySelectorAll(".src-back")) { const c = b.querySelector('[data-act="cancel"], [data-act="close"], .src-close'); if (c) c.click(); } return true; })()`);
    await sleep(800);
    await inDoc(app, `(() => { document.querySelector('[data-testid="doc-select-source"]').click(); return true; })()`);
    const listed = async () =>
      inDoc(app, `(() => { const m = document.querySelector('[data-testid="doc-source-modal"]'); if (!m) return null; const items = [...m.querySelectorAll(".src-item")].map((b) => b.textContent); return { loading: items.some((t) => /Still loading/.test(t)), items }; })()`);
    await expect
      .poll(async () => { const l = await listed(); return !!(l && !l.loading); }, { timeout: 40_000 })
      .toBe(true)
      .catch(async (e) => {
        report("picker-not-ready", { listed: await listed(), status: await inDoc(app, `(document.getElementById("status") || {}).textContent || ""`) });
        throw e;
      });
    const seen = await listed();
    report("picker", seen);
    await inDoc(app, `(() => { for (const b of document.querySelectorAll(".src-back")) { const c = b.querySelector('[data-act="cancel"], [data-act="close"], .src-close'); if (c) c.click(); } return true; })()`);
    const offers = (name) => seen.items.some((t) => t.includes(name));
    const listing = { billedNotReceived: offers(made.b), receivedNotBilled: offers(made.a) };

    // B brings its line; then A, which has nothing left to receive.
    const mergeB = await inDoc(app, `(async () => { const r = await window.erpDoc.mergeSource("po", ${JSON.stringify(made.b)}); return { ok: !!(r && r.ok), lines: r && r.doc ? (r.doc.items || []).length : null }; })()`, 60_000);
    const mergeA = await inDoc(app, `(async () => { const r = await window.erpDoc.mergeSource("po", ${JSON.stringify(made.a)}); const s = await window.erpDoc.getSnapshot(); return { ok: !!(r && r.ok), reason: (r && r.reason) || "", linesAfter: (s.doc.items || []).filter((i) => i.item_code).length }; })()`, 60_000);
    report("merge", { mergeB, mergeA });

    // R7-3: the Bill's picker, where the receipt from A is still to bill.
    await openNewDoc(app, "bill", "/app/purchase-invoice/new");
    await sleep(2500);
    await inDoc(app, `(async () => { await window.erpDoc.setHeader("supplier", ${JSON.stringify(VENDOR)}); return true; })()`, 30_000);
    await sleep(3000);
    await repaintDoc(app);
    await sleep(1000);
    await inDoc(app, `(() => { for (const b of document.querySelectorAll(".src-back")) { const c = b.querySelector('[data-act="cancel"], [data-act="close"], .src-close'); if (c) c.click(); } return true; })()`);
    await sleep(800);
    await inDoc(app, `(() => { document.querySelector('[data-testid="bill-select-po"]').click(); return true; })()`);
    const billListed = async () =>
      inDoc(app, `(() => { const m = document.querySelector('[data-testid="bill-source-modal"]'); if (!m) return null; const items = [...m.querySelectorAll(".src-item")].map((b) => b.textContent); return { loading: items.some((t) => /Still loading/.test(t)), items }; })()`);
    await expect.poll(async () => { const l = await billListed(); return !!(l && !l.loading); }, { timeout: 40_000 }).toBe(true).catch(() => {});
    const billSeen = await billListed();
    report("bill-picker", billSeen);
    const receiptRow = ((billSeen && billSeen.items) || []).find((t) => t.includes(made.pr)) || "";

    // Asserted after every part ran, so a run on the old code shows them all.
    expect(listing).toEqual({ billedNotReceived: true, receivedNotBilled: false });
    expect(mergeB.ok).toBe(true);
    expect(mergeA.ok).toBe(false);
    expect(mergeA.reason).toMatch(/already received/);
    expect(mergeA.linesAfter).toBe(1);
    expect(receiptRow).toContain(`PO ${made.a}`);
  } finally {
    const undone = await inErp(
      app,
      `(async () => { const out = []; const m = ${JSON.stringify(made)};
        for (const [dt, n] of [["Purchase Invoice", m.pi], ["Purchase Receipt", m.pr], ["Purchase Order", m.a], ["Purchase Order", m.b]]) {
          if (!n) continue;
          try { await frappe.xcall("frappe.client.cancel", { doctype: dt, name: n }); out.push("cancel " + n); } catch (e) { out.push("kept " + n + ": " + (e && e.message)); }
        } return out; })()`,
      90_000,
    ).catch(() => "ERR");
    report("clear", undone);
    await app.close().catch(() => {});
  }
});
