/**
 * Plan 10-19 R10b-2 (G13): one vendor card that throws while drawing. Question: does the rest of
 * the board still draw, with a note where that card would be? A made-up vendor's bill (`ZZ CARD
 * BREAKS`, 777.77, never in ERPNext) is added to what the loader returns, and the page's money
 * formatting is made to throw on 777.77 only. Makes nothing in ERPNext.
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi, e2eCall, e2eGet } from "../../e2e/helpers.js";
import { sleep, openNewDoc, report } from "./probe-helpers.js";

const inBoard = (app, js) => e2eCall(app, "execInView", "payOutstanding", js);

test("a vendor card that throws leaves the other vendors on the board", async () => {
  const app = await launchShell();
  try {
    await waitForE2eApi(app);
    await openNewDoc(app, "bill", "/app/purchase-invoice/new"); // the ERPNext page is logged in and ready
    await app.evaluate(({ ipcMain }) => {
      const h = ipcMain._invokeHandlers;
      const orig = h.get("get-outstanding-bills");
      h.set("get-outstanding-bills", async (...a) => {
        const res = await orig(...a);
        const fake = { invoice: "ZZ-FAKE-1", installmentKey: "ZZ-FAKE-1", supplier: "ZZ CARD BREAKS", billNo: "", postingDate: "2026-01-01", dueDate: "2026-01-02", invoiced: 777.77, outstanding: 777.77, currency: "USD" };
        return { ...res, bills: [fake, ...(res.bills || [])] };
      });
    });
    await e2eCall(app, "execInView", "home", `document.querySelector('[data-testid="tile-pay-bills"]').click(); true`);
    await sleep(3000);
    if ((await e2eGet(app, "surfaceMode")) !== "pay-outstanding") {
      await e2eCall(app, "execInView", "chrome", `document.querySelector('[data-testid="lens-doc"]').click(); true`);
    }
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 15_000 }).toBe("pay-outstanding");
    await expect
      .poll(async () => inBoard(app, `document.querySelectorAll('[data-testid="vendor-card"]').length`), { timeout: 30_000 })
      .toBeGreaterThan(0);
    // Every ribbon and brace as drawn, so a geometry change (R10b-3's move to src/) shows as a diff.
    const paths = await inBoard(app, `[...document.querySelectorAll(".flow-svg path")].map((p) => p.getAttribute("d") + "|" + p.getAttribute("stroke-width")).join("\\n")`);
    report("ribbons", { count: paths ? paths.split("\n").length : 0, text: paths });
    // Break the money formatting for 777.77 only, then redraw (the filter box redraws the board).
    await inBoard(
      app,
      `(() => {
        const d = Object.getOwnPropertyDescriptor(Intl.NumberFormat.prototype, "format");
        Object.defineProperty(Intl.NumberFormat.prototype, "format", { configurable: true, get() {
          const f = d.get.call(this);
          return (n) => { if (Math.abs(Number(n)) === 777.77) throw new Error("probe: this card breaks"); return f(n); };
        } });
        const i = document.querySelector('[data-testid="filter-input"]');
        i.value = ""; i.dispatchEvent(new Event("input"));
        return true;
      })()`,
    );
    await sleep(1000);
    const seen = await inBoard(
      app,
      `({ cards: document.querySelectorAll('[data-testid="vendor-card"]').length,
          failed: [...document.querySelectorAll('[data-testid="vendor-card-failed"]')].map((e) => e.textContent),
          loadError: (() => { const e = document.getElementById("load-error"); return e && !e.hidden ? e.textContent : null; })() })`,
    );
    report("board", seen);
    // On b7adae0 the throw escaped render(): no card after it drew, and nothing said why.
    expect(seen.failed.length).toBe(1);
    expect(seen.failed[0]).toMatch(/ZZ CARD BREAKS: this vendor's card could not be drawn \(probe: this card breaks\)/);
    expect(seen.cards).toBeGreaterThan(0);
  } finally {
    await app.close().catch(() => {});
  }
});
