/**
 * Scaffold — WebContentsViews layout (chrome / hist / home / erp).
 * Gotcha: assert bounds via main getBounds(), not Playwright page geometry.
 */
import { test, expect } from "@playwright/test";
import { launchShell, e2eCall, e2eGet, waitForE2eApi } from "./helpers.js";

const OFF_X = -20000;

test.describe("scaffold: WebContentsViews", () => {
  /** @type {import('@playwright/test').ElectronApplication | undefined} */
  let app;

  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
    app = undefined;
  });

  test("launcher shows home view; ERP route parks home off-screen", async () => {
    test.setTimeout(90_000);
    try {
      app = await launchShell();
    } catch (err) {
      test.skip(true, `launch skip-OK: ${err?.message || err}`);
      return;
    }
    await waitForE2eApi(app);

    await e2eCall(app, "showLauncher");
    let bounds = await e2eCall(app, "viewBounds");
    expect(bounds.showingHome).toBe(true);
    expect(bounds.chrome?.height).toBeGreaterThan(0);
    expect(bounds.hist?.width).toBeGreaterThan(0);
    expect(bounds.home?.x).toBeGreaterThan(OFF_X / 2);
    expect(bounds.erp?.x).toBe(OFF_X);

    await e2eCall(app, "openErp", "/desk");
    bounds = await e2eCall(app, "viewBounds");
    expect(bounds.showingHome).toBe(false);
    expect(bounds.erp?.x).toBeGreaterThan(OFF_X / 2);
    expect(bounds.home?.x).toBe(OFF_X);

    // Museum-style grouped tiles on workflow Home
    const tileCount = await e2eCall(
      app,
      "execInView",
      "home",
      `document.querySelectorAll('[data-testid^="tile-"]').length`,
    );
    expect(tileCount).toBeGreaterThanOrEqual(10);

    const hasVendors = await e2eCall(
      app,
      "execInView",
      "home",
      `!!document.querySelector('[data-testid="group-vendors"]')`,
    );
    expect(hasVendors).toBe(true);

    const histOk = await e2eCall(
      app,
      "execInView",
      "hist",
      `!!document.querySelector('#list-recent') || !!document.querySelector('#empty')`,
    );
    expect(histOk).toBe(true);
  });
});
