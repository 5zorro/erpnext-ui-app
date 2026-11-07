/**
 * A new Purchase Order's opening focus in Vendor never pulls the clerk out of a box they already
 * clicked into (the Bill's rule since 2026-10-11, 5zorro: a slow load must not move the clerk; on
 * every Doc form since plan 2026-10-25 closeout item 4, src/party-focus.js).
 *
 * The probe opens a new PO, waits for the opening focus to land in Vendor, and at once clicks into
 * another box on the form, as a clerk would. The old doc-form code retried the focus at 50 and
 * 200 ms and took the clerk back to Vendor; now the click counts as a move and the focus stays.
 * Acts as the AP clerk. Saves nothing (the new PO is never saved).
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi, e2eCall, e2eGet } from "../../e2e/helpers.js";
import { inDoc, inErp, report, sleep } from "./probe-helpers.js";
import { loginAsProbeUser, AP_CLERK } from "./probe-user.js";

/** Where the clerk is: the focused box's field, or its tag. */
const where = (app) =>
  inDoc(app, `(() => { const a = document.activeElement; return a ? (a.dataset && a.dataset.field) || a.id || a.tagName : ""; })()`, 3000);

test("clicking into another box as a new PO opens is not pulled back to Vendor", async () => {
  test.setTimeout(150_000);
  let app = null;
  let clerk = null;
  try {
    app = await launchShell();
    await waitForE2eApi(app);
    await expect.poll(() => inErp(app, `!!(window.frappe && frappe.xcall)`), { timeout: 30_000 }).toBe(true);
    clerk = await loginAsProbeUser(app, AP_CLERK.roles, { as: AP_CLERK.name });

    await e2eCall(app, "openPo", "/app/purchase-order/new");
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("doc");
    // The opening focus lands in Vendor…
    await expect.poll(() => where(app), { timeout: 40_000, intervals: [20] }).toBe("supplier");
    // …and at once the clerk clicks into another box on the form (a real click: it counts as a move).
    const target = await inDoc(
      app,
      `(() => { const boxes = [...document.querySelectorAll('#header-left [data-field], #header-right [data-field], #f-memo')].filter((i) => i.dataset.field !== "supplier" && !i.readOnly && !i.disabled && i.offsetParent && (i.tagName === "TEXTAREA" || i.type === "text")); const i = boxes[0]; if (!i) return null; const r = i.getBoundingClientRect(); return { field: i.dataset.field || i.id, x: Math.round(r.left + 8), y: Math.round(r.top + r.height / 2) }; })()`,
    );
    report("target", target);
    expect(target, "a box to click into").toBeTruthy();
    await app.evaluate(({ webContents }, p) => {
      const w = webContents.getAllWebContents().find((x) => /doc-form\.html/.test(x.getURL()));
      w.focus();
      w.sendInputEvent({ type: "mouseDown", x: p.x, y: p.y, button: "left", clickCount: 1 });
      w.sendInputEvent({ type: "mouseUp", x: p.x, y: p.y, button: "left", clickCount: 1 });
    }, target);
    await expect.poll(() => where(app), { timeout: 2000, intervals: [20] }).toBe(target.field);
    // Past the old 50 / 200 ms retries, and the blank line's repaint.
    await sleep(2500);
    const after = await where(app);
    report("after", { after });
    expect(after, "the clerk's box keeps the focus").toBe(target.field);
  } finally {
    if (clerk) await clerk.retire().catch((e) => report("retire-failed", String(e)));
    if (app) await app.close().catch(() => {});
  }
});
