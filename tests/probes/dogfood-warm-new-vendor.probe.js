/**
 * @dogfood Warm lists 2
 * Plan 10-19 dogfood row "Warm lists 2" (HANDOFF § Warm pick lists): a vendor added through the
 * Bill's *Create Vendor…* peek and saved there, then, back on the Bill, part of its name typed into
 * a new Bill's vendor box. Question: is it listed at once — from the warm copy, with no
 * "Searching Supplier…" — rather than only after a live search? Makes vendor `ZZ DF WARM <n>`,
 * deleted after.
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../e2e/helpers.js";
import { sleep, keys, escPeek, focusTestId, inDoc, inErp, openNewDoc, docState, erpDown, erpUp, report } from "./probe-helpers.js";

const NAME = `ZZ DF WARM ${Date.now() % 100000}`;
const dropdown = (app) =>
  inDoc(app, `(() => { const d = [...document.querySelectorAll(".link-dd")].find((x) => !x.hidden); return d ? { opts: [...d.querySelectorAll(".link-opt")].map((o) => o.textContent.trim()), searching: !!d.querySelector(".link-muted") && /Searching/.test(d.textContent) } : null; })()`);

test("Warm lists 2: a vendor made through Create Vendor… is listed at once", async () => {
  const app = await launchShell();
  try {
    await waitForE2eApi(app);
    await openNewDoc(app, "bill", "/app/purchase-invoice/new");
    await sleep(3000);
    await focusTestId(app, "bill-vendor");
    await keys(app, NAME);
    await sleep(1500);
    await keys(app, "\t"); // Create Vendor… (the only option)
    await expect.poll(() => inErp(app, `!!(window.cur_frm && cur_frm.doctype === "Supplier")`), { timeout: 20_000 }).toBe(true);
    const saved = await inErp(app, `(async () => { cur_frm.set_value("supplier_name", ${JSON.stringify(NAME)}); if (!cur_frm.doc.supplier_group) { const g = await frappe.xcall("frappe.client.get_list", { doctype: "Supplier Group", fields: ["name"], limit_page_length: 1 }); await cur_frm.set_value("supplier_group", g[0].name); } await cur_frm.save(); return cur_frm.doc.name; })()`, 30_000);
    report("saved", { saved });
    expect(saved).toBe(NAME);
    await sleep(1500);
    if ((await docState(app)).snapOk !== true) await escPeek(app);
    await expect.poll(async () => (await docState(app)).snapOk, { timeout: 30_000 }).toBe(true);

    await openNewDoc(app, "bill", "/app/purchase-invoice/new");
    await sleep(2000);
    await erpDown(app, "search_link"); // a live search cannot answer now
    await focusTestId(app, "bill-vendor");
    await keys(app, "ZZ DF WA");
    await sleep(1500);
    const seen = await dropdown(app);
    await erpUp(app);
    report("typed", seen);
    expect(seen && seen.opts.some((o) => o.includes(NAME))).toBe(true);
    expect(seen.searching).toBe(false);
  } finally {
    await erpUp(app).catch(() => {});
    report("cleanup", await inErp(app, `(async () => { try { await frappe.xcall("frappe.client.delete", { doctype: "Supplier", name: ${JSON.stringify(NAME)} }); return "deleted"; } catch (e) { return "not deleted: " + (e && e.message); } })()`, 15_000));
    await app.close().catch(() => {});
  }
});
