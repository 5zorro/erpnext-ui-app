/**
 * Plan 10-19 R10a-1 / R10b-1: Pay Outstanding's bill loader — the A/P report by payment term plus
 * one Payment Schedule query. Question: does every open bill's total on the board equal ERPNext's
 * own `outstanding_amount`, and how long does a load take? Read-only: makes nothing.
 * (A submitted test bill cannot be deleted after cancelling — its ledger entries link to it — so
 * the part-paid case is pinned by tests/outstanding-bills.test.js, not made here.)
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../e2e/helpers.js";
import { sleep, inErp, openNewDoc, report } from "./probe-helpers.js";

test("the board's bills add up to what ERPNext says each invoice owes", async () => {
  const app = await launchShell();
  try {
    await waitForE2eApi(app);
    await openNewDoc(app, "bill", "/app/purchase-invoice/new"); // the ERPNext page is logged in and ready
    await sleep(1500);
    const t0 = Date.now();
    const res = await app.evaluate(async ({ ipcMain }) => ipcMain._invokeHandlers.get("get-outstanding-bills")({}));
    const ms = Date.now() - t0;
    const erp = await inErp(
      app,
      `(async () => (await frappe.xcall("frappe.client.get_list", { doctype: "Purchase Invoice", filters: [["docstatus", "=", 1], ["outstanding_amount", "!=", 0]], fields: ["name", "outstanding_amount"], limit_page_length: 0 })))()`,
      20_000,
    );
    const board = {};
    for (const b of res.bills || []) if (b.outstanding > 0) board[b.invoice] = Math.round(((board[b.invoice] || 0) + b.outstanding) * 100) / 100;
    const want = {};
    for (const r of Array.isArray(erp) ? erp : []) if (r.outstanding_amount > 0) want[r.name] = r.outstanding_amount;
    report("board", { ok: res.ok, reason: res.reason, ms, rows: (res.bills || []).length, board, erp: want });
    expect(res.ok).toBe(true);
    expect(board).toEqual(want);
  } finally {
    await app.close().catch(() => {});
  }
});
