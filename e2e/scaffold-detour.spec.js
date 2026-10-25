/**
 * Doors rule, door 4 (plan 2026-09-26 "Doors: peek or navigate", 5zorro 2026-10-02): from the
 * payment board, open the bill a payment pays, then come back to the board exactly as it was —
 * a half-written check included. Against the live sandbox; never saves.
 */
import { test, expect } from "@playwright/test";
import { launchShell, e2eCall, e2eGet, waitForE2eApi } from "./helpers.js";

/** @param {import('@playwright/test').ElectronApplication} app @param {string} view @param {string} js */
const inView = (app, view, js) => e2eCall(app, "execInView", view, js);

/** Any submitted bill — the detour does not care whether it is still outstanding. */
async function anyBill(app) {
  return inView(
    app,
    "erp",
    `(async () => {
      const r = await frappe.db.get_list("Purchase Invoice", { fields: ["name"], filters: { docstatus: 1 }, limit: 1 });
      return r[0] ? r[0].name : "";
    })()`,
  );
}

test.describe("scaffold: detour from the payment board (doors rule, door 4)", () => {
  /** @type {import('@playwright/test').ElectronApplication | undefined} */
  let app;
  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
    app = undefined;
  });

  test("board → bill in the usual lens → ← Back / Esc → the board as it was left", async () => {
    test.setTimeout(150_000);
    app = await launchShell();
    await waitForE2eApi(app);
    await expect.poll(async () => e2eCall(app, "getErpUrl"), { timeout: 30_000 }).toMatch(/\/(app|desk)\b/);
    const bill = await anyBill(app).catch(() => "");
    test.skip(!bill, "sandbox has no submitted bill");

    await inView(app, "home", `document.querySelector('[data-testid="tile-pay-bills"]').click(); true`);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 15_000 }).toBe("pay-outstanding");
    // Something only this page load has: a marker, and the blank-check drawer left open.
    await inView(app, "payOutstanding", `window.__detourMarker = 42; document.getElementById("drawer-tab").click(); true`);
    await expect
      .poll(async () => inView(app, "payOutstanding", `!document.getElementById("check-drawer").hidden`), { timeout: 5_000 })
      .toBe(true);

    // Leg 1: open the bill, come back with Esc.
    await inView(app, "payOutstanding", `window.erpPayOutstanding.openDetour("/app/purchase-invoice/${encodeURIComponent(bill)}"); true`);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).not.toBe("pay-outstanding");
    await expect
      .poll(async () => inView(app, "chrome", `(() => { const b = document.getElementById("btn-detour-back"); return b && !b.hidden ? b.textContent : ""; })()`), { timeout: 10_000 })
      .toBe("← Back to Pay Outstanding");

    const surface = await e2eGet(app, "surfaceMode");
    if (surface === "doc") {
      await new Promise((r) => setTimeout(r, 2500));
      await inView(app, "docForm", `document.activeElement && document.activeElement.blur(); window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); true`);
    } else {
      await inView(app, "erp", `window.erpUiShell.softPeekEsc(); true`);
    }
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 15_000 }).toBe("pay-outstanding");
    expect(await inView(app, "payOutstanding", `window.__detourMarker`)).toBe(42);
    expect(await inView(app, "payOutstanding", `!document.getElementById("check-drawer").hidden`)).toBe(true);
    expect(await inView(app, "chrome", `document.getElementById("btn-detour-back").hidden`)).toBe(true);

    // Leg 2: same again, back with the toolbar button.
    await inView(app, "payOutstanding", `window.erpPayOutstanding.openDetour("/app/purchase-invoice/${encodeURIComponent(bill)}"); true`);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).not.toBe("pay-outstanding");
    await expect
      .poll(async () => inView(app, "chrome", `!document.getElementById("btn-detour-back").hidden`), { timeout: 10_000 })
      .toBe(true);
    await inView(app, "chrome", `document.getElementById("btn-detour-back").click(); true`);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 15_000 }).toBe("pay-outstanding");
    expect(await inView(app, "payOutstanding", `window.__detourMarker`)).toBe(42);
  });

  test("Home ends a detour — the back control does not linger on other work", async () => {
    test.setTimeout(120_000);
    app = await launchShell();
    await waitForE2eApi(app);
    await expect.poll(async () => e2eCall(app, "getErpUrl"), { timeout: 30_000 }).toMatch(/\/(app|desk)\b/);
    const bill = await anyBill(app).catch(() => "");
    test.skip(!bill, "sandbox has no submitted bill");

    await inView(app, "home", `document.querySelector('[data-testid="tile-pay-bills"]').click(); true`);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 15_000 }).toBe("pay-outstanding");
    await inView(app, "payOutstanding", `window.erpPayOutstanding.openDetour("/app/purchase-invoice/${encodeURIComponent(bill)}"); true`);
    await expect
      .poll(async () => inView(app, "chrome", `!document.getElementById("btn-detour-back").hidden`), { timeout: 15_000 })
      .toBe(true);
    await inView(app, "chrome", `document.getElementById("btn-home").click(); true`);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 15_000 }).toBe("home");
    expect(await inView(app, "chrome", `document.getElementById("btn-detour-back").hidden`)).toBe(true);
  });
});
