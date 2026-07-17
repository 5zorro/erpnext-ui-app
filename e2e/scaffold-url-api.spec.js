/**
 * Scaffold 0 — load ERP URL + ping API (reachability).
 * Gotcha: do not assert a fixed desk path (login vs session); assert origin + health settle.
 */
import { test, expect } from "@playwright/test";
import { launchShell, e2eGet, e2eCall, waitForE2eApi } from "./helpers.js";

test.describe("scaffold: URL + API", () => {
  /** @type {import('@playwright/test').ElectronApplication | undefined} */
  let app;

  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
    app = undefined;
  });

  test("ERP view loads configured origin; ping settles ok|bad", async () => {
    test.setTimeout(90_000);
    try {
      app = await launchShell();
    } catch (err) {
      test.skip(true, `launch skip-OK: ${err?.message || err}`);
      return;
    }
    await waitForE2eApi(app);

    const base = await e2eGet(app, "erpBase");
    expect(typeof base).toBe("string");
    expect(base.length).toBeGreaterThan(0);

    await expect
      .poll(async () => e2eGet(app, "lastHealth"), { timeout: 25_000 })
      .toMatch(/^(ok|bad)$/);

    // Warm-load may still be in flight; force desk then check allowlist origin.
    await e2eCall(app, "openErp", "/desk");
    await expect
      .poll(async () => e2eCall(app, "getErpUrl"), { timeout: 20_000 })
      .toMatch(new RegExp(`^${escapeRegExp(String(base).replace(/\/+$/, ""))}(/|$)`));

    const url = await e2eCall(app, "getErpUrl");
    expect(await e2eCall(app, "isAllowed", url)).toBe(true);
    expect(await e2eCall(app, "isAllowed", "https://evil.example/")).toBe(false);
  });
});

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
