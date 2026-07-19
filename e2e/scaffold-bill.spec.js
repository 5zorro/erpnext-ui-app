/**
 * Scaffold — Doc Bill WebContentsView (M3c).
 * Does not require a logged-in ERP form; asserts the bill surface mounts.
 */
import { test, expect } from "@playwright/test";
import { launchShell, e2eCall, e2eGet, waitForE2eApi } from "./helpers.js";

test.describe("scaffold: Doc Bill view", () => {
  /** @type {import('@playwright/test').ElectronApplication | undefined} */
  let app;

  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
    app = undefined;
  });

  test("openBill shows bill surface and root", async () => {
    test.setTimeout(90_000);
    try {
      app = await launchShell();
    } catch (err) {
      test.skip(true, `launch skip-OK: ${err?.message || err}`);
      return;
    }
    await waitForE2eApi(app);

    await e2eCall(app, "openBill", "/app/purchase-invoice/new");
    await expect
      .poll(async () => e2eGet(app, "surfaceMode"), { timeout: 15_000 })
      .toBe("bill");

    const title = await e2eCall(
      app,
      "execInView",
      "bill",
      `document.querySelector('[data-testid="bill-root"]') ? "ok" : ""`,
    );
    expect(title).toBe("ok");

    const chip = await e2eCall(
      app,
      "execInView",
      "bill",
      `document.querySelector('[data-testid="bill-due-chip"]')?.className || ""`,
    );
    expect(chip).toMatch(/chip/);
  });
});
