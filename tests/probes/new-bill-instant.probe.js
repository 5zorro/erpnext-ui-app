/**
 * How long a new Bill takes to be ready for typing, from each door a clerk uses: Home's New Bill
 * tile, and New on a Bill. For each: when the page first showed the blank Bill unblocked, when the
 * cursor reached Vendor, and the trail between (what the wait is made of). 5zorro 2026-11-03: a new
 * Bill should wait on no ERPNext reply for its first paint and the cursor in Vendor.
 *
 * The baseline it competes against (5zorro: "a baseline that we are competing against"): ERPNext's
 * own page doing the same job, timed the same way — the Purchase Invoice list's "+ Add" button
 * (`frappe.new_doc`, the blank built in the page), and a full load of `/app/purchase-invoice/new`
 * (a typed URL, a refresh). For each: when the blank form showed, and when the cursor was in one
 * of its fields (`-` when Vanilla puts it nowhere).
 *
 * Acts as the AP clerk. Makes no records.
 */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { launchShell, waitForE2eApi, e2eCall } from "../../e2e/helpers.js";
import { inDoc, inErp, openNewDoc, report, docQuiet, sleep } from "./probe-helpers.js";
import { loginAsProbeUser, AP_CLERK } from "./probe-user.js";

const state = (app) =>
  inDoc(
    app,
    `(() => { const v = document.querySelector('[data-testid="bill-vendor"]'); return { blocked: document.body.classList.contains("blocked"), focus: document.activeElement === v, enabled: !!v && !v.disabled }; })()`,
    2000,
  );

/** Poll the page from `t0` until the cursor is in Vendor; first times each state was seen. */
async function watch(app, t0, ms = 30_000) {
  const seen = { blocked: null, unblocked: null, focus: null };
  let sawBlocked = false;
  while (Date.now() - t0 < ms) {
    const s = await state(app);
    const at = Date.now() - t0;
    if (s && typeof s === "object") {
      if (s.blocked && seen.blocked == null) {
        seen.blocked = at;
        sawBlocked = true;
      }
      if (!s.blocked && sawBlocked && seen.unblocked == null) seen.unblocked = at;
      if (s.focus && !s.blocked && (sawBlocked || at > 300)) {
        seen.focus = at;
        break;
      }
    }
    await sleep(20);
  }
  return seen;
}

/** What ERPNext's own page shows: a blank Purchase Invoice other than `notName`, and where the cursor is. */
const vanillaState = (app, notName) =>
  inErp(
    app,
    `(() => { const f = window.cur_frm; const d = f && f.doc; const a = document.activeElement; const shown = !!(d && d.doctype === "Purchase Invoice" && d.__islocal && d.name !== ${JSON.stringify(notName || "")} && f.$wrapper && f.$wrapper.is(":visible") && /purchase-invoice\\/new/.test(location.pathname)); return { shown, name: d ? d.name : "", focus: shown && !!(a && a.closest && a.closest(".form-layout") && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) ? (a.getAttribute("data-fieldname") || a.tagName) : "" }; })()`,
    2000,
  );

/** Poll ERPNext's page from `t0` until the blank form shows (then up to 1.5 s more for a cursor). */
async function watchVanilla(app, t0, notName, ms = 30_000) {
  const seen = { shown: null, focus: null, field: "" };
  while (Date.now() - t0 < ms) {
    const s = await vanillaState(app, notName);
    const at = Date.now() - t0;
    if (s && typeof s === "object" && s.shown) {
      if (seen.shown == null) seen.shown = at;
      if (s.focus) {
        seen.focus = at;
        seen.field = s.focus;
        break;
      }
      if (at - seen.shown > 1500) break;
    }
    await sleep(20);
  }
  return seen;
}

