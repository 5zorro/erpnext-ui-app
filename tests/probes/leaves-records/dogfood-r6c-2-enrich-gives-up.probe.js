/**
 * @dogfood R6c-2
 * Plan 10-19 dogfood row R6c-2: a draft Bill made from a Purchase Order, opened while ERPNext stops
 * answering the background reads for its PO and receipt columns (the app's session refuses
 * `/api/resource/Purchase Order…`, `…Purchase Receipt…` and the page's list calls from before the Bill opens), until the background retry gives up (15 rounds, a few
 * minutes; it is read from the app's own nav-debug.log). Questions: is no field left saying it is
 * still loading, and does Save say to press Refresh rather than to wait? (The PO fields keep the PO
 * numbers from the bill's own lines — only their titles are missing — so here it is the PO line
 * limits that stay unloaded, and Save that says so.)
 *
 * 🔴 LEAVES RECORDS (run with --leaves-records, sandbox only): scene `bill-from-po`
 * (tests/probes/dogfood-scenes.js) — per run a Purchase Order for `ZZ DF ENRICH` (cancelled after;
 * it stays, cancelled) and a draft Bill (deleted).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../../e2e/helpers.js";
import { sleep, inDoc, openNewDoc, assertSandboxSite, keepScene, erpDown, erpUp, report } from "../probe-helpers.js";
import { SCENES } from "../dogfood-scenes.js";
import { LINKED_SOURCE_LOADING_PLACEHOLDER } from "../../../src/bill-enrich-pending.js";

const scene = SCENES["bill-from-po"];
const NAV_LOG = path.join(os.homedir(), ".config", "erpnext-ui-app", "nav-debug.log");
/** The app's own trail: the background retry's give-up line for this bill, after `since`. */
const gaveUpLine = (bill, since) =>
  fs.readFileSync(NAV_LOG, "utf8").split("\n").filter((l) => l.includes('"bill-enrich-stop"') && l.includes(bill) && /max_rounds/.test(l)).find((l) => {
    const at = /"at":"([^"]+)"/.exec(l);
    return at && Date.parse(at[1]) >= since;
  }) || null;

test("R6c-2: when the background loading gives up, the page says Refresh", async () => {
  test.setTimeout(900_000);
  const app = await launchShell();
  try {
    await waitForE2eApi(app);
    await openNewDoc(app, "bill", "/app/purchase-invoice/new");
    await sleep(1500);
    report("site", { companies: await assertSandboxSite(app) });
    const made = await scene.make(app);
    report("scene", made);
    expect(made && made.error).toBeFalsy();

    // Every route the background reads take: /api/resource over HTTP, and the lists in the ERPNext
    // page — frappe.client.get_list, and reportview.get_list, which xList asks (review 10-19 R7-5).
    await erpDown(app, ["/api/resource/Purchase%20Order", "/api/resource/Purchase%20Receipt", "frappe.client.get_list", "frappe.desk.reportview.get_list"]);
    await openNewDoc(app, "bill", `/app/purchase-invoice/${made.bill}`);
    await expect.poll(() => inDoc(app, `(async () => (await window.erpDoc.getSnapshot()).doc.name)()`), { timeout: 30_000 }).toBe(made.bill);
    const t0 = Date.now();
    await expect.poll(() => gaveUpLine(made.bill, t0), { timeout: 840_000, intervals: [5_000] }).not.toBeNull();
    report("gave-up", { afterMs: Date.now() - t0, line: /"detail":"([^"]+)"/.exec(gaveUpLine(made.bill, t0))[1] });
    await sleep(1500);
    // No field is left saying it is still loading (a field still pending says "Couldn't load — press
    // Refresh"; the PO numbers come from the bill's own lines, so those fields are filled).
    const loading = await inDoc(app, `[...document.querySelectorAll("input")].filter((i) => i.placeholder === ${JSON.stringify(LINKED_SOURCE_LOADING_PLACEHOLDER)}).length`);
    report("fields", { stillLoading: loading });
    expect(loading).toBe(0);

    await inDoc(app, `(() => { window.confirm = () => true; document.getElementById("btn-save").click(); return true; })()`);
    await sleep(1500);
    await inDoc(app, `(() => { const b = document.querySelector('[data-testid="bill-receive-bill-only"]'); if (b) b.click(); return true; })()`);
    await expect.poll(() => inDoc(app, `document.getElementById("status").textContent`), { timeout: 30_000 }).toMatch(/Refresh/);
    const status = await inDoc(app, `document.getElementById("status").textContent`);
    report("save", { status });
    expect(status).toMatch(/press Refresh/);
    expect(status).not.toMatch(/wait for/i);
  } finally {
    await erpUp(app).catch(() => {});
    if (!keepScene()) report("clear", await scene.clear(app));
    await app.close().catch(() => {});
  }
});
