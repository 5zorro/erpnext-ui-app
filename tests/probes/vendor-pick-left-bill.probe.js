/**
 * A vendor picked on a new Bill is never written to another Bill the clerk opened while the pick
 * was still checking (plan 2026-10-25 closeout, item 8; 5zorro: "it is probably redundant to the
 * dirty gate, but in situations where im switching between submitted bills, it might surface").
 *
 * The pick first asks ERPNext whether the vendor still exists (`linkExists`), then clears the Bill
 * if the vendor changes (museum OI-200), then writes the vendor. This probe holds that first
 * question's reply in flight (the one `frappe.client.get_list` request naming the vendor), opens
 * another Bill from Recent's door meanwhile — answering Discard if the unsaved-changes gate asks —
 * then lets the reply go. Opening a saved Bill reloads the ERPNext page, which ends the held
 * question anyway, so the pick goes on at once. The pick must notice the page has moved to another
 * open (`openToken`, `vendor-pick-dropped` in the focus trail) and stop: the Bill now open keeps
 * its vendor and its lines, and ERPNext's form of it stays unchanged.
 *
 * Two Bills to open mid-pick: a saved draft (the harmful case: the switch would clear its lines)
 * and a submitted one. Acts as the AP clerk. Makes one draft Bill (bill no. `ZZ-PICK-LEFT-…`, as
 * Administrator, before the clerk signs in) and deletes it at the end; nothing else is saved.
 */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { launchShell, waitForE2eApi, e2eCall } from "../../e2e/helpers.js";
import { inDoc, inErp, openNewDoc, report, docQuiet, sleep, keys, searchDone, warmCopies, focusTestId, erpUp } from "./probe-helpers.js";
import { loginAsProbeUser, AP_CLERK } from "./probe-user.js";

/** Hold every request to ERPNext whose URL has `urlPart` and whose body names `bodyPart`. */
const holdRequests = (app, urlPart, bodyPart) =>
  app.evaluate(({ session }, [u, b]) => {
    globalThis.__probeHeld = [];
    session.defaultSession.webRequest.onBeforeRequest((d, cb) => {
      if (d.url.includes(u)) {
        const body = (d.uploadData || []).map((x) => (x.bytes ? Buffer.from(x.bytes).toString("utf8") : "")).join("");
        let text = body;
        try {
          text = decodeURIComponent(body.replace(/\+/g, " "));
        } catch {
          /* keep it raw */
        }
        if (text.includes(b)) {
          globalThis.__probeHeld.push(cb);
          return;
        }
      }
      cb({});
    });
  }, [urlPart, bodyPart]);
const heldCount = (app) => app.evaluate(() => (globalThis.__probeHeld || []).length);
const releaseHeld = (app) =>
  app.evaluate(() => {
    for (const cb of (globalThis.__probeHeld || []).splice(0)) cb({});
  });

/** ERPNext's open form: which Bill, its vendor, its line count, whether it has unsaved changes. */
const erpForm = (app) =>
  inErp(app, `(() => { const d = window.cur_frm && cur_frm.doc; return d ? { name: d.name, supplier: d.supplier || "", lines: (d.items || []).length, unsaved: !!d.__unsaved, docstatus: d.docstatus } : null; })()`, 4000);

function focusTrail(userData) {
  try {
    return fs.readFileSync(path.join(userData, "focus-debug.log"), "utf8").split("\n").filter((l) => l.includes("vendor-pick-dropped"));
  } catch {
    return [];
  }
}

