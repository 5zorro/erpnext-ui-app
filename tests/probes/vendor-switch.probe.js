/**
 * Museum OI-200 (5zorro's option A, 2026-11-01): changing from one vendor to another clears the
 * whole document before the new vendor is set; when the clerk has typed anything, a warning says
 * what will clear, and Keep is the default. Questions, as the AP clerk on a new Bill:
 *   1. ALPINE SUPPLY CO (has an address), then the vendor's invoice number typed: no warning;
 *   2. SUMMIT TRADERS picked, the warning answered Keep: nothing changes, the box shows ALPINE;
 *   3. SUMMIT TRADERS again with ERPNext's vendor-details reply held 14 s, answered Change: when
 *      the write ends, no ALPINE address anywhere and the invoice number gone, in ERPNext and on
 *      the page;
 *   4. back to ALPINE (nothing typed since), the reply held 14 s: no warning, ALPINE's address.
 * Then (its own launch: leaving an unsaved Bill asks Save / Discard / Cancel) a new PO: ALPINE,
 * then SUMMIT with the reply held 14 s; 13 s in, ERPNext's own form already holds no address —
 * the clear runs before the new vendor is asked for.
 *
 * On the code before OI-200 (checked 2026-11-01): step 3 keeps the invoice number, and the PO's
 * form still holds ALPINE's address 13 s in. The page never showed that address, though, even
 * with the reply held 32 s: the write's `set_value` waits for every server call the vendor's
 * script starts, however slow (docs/gotchas.md, "A field script's server calls hold set_value").
 * The museum's first reading of OI-200 — a reply slower than 12 s leaves the old address — was
 * wrong; the switch's other reasons stand.
 * Saves nothing; makes no records.
 */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { launchShell, waitForE2eApi } from "../../e2e/helpers.js";
import { sleep, keys, inDoc, inErp, focusTestId, openNewDoc, report, closeSourcePickers, erpUp } from "./probe-helpers.js";
import { loginAsProbeUser, AP_CLERK } from "./probe-user.js";

const WITH_ADDRESS = "ALPINE SUPPLY CO";
const NO_ADDRESS = "SUMMIT TRADERS";
const PARTY_DETAILS = "erpnext.accounts.party.get_party_details";
const HELD_MS = 14_000; // past the bridge's 12 s ajax wait
const BILL_NO = "ZZOI200-1";

/** ERPNext's vendor-details reply is held back `ms` (0 = let it through). */
const holdPartyDetails = (app, ms) =>
  app.evaluate(({ session }, [part, wait]) => {
    session.defaultSession.webRequest.onBeforeRequest((d, cb) => {
      if (wait && d.url.includes(part)) setTimeout(() => cb({}), wait);
      else cb({});
    });
  }, [PARTY_DETAILS, ms]);

/** The vendor-switch warning answers `response` (0 Keep, 1 Change); every message is kept. */
const answerVendorWarning = (app, response) =>
  app.evaluate(({ dialog }, r) => {
    globalThis.__vendorWarnings = globalThis.__vendorWarnings || [];
    dialog.showMessageBox = async (_w, o) => {
      globalThis.__vendorWarnings.push(`${o.message} | ${o.detail} | ${o.buttons.join(" / ")}`);
      return { response: r };
    };
  }, response);
const warnings = (app) => app.evaluate(() => globalThis.__vendorWarnings || []);

function lastSupplierWait(logFile) {
  let lines = [];
  try {
    lines = fs.readFileSync(logFile, "utf8").trim().split("\n");
  } catch {
    return null;
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const e = JSON.parse(lines[i]);
      if (e.event === "bridge-supplier-wait") return `${e.ts || i} ${e.detail}`;
    } catch {
      /* a torn line */
    }
  }
  return null;
}

const ERP_STATE = `(() => { const d = cur_frm.doc; return { supplier: d.supplier || "", bill_no: d.bill_no || "", address: (d.address_display || "").replace(/<[^>]*>/g, " ").replace(/\\s+/g, " ").trim() }; })()`;
const billBox = (app) =>
  inDoc(app, `(() => ({ vendor: document.querySelector('[data-testid="bill-vendor"]').value, ref: document.querySelector('[data-testid="bill-ref"]').value, address: document.querySelector('[data-testid="bill-billing-address"]').value.replace(/\\s+/g, " ").trim() }))()`);

