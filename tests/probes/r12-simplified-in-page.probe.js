/**
 * Review 10-19 R12-1: the Simplified lens on a new Bill in Vanilla, left by an **in-page** hop
 * (to the Supplier list — no reload, so the shell tears the skin down in place), then back to a new
 * Bill in the same page. Questions: after the hop, is the Bill form's Vanilla back (its tabs show
 * one pane, its tab links carry Frappe's own click handler again)? Back on a new Bill, is the skin
 * applied again (an assumed field carries the assumption note), or does the skin say it is installed
 * while ERPNext's refresh still calls the copy that was torn down? Makes no records (new Bills are
 * never saved; lens-prefs.json is restored by `npm run probe`). Then two more round trips: the skin's
 * posting-stamp hook is added to ERPNext's page once, not once per copy (museum OI-207, G29).
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi, e2eCall } from "../../e2e/helpers.js";
import { inErp, report, settle } from "./probe-helpers.js";

/** What the page shows of the skin, on the Bill form Frappe keeps for this page. */
const STATE = `(() => {
  const fv = frappe.views && frappe.views.formview && frappe.views.formview["Purchase Invoice"];
  const frm = fv && fv.frm;
  const df = frm && frm.get_docfield && frm.get_docfield("apply_tds");
  const tabs = (frm && frm.layout && frm.layout.tabs) || [];
  const panes = tabs.filter((t) => t && t.wrapper && t.wrapper.get(0)).map((t) => t.wrapper.get(0));
  const link = tabs[0] && tabs[0].tab_link ? tabs[0].tab_link.find(".nav-link").get(0) : null;
  const ev = link && window.jQuery ? (jQuery._data(link, "events") || {}).click || [] : [];
  return {
    route: frappe.get_route_str(),
    installed: !!window.__simplifiedSkin,
    note: !!(df && /general assumption/.test(df.description || "")),
    forcedPanes: panes.filter((p) => p.style.display === "block").length,
    panes: panes.length,
    clickHandlers: ev.map((h) => h.namespace || "frappe"),
    validateHandlers: (((frappe.ui.form.handlers || {})["Purchase Invoice"] || {}).validate || []).length,
  };
})()`;

test("R12-1: Simplified leaves cleanly in-page and applies again on the way back", async () => {
  test.setTimeout(4 * 60_000);
  const app = await launchShell();
  try {
    await waitForE2eApi(app);
    await e2eCall(app, "setLensPref", "purchase-invoice", "simplified");
    await e2eCall(app, "openErp", "/app/purchase-invoice/new");
    await expect.poll(async () => (await inErp(app, STATE).catch(() => null)) || {}, { timeout: 40_000 }).toMatchObject({ installed: true, note: true });
    const on = await inErp(app, STATE);
    report("simplified", on);

    await inErp(app, `(() => { frappe.set_route("app", "supplier"); return true; })()`);
    await expect.poll(async () => (await inErp(app, STATE)).installed, { timeout: 20_000 }).toBe(false);
    await settle();
    const away = await inErp(app, STATE);
    report("away", away);

    await inErp(app, `(() => { frappe.new_doc("Purchase Invoice"); return true; })()`);
    await expect.poll(async () => (await inErp(app, STATE).catch(() => null)) || {}, { timeout: 15_000 }).toMatchObject({ installed: true, note: true }).catch(() => {});
    const back = await inErp(app, STATE);
    report("back", back);
    // Another new Bill straight from this one: the skin is installed, so a re-inject returns at
    // once — only ERPNext's refresh (the patched hook) can apply it to the new document.
    await inErp(app, `(() => { frappe.new_doc("Purchase Invoice"); return true; })()`);
    await expect.poll(async () => (await inErp(app, STATE).catch(() => null)) || {}, { timeout: 15_000 }).toMatchObject({ installed: true, note: true }).catch(() => {});
    const again = await inErp(app, STATE);
    report("again", again);

    // Two more round trips: each comes back to a fresh copy of the skin, and Frappe keeps every
    // form handler for the life of the page (gotchas G29), so a copy that added its own posting-stamp
    // validate handler left one more behind each time.
    for (let trip = 1; trip <= 2; trip += 1) {
      await inErp(app, `(() => { frappe.set_route("app", "supplier"); return true; })()`);
      await expect.poll(async () => (await inErp(app, STATE)).installed, { timeout: 20_000 }).toBe(false);
      await inErp(app, `(() => { frappe.new_doc("Purchase Invoice"); return true; })()`);
      await expect.poll(async () => (await inErp(app, STATE).catch(() => null)) || {}, { timeout: 15_000 }).toMatchObject({ installed: true, note: true }).catch(() => {});
    }
    const trips = await inErp(app, STATE);
    report("after two more round trips", trips);

    // And the one hook still stamps: ERPNext's validate step (run here without saving) puts a
    // typed posting date back to today and unticks Edit Posting Date.
    const stamp = await inErp(
      app,
      `(() => { const f = cur_frm; f.doc.set_posting_time = 1; f.doc.posting_date = frappe.datetime.add_days(frappe.datetime.get_today(), -3); (frappe.ui.form.handlers["Purchase Invoice"].validate || []).forEach((h) => { try { h(f); } catch (e) {} }); return { today: frappe.datetime.get_today(), posting: f.doc.posting_date, tick: f.doc.set_posting_time }; })()`,
    );
    report("stamp after the round trips", stamp);

    expect.soft(trips.validateHandlers, "Purchase Invoice validate handlers after three round trips").toBe(on.validateHandlers);
    expect.soft(stamp, "the posting stamp").toEqual({ today: stamp.today, posting: stamp.today, tick: 0 });
    expect(away.forcedPanes).toBe(0);
    expect(away.clickHandlers).toContain("frappe");
    expect(back).toMatchObject({ installed: true, note: true });
    expect(again).toMatchObject({ installed: true, note: true });
  } finally {
    await app.close().catch(() => {});
  }
});
