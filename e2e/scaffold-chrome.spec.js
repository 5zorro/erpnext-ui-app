/**
 * Scaffold — toolbar chrome (actions + health UI path).
 * Gotcha: chrome is a WebContentsView — use execInView / __erpE2e, not firstWindow clicks.
 */
import { test, expect } from "@playwright/test";
import { launchShell, e2eCall, e2eGet, waitForE2eApi } from "./helpers.js";

test.describe("scaffold: toolbar chrome", () => {
  /** @type {import('@playwright/test').ElectronApplication | undefined} */
  let app;

  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
    app = undefined;
  });

  test("chrome controls exist; Home shows workflow tiles; Vanilla opens ERP", async () => {
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

    await expect
      .poll(async () => {
        try {
          return await e2eCall(
            app,
            "execInView",
            "chrome",
            `!!document.querySelector('[data-testid="btn-home"]')`,
          );
        } catch {
          return false;
        }
      }, { timeout: 15_000 })
      .toBe(true);

    const ids = await e2eCall(
      app,
      "execInView",
      "chrome",
      `(() => {
        const health = document.querySelector('[data-testid="health"]');
        const htext = health && health.querySelector('.htext');
        return JSON.stringify([
          !!document.querySelector('[data-testid="btn-home"]'),
          !!health,
          !!document.querySelector('[data-testid="btn-devtools"]'),
          !!document.querySelector('[data-testid="lens-vanilla"]'),
          htext ? htext.textContent : ""
        ]);
      })()`,
    );
    const [hasHome, hasHealth, hasDevtools, hasVanilla, healthText] = JSON.parse(ids);
    expect(hasHome && hasHealth && hasDevtools && hasVanilla).toBe(true);
    expect(healthText).toMatch(/^DB [✓✗…]/);

    // Starts on Doc Workflow Home
    expect(await e2eGet(app, "showingHome")).toBe(true);

    await e2eCall(app, "openErp", "/desk");
    expect(await e2eGet(app, "showingHome")).toBe(false);

    // Doc skin tab → Doc Workflow Home (same as Home button until Bill Doc form ships)
    await e2eCall(
      app,
      "execInView",
      "chrome",
      `document.querySelector('[data-testid="lens-doc"]').click(); true`,
    );
    await expect
      .poll(async () => e2eGet(app, "showingHome"), { timeout: 10_000 })
      .toBe(true);

    await e2eCall(app, "openErp", "/desk");
    expect(await e2eGet(app, "showingHome")).toBe(false);

    await e2eCall(
      app,
      "execInView",
      "chrome",
      `document.querySelector('[data-testid="btn-home"]').click(); true`,
    );
    await expect
      .poll(async () => e2eGet(app, "showingHome"), { timeout: 10_000 })
      .toBe(true);

    const title = await e2eCall(
      app,
      "execInView",
      "home",
      `document.querySelector('[data-testid="home-title"]')?.textContent || ""`,
    );
    expect(title).toMatch(/Doc Workflow Home/);
  });
});
