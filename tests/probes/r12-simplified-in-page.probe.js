/**
 * Review 10-19 R12-1: the Simplified lens on a new Bill in Vanilla, left by an **in-page** hop
 * (to the Supplier list — no reload, so the shell tears the skin down in place), then back to a new
 * Bill in the same page. Questions: after the hop, is the Bill form's Vanilla back (its tabs show
 * one pane, its tab links carry Frappe's own click handler again)? Back on a new Bill, is the skin
 * applied again (an assumed field carries the assumption note), or does the skin say it is installed
 * while ERPNext's refresh still calls the copy that was torn down? Makes no records (new Bills are
 * never saved; lens-prefs.json is restored by `npm run probe`).
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi, e2eCall } from "../../e2e/helpers.js";
import { sleep, inErp, report } from "./probe-helpers.js";

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
    await sleep(1500);
    const away = await inErp(app, STATE);
    report("away", away);

    await inErp(app, `(() => { frappe.new_doc("Purchase Invoice"); return true; })()`);
    await sleep(6000);
    const back = await inErp(app, STATE);
    report("back", back);
    // Another new Bill straight from this one: the skin is installed, so a re-inject returns at
    // once — only ERPNext's refresh (the patched hook) can apply it to the new document.
    await inErp(app, `(() => { frappe.new_doc("Purchase Invoice"); return true; })()`);
    await sleep(6000);
    const again = await inErp(app, STATE);
    report("again", again);

    expect(away.forcedPanes).toBe(0);
    expect(away.clickHandlers).toContain("frappe");
    expect(back).toMatchObject({ installed: true, note: true });
    expect(again).toMatchObject({ installed: true, note: true });
  } finally {
    await app.close().catch(() => {});
  }
});
