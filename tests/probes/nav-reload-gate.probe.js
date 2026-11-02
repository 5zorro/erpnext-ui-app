/**
 * @nav reload
 * Plan 2026-10-24 build step 1: why did R2-1's reload of a typed new Bill ask nothing? Vanilla's
 * form adds a `beforeunload` listener when it goes dirty (`form.js` `dirty()`); the shell answers
 * it in `onErpWillPreventUnload` — "allow" when its own unsaved check passed in the last 20 s
 * (`decideErpUnload`), else it asks. Questions, on a new Bill typed through the Doc page:
 * 1. is ERPNext's form dirty, and is its listener on?
 * 2. a reload soon after the Bill was opened — asked, or let through? what does the Doc page show?
 * 3. a reload more than 20 s after the open — asked?
 * 4. the same once the ERPNext page has had a user gesture (Chromium shows a page's "leave?" only
 *    after the person interacted with that page — and the clerk types in the Doc page, not there)?
 * The shell's box is answered "Stay" by a stub (a real box would block the probe). Saves nothing.
 *
 * Answer (2026-10-24, docs/gotchas.md G23): 1 yes; 2 and 3 not asked — the reload goes through and
 * the typing is gone, because Chromium skips the listener of a page nobody interacted with; 4 asked,
 * and Stay kept the typing. The 20 s window plays no part. DC-4 (A) turns 2 and 3 into "asked".
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi, e2eCall, e2eGet } from "../../e2e/helpers.js";
import { sleep, inDoc, inErp, openNewDoc, report, closeSourcePickers, docQuiet } from "./probe-helpers.js";

const ERP_STATE = `(() => { const f = window.cur_frm; const ev = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(ev);
  return { name: f && f.doc && f.doc.name, unsaved: !!(f && f.doc && f.doc.__unsaved), supplier: (f && f.doc && f.doc.supplier) || "", listener: ev.defaultPrevented, everActive: !!(navigator.userActivation && navigator.userActivation.hasBeenActive) }; })()`;
const DOC_STATE = `(async () => { const s = await window.erpDoc.getSnapshot(); const v = document.querySelector('[data-testid="bill-vendor"]');
  return { snapName: s && s.doc && s.doc.name, snapSupplier: (s && s.doc && s.doc.supplier) || "", box: v ? v.value : null, status: (document.getElementById("status") || {}).textContent || "" }; })()`;

/** Replace the shell's "Unsaved changes" box with one that records the ask and answers Stay. */
const stubDialog = (app) =>
  app.evaluate(({ dialog }) => {
    globalThis.__probeAsks = [];
    dialog.showMessageBoxSync = (_w, spec) => {
      globalThis.__probeAsks.push({ at: Date.now(), message: spec && spec.message });
      return 0;
    };
  });
const asks = (app) => app.evaluate(() => globalThis.__probeAsks.slice());

/** After Home: the Doc page's unsaved gate is up, or the shell is already Home. */
const gateOrHome = (app) => async () =>
  (await e2eGet(app, "surfaceMode")) === "home" ||
  (await inDoc(app, `(() => { const b = document.querySelector('[data-testid="doc-gate-discard"]'); return !!(b && b.offsetParent); })()`)) === true;

async function typedNewBill(app) {
  await openNewDoc(app, "bill", "/app/purchase-invoice/new");
  const openedAt = Date.now();
  await docQuiet(app);
  await inDoc(app, `(async () => { const d = window.erpDoc; await d.setHeader("supplier", "ALPINE SUPPLY CO"); await d.setItem(0, "item_code", "SAMPLE-SKU-01"); await d.setItem(0, "qty", 2); return true; })()`, 60_000);
  await docQuiet(app);
  await closeSourcePickers(app);
  return openedAt;
}

