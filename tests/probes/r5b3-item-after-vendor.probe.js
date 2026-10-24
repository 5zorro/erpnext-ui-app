/**
 * @dogfood R5b-6 / R5b-7
 * Review 10-19 R5b-3: an item typed within ~1 s of setting the vendor on a new PO lost its typing —
 * the half-typed text was written to the line and focus jumped to Qty. Question: is the item
 * typed whole, and is the clerk still on the line after the vendor settles? Two ways in: the vendor written straight (as the original probe did), and as a
 * clerk does it (type, Tab, Esc the source picker). Saves nothing.
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../e2e/helpers.js";
import { sleep, keys, inDoc, focusTestId, openNewDoc, report } from "./probe-helpers.js";

const ITEM = "SAMPLE-SKU-02";
const VENDOR = "SUMMIT TRADERS";
const cell = `document.querySelector('input[data-row="0"][data-field="item_code"]')`;
const line = (app) =>
  inDoc(
    app,
    `(async () => { const s = await window.erpDoc.getSnapshot(); const i = ${cell}; const a = document.activeElement; return { erp: ((s.doc.items || [])[0] || {}).item_code || "", box: i ? i.value : null, focus: a && a.dataset ? a.dataset.field || a.tagName : "" }; })()`,
    15_000,
  );
const typeItem = async (app) => {
  await inDoc(app, `(() => { const i = ${cell}; i.focus(); i.select(); return true; })()`);
  await keys(app, ITEM);
  await sleep(1200);
  await keys(app, "\t");
};

for (const way of ["written", "clerk"]) {
  test(`item typed right after the vendor is set (${way})`, async () => {
    const app = await launchShell();
    try {
      await waitForE2eApi(app);
      await openNewDoc(app, "po", "/app/purchase-order/new");
      await sleep(3000);
      if (way === "written") {
        await inDoc(app, `(() => { window.erpDoc.setHeader("supplier", ${JSON.stringify(VENDOR)}); return true; })()`);
        await sleep(300);
      } else {
        await focusTestId(app, "doc-supplier");
        await keys(app, `${VENDOR}\t`);
        await sleep(2500);
        await keys(app, "\x1b"); // the source picker opens on a vendor pick; close it
        await sleep(200);
      }
      await typeItem(app);
      await sleep(15_000); // the vendor settle and its repaint
      const seen = await line(app);
      report(`r5b3-${way}`, seen);
      expect(seen.erp).toBe(ITEM);
      expect(seen.box).toBe(ITEM);
      // The clerk is still on the line: a late vendor repaint must not drop focus to the page
      // (review 2026-10-22: a pick's duplicate blur write did, 9 s on).
      expect(seen.focus).toBe("description");
    } finally {
      await app.close().catch(() => {});
    }
  });
}
