/**
 * @dogfood R5b-2
 * Plan 10-19 dogfood row R5b-2: Import into a new Bill. First 4 lines with ERPNext answering (the
 * control: "Imported 4 line(s)."), then 2 with each lookup held 3 s (slow is not stopped), then 12 lines where ERPNext stops part way — the app's session
 * refuses the item lookups (`run_doc_method`) after the first 4. Questions: does the status say
 * "Import stopped at line N of 12: … Lines 1–(N−1) are on the form.", are those lines on the form
 * with ERPNext's details, and were the line table and Import locked while it ran?
 *
 * Found DC-3 on its first run: with the lookups refused, the import said "Imported 12 line(s)." —
 * the item code writes land, but lines 5–12 had no name, unit or account. Saves nothing; makes no
 * records.
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../e2e/helpers.js";
import { sleep, inDoc, inErp, openNewDoc, erpDownAfter, erpUp, report, closeSourcePickers } from "./probe-helpers.js";

const SKUS = ["SAMPLE-SKU-01", "SAMPLE-SKU-02", "SAMPLE-SKU-03", "SAMPLE-SKU-04"];
const paste = (n) => ["SKU\tQty\tRate", ...Array.from({ length: n }, (_, i) => `${SKUS[i % 4]}\t${i + 1}\t10`)].join("\n");
const status = (app) => inDoc(app, `document.getElementById("status").textContent`);
const lines = (app) => inDoc(app, `(async () => (await window.erpDoc.getSnapshot()).doc.items.filter((i) => i.item_code).map((i) => [i.item_code, i.qty, i.uom || ""]))()`);

/** Paste `text` into Import, preview, Apply; returns when Apply was clicked. */
async function startImport(app, text) {
  await inDoc(app, `(() => { document.getElementById("btn-import-items").click(); return true; })()`);
  await expect.poll(() => inDoc(app, `!!document.querySelector('[data-testid="bill-import-paste"]')`), { timeout: 10_000 }).toBe(true);
  await inDoc(app, `(() => { const t = document.querySelector('[data-testid="bill-import-paste"]'); t.value = ${JSON.stringify(text)}; t.dispatchEvent(new Event("input", { bubbles: true })); document.querySelector('[data-testid="bill-import-preview"]').click(); return true; })()`);
  await expect.poll(() => inDoc(app, `!document.querySelector('[data-testid="bill-import-apply"]').disabled`), { timeout: 10_000 }).toBe(true);
}
const apply = (app) => inDoc(app, `(() => { document.querySelector('[data-testid="bill-import-apply"]').click(); return true; })()`);

test("R5b-2: an Import that stops part way says which lines are on the form", async () => {
  const app = await launchShell();
  try {
    await waitForE2eApi(app);
    await openNewDoc(app, "bill", "/app/purchase-invoice/new");
    await sleep(1500);
    await inDoc(app, `(async () => { await window.erpDoc.setHeader("supplier", "ALPINE SUPPLY CO"); return true; })()`, 30_000);
    await sleep(2500);
    await closeSourcePickers(app);

    // Control: ERPNext answering, every line filled in.
    await startImport(app, paste(4));
    await apply(app);
    await expect.poll(() => status(app), { timeout: 120_000 }).toMatch(/^Import/);
    const control = { status: await status(app), lines: await lines(app) };
    report("control", control);
    expect(control.status).toBe("Imported 4 line(s).");
    expect(control.lines.every((l) => l[2])).toBe(true);

    // A slow ERPNext that still answers (each lookup held 3 s in its page) is not "stopped": the
    // item code write waits for the details, so DC-3's check must not fire.
    await inErp(app, `(() => { const orig = frappe.call; window.__probeOrigCall = orig; frappe.call = function (opts) { if (opts && opts.method === "run_doc_method") return new Promise((r) => setTimeout(r, 3000)).then(() => orig.apply(this, arguments)); return orig.apply(this, arguments); }; return true; })()`);
    await startImport(app, paste(2));
    await apply(app);
    await expect.poll(() => status(app), { timeout: 120_000 }).toMatch(/^Import/);
    const slow = await status(app);
    await inErp(app, `(() => { frappe.call = window.__probeOrigCall; return true; })()`);
    report("slow", { status: slow });
    expect(slow).toBe("Imported 2 line(s).");

    // ERPNext stops after 4 more lookups.
    await startImport(app, paste(12));
    await erpDownAfter(app, "/api/method/run_doc_method", 4);
    await apply(app);
    await sleep(1500);
    const during = await inDoc(app, `(() => { const t = document.getElementById("items-body"); return { itemsInert: !!(t && t.closest("[inert]")), importDisabled: document.getElementById("btn-import-items").disabled }; })()`);
    report("during", during);
    await expect.poll(() => status(app), { timeout: 180_000 }).toMatch(/^Import (stopped|\d)/);
    const said = await status(app);
    await erpUp(app);
    const after = await lines(app);
    report("stopped", { status: said, lines: after });
    const m = /^Import stopped at line (\d+) of 12: .+\. Lines 1–(\d+) are on the form\./.exec(said);
    expect(m).toBeTruthy();
    const [stoppedAt, done] = [Number(m[1]), Number(m[2])];
    expect(stoppedAt).toBe(5);
    expect(done).toBe(4);
    // The control's 4 lines and the slow 2, then the 4 that landed with ERPNext's details.
    expect(after.slice(6, 10).every((l) => l[2])).toBe(true);
    expect(during.importDisabled).toBe(true);
    expect(during.itemsInert).toBe(true);
  } finally {
    await erpUp(app).catch(() => {});
    await app.close().catch(() => {});
  }
});
