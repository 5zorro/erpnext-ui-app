/**
 * @dogfood D2
 * Plan 2026-10-21 D2 (HANDOFF § Warm pick lists), the Bill side: a vendor that does not exist,
 * typed and then left by clicking into another box and typing there. Question: banner, the box
 * back to the bill's vendor, nothing written, no source picker? Makes no records.
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../e2e/helpers.js";
import { sleep, keys, focusTestId, openNewDoc, docState, report } from "./probe-helpers.js";

test("Bill: a made-up vendor gets the banner, never its sources", async () => {
  const app = await launchShell();
  try {
    await waitForE2eApi(app);
    await openNewDoc(app, "bill", "/app/purchase-invoice/new");
    await sleep(3000);
    await focusTestId(app, "bill-vendor");
    await keys(app, "ZZ NEVER EXISTED");
    await sleep(1500);
    await focusTestId(app, "bill-ref");
    await sleep(300);
    await keys(app, "123");
    await sleep(15_000);
    const seen = await docState(app);
    report("d2-bill", seen);
    expect(seen.banner || "").toMatch(/not in ERPNext.*the bill keeps its old one/);
    expect(seen.sourceModal).toBe(false);
    expect(seen.erpSupplier).toBe("");
  } finally {
    await app.close().catch(() => {});
  }
});
