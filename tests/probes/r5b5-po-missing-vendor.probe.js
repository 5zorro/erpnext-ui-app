/**
 * @dogfood R5b-5
 * Review 10-19 R5b-5 (5zorro's dogfood 2026-10-22): on a new PO, `TEST` typed, *Create Vendor…*
 * taken, Esc, then on into the dates — 10 s later the source picker opened for a vendor that does
 * not exist. Question: banner instead, and no source picker then or later? Makes no records
 * (a vendor it might have made is `ZZ…` and deleted in `finally`).
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../e2e/helpers.js";
import { sleep, keys, escPeek, focusTestId, openNewDoc, docState, deleteZzSuppliers, report } from "./probe-helpers.js";

test("a vendor that does not exist gets the banner, never its sources", async () => {
  const app = await launchShell();
  try {
    await waitForE2eApi(app);
    await openNewDoc(app, "po", "/app/purchase-order/new");
    await sleep(3000);
    await focusTestId(app, "doc-supplier");
    await keys(app, "ZZ NO SUCH VENDOR");
    await sleep(1500);
    await keys(app, "\t"); // takes Create Vendor… (the only option)
    await sleep(4000);
    await escPeek(app); // back from the peek without saving; the box is back to no vendor
    await expect.poll(async () => (await docState(app)).snapOk, { timeout: 30_000 }).toBe(true);
    const back = await docState(app);
    // "I did it again": the name typed once more, then a click into the date (Tab here would take
    // Create Vendor… again) and typing there. Leaving the box writes the made-up name.
    await focusTestId(app, "doc-supplier");
    await keys(app, "ZZ NO SUCH VENDOR");
    await sleep(1500);
    await focusTestId(app, "doc-transaction_date");
    await sleep(500);
    await keys(app, "10222026");
    await sleep(15_000); // longer than a vendor settle (~12 s)
    const seen = { back, after: await docState(app) };
    report("r5b5", seen);
    expect(seen.after.sourceModal).toBe(false);
    expect(seen.after.banner || "").toMatch(/not in ERPNext/);
    expect(seen.after.erpSupplier).toBe("");
  } finally {
    report("r5b5-cleanup", { zzSuppliers: await deleteZzSuppliers(app).catch(() => "ERR") });
    await app.close().catch(() => {});
  }
});
