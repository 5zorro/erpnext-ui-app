/**
 * @dogfood R10a-3
 * Plan 10-19 dogfood row R10a-3: Pay Outstanding's next check run set to 2026-12-25 (Christmas, a
 * Friday), every 14 days. Question: does the run strip add "That day is a weekend or bank holiday —
 * “Do this run today” runs it before."? And not for 2026-12-24, an ordinary Thursday. The prefs
 * file is restored by the probe runner; makes no records.
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../e2e/helpers.js";
import { sleep, inBoard, openBoard, openNewDoc, report } from "./probe-helpers.js";

const setRun = (app, date) =>
  inBoard(
    app,
    `(() => { const v = (id, val) => { const e = document.getElementById(id); e.value = val; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); };
      v("pref-run-interval", "14"); v("pref-next-run", ${JSON.stringify(date)}); return true; })()`,
  );
const said = (app) => inBoard(app, `({ strip: document.getElementById("run-strip").hidden ? null : document.getElementById("run-strip-status").textContent, prefs: document.getElementById("pref-run-status").textContent })`);

test("R10a-3: a check run on a bank holiday says so", async () => {
  const app = await launchShell();
  try {
    await waitForE2eApi(app);
    await openNewDoc(app, "bill", "/app/purchase-invoice/new"); // the ERPNext page is logged in and ready
    await openBoard(app, { cards: false });
    await sleep(2000);
    await setRun(app, "2026-12-25");
    await expect.poll(async () => (await said(app)).prefs, { timeout: 10_000 }).toMatch(/2026|Dec/);
    const holiday = await said(app);
    report("2026-12-25", holiday);
    expect(holiday.prefs).toMatch(/That day is a weekend or bank holiday — “Do this run today” runs it before\.$/);
    await setRun(app, "2026-12-24");
    await sleep(500);
    const thursday = await said(app);
    report("2026-12-24", thursday);
    expect(thursday.prefs).not.toMatch(/weekend or bank holiday/);
  } finally {
    await app.close().catch(() => {});
  }
});
