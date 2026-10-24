/**
 * Driving a Bill line's *Assign…* dialog (customer → Sales Orders → Project → costing) from a probe,
 * after a Bill is open with the line filled. Used by r6b4-split-by-need and the R2-2 dogfood probe.
 */
import { expect } from "@playwright/test";
import { sleep, inDoc, report } from "./probe-helpers.js";

export const inDialog = (app, js) => inDoc(app, `(() => { const d = document.querySelector('[data-testid="bill-allocation-picker"]'); if (!d) return "NO DIALOG"; ${js} })()`);
export const clickPrimary = (app) => inDialog(app, `d.querySelector('[data-act="pick"]').click(); return true;`);
export const dialogTitle = (app) => inDialog(app, `return d.querySelector("[data-alloc-title]").textContent;`);

/** Click the dialog's main button, then wait until its title says the next step. */
export async function nextStep(app, want) {
  await clickPrimary(app);
  await expect.poll(() => dialogTitle(app), { timeout: 20_000 }).toMatch(want);
  report("step", { title: await dialogTitle(app) });
}

/**
 * Open Assign on line `row` and get to the Project step with `salesOrders` picked. The vendor was set
 * through the page's API, which does not repaint the box: `vendor` is shown there as a repaint
 * would, since Assign reads it from the box; an open source picker is closed first.
 */
export async function assignToOrders(app, { row = 0, vendor, salesOrders, beforeProject }) {
  await inDoc(app, `(() => { document.querySelector('[data-testid="bill-vendor"]').value = ${JSON.stringify(vendor)}; return true; })()`);
  await inDoc(app, `(() => { for (const b of document.querySelectorAll(".src-back")) { const c = b.querySelector('[data-act="cancel"], [data-act="close"], .src-close'); if (c) c.click(); } return true; })()`);
  await sleep(1000);
  const opened = await inDoc(app, `(() => { const b = document.querySelector('[data-testid="bill-assign-${row}"]'); if (!b) return false; b.click(); return true; })()`);
  expect(opened).toBe(true);
  await sleep(1500);
  await expect.poll(() => dialogTitle(app), { timeout: 10_000 }).toMatch(/pick customer/);
  await nextStep(app, /Sales order/); // all customers → Sales Orders
  await sleep(500);
  const picked = await inDialog(
    app,
    `const want = ${JSON.stringify(salesOrders)}; let n = 0; for (const b of d.querySelectorAll(".src-item")) { if (want.some((w) => b.textContent.includes(w))) { b.click(); n++; } } return n;`,
  );
  report("picked", { picked });
  await sleep(500);
  if (beforeProject) await beforeProject();
  await nextStep(app, /Project/);
}
