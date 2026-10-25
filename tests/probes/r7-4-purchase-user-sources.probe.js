/**
 * Review 10-19 R7-4, as a clerk rather than Administrator: a **Purchase User** (ERPNext's own role,
 * which may not read Sales Orders — `sales_order.json`) opens a new Purchase Order in the Doc lens
 * and asks Select PO for its sources. Question: does the Sales Orders slice end in its error row,
 * with the status line saying a source failed, or does it say "Still loading…" for good (G19:
 * `frappe.db.get_list` never settles on a refusal)?
 * Runs as the restricted probe user (tests/probes/probe-user.js): it stays on the sandbox, disabled,
 * between runs. Makes no other records (the PO is never saved).
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../e2e/helpers.js";
import { sleep, inDoc, inErp, openNewDoc, report, repaintDoc, closeSourcePickers } from "./probe-helpers.js";
import { loginAsProbeUser } from "./probe-user.js";

const VENDOR = "ALPINE SUPPLY CO";

test("R7-4: a source the clerk may not read shows its error, never spins", async () => {
  test.setTimeout(4 * 60_000);
  const app = await launchShell();
  /** @type {Awaited<ReturnType<typeof loginAsProbeUser>> | null} */
  let clerk = null;
  try {
    await waitForE2eApi(app);
    await expect.poll(() => inErp(app, `!!(window.frappe && frappe.xcall)`), { timeout: 30_000 }).toBe(true);
    // Leaving an unsaved PO at the end asks "leave?": the answer is Discard.
    await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; });
    clerk = await loginAsProbeUser(app, ["Purchase User"]);

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
    expect(seen.items.some((t) => /permission|not permitted|insufficient/i.test(t))).toBe(true);
    expect(seen.status).toMatch(/Some sources failed to load \(1\)/);
  } finally {
    if (clerk) await clerk.retire();
    await app.close().catch(() => {});
  }
});
