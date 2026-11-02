/**
 * Plan 10-25 step 3b, finding 1: picking a vendor with no address on file held the Bill's header
 * write for ~9 s: the bridge waited for an address that was never coming. The source picker opens
 * at once either way (~0.1 s); what waited was the write itself, so the clerk saw "Setting vendor…"
 * and the vendor's terms and due date ~9 s late. Questions, as the AP clerk typing a vendor and
 * Tabbing on a new Bill: how long until the header write ends (`bridge-supplier-wait` in the run's
 * focus log, which also says what the wait ended on), and is the Remittance & Billing Address
 * right afterwards: empty for a vendor with none, the address for one with it, and emptied again
 * when the next vendor has none. Then the same two kinds of vendor with ERPNext's vendor-details
 * reply held back 4 s (a slow server): the write must still wait for that reply, and the address
 * must still arrive, so "ERPNext has gone quiet" cannot fire before the reply lands. A re-pick of the same vendor is not asked: main.js skips the
 * write when the vendor has not changed. Saves nothing; makes no records.
 */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { launchShell, waitForE2eApi } from "../../e2e/helpers.js";
import { sleep, keys, inDoc, inErp, focusTestId, openNewDoc, report, closeSourcePickers, erpUp, docQuiet, settle } from "./probe-helpers.js";
import { loginAsProbeUser, AP_CLERK } from "./probe-user.js";

const NO_ADDRESS = "SUMMIT TRADERS";
const WITH_ADDRESS = "ALPINE SUPPLY CO";
const NO_ADDRESS_2 = "ZZ DF BRIDGE";
const PICKER_OPEN = `!!document.querySelector(".src-back:not([hidden])")`;
const PARTY_DETAILS = "erpnext.accounts.party.get_party_details";
const SLOW_MS = 4000;

/** ERPNext's vendor-details reply is held back `ms` (the request waits before it is sent). */
const slowPartyDetails = (app, ms) =>
  app.evaluate(({ session }, [part, wait]) => {
    session.defaultSession.webRequest.onBeforeRequest((d, cb) => {
      if (d.url.includes(part)) setTimeout(() => cb({}), wait);
      else cb({});
    });
  }, [PARTY_DETAILS, ms]);

/** The last `bridge-supplier-wait` line in this run's focus log (how the bridge's wait ended). */
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
      if (e.event === "bridge-supplier-wait") return e.detail;
    } catch {
      /* a torn line */
    }
  }
  return null;
}

test("a vendor with no address: the header write ends without a long wait, and the address is right", async () => {
  test.setTimeout(240_000);
  const app = await launchShell();
  let clerk = null;
  try {
    await waitForE2eApi(app);
    await expect.poll(() => inErp(app, `!!(window.frappe && frappe.xcall)`), { timeout: 30_000 }).toBe(true);
    await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; }); // leaving: Discard
    clerk = await loginAsProbeUser(app, AP_CLERK.roles, { as: AP_CLERK.name });
    await openNewDoc(app, "bill", "/app/purchase-invoice/new");
    await docQuiet(app);
    const logFile = path.join(await app.evaluate(({ app: a }) => a.getPath("userData")), "focus-debug.log");

    const results = [];
    const picks = [
      { vendor: NO_ADDRESS },
      { vendor: WITH_ADDRESS },
      { vendor: NO_ADDRESS_2 },
      { vendor: WITH_ADDRESS, slow: true },
      { vendor: NO_ADDRESS, slow: true },
    ];
    for (const { vendor, slow } of picks) {
      if (slow) await slowPartyDetails(app, SLOW_MS);
      const before = lastSupplierWait(logFile);
      await focusTestId(app, "bill-vendor");
      await inDoc(app, `(() => { const i = document.querySelector('[data-testid="bill-vendor"]'); i.select(); return true; })()`);
      await keys(app, `${vendor}`);
      await sleep(600); // the pick list's own debounce, as a clerk's pause
      await keys(app, "\t");
      const t0 = Date.now();
      await expect.poll(() => inDoc(app, PICKER_OPEN), { timeout: 20_000, intervals: [100] }).toBe(true);
      const pickerMs = Date.now() - t0;
      await expect.poll(() => lastSupplierWait(logFile), { timeout: 20_000, intervals: [100] }).not.toBe(before);
      const bridgeMs = Date.now() - t0;
      if (slow) await erpUp(app);
      const erp = await inErp(app, `(() => { const d = cur_frm.doc; return { supplier: d.supplier, supplier_address: d.supplier_address || "", address: (d.address_display || "").replace(/<[^>]*>/g, " ").replace(/\\s+/g, " ").trim() }; })()`);
      await closeSourcePickers(app);
      await settle();
      const box = await inDoc(app, `document.querySelector('[data-testid="bill-billing-address"]').value.replace(/\\s+/g, " ").trim()`);
      const row = { vendor, slow: !!slow, pickerMs, bridgeMs, bridgeWait: lastSupplierWait(logFile), erp, box };
      report("pick", row);
      results.push(row);
    }

    const [none, withAddr, noneAfter, slowAddr, slowNone] = results;
    for (const r of results) expect(r.erp.supplier).toBe(r.vendor);
    for (const r of [withAddr, slowAddr]) {
      expect(r.erp.address).not.toBe("");
      expect(r.box).toContain(r.erp.address.split(" ")[0]);
      expect(r.bridgeWait).toMatch(/^address_display/);
    }
    for (const r of [none, noneAfter, slowNone]) {
      expect(r.erp.supplier_address).toBe("");
      expect(r.erp.address).toBe("");
      expect(r.box).toBe("");
    }
    // The header write after a vendor with no address ends about as fast as after one with an
    // address (it took ~9 s before plan 10-25 3b's fix). The picker never waited on it.
    for (const r of [none, noneAfter]) expect(r.bridgeMs).toBeLessThan(3_000);
    // A slow reply is waited for, and a vendor with no address ends soon after it lands.
    for (const r of [slowAddr, slowNone]) expect(r.bridgeMs).toBeGreaterThanOrEqual(SLOW_MS);
    expect(slowNone.bridgeMs).toBeLessThan(SLOW_MS + 3_000);
  } finally {
    await erpUp(app).catch(() => {});
    if (clerk) await clerk.retire().catch((e) => report("retire-failed", String(e)));
    await app.close().catch(() => {});
  }
});
