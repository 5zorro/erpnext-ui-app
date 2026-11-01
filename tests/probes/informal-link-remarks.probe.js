/**
 * Museum OI-193: a credit memo's informal links and the Remarks box. Link a Bill, clear it, then
 * link a Sales Order, through the real dialog. Questions: does the Remarks box show what was
 * written each time (it kept the first link's text, and the next link wrote the cleared Bill
 * back)? Does clearing leave a trace — "Removed linked Bill: …" — that stays (5zorro 2026-10-31:
 * "when something is wonky, i want to be able to see the fingerprints that left it in the state
 * that i am researching out")? Makes no records: the Bill is never saved.
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../e2e/helpers.js";
import { sleep, inDoc, openNewDoc, assertSandboxSite, report, closeSourcePickers } from "./probe-helpers.js";

const VENDOR = "ZZ DF BRIDGE";
const call = (app, js) => inDoc(app, `(async () => { try { const r = await ${js}; return r && typeof r === "object" ? JSON.parse(JSON.stringify(r)) : r; } catch (e) { return "ERR " + (e && e.message); } })()`, 90_000);
const status = (app) => inDoc(app, `document.getElementById("status").textContent`);
const click = (app, sel) => inDoc(app, `(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return false; b.click(); return true; })()`);
const rows = (app, kind) => inDoc(app, `document.querySelectorAll('[data-testid="bill-informal-link-${kind}-row"]').length`);
/** What the clerk sees (the box, the two link lines) and what ERPNext holds. */
const seen = (app) =>
  call(app, `(async () => { const s = await window.erpDoc.getSnapshot(); return {
    box: document.getElementById("f-memo").value,
    bill: document.getElementById("credit-link-bill-value").textContent,
    so: document.getElementById("credit-link-so-value").textContent,
    stored: (s && s.doc && s.doc.remarks) || "" }; })()`);

async function openDialog(app, kind) {
  await click(app, `#btn-informal-link-${kind}`);
  await expect.poll(async () => inDoc(app, `!!document.querySelector('[data-testid="bill-informal-link-picker-${kind}"]')`), { timeout: 20_000 }).toBe(true);
}

test("informal links: the Remarks box shows what was written, and a cleared link leaves a trace", async () => {
  const app = await launchShell();
  try {
    await waitForE2eApi(app);
    await openNewDoc(app, "bill", "/app/purchase-invoice/new");
    await sleep(1500);
    await assertSandboxSite(app);
    await call(app, `window.erpDoc.setHeader("supplier", ${JSON.stringify(VENDOR)})`);
    await sleep(2500);
    await inDoc(app, `(() => { document.querySelector('[data-testid="bill-vendor"]').value = ${JSON.stringify(VENDOR)}; return true; })()`);
    await closeSourcePickers(app);
    await sleep(1000);
    // A credit memo, as a clerk makes one: Credit memo → Yes opens "which Bill?"; Decide later.
    await click(app, "#f-is-return");
    await expect.poll(async () => inDoc(app, `!!document.querySelector('[data-testid="bill-credit-source-picker"]')`), { timeout: 20_000 }).toBe(true);
    await click(app, '[data-testid="bill-credit-source-picker"] [data-act="clear"]');
    await expect.poll(() => status(app), { timeout: 20_000 }).toMatch(/no Bill behind it/);

    // Link a Bill (any vendor's: search by name).
    await openDialog(app, "bill");
    await inDoc(app, `(() => { const s = document.querySelector("[data-link-search]"); s.value = "ACC-PINV-2026-0000"; s.dispatchEvent(new Event("input")); return true; })()`);
    await expect.poll(() => rows(app, "bill"), { timeout: 20_000 }).toBeGreaterThan(0);
    const bill = await inDoc(app, `document.querySelector('[data-testid="bill-informal-link-bill-row"]').textContent.split(" — ")[0]`);
    await click(app, '[data-testid="bill-informal-link-bill-row"]');
    await expect.poll(() => status(app), { timeout: 20_000 }).toMatch(/Noted in Remarks: informal link to Bill/);
    const linked = await seen(app);
    report("bill-linked", { picked: bill, ...linked });
    expect(linked.bill).toBe(bill);
    expect(linked.box).toBe(`Linked Bill: ${bill}`);

    // Clear it: the box follows, and a trace stays.
    await openDialog(app, "bill");
    await click(app, '[data-testid="bill-informal-link-picker-bill"] [data-act="clear"]');
    await expect.poll(() => status(app), { timeout: 20_000 }).toMatch(/Informal Bill link cleared/);
    const cleared = await seen(app);
    report("bill-cleared", cleared);
    expect(cleared.bill).toBe("(none)");
    expect(cleared.box).toBe(`Removed linked Bill: ${bill}`);
    expect(cleared.stored).toBe(cleared.box);

    // Link a Sales Order: the cleared Bill does not come back; the trace is still there.
    await openDialog(app, "so");
    await expect.poll(() => rows(app, "so"), { timeout: 20_000 }).toBeGreaterThan(0);
    const so = await inDoc(app, `document.querySelector('[data-testid="bill-informal-link-so-row"]').textContent.split(" — ")[0]`);
    await click(app, '[data-testid="bill-informal-link-so-row"]');
    await expect.poll(() => status(app), { timeout: 20_000 }).toMatch(/Noted in Remarks: informal link to Sales Order/);
    const both = await seen(app);
    report("so-linked", { picked: so, ...both });
    expect(both.bill).toBe("(none)");
    expect(both.so).toBe(so);
    expect(both.box).toBe(`Removed linked Bill: ${bill}\nLinked Sales Order: ${so}`);
    expect(both.stored).toBe(both.box);
  } finally {
    await app.close().catch(() => {});
  }
});
