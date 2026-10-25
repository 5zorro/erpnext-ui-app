/**
 * Review 10-19 R5b-4: on a new PO, an unknown vendor typed and Tabbed at once (before its list
 * opens) left every later call into the ERPNext page waiting until a reload ("35 pending").
 * Question: does the ERPNext page still answer afterwards? Makes no records.
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../e2e/helpers.js";
import { sleep, keys, escPeek, focusTestId, openNewDoc, erpAnswers, docState, report } from "./probe-helpers.js";

test("unknown vendor + fast Tab leaves the ERPNext page answering", async () => {
  const app = await launchShell();
  try {
    await waitForE2eApi(app);
    await openNewDoc(app, "po", "/app/purchase-order/new");
    await sleep(3000); // warm lists in
    await focusTestId(app, "doc-supplier");
    await keys(app, "ZZNOPE\t");
    await sleep(6000);
    const afterTab = await docState(app);
    await escPeek(app); // close the Create Vendor… peek the Tab opens
    await keys(app, "\x1b"); // and any dropdown
    await sleep(3000);
    const seen = { afterTab, erpAnswers: await erpAnswers(app), after: await docState(app) };
    report("r5b4", seen);
    expect(seen.erpAnswers).toBe(true);
    expect(seen.after.snapOk).toBe(true);
  } finally {
    await app.close().catch(() => {});
  }
});
