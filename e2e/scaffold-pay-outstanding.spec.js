/**
 * Scaffold — OI-161 Doc Pay skin (Packet 4).
 * Unlike chrome/home/hist/erp, pay-outstanding.html is a standalone BrowserWindow, not a
 * WebContentsView — Playwright sees it as a real `window` event / Page, no execInView needed
 * once it's open. Getting there still goes through the real Home tile click (execInView "home").
 */
import { test, expect } from "@playwright/test";
import { launchShell, e2eCall, waitForE2eApi } from "./helpers.js";

test.describe("scaffold: pay outstanding", () => {
  /** @type {import('@playwright/test').ElectronApplication | undefined} */
  let app;

  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
    app = undefined;
  });

  test("Home tile opens a standalone window with vendor-grouped flow diagrams", async () => {
    test.setTimeout(90_000);
    try {
      app = await launchShell();
    } catch (err) {
      test.skip(true, `launch skip-OK: ${err?.message || err}`);
      return;
    }
    await waitForE2eApi(app);

    // getErpUrl is a function-valued __erpE2e key — must invoke via e2eCall, not e2eGet
    // (e2e/GOTCHAS.md #8: a function silently structured-clones to undefined through e2eGet).
    await expect
      .poll(async () => e2eCall(app, "getErpUrl"), { timeout: 30_000 })
      .toMatch(/\/(app|desk|login)\b/);

    // get-outstanding-bills needs a logged-in erp view (gotcha #5: login-vs-session is not
    // guaranteed). Log in with the local sandbox's own default (frappe_docker demo credential,
    // not a real secret) so this scaffold can actually exercise real data end to end; skip
    // gracefully rather than hard-fail if a different environment's password doesn't match.
    const erpUrl = await e2eCall(app, "getErpUrl");
    if (/\/login\b/.test(erpUrl)) {
      const pwd = process.env.E2E_ERP_PASSWORD || "admin";
      await e2eCall(
        app,
        "execInView",
        "erp",
        `fetch("/api/method/login", {
           method: "POST",
           headers: { "Content-Type": "application/x-www-form-urlencoded" },
           body: "usr=Administrator&pwd=" + encodeURIComponent(${JSON.stringify(pwd)}),
           credentials: "include",
         }).then((r) => r.json())`,
      );
      await e2eCall(app, "openErp", "/desk");
      const loggedIn = await expect
        .poll(async () => e2eCall(app, "getErpUrl"), { timeout: 15_000 })
        .toMatch(/\/desk\b/)
        .then(() => true)
        .catch(() => false);
      if (!loggedIn) {
        test.skip(true, "sandbox login skip-OK: E2E_ERP_PASSWORD doesn't match this environment");
        return;
      }
    }

    const winPromise = app.waitForEvent("window");
    await e2eCall(
      app,
      "execInView",
      "home",
      `document.querySelector('[data-testid="tile-pay-outstanding"]').click(); true`,
    );
    const payWin = await winPromise;
    await payWin.waitForLoadState("domcontentloaded");

    await expect(payWin.locator('[data-testid="pay-outstanding-title"]')).toHaveText("Pay Outstanding");

    // SUP-DAILY / SUP-DAILY-LG (Packet G) should always be present in the sandbox.
    await expect
      .poll(async () => payWin.locator('[data-testid="vendor-card"]').count(), { timeout: 20_000 })
      .toBeGreaterThan(0);

    const groupCount = await payWin.locator('[data-testid="group-node"]').count();
    expect(groupCount).toBeGreaterThan(0);

    // Expand one group's rationale (collapsed by default per OI-161 "suggestion only").
    const firstGroup = payWin.locator('[data-testid="group-node"]').first();
    const rationale = payWin.locator('[data-testid="group-rationale"]').first();
    await expect(rationale).toBeHidden();
    await firstGroup.click();
    await expect(rationale).toBeVisible();
    if (process.env.SCAFFOLD_SCREENSHOT) {
      await payWin.screenshot({ path: process.env.SCAFFOLD_SCREENSHOT, fullPage: true });
    }

    // The Sankey ribbon layer actually drew something.
    const ribbonCount = await payWin.locator("svg.flow-svg path").count();
    expect(ribbonCount).toBeGreaterThan(0);
  });
});