async function pickVendor(app, testId, vendor) {
  await focusTestId(app, testId);
  await inDoc(app, `(() => { const i = document.querySelector('[data-testid="${testId}"]'); i.select(); return true; })()`);
  await keys(app, vendor);
  await sleep(600); // the pick list's own debounce, as a clerk's pause
  await keys(app, "\t");
}

test("a vendor switch clears the document first: a slow reply leaves a blank, never the old address", async () => {
  test.setTimeout(300_000);
  const app = await launchShell();
  let clerk = null;
  try {
    await waitForE2eApi(app);
    await expect.poll(() => inErp(app, `!!(window.frappe && frappe.xcall)`), { timeout: 30_000 }).toBe(true);
    await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; }); // leaving: Discard
    clerk = await loginAsProbeUser(app, AP_CLERK.roles, { as: AP_CLERK.name });
    await openNewDoc(app, "bill", "/app/purchase-invoice/new");
    await sleep(2000);
    const logFile = path.join(await app.evaluate(({ app: a }) => a.getPath("userData")), "focus-debug.log");

    // 1. The first pick: no warning, ALPINE's address.
    await answerVendorWarning(app, 0);
    let before = lastSupplierWait(logFile);
    await pickVendor(app, "bill-vendor", WITH_ADDRESS);
    await expect.poll(() => lastSupplierWait(logFile), { timeout: 30_000, intervals: [100] }).not.toBe(before);
    await closeSourcePickers(app);
    await sleep(500);
    const alpine = await inErp(app, ERP_STATE);
    await focusTestId(app, "bill-ref");
    await keys(app, BILL_NO);
    await keys(app, "\t");
    await expect.poll(async () => (await inErp(app, ERP_STATE)).bill_no, { timeout: 15_000 }).toBe(BILL_NO);
    const first = { erp: await inErp(app, ERP_STATE), box: await billBox(app), warnings: await warnings(app) };
    report("1-first-pick", first);

    // 2. Switch, answered Keep.
    await pickVendor(app, "bill-vendor", NO_ADDRESS);
    await expect.poll(async () => (await warnings(app)).length, { timeout: 15_000 }).toBe(1);
    await sleep(1500);
    const kept = { erp: await inErp(app, ERP_STATE), box: await billBox(app), warning: (await warnings(app))[0] };
    report("2-kept", kept);

    // 3. Switch with the reply held past 12 s, answered Change.
    await answerVendorWarning(app, 1);
    await holdPartyDetails(app, HELD_MS);
    before = lastSupplierWait(logFile);
    const t0 = Date.now();
    await pickVendor(app, "bill-vendor", NO_ADDRESS);
    await expect.poll(() => lastSupplierWait(logFile), { timeout: 45_000, intervals: [100] }).not.toBe(before);
    const writeMs = Date.now() - t0;
    const boxAtWriteEnd = await billBox(app);
    await erpUp(app);
    await sleep(Math.max(0, HELD_MS + 2000 - (Date.now() - t0))); // the held reply lands
    await closeSourcePickers(app);
    await sleep(500);
    const changed = { writeMs, boxAtWriteEnd, erp: await inErp(app, ERP_STATE), box: await billBox(app), warnings: await warnings(app) };
    report("3-changed-slow", changed);

    // 4. Back to ALPINE, nothing typed since: no warning; the reply still held past 12 s.
    await holdPartyDetails(app, HELD_MS);
    before = lastSupplierWait(logFile);
    await pickVendor(app, "bill-vendor", WITH_ADDRESS);
    await expect.poll(() => lastSupplierWait(logFile), { timeout: 45_000, intervals: [100] }).not.toBe(before);
    const boxBack = await billBox(app);
    await erpUp(app);
    await holdPartyDetails(app, 0);
    await closeSourcePickers(app);
    await sleep(500);
    const back = { boxAtWriteEnd: boxBack, erp: await inErp(app, ERP_STATE), box: await billBox(app), warnings: await warnings(app) };
    report("4-back-no-warning", back);

    // 1.
    expect(alpine.supplier).toBe(WITH_ADDRESS);
    expect(alpine.address).not.toBe("");
    expect(first.warnings).toEqual([]);
    // 2. Keep: the warning named both vendors and what would clear; nothing changed.
    expect(kept.warning).toContain(`from ${WITH_ADDRESS} to ${NO_ADDRESS}`);
    expect(kept.warning).toContain(BILL_NO);
    expect(kept.warning).toContain(`Keep ${WITH_ADDRESS}`);
    expect(kept.erp).toEqual(first.erp);
    expect(kept.box.vendor).toBe(WITH_ADDRESS);
    expect(kept.box.ref).toBe(BILL_NO);
    // 3. Change: the write waited for the held reply, and nothing of ALPINE's is left.
    expect(changed.warnings.length).toBe(2);
    expect(changed.writeMs).toBeGreaterThanOrEqual(HELD_MS - 1000);
    const alpineStreet = alpine.address.split(" ")[0];
    expect(changed.boxAtWriteEnd.address).not.toContain(alpineStreet);
    expect(changed.boxAtWriteEnd.address).toBe("");
    expect(changed.erp).toEqual({ supplier: NO_ADDRESS, bill_no: "", address: "" });
    expect(changed.box.ref).toBe("");
    // 4. No warning when nothing was typed; ALPINE's address arrives.
    expect(back.warnings.length).toBe(2);
    expect(back.erp.supplier).toBe(WITH_ADDRESS);
    expect(back.erp.address).toBe(alpine.address);
    expect(back.box.address).toContain(alpineStreet);
  } finally {
    await holdPartyDetails(app, 0).catch(() => {});
    await erpUp(app).catch(() => {});
    if (clerk) await clerk.retire().catch((e) => report("retire-failed", String(e)));
    await app.close().catch(() => {});
  }
});

