/**
 * A repaint never changes the line cell the clerk is typing in, or one they left whose write is
 * still out (5zorro 2026-11-01: "repaints should not affect the inputbox that has been directly or
 * is currently directly edited by the user"; museum OI-202). Before, the shared item rows
 * (`src/doc-form-item-rows-ui.js`) rebuilt every line on each repaint: focus came back to the
 * rebuilt cell (`bill-focus-guard.js`), the typed text and its pick list did not.
 *
 * A. Bill: the vendor's details reply held 6 s; meanwhile Tab on and type `SAMPLE` in line 1's Item.
 *    The reply's repaint must leave the text, the focus and the pick list.
 * B. Bill: a Qty typed and left while ERPNext's pricing call for it is held; a late repaint carrying
 *    the document from before the edit must still show the clerk's Qty, and ERPNext ends on it.
 * C. PO: as A, the repaint being a late reply carrying the document from before the typing.
 * D. Bill taxes: an Amount being typed in a tax row survives a late repaint of the older document
 *    (the taxes table keeps edits the same way, src/repaint-keeps-edit.js).
 *
 * Acts as the AP clerk. Makes no records (the drafts are left unsaved).
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../e2e/helpers.js";
import { sleep, keys, inDoc, inErp, focusTestId, openNewDoc, report, docQuiet, searchDone, settle, closeSourcePickers } from "./probe-helpers.js";
import { loginAsProbeUser, AP_CLERK } from "./probe-user.js";

const VENDOR = "SUMMIT TRADERS";
const ITEM = "SAMPLE-SKU-01";
const PARTY_DETAILS = "erpnext.accounts.party.get_party_details";
const PRICING = "pricing_rule.apply_pricing_rule";
const HOLD_MS = 6000;

/** Requests whose URL has `part` (and whose body has `text`, when given) wait `ms` before going out. */
const holdRequests = (app, part, text, ms) =>
  app.evaluate(({ session }, [p, t, m]) => {
    globalThis.__held = 0;
    session.defaultSession.webRequest.onBeforeRequest((d, cb) => {
      const body = (d.uploadData || []).map((u) => (u.bytes ? Buffer.from(u.bytes).toString("utf8") : "")).join("");
      if (d.url.includes(p) && (!t || decodeURIComponent(body.replace(/\+/g, " ")).includes(t))) {
        globalThis.__held++;
        setTimeout(() => cb({}), m);
      } else cb({});
    });
  }, [part, text, ms]);
const release = (app) => app.evaluate(({ session }) => session.defaultSession.webRequest.onBeforeRequest(null));
const heldCount = (app) => app.evaluate(() => globalThis.__held || 0);

/** A late reply: repaint the Doc page with a snapshot taken earlier. */
const sendSnapshot = (app, snap) =>
  app.evaluate(({ webContents }, s) => webContents.getAllWebContents().find((w) => /doc-form\.html/.test(w.getURL())).send("doc-snapshot", s), snap);