for (const kind of ["draft", "submitted"]) {
  test(`a vendor pick still checking when a ${kind} Bill is opened is not written to it`, async () => {
    test.setTimeout(180_000);
    let app = null;
    let clerk = null;
    let draft = "";
    try {
      app = await launchShell();
      await waitForE2eApi(app);
      await expect.poll(() => inErp(app, `!!(window.frappe && frappe.xcall)`), { timeout: 30_000 }).toBe(true);
      if (kind === "draft") {
        // The sandbox has no draft Bill with a vendor: make one, as Administrator.
        draft = await inErp(
          app,
          `frappe.xcall("frappe.client.insert", { doc: { doctype: "Purchase Invoice", supplier: "ALPINE SUPPLY CO", bill_no: "ZZ-PICK-LEFT-" + Date.now(), items: [{ item_code: "SAMPLE-SKU-01", qty: 1, rate: 10 }] } }).then((d) => d.name)`,
          30_000,
        );
        report("draft made", draft);
      }
      clerk = await loginAsProbeUser(app, AP_CLERK.roles, { as: AP_CLERK.name });
      const userData = await app.evaluate(({ app: a }) => a.getPath("userData"));

      const target = await inErp(
        app,
        kind === "draft"
          ? `frappe.xcall("frappe.client.get_value", { doctype: "Purchase Invoice", filters: { name: ${JSON.stringify(draft || "")} }, fieldname: ["name", "supplier"] })`
          : `frappe.xcall("frappe.client.get_list", { doctype: "Purchase Invoice", filters: { docstatus: 1, supplier: ["is", "set"] }, fields: ["name", "supplier"], order_by: "modified desc", limit_page_length: 1 }).then((r) => r[0] || null)`,
        15_000,
      );
      const vendors = await inErp(app, `frappe.xcall("frappe.client.get_list", { doctype: "Supplier", filters: { disabled: 0 }, fields: ["name"], order_by: "name asc", limit_page_length: 10 }).then((r) => r.map((x) => x.name))`, 15_000);
      expect(target, `a ${kind} Bill with a vendor to open`).toBeTruthy();
      const vendor = vendors.find((v) => v !== target.supplier);
      report("scene", { target, vendor });

      await openNewDoc(app, "bill", "/app/purchase-invoice/new");
      await docQuiet(app);
      await warmCopies(app, ["Supplier"]);
      const before = await (async () => {
        await openNewDoc(app, "bill", `/app/purchase-invoice/${encodeURIComponent(target.name)}`);
        await docQuiet(app);
        return erpForm(app);
      })();
      report("target as saved", before);
      await openNewDoc(app, "bill", "/app/purchase-invoice/new");
      await docQuiet(app);

      // Pick the vendor, holding its "does it exist" question.
      await focusTestId(app, "bill-vendor");
      await keys(app, vendor);
      await searchDone(app);
      await holdRequests(app, "frappe.client.get_list", vendor);
      await keys(app, "\n");
      await expect.poll(() => heldCount(app), { timeout: 10_000, message: "the vendor check was held" }).toBeGreaterThan(0);

      // Open the other Bill meanwhile; answer Discard if the gate asks.
      await e2eCall(app, "openBill", `/app/purchase-invoice/${encodeURIComponent(target.name)}`);
      let gate = false;
      for (let i = 0; i < 150; i += 1) {
        const clicked = await inDoc(app, `(() => { const b = document.querySelector('[data-testid="doc-gate-discard"]'); if (b && b.offsetParent) { b.click(); return true; } return false; })()`, 2000);
        if (clicked === true) gate = true;
        const f = await erpForm(app);
        if (f && f.name === target.name) break;
        await sleep(100);
      }
      report("the gate asked", gate);
      await releaseHeld(app);
      await erpUp(app);
      await docQuiet(app);
      // The pick goes on as soon as its question ends; give it the time a write would take.
      await sleep(3000);
      await docQuiet(app);

      const after = await erpForm(app);
      const box = await inDoc(app, `(() => { const v = document.querySelector('[data-testid="bill-vendor"]'); return v ? v.value : null; })()`, 2000);
      const dropped = focusTrail(userData);
      report("after", { erp: after, vendorBox: box, dropped });
      expect(after && after.name, "ERPNext shows the Bill opened").toBe(target.name);
      expect.soft(after && after.supplier, "its vendor").toBe(target.supplier);
      expect.soft(after && after.lines, "its lines").toBe(before && before.lines);
      expect.soft(after && after.unsaved, "no unsaved change in ERPNext's form").toBe(false);
    } finally {
      if (app) await erpUp(app).catch(() => {});
      if (clerk) await clerk.retire().catch((e) => report("retire-failed", String(e)));
      if (app && draft) {
        // Back as Administrator: the Doc page may hold the draft open, so leave it first.
        await e2eCall(app, "openBill", "/app/purchase-invoice/new").catch(() => {});
        await sleep(3000);
        report("draft deleted", await inErp(app, `frappe.xcall("frappe.client.delete", { doctype: "Purchase Invoice", name: ${JSON.stringify(draft)} }).then(() => "deleted", (e) => String(e && e.message || e))`, 20_000).catch((e) => String(e)));
      }
      if (app) await app.close().catch(() => {});
    }
  });
}
