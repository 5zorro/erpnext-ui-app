/**
 * @dogfood R4-2
 * Plan 10-19 dogfood row R4-2: Find Purchase Orders with more than 200 rows; ERPNext stops answering
 * (the app's session refuses its list reads), then Show more. Questions: do the 200 rows already
 * shown stay, does "Could not read more…" appear under them, and does the button read Try again —
 * and once ERPNext answers again, does Try again add the rest?
 *
 * 🔴 LEAVES RECORDS (run with --leaves-records, sandbox only): scene `find-many`
 * (tests/probes/dogfood-scenes.js) — 205 draft Purchase Orders for `ZZ DF MANY`, deleted after
 * (drafts). Only the deleted-document log and the next numbers remain. The vendor stays.
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi, e2eCall, e2eGet } from "../../../e2e/helpers.js";
import { sleep, inDoc, inFind, openNewDoc, assertSandboxSite, keepScene, erpDown, erpUp, report } from "../probe-helpers.js";
import { SCENES } from "../dogfood-scenes.js";

const scene = SCENES["find-many"];
const state = (app) =>
  inFind(
    app,
    `({ rows: document.querySelectorAll("tr.row").length,
        more: document.getElementById("btn-more").textContent,
        moreShown: !document.getElementById("btn-more").closest("[hidden]") && !document.getElementById("btn-more").hidden,
        moreError: document.getElementById("more-error").hidden ? null : document.getElementById("more-error").textContent,
        listError: (document.querySelector('[data-testid="find-doc-error"]') || {}).textContent || null })`,
  );

test("R4-2: a failed Show more keeps the rows and offers Try again", async () => {
  test.setTimeout(600_000);
  const app = await launchShell();
  try {
    await waitForE2eApi(app);
    await openNewDoc(app, "po", "/app/purchase-order/new");
    await sleep(1500);
    report("site", { companies: await assertSandboxSite(app) });
    const made = await scene.make(app);
    report("scene", made);
    expect(made && made.error).toBeFalsy();

    await inDoc(app, `document.getElementById("btn-find").click(); true`);
    await expect
      .poll(async () => {
        if ((await e2eGet(app, "surfaceMode")) === "find-doc") return true;
        await inDoc(app, `(() => { const b = document.querySelector('[data-testid="doc-gate-discard"]'); if (b && b.offsetParent) b.click(); return true; })()`).catch(() => {});
        return false;
      }, { timeout: 20_000 })
      .toBe(true);
    await expect.poll(async () => (await state(app)).rows, { timeout: 30_000 }).toBe(200);
    report("first-page", await state(app));
    expect((await state(app)).moreShown).toBe(true);

    await erpDown(app, "/api/resource/Purchase%20Order");
    await inFind(app, `(() => { document.getElementById("btn-more").click(); return true; })()`);
    await expect.poll(async () => (await state(app)).moreError, { timeout: 30_000 }).toBeTruthy();
    const failed = await state(app);
    report("show-more-failed", failed);
    expect(failed.rows).toBe(200);
    expect(failed.listError).toBeNull();
    expect(failed.moreError).toMatch(/^Could not read more from ERPNext: /);
    expect(failed.more).toBe("Try again");

    await erpUp(app);
    await inFind(app, `(() => { document.getElementById("btn-more").click(); return true; })()`);
    await expect.poll(async () => (await state(app)).rows, { timeout: 30_000 }).toBeGreaterThan(200);
    report("try-again", await state(app));
    expect((await state(app)).moreError).toBeNull();
  } finally {
    await erpUp(app).catch(() => {});
    if (!keepScene()) report("clear", await scene.clear(app));
    await app.close().catch(() => {});
  }
});