const snapshot = (app) => inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); return { doc: s.doc }; })()`);

const cell = (app, field, row = 0) =>
  inDoc(
    app,
    `(() => { const c = document.querySelector('input[data-row="${row}"][data-field="${field}"]'); const d = [...document.querySelectorAll(".link-dd")].find((x) => !x.hidden); return { value: c ? c.value : null, focused: !!c && document.activeElement === c, list: d ? d.querySelectorAll(".link-opt").length : 0 }; })()`,
  );
const focusCell = (app, field, row = 0) =>
  inDoc(app, `(() => { const c = document.querySelector('input[data-row="${row}"][data-field="${field}"]'); c.focus(); c.select(); return true; })()`);

async function pickVendor(app, testId) {
  await focusTestId(app, testId);
  await keys(app, VENDOR);
  await searchDone(app);
  await keys(app, "\t");
  await settle(); // the clerk's reaction time before clicking elsewhere (the Tab moves focus on its own)
  // The vendor's source picker opens on the pick when it has POs or receipts: closed, as a clerk
  // would, before the item.
  await closeSourcePickers(app);
  await settle();
}

async function newDocAsClerk(skin, route) {
  const app = await launchShell();
  await waitForE2eApi(app);
  await expect.poll(() => inErp(app, `!!(window.frappe && frappe.xcall)`), { timeout: 30_000 }).toBe(true);
  await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; }); // leaving: Discard
  const clerk = await loginAsProbeUser(app, AP_CLERK.roles, { as: AP_CLERK.name });
  await openNewDoc(app, skin, route);
  await docQuiet(app);
  return { app, clerk };
}

async function close(app, clerk) {
  if (app) await release(app).catch(() => {});
  if (clerk) await clerk.retire().catch((e) => report("retire-failed", String(e)));
  if (app) await app.close().catch(() => {});
}

test("A. Bill: an item typed while the vendor's reply is out survives the reply's repaint", async () => {
  test.setTimeout(180_000);
  let app = null;
  let clerk = null;
  try {
    ({ app, clerk } = await newDocAsClerk("bill", "/app/purchase-invoice/new"));
    await holdRequests(app, PARTY_DETAILS, VENDOR, HOLD_MS);
    await pickVendor(app, "bill-vendor");
    await focusCell(app, "item_code");
    await keys(app, "SAMPLE");
    await searchDone(app);
    const before = await cell(app, "item_code");
    report("typed, reply out", before);
    expect(before.list).toBeGreaterThan(0);
    await docQuiet(app, { timeout: 30_000 });
    const after = await cell(app, "item_code");
    report("after the reply", { ...after, held: await heldCount(app) });
    expect(await heldCount(app)).toBeGreaterThan(0);
    expect(after.value).toBe("SAMPLE");
    expect(after.focused).toBe(true);
    expect(after.list).toBeGreaterThan(0);
  } finally {
    await close(app, clerk);
  }
});

test("B. Bill: a Qty left while its write is out survives a late repaint of the older document", async () => {
  test.setTimeout(180_000);
  let app = null;
  let clerk = null;
  try {
    ({ app, clerk } = await newDocAsClerk("bill", "/app/purchase-invoice/new"));
    await pickVendor(app, "bill-vendor");
    await docQuiet(app, { timeout: 30_000 });
    await focusCell(app, "item_code");
    await keys(app, ITEM);
    await searchDone(app);
    await keys(app, "\t");
    await docQuiet(app, { timeout: 30_000 });
    const older = await snapshot(app);
    report("before the edit", { qty: older.doc.items[0].qty, item: older.doc.items[0].item_code });
    await holdRequests(app, PRICING, "", HOLD_MS);
    await focusCell(app, "qty");
    await keys(app, "7");
    await keys(app, "\t");
    await sleep(500); // the write is out (its pricing call held)
    report("left, write out", await cell(app, "qty"));
    await sendSnapshot(app, older);
    await sleep(300); // the late repaint has painted
    const mid = await cell(app, "qty");
    report("after the late repaint", mid);
    expect(mid.value).toBe("7");
    await docQuiet(app, { timeout: 30_000 });
    const end = { cell: await cell(app, "qty"), erp: await inErp(app, `cur_frm.doc.items[0].qty`), held: await heldCount(app) };
    report("after the write", end);
    expect(end.held).toBeGreaterThan(0);
    expect(end.cell.value).toBe("7");
    expect(Number(end.erp)).toBe(7);
  } finally {
    await close(app, clerk);
  }
});

test("C. PO: an item being typed survives a late repaint of the older document", async () => {
  test.setTimeout(180_000);
  let app = null;
  let clerk = null;
  try {
    ({ app, clerk } = await newDocAsClerk("po", "/app/purchase-order/new"));
    const older = await snapshot(app);
    await focusCell(app, "item_code");
    await keys(app, "SAMPLE");
    await searchDone(app);
    report("typed", await cell(app, "item_code"));
    await sendSnapshot(app, older);
    await sleep(300); // the late repaint has painted
    await searchDone(app);
    const after = await cell(app, "item_code");
    report("after the late repaint", after);
    expect(after.value).toBe("SAMPLE");
    expect(after.focused).toBe(true);
    expect(after.list).toBeGreaterThan(0);
  } finally {
    await close(app, clerk);
  }
});

test("D. Bill taxes: a tax Amount being typed survives a late repaint of the older document", async () => {
  test.setTimeout(180_000);
  let app = null;
  let clerk = null;
  try {
    ({ app, clerk } = await newDocAsClerk("bill", "/app/purchase-invoice/new"));
    await pickVendor(app, "bill-vendor");
    await docQuiet(app, { timeout: 30_000 });
    await focusCell(app, "item_code");
    await keys(app, ITEM);
    await searchDone(app);
    await keys(app, "\t");
    await docQuiet(app, { timeout: 30_000 });
    // A fixed tax row through the Add box.
    await inDoc(app, `(() => { const a = document.querySelector("#f-tax-account"); a.value = "ST 4% - USE"; a.dataset.linkCommitted = a.value; const m = document.querySelector('[data-testid="bill-tax-amount"]'); m.value = "5"; document.querySelector('[data-testid="bill-add-tax"]').click(); return true; })()`);
    await expect.poll(() => inDoc(app, `!!document.querySelector('[data-testid="bill-tax-0-amount"]')`), { timeout: 20_000 }).toBe(true);
    await docQuiet(app, { timeout: 30_000 });
    const older = await snapshot(app);
    await inDoc(app, `(() => { const c = document.querySelector('[data-testid="bill-tax-0-amount"]'); c.focus(); c.select(); return true; })()`);
    await keys(app, "12");
    const amount = () => inDoc(app, `(() => { const c = document.querySelector('[data-testid="bill-tax-0-amount"]'); return { value: c ? c.value : null, focused: !!c && document.activeElement === c }; })()`);
    report("tax typed", await amount());
    await sendSnapshot(app, older);
    await sleep(300); // the late repaint has painted
    const after = await amount();
    report("tax after the late repaint", after);
    expect(after.value).toBe("12");
    expect(after.focused).toBe(true);
  } finally {
    await close(app, clerk);
  }
});
