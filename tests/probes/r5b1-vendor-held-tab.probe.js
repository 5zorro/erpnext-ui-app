/**
 * @dogfood R5b-1; R5b-6 / R5b-7
 * Review 10-19 R5b-1 for vendors (5zorro 2026-10-22: "it shouldn't [go to Create Vendor] if there is
 * a vendor match"). A few letters of a real vendor and Tab before the list is in — the first
 * thing in the day, before the warm list: the search is slowed so the Tab is always held.
 * Question: is the vendor picked, never Create Vendor…? Then a name that matches nothing, for
 * contrast. Saves nothing.
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../e2e/helpers.js";
import { sleep, keys, escPeek, focusTestId, openNewDoc, docState, report } from "./probe-helpers.js";

/** Every Supplier search answers 1.5 s late (copy or live — the wrap is around the IPC handler). */
const slowVendorSearch = (app) =>
  app.evaluate(({ ipcMain }) => {
    const h = ipcMain._invokeHandlers;
    const orig = h.get("doc-search-link");
    h.set("doc-search-link", async (ev, doctype, ...rest) => {
      if (doctype === "Supplier") await new Promise((r) => setTimeout(r, 1500));
      return orig(ev, doctype, ...rest);
    });
  });
const views = (app) =>
  app.evaluate(({ webContents }) => webContents.getAllWebContents().map((w) => w.getURL()).filter((u) => /supplier\/new/.test(u)).length);

test("held Tab on a vendor match picks the vendor, not Create Vendor…", async () => {
  const app = await launchShell();
  try {
    await waitForE2eApi(app);
    await openNewDoc(app, "po", "/app/purchase-order/new");
    await sleep(3000);
    await slowVendorSearch(app);
    await focusTestId(app, "doc-supplier");
    await keys(app, "SUMM\t");
    await sleep(6000);
    const match = { ...(await docState(app)), createPeek: await views(app) };
    await keys(app, "\x1b"); // the PO opens its source picker on a vendor pick
    await sleep(500);
    await focusTestId(app, "doc-supplier");
    await keys(app, "ZZQX\t");
    await sleep(6000);
    const none = { ...(await docState(app)), createPeek: await views(app) };
    await escPeek(app);
    report("r5b1-vendor", { match, none });
    expect(match.erpSupplier).toBe("SUMMIT TRADERS");
    expect(match.createPeek).toBe(0);
    expect(none.createPeek).toBeGreaterThan(0);
  } finally {
    await app.close().catch(() => {});
  }
});
