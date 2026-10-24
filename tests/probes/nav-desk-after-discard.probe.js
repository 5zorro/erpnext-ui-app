/**
 * @nav race
 * Nav matrix N-3 (2026-10-24): Discard on a typed new Bill makes ERPNext start a fresh new form
 * (`frappe.new_doc`); the gate then goes Home, and Desk is clicked at once. Seen in the matrix: the
 * route poll read the fresh `new-…` form after the Desk load began (a Desk load armed no guard),
 * and the Doc lens pulled the clerk back onto a blank Bill. Repeated `NAV_TRIES` times (default 8),
 * Desk clicked as soon as Home shows. Question: does every try end on Desk? Saves nothing.
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi, e2eCall, e2eGet } from "../../e2e/helpers.js";
import { sleep, inDoc, keys, report } from "./probe-helpers.js";

const surface = (app) => e2eGet(app, "surfaceMode");
const click = (view, id) => e2eCall(app_, "execInView", view, `(() => { const b = document.querySelector('[data-testid="${id}"]'); if (b) b.click(); return !!b; })()`);
let app_;

test("N-3: Desk right after Discard on a new Bill stays on Desk", async () => {
  test.setTimeout(20 * 60_000);
  const app = (app_ = await launchShell());
  const tries = Number(process.env.NAV_TRIES) || 8;
  const ends = [];
  try {
    await waitForE2eApi(app);
    await e2eCall(app, "setLensPref", "purchase-invoice", "doc");
    await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; });
    for (let i = 0; i < tries; i += 1) {
      await click("home", "tile-bill-new");
      await expect.poll(() => surface(app), { timeout: 30_000 }).toBe("doc");
      await sleep(2500);
      await inDoc(app, `(() => { const i = document.getElementById("f-billno"); i.focus(); return true; })()`);
      await keys(app, `ZZNAV-R${i}\t`);
      await sleep(1000);
      await click("chrome", "btn-home");
      await expect.poll(() => inDoc(app, `(() => { const g = document.querySelector('[data-testid="doc-commit-gate"]'); return !!(g && !g.hidden); })()`), { timeout: 10_000 }).toBe(true);
      await inDoc(app, `(() => { document.querySelector('[data-testid="doc-gate-discard"]').click(); return true; })()`);
      for (let k = 0; k < 200 && (await surface(app)) !== "home"; k += 1) await sleep(20);
      await click("home", "tile-desk");
      await sleep(6000);
      const end = await surface(app);
      ends.push(end);
      report("try", { i, end, route: await e2eCall(app, "currentRoute") });
      if (end !== "home") {
        await click("chrome", "btn-home");
        await sleep(1500);
        await inDoc(app, `(() => { const b = document.querySelector('[data-testid="doc-gate-discard"]'); if (b && b.offsetParent) b.click(); return true; })()`);
        await expect.poll(() => surface(app), { timeout: 15_000 }).toBe("home");
      }
    }
    report("ends", { ends });
    expect(ends.every((e) => e === "erp")).toBe(true);
  } finally {
    await app.close().catch(() => {});
  }
});
