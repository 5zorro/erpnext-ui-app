/**
 * A Doc form's opening warms only the pick lists that form uses (plan 2026-10-25 closeout; 5zorro:
 * the warm pick lists should "not make unused requests"). Before, every Doc open loaded or checked
 * all eight copied lists (3b finding 4), whichever form it was.
 *
 * Opens a new Bill, then a new Item Receipt, as the AP clerk, and compares the lists the shell has
 * copied with the pickers each page has mounted (each picker's button is titled "Search <list>"):
 * every list copied must be one some opened page has a picker for, and each page's own lists (those
 * the clerk may read) are copied once it has opened.
 *
 * Makes no records.
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi, e2eCall } from "../../e2e/helpers.js";
import { inDoc, inErp, openNewDoc, report, docQuiet, sleep } from "./probe-helpers.js";
import { loginAsProbeUser, AP_CLERK } from "./probe-user.js";

const PICKER_LISTS = `[...new Set([...document.querySelectorAll(".link-btn")].map((b) => (b.title || "").replace(/^Search /, "")).filter(Boolean))].sort()`;

test("a Doc form's opening copies only the lists its pickers use", async () => {
  test.setTimeout(180_000);
  let app = null;
  let clerk = null;
  try {
    app = await launchShell();
    await waitForE2eApi(app);
    await expect.poll(() => inErp(app, `!!(window.frappe && frappe.xcall)`), { timeout: 30_000 }).toBe(true);
    clerk = await loginAsProbeUser(app, AP_CLERK.roles, { as: AP_CLERK.name });

    const used = new Set();
    // What each page's pickers use and the AP clerk may read (no Project; Account is never copied).
    const expected = {
      bill: ["Item", "Mode of Payment", "Payment Terms Template", "Supplier"],
      receipt: ["Item", "Supplier"],
    };
    for (const [skin, route] of [
      ["bill", "/app/purchase-invoice/new"],
      ["receipt", "/app/purchase-receipt/new"],
    ]) {
      await openNewDoc(app, skin, route);
      await docQuiet(app);
      // The warm runs 2 s after an opening (the ERPNext page settles first); time is the question.
      await sleep(4000);
      await docQuiet(app);
      const pickers = await inDoc(app, PICKER_LISTS, 4000);
      for (const p of pickers) used.add(p);
      const copied = (await e2eCall(app, "linkListsLoaded")).slice().sort();
      report(`${skin} opened`, { pickers, copied });
      expect.soft(copied, `the ${skin}'s own lists are copied`).toEqual(expect.arrayContaining(expected[skin]));
    }

    const copied = (await e2eCall(app, "linkListsLoaded")).slice().sort();
    const unused = copied.filter((dt) => !used.has(dt));
    report("copied without a picker", unused);
    expect(unused, "lists copied that no opened page has a picker for").toEqual([]);
  } finally {
    if (clerk) await clerk.retire().catch((e) => report("retire-failed", String(e)));
    if (app) await app.close().catch(() => {});
  }
});
