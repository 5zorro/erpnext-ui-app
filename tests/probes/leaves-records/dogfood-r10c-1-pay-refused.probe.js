/**
 * @dogfood R10c-1
 * Plan 10-19 dogfood row R10c-1: paying a bill from the board's check drawer where ERPNext saves
 * the Payment Entry but refuses its submit (the bank account is disabled — checked only when the
 * ledger entries are made). Questions: does the drawer name the draft and ERPNext's reason, and is
 * the draft under Draft payments at once?
 *
 * 🔴 LEAVES RECORDS (run with --leaves-records, sandbox only): scene `payment-submit-refused`
 * (tests/probes/dogfood-scenes.js) — per run one bill for `ZZ DF PAY REFUSED`, cancelled after,
 * and the draft payment, deleted; the account `ZZ DF Bank` stays (enabled after).
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../../e2e/helpers.js";
import { sleep, inBoard, openBoard, openNewDoc, assertSandboxSite, keepScene, report } from "../probe-helpers.js";
import { SCENES } from "../dogfood-scenes.js";
import { cardOf } from "../method-panel-helpers.js";

const scene = SCENES["payment-submit-refused"];
const V = "ZZ DF PAY REFUSED";

test("R10c-1: a refused payment submit names the draft and lists it under Draft payments", async () => {
  const app = await launchShell();
  try {
    await waitForE2eApi(app);
    await openNewDoc(app, "bill", "/app/purchase-invoice/new");
    await sleep(1500);
    report("site", { companies: await assertSandboxSite(app) });
    const made = await scene.make(app);
    report("scene", made);
    expect(made && made.error).toBeFalsy();

    await openBoard(app);
    await expect.poll(() => inBoard(app, `!!(${cardOf(V)})`), { timeout: 20_000 }).toBe(true);
    await inBoard(app, `(() => { ${cardOf(V)}.querySelector('[data-testid="group-create-payment"]').click(); return true; })()`);
    await sleep(2500); // the drawer's defaults load
    const set = (testid, value) =>
      `(() => { const i = document.querySelector('#check-doc [data-testid="${testid}"]'); i.value = ${JSON.stringify(value)}; i.dataset.autofilled = "0"; i.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`;
    await inBoard(app, set("check-doc-cash-account", made.disabledBank));
    await inBoard(app, set("check-doc-mop", "Check"));
    await inBoard(app, set("check-doc-reference-no", "ZZ-DF-PAY"));
    await inBoard(app, `(() => { document.querySelector('#check-doc [data-testid="check-doc-submit"]').click(); return true; })()`);
    await expect
      .poll(() => inBoard(app, `document.querySelector('#check-doc [data-testid="check-doc-write-status"]').textContent`), { timeout: 60_000 })
      .not.toMatch(/^(Creating Payment Entry…)?$/);
    await sleep(2000);
    const seen = await inBoard(
      app,
      `({ status: document.querySelector('#check-doc [data-testid="check-doc-write-status"]').textContent,
          drafts: [...document.querySelectorAll('[data-testid="draft-payment-row"]')].map((r) => r.textContent.replace(/\\s+/g, " ").trim()) })`,
    );
    report("drawer", seen);
    const draft = (/(ACC-PAY-\d{4}-\d+)/.exec(seen.status) || [])[1];
    expect(draft).toBeTruthy();
    expect(seen.status).toMatch(/draft/i);
    expect(seen.status).toMatch(/disabled/i);
    expect(seen.drafts.some((d) => d.includes(draft))).toBe(true);
  } finally {
    if (!keepScene()) report("clear", await scene.clear(app));
    await app.close().catch(() => {});
  }
});