/** Reload the ERPNext page and report what each side holds after. */
async function reloadAndLook(app, label, openedAt) {
  const before = await asks(app);
  const reloadAt = Date.now();
  // A mark only the page before the reload carries: gone means ERPNext's page is a new one.
  await inErp(app, `(() => { window.__probeBeforeReload = 1; return true; })()`);
  await e2eCall(app, "reloadErp");
  await expect
    .poll(async () => (await asks(app)).length > before.length || (await inErp(app, `!window.__probeBeforeReload && !!(window.frappe && frappe.xcall && window.cur_frm)`)) === true, { timeout: 30_000, intervals: [200] })
    .toBe(true);
  await docQuiet(app);
  const after = await asks(app);
  const look = {
    sinceOpenMs: reloadAt - openedAt,
    asked: after.length > before.length,
    erp: await inErp(app, ERP_STATE, 15_000),
    doc: await inDoc(app, DOC_STATE, 15_000),
  };
  report(label, look);
  return look;
}

test("nav step 1: a reload under unsaved Bill typing — asked or not, and why", async () => {
  const app = await launchShell();
  try {
    await waitForE2eApi(app);
    await stubDialog(app);
    // Playwright auto-answers a page's "leave?" prompt and throws when Electron answered it first;
    // a listener of our own turns that off (and counts the prompts Chromium raised).
    const raised = [];
    const watch = (page) => page.on("dialog", (d) => { raised.push({ type: d.type(), url: page.url() }); d.dismiss().catch(() => {}); });
    app.context().pages().forEach(watch);
    app.context().on("page", watch);

    // Case A, R2-1's shape: reload soon after the open.
    const openedA = await typedNewBill(app);
    const typedA = await inErp(app, ERP_STATE);
    report("typed-A", { ...typedA, sinceOpenMs: Date.now() - openedA });
    const a = await reloadAndLook(app, "reload-soon", openedA);

    // Case B: the same, reloaded past the 20 s window.
    e2eCall(app, "goHome").catch(() => {});
    await expect.poll(gateOrHome(app), { timeout: 15_000 }).toBe(true);
    await inDoc(app, `(() => { const b = document.querySelector('[data-testid="doc-gate-discard"]'); if (b && b.offsetParent) { b.click(); return true; } return false; })()`);
    await expect.poll(() => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("home");
    const openedB = await typedNewBill(app);
    const typedB = await inErp(app, ERP_STATE);
    report("typed-B", typedB);
    const wait = 22_000 - (Date.now() - openedB);
    if (wait > 0) await sleep(wait);
    const b = await reloadAndLook(app, "reload-late", openedB);

    // Case C: as B, after a user gesture in the ERPNext page itself.
    e2eCall(app, "goHome").catch(() => {});
    await expect.poll(gateOrHome(app), { timeout: 15_000 }).toBe(true);
    await inDoc(app, `(() => { const b = document.querySelector('[data-testid="doc-gate-discard"]'); if (b && b.offsetParent) { b.click(); return true; } return false; })()`);
    await expect.poll(() => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("home");
    const openedC = await typedNewBill(app);
    await app.evaluate(({ webContents }) => {
      const wc = webContents.getAllWebContents().find((w) => /\/(app|desk)\//.test(w.getURL()));
      return wc.executeJavaScript("1", true);
    });
    const typedC = await inErp(app, ERP_STATE);
    report("typed-C", typedC);
    const waitC = 22_000 - (Date.now() - openedC);
    if (waitC > 0) await sleep(waitC);
    const c = await reloadAndLook(app, "reload-late-gesture", openedC);

    expect(typedA.unsaved).toBe(true);
    expect(typedA.listener).toBe(true);
    expect(c.asked).toBe(true);
    expect(c.erp.supplier).toBe("ALPINE SUPPLY CO");
    report("verdict", { soonAsked: a.asked, lateAsked: b.asked, gestureAsked: c.asked, activeBefore: [typedA.everActive, typedB.everActive, typedC.everActive], chromiumPrompts: raised });
  } finally {
    await app.close().catch(() => {});
  }
});
