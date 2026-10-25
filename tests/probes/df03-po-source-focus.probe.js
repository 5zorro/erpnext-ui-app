/**
 * DF-03 (5zorro, 2026-10-25): "focus after the source modal closed was lost and is not in the date
 * field when entering the po". A **Purchase User** opens a new Purchase Order in the Doc lens, picks
 * the vendor, opens Select PO, and chooses NIC (no source). Question: where is focus when the
 * picker closes? It was on nothing (`BODY`) before `355249b`, and failed on that code; now the
 * PO's Date (`focusTargetAfterDocSourceModal`).
 * Runs as the restricted probe user (tests/probes/probe-user.js), disabled again after. Makes no
 * records (the PO is never saved).
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../e2e/helpers.js";
import { sleep, inDoc, inErp, openNewDoc, report, repaintDoc, closeSourcePickers } from "./probe-helpers.js";
import { loginAsProbeUser } from "./probe-user.js";

test("DF-03: after Select PO → NIC, focus is on the PO's Date", async () => {
  test.setTimeout(4 * 60_000);
  const app = await launchShell();
  let clerk = null;
  try {
    await waitForE2eApi(app);
    await expect.poll(() => inErp(app, `!!(window.frappe && frappe.xcall)`), { timeout: 30_000 }).toBe(true);
    await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; });
    clerk = await loginAsProbeUser(app, ["Purchase User"]);
    await openNewDoc(app, "po", "/app/purchase-order/new");
    await sleep(2500);
    await inDoc(app, `(async () => { const r = await window.erpDoc.setHeader("supplier", "ALPINE SUPPLY CO"); return r && r.ok; })()`, 30_000);
    await sleep(3000);
    await repaintDoc(app);
    await sleep(1000);
    await closeSourcePickers(app);
    await sleep(800);
    await inDoc(app, `(() => { document.querySelector('[data-testid="doc-select-source"]').click(); return true; })()`);
    await expect.poll(() => inDoc(app, `!!document.querySelector('[data-testid="doc-source-modal"]')`), { timeout: 20_000 }).toBe(true);
    await sleep(1500);
    const clicked = await inDoc(app, `(() => { const m = document.querySelector('[data-testid="doc-source-modal"]'); const nic = [...m.querySelectorAll(".src-item")].find((b) => /^NIC/.test(b.textContent.trim())); if (!nic) return "no nic"; nic.click(); m.querySelector('[data-act="pick"]').click(); return "ok"; })()`);
    report("clicked", clicked);
    expect(clicked).toBe("ok");
    await sleep(1500);
    const active = await inDoc(app, `(() => { const a = document.activeElement; return a ? (a.getAttribute("data-field") || a.tagName) : null; })()`);
    report("active", active);
    expect(active).toBe("transaction_date");
  } finally {
    if (clerk) await clerk.retire();
    await app.close().catch(() => {});
  }
});
