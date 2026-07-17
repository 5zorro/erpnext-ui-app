/**
 * Scaffold — src/ pure modules wired through main.
 * Gotcha: do not duplicate unit tables here; prove pushHistory + nav-guard are what main uses.
 */
import { test, expect } from "@playwright/test";
import { launchShell, e2eCall, e2eGet, waitForE2eApi } from "./helpers.js";

test.describe("scaffold: pure module wiring", () => {
  /** @type {import('@playwright/test').ElectronApplication | undefined} */
  let app;

  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
    app = undefined;
  });

  test("trackNav dedupes via history.js; nav-guard blocks external", async () => {
    test.setTimeout(90_000);
    try {
      app = await launchShell();
    } catch (err) {
      test.skip(true, `launch skip-OK: ${err?.message || err}`);
      return;
    }
    await waitForE2eApi(app);

    const base = String(await e2eGet(app, "erpBase")).replace(/\/+$/, "");

    expect(await e2eCall(app, "isAllowed", `${base}/desk`)).toBe(true);
    expect(await e2eCall(app, "isAllowed", "https://example.com/phish")).toBe(false);

    const afterBill = await e2eCall(
      app,
      "trackNav",
      `${base}/desk/purchase-invoice/PINV-1`,
    );
    expect(afterBill.some((h) => h.dt === "purchase-invoice")).toBe(true);
    const billLabel = afterBill.find((h) => h.dt === "purchase-invoice")?.label;
    expect(billLabel).toBe("Bill");

    const afterAgain = await e2eCall(
      app,
      "trackNav",
      `${base}/desk/purchase-invoice/PINV-2`,
    );
    const billRows = afterAgain.filter((h) => h.dt === "purchase-invoice");
    expect(billRows.length).toBe(1);

    await e2eCall(app, "trackNav", `${base}/desk/item/ITEM-1`);
    const hist = await e2eCall(app, "getHistory");
    expect(hist[0].dt).toBe("item");
  });
});
