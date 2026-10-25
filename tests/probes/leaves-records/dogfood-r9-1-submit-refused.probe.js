/**
 * @dogfood R9-1
 * Plan 10-19 dogfood row R9-1: the batch method change where ERPNext takes a bill's cancel and
 * saves its amended copy, but refuses the copy's submit (the bill's expense account was disabled
 * after it was submitted — `validate_disabled_accounts` runs only when ledger entries are made).
 * Questions: does that bill's chip say "Cancelled — <name>-1 not submitted", is the copy a draft
 * in ERPNext, does the outcome give ERPNext's reason, and does the batch stop before bill 3?
 *
 * 🔴 LEAVES RECORDS (run with --leaves-records, sandbox only): scene `batch-submit-refused`
 * (tests/probes/dogfood-scenes.js) — per run 3 bills for `ZZ DF BATCH SUBMIT` and an amended copy,
 * cancelled (or the draft deleted) after; the account `ZZ DF Expense` (re-enabled) and the item
 * `ZZ-DF-SERVICE` stay. `DOGFOOD_KEEP=1` leaves the scene as it ended.
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../../e2e/helpers.js";
import { sleep, inBoard, openBoard, openNewDoc, assertSandboxSite, keepScene, report } from "../probe-helpers.js";
import { SCENES, inPage } from "../dogfood-scenes.js";
import { cardOf, applyMethod, panelState } from "../method-panel-helpers.js";

const scene = SCENES["batch-submit-refused"];
const V = "ZZ DF BATCH SUBMIT";

test("R9-1: a refused submit leaves the amended copy as a draft, and the chip says so", async () => {
  const app = await launchShell();
  try {
    await waitForE2eApi(app);
    await openNewDoc(app, "bill", "/app/purchase-invoice/new");
    await sleep(1500);
    report("site", { companies: await assertSandboxSite(app) });
    const made = await scene.make(app);
    report("scene", made);
    expect(made && made.error).toBeFalsy();

    await openBoard(app);
    await expect.poll(() => inBoard(app, `!!(${cardOf(V)})`), { timeout: 20_000 }).toBe(true);
    expect(await applyMethod(app, V, "ACH")).toBe(true);
    await expect.poll(async () => (await panelState(app, V)).done, { timeout: 120_000 }).toBe(true);
    const seen = await panelState(app, V);
    report("panel", seen);
    const [b1, b2, b3] = made.bills;
    expect(seen.chips[b1]).toMatch(/^✓ → /);
    expect(seen.chips[b2]).toBe(`Cancelled — ${b2}-1 not submitted`);
    expect(seen.chips[b3]).toBe("Not attempted");
    expect(seen.outcome.join("\n")).toMatch(/disabled/i);

    const copy = await inPage(app, async (n) => frappe.xcall("frappe.client.get_list", { doctype: "Purchase Invoice", filters: { name: n }, fields: ["name", "docstatus", "amended_from"] }), `${b2}-1`);
    report("copy", copy);
    expect(copy).toEqual([{ name: `${b2}-1`, docstatus: 0, amended_from: b2 }]);
  } finally {
    if (!keepScene()) report("clear", await scene.clear(app));
    await app.close().catch(() => {});
  }
});
