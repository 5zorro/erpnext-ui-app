/**
 * @dogfood D1
 * Plan 10-19 dogfood row D1 (warm lists' D1): a vendor dropdown open on a new Bill, then Vanilla
 * (Default-skin) and back to the Document skin. Question: is the dropdown closed on return? Makes
 * no records.
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi, e2eCall, e2eGet } from "../../e2e/helpers.js";
import { sleep, keys, focusTestId, inDoc, openNewDoc, report } from "./probe-helpers.js";

const openDropdowns = (app) => inDoc(app, `[...document.querySelectorAll(".link-dd")].filter((d) => !d.hidden).length`);
const lens = (app, which) => e2eCall(app, "execInView", "chrome", `document.querySelector('[data-testid="lens-${which}"]').click(); true`);

test("D1: a dropdown left open is closed when you come back from Vanilla", async () => {
  const app = await launchShell();
  try {
    await waitForE2eApi(app);
    await openNewDoc(app, "bill", "/app/purchase-invoice/new");
    await sleep(3000);
    await focusTestId(app, "bill-vendor");
    await keys(app, "A");
    await expect.poll(() => openDropdowns(app), { timeout: 10_000 }).toBe(1);
    report("before", { open: await openDropdowns(app) });
    await lens(app, "vanilla");
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 15_000 }).not.toBe("doc");
    await sleep(1500);
    await lens(app, "doc");
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 15_000 }).toBe("doc");
    await sleep(1500);
    const after = await openDropdowns(app);
    report("after", { open: after });
    expect(after).toBe(0);
  } finally {
    await app.close().catch(() => {});
  }
});
