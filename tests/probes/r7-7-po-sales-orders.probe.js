/**
 * Review 10-19 R7-7, as the AP clerk (who may read Sales Orders): a new Purchase Order's Select
 * source lists the open Sales Orders with a line still to order — now read orders first, then only
 * their lines (it was one row per order line, capped at 500). Question: is the sandbox's open order
 * (`SAL-ORD-2026-00001`, two lines to order) listed, with no error row and no "Still loading…"?
 * Makes no records (the PO is never saved).
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../e2e/helpers.js";
import { sleep, inDoc, inErp, openNewDoc, report, repaintDoc, closeSourcePickers } from "./probe-helpers.js";
import { loginAsProbeUser, AP_CLERK } from "./probe-user.js";

const VENDOR = "ALPINE SUPPLY CO";
const OPEN_ORDER = "SAL-ORD-2026-00001";

test("R7-7: the PO's Sales Orders slice lists the open order, orders first", async () => {
  test.setTimeout(4 * 60_000);
  const app = await launchShell();
  /** @type {Awaited<ReturnType<typeof loginAsProbeUser>> | null} */
  let clerk = null;
  try {
    await waitForE2eApi(app);
    await expect.poll(() => inErp(app, `!!(window.frappe && frappe.xcall)`), { timeout: 30_000 }).toBe(true);
    // Leaving an unsaved PO at the end asks "leave?": the answer is Discard.
    await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; });
    clerk = await loginAsProbeUser(app, AP_CLERK.roles, { as: AP_CLERK.name });

    await openNewDoc(app, "po", "/app/purchase-order/new");
    await sleep(2500);
    const set = await inDoc(app, `(async () => { const r = await window.erpDoc.setHeader("supplier", ${JSON.stringify(VENDOR)}); return r && r.ok ? "ok" : (r && r.reason) || "?"; })()`, 30_000);
    report("vendor", set);
    await sleep(3000);
    await repaintDoc(app);
    await sleep(1000);
    await closeSourcePickers(app);
    await sleep(800);
    await inDoc(app, `(() => { document.querySelector('[data-testid="doc-select-source"]').click(); return true; })()`);
    const listed = () =>
      inDoc(app, `(() => { const m = document.querySelector('[data-testid="doc-source-modal"]'); if (!m) return null; const items = [...m.querySelectorAll(".src-item")].map((b) => b.textContent); return { loading: items.some((t) => /Still loading/.test(t)), items, status: (document.getElementById("status") || {}).textContent || "" }; })()`);
    let done = true;
    await expect
      .poll(async () => { const l = await listed(); return !!(l && !l.loading); }, { timeout: 45_000 })
      .toBe(true)
      .catch(() => { done = false; });
    const seen = await listed();
    report("picker", { done, ...seen });
    await closeSourcePickers(app);

    expect(done).toBe(true);
    expect(seen.items.some((t) => t.includes(OPEN_ORDER))).toBe(true);
    expect(seen.items.some((t) => /permission|not permitted|insufficient|did not answer/i.test(t))).toBe(false);
    expect(seen.status).not.toMatch(/failed to load/);
  } finally {
    if (clerk) await clerk.retire();
    await app.close().catch(() => {});
  }
});