function trailSince(userData, t0) {
  const out = [];
  for (const file of ["nav-debug.log"]) {
    let text = "";
    try {
      text = fs.readFileSync(path.join(userData, file), "utf8");
    } catch {
      continue;
    }
    for (const l of text.split("\n")) {
      if (!l) continue;
      try {
        const e = JSON.parse(l);
        const at = Date.parse(e.at) - t0;
        if (at >= -50) out.push(`${String(at).padStart(6)} ${e.event} ${String(e.detail || "").slice(0, 120)}`);
      } catch {
        /* a partial line */
      }
    }
  }
  return out;
}

test("new Bill: time to the cursor in Vendor, from Home and from New", async () => {
  test.setTimeout(240_000);
  let app = null;
  let clerk = null;
  try {
    app = await launchShell();
    await waitForE2eApi(app);
    await expect.poll(() => inErp(app, `!!(window.frappe && frappe.xcall)`), { timeout: 30_000 }).toBe(true);
    clerk = await loginAsProbeUser(app, AP_CLERK.roles, { as: AP_CLERK.name });
    const userData = await app.evaluate(({ app: a }) => a.getPath("userData"));
    // A first Bill, so the page and the copies are warm, as for a clerk mid-morning.
    await openNewDoc(app, "bill", "/app/purchase-invoice/new");
    await docQuiet(app);
    await sleep(3000);

    for (let round = 1; round <= 2; round += 1) {
      // New on a Bill.
      let t0 = Date.now();
      await inDoc(app, `(window.erpDoc.newDoc(), true)`, 2000);
      let seen = await watch(app, t0);
      report(`new-on-bill ${round}`, seen);
      report(`new-on-bill ${round} trail`, trailSince(userData, t0));
      await docQuiet(app);
      await sleep(2000);

      // Home, then the New Bill tile.
      await e2eCall(app, "goHome");
      await sleep(2000);
      t0 = Date.now();
      await e2eCall(app, "execInView", "home", `(window.erpHome.openEntry("purchase-invoice"), true)`);
      seen = await watch(app, t0);
      report(`home-tile ${round}`, seen);
      report(`home-tile ${round} trail`, trailSince(userData, t0));
      await docQuiet(app);
      await sleep(2000);
    }

    // The baseline: ERPNext's own page, in Vanilla.
    await e2eCall(app, "openErp", "/app/purchase-invoice");
    await expect.poll(() => inErp(app, `!!(window.cur_list && cur_list.doctype === "Purchase Invoice" && [...document.querySelectorAll(".primary-action")].some((b) => b.offsetParent))`), { timeout: 30_000 }).toBe(true);
    await sleep(2000);
    for (let round = 1; round <= 2; round += 1) {
      const before = await vanillaState(app, "");
      let t0 = Date.now();
      await inErp(app, `([...document.querySelectorAll(".primary-action")].find((b) => b.offsetParent).click(), true)`, 2000);
      report(`vanilla add-button ${round}`, await watchVanilla(app, t0, before && before.name));
      await sleep(2000);
      // Leave the blank untouched and go back to the list, as a clerk would before the next one.
      await inErp(app, `(() => { const f = window.cur_frm; if (f && f.doc && f.doc.__islocal) { f.doc.__unsaved = 0; frappe.model.clear_doc(f.doctype, f.doc.name); } frappe.set_route("List", "Purchase Invoice"); return true; })()`, 4000);
      await sleep(2000);

      t0 = Date.now();
      await inErp(app, `(location.assign("/app/purchase-invoice/new"), true)`, 2000).catch(() => {});
      report(`vanilla url-load ${round}`, await watchVanilla(app, t0, ""));
      await sleep(2000);
      await inErp(app, `(() => { const f = window.cur_frm; if (f && f.doc && f.doc.__islocal) { f.doc.__unsaved = 0; frappe.model.clear_doc(f.doctype, f.doc.name); } frappe.set_route("List", "Purchase Invoice"); return true; })()`, 4000);
      await sleep(2000);
    }
  } finally {
    if (clerk) await clerk.retire().catch((e) => report("retire-failed", String(e)));
    if (app) await app.close().catch(() => {});
  }
});