test("the PO the same way: 13 s into a slow switch, ERPNext's form already holds no address", async () => {
  test.setTimeout(180_000);
  const app = await launchShell();
  let clerk = null;
  try {
    await waitForE2eApi(app);
    await expect.poll(() => inErp(app, `!!(window.frappe && frappe.xcall)`), { timeout: 30_000 }).toBe(true);
    await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; }); // leaving: Discard
    clerk = await loginAsProbeUser(app, AP_CLERK.roles, { as: AP_CLERK.name });
    await answerVendorWarning(app, 1); // nothing is typed, so no warning is expected at all
    await openNewDoc(app, "po", "/app/purchase-order/new");
    await expect.poll(() => inDoc(app, `!!document.querySelector('[data-testid="doc-supplier"]')`), { timeout: 30_000 }).toBe(true);
    await sleep(2000);
    await pickVendor(app, "doc-supplier", WITH_ADDRESS);
    await expect.poll(async () => (await inErp(app, ERP_STATE)).address, { timeout: 30_000 }).not.toBe("");
    await closeSourcePickers(app);
    await sleep(1000);
    const poAlpine = await inErp(app, ERP_STATE);
    await holdPartyDetails(app, HELD_MS);
    await pickVendor(app, "doc-supplier", NO_ADDRESS);
    await sleep(13_000);
    const poMid = await inErp(app, ERP_STATE);
    await erpUp(app);
    await sleep(HELD_MS + 2000 - 13_000); // the held reply lands
    await expect.poll(async () => (await inErp(app, ERP_STATE)).supplier, { timeout: 30_000 }).toBe(NO_ADDRESS);
    const poEnd = await inErp(app, ERP_STATE);
    const poWarnings = await warnings(app);
    report("5-po", { poAlpine, poMid, poEnd, poWarnings });

    expect(poAlpine.address).not.toBe("");
    expect(poMid.address).toBe("");
    expect(poEnd.address).toBe("");
    expect(poWarnings).toEqual([]);
  } finally {
    await holdPartyDetails(app, 0).catch(() => {});
    await erpUp(app).catch(() => {});
    if (clerk) await clerk.retire().catch((e) => report("retire-failed", String(e)));
    await app.close().catch(() => {});
  }
});
