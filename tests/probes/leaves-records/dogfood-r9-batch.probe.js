/**
 * @dogfood R9
 * Plan 10-19 dogfood row R9 (the batch method change): a vendor with 4 open bills, all changed from
 * Check to ACH through the board's Method… panel, where ERPNext refuses to cancel the 3rd (its
 * Purchase Order is On Hold). Questions: do the chips move bill by bill; does the batch stop at the
 * 3rd and leave the 4th untouched; does Try again offer the remaining 2 and, once the order is
 * resumed, finish them; does the board then show the vendor's bills on ACH?
 *
 * 🔴 LEAVES RECORDS (run with --leaves-records, sandbox only): scene `batch-cancel-refused`
 * (tests/probes/dogfood-scenes.js) — per run 4 bills and a Purchase Order for vendor `ZZ DF BATCH`,
 * and the bills' amendments; all cancelled after (they stay, cancelled). The vendor and the board's
 * payment methods stay. `DOGFOOD_KEEP=1` leaves the scene as it ended.
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../../e2e/helpers.js";
import { sleep, inBoard, openBoard, openNewDoc, assertSandboxSite, keepScene, report } from "../probe-helpers.js";
import { SCENES, inPage } from "../dogfood-scenes.js";

const scene = SCENES["batch-cancel-refused"];
const card = `[...document.querySelectorAll('[data-testid="vendor-card"]')].find((c) => c.textContent.includes("ZZ DF BATCH"))`;
const panelState = (app) =>
  inBoard(
    app,
    `(() => { const c = ${card}; if (!c) return null; const p = c.querySelector('[data-testid="method-panel"]');
      return { open: !p.hidden, status: p.querySelector('[data-testid="method-panel-status"]').textContent,
        chips: [...p.querySelectorAll('[data-testid="method-panel-row"]')].map((r) => [r.querySelector("strong").textContent, r.querySelector('[data-testid="method-panel-chip"]').textContent]),
        retry: (() => { const b = p.querySelector('[data-testid="method-panel-retry"]'); return b.hidden || b.closest("[hidden]") ? null : b.textContent; })(),
        outcome: [...p.querySelectorAll('[data-testid="method-panel-outcome"] li')].map((l) => l.textContent) }; })()`,
  );

test("R9: a batch method change stops at a refused cancel and finishes on Try again", async () => {
  const app = await launchShell();
  let made = null;
  try {
    await waitForE2eApi(app);
    await openNewDoc(app, "bill", "/app/purchase-invoice/new"); // the ERPNext page is logged in and ready
    await sleep(1500);
    report("site", { companies: await assertSandboxSite(app) });
    made = await scene.make(app);
    report("scene", made);
    expect(made && made.error).toBeFalsy();

    await openBoard(app);
    await expect.poll(() => inBoard(app, `!!(${card})`), { timeout: 20_000 }).toBe(true);
    // window.confirm is the panel's "are you sure": answer yes.
    await inBoard(app, `(() => { window.confirm = () => true; const c = ${card}; c.querySelector('[data-testid="vendor-change-method"]').click();
      const p = c.querySelector('[data-testid="method-panel"]'); p.querySelector('[data-testid="method-panel-mode"]').value = "ACH";
      p.querySelector('[data-testid="method-panel-apply"]').click(); return true; })()`);
    await expect.poll(async () => (await panelState(app)).retry, { timeout: 120_000 }).toBeTruthy();
    const stopped = await panelState(app);
    report("stopped", stopped);
    const chip = Object.fromEntries(stopped.chips);
    const [b1, b2, b3, b4] = made.bills;
    expect(chip[b1]).toMatch(/^✓ → /);
    expect(chip[b2]).toMatch(/^✓ → /);
    expect(chip[b3]).toBe("Not changed");
    expect(chip[b4]).toBe("Not attempted");
    expect(stopped.outcome.join("\n")).toMatch(/On Hold/);
    expect(stopped.retry).toBe("Try again on the remaining 2");

    // Resume the order, then Try again: both finish and the board is read again.
    const resumed = await inPage(app, async (po) => frappe.xcall("erpnext.buying.doctype.purchase_order.purchase_order.update_status", { status: "Draft", name: po }), made.heldPo);
    report("resumed", resumed ?? "ok");
    await inBoard(app, `(() => { const c = ${card}; c.querySelector('[data-testid="method-panel-retry"]').click(); return true; })()`);
    const onAch = (app) =>
      inPage(app, async (v) => frappe.xcall("frappe.client.get_list", { doctype: "Purchase Invoice", filters: { supplier: v, docstatus: 1 }, fields: ["name", "mode_of_payment", "amended_from"], limit_page_length: 0 }), "ZZ DF BATCH");
    await expect.poll(async () => (await onAch(app)).filter((b) => b.mode_of_payment === "ACH").length, { timeout: 120_000 }).toBe(4);
    const after = await onAch(app);
    report("erpnext-after", after);
    // Every bill went through the board once more: the panel is gone and the card shows 4 bills.
    await sleep(3000);
    const board = await inBoard(app, `(() => { const c = ${card}; return c ? { panel: !!c.querySelector('[data-testid="method-panel"]:not([hidden])'), text: c.textContent.slice(0, 300) } : null; })()`);
    report("board-after", board);
    expect(board && board.panel).toBe(false);
    expect(after.length).toBe(4);
    expect(after.every((b) => b.mode_of_payment === "ACH" && b.amended_from)).toBe(true);
  } finally {
    if (!keepScene()) report("clear", await scene.clear(app));
    await app.close().catch(() => {});
  }
});
