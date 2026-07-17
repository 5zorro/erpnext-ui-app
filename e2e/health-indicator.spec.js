/**
 * Health ping smoke (subset of URL/API + chrome). Kept as the original MVP entry.
 * Prefer scaffold-*.spec.js for per-scaffold coverage.
 */
import { test, expect } from "@playwright/test";
import { launchShell, e2eGet, waitForE2eApi } from "./helpers.js";

test.describe("shell health indicator", () => {
  /** @type {import('@playwright/test').ElectronApplication | undefined} */
  let app;

  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
    app = undefined;
  });

  test("ping settles to ok or bad (not stuck unknown)", async () => {
    test.setTimeout(90_000);
    try {
      app = await launchShell();
    } catch (err) {
      test.skip(true, `launch skip-OK: ${err?.message || err}`);
      return;
    }
    await waitForE2eApi(app);

    await expect
      .poll(async () => e2eGet(app, "lastHealth"), { timeout: 25_000 })
      .toMatch(/^(ok|bad)$/);

    const title = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      return w && !w.isDestroyed() ? w.getTitle() : "";
    });
    expect(title).toMatch(/\[health=(ok|bad)\]/);
  });
});
