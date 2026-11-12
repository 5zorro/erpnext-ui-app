/**
 * The bridge's waits for a form do not pile hooks onto ERPNext's page (museum OI-207, gotchas G29).
 * `waitForForm` used to register its own `frappe.ui.form.on` refresh / onload handlers and a
 * `frappe.router.on("change")` handler on every wait that had to wait; Frappe keeps both for the
 * life of the page (and cannot remove a router handler). And one wait ending removed every wait's
 * jQuery handlers (`.off(".docFormBridge")`), so a longer wait still running lost its own. Now the
 * hooks are registered once per page (the form ones once per doctype), shared by every wait.
 *
 * Measured on the old code 2026-11-03: the clerk's usual opens leak nothing. A saved document opens
 * by reloading ERPNext's page, and a New makes its blank before the wait starts, so the wait
 * resolves at once. A wait that waits on an in-place page (the Doc page taking its form back after a
 * peek or a Vanilla detour) leaks. So the first test drives the bridge's waits directly; the second
 * keeps the usual opens honest.
 *
 * Acts as the AP clerk. Makes no records.
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi, e2eCall } from "../../e2e/helpers.js";
import { inDoc, inErp, openNewDoc, report, docQuiet, sleep } from "./probe-helpers.js";
import { loginAsProbeUser, AP_CLERK } from "./probe-user.js";

const COUNT_JS = `(() => {
  const h = (window.frappe && frappe.ui && frappe.ui.form && frappe.ui.form.handlers["Purchase Invoice"]) || {};
  const ev = (el, name) => { try { const e = jQuery._data(el, "events"); return e && e[name] ? e[name].length : 0; } catch (x) { return -1; } };
  return {
    refresh: (h.refresh || []).length,
    onload: (h.onload || []).length,
    routerChange: frappe.router && frappe.router.jq ? ev(frappe.router.jq[0], "change") : -1,
    formLoad: ev(document, "form-load"),
    name: (window.cur_frm && cur_frm.doc && cur_frm.doc.name) || "",
  };
})()`;

const PO_HOOKS_JS = `(() => {
  const h = (frappe.ui.form.handlers["Purchase Order"]) || {};
  const ev = (el, name) => { try { const e = jQuery._data(el, "events"); return e && e[name] ? e[name].length : 0; } catch (x) { return -1; } };
  return { refresh: (h.refresh || []).length, onload: (h.onload || []).length, routerChange: ev(frappe.router.jq[0], "change"), formLoad: ev(document, "form-load") };
})()`;

test("ten waits for a form that is not coming add the hooks once, and one ending leaves the others theirs", async () => {
  test.setTimeout(180_000);
  let app = null;
  let clerk = null;
  try {
    app = await launchShell();
    await waitForE2eApi(app);
    await expect.poll(() => inErp(app, `!!(window.frappe && frappe.xcall)`), { timeout: 30_000 }).toBe(true);
    clerk = await loginAsProbeUser(app, AP_CLERK.roles, { as: AP_CLERK.name });
    await openNewDoc(app, "bill", "/app/purchase-invoice/new");
    await docQuiet(app);
    await expect.poll(() => inErp(app, `!!(window.__docFormBridge && __docFormBridge.waitForForm)`), { timeout: 15_000 }).toBe(true);

    // On a Bill, wait for a Purchase Order ten times, each giving up after 150 ms.
    const before = await inErp(app, PO_HOOKS_JS, 4000);
    report("before", before);
    const answers = await inErp(app, `(async () => { const out = []; for (let i = 0; i < 10; i += 1) out.push((await __docFormBridge.waitForForm("Purchase Order", 150)).ok); return out; })()`, 15_000);
    const after = await inErp(app, PO_HOOKS_JS, 4000);
    report("after ten waits", { answers, after });
    expect(answers).toEqual(Array(10).fill(false));
    expect.soft(after.refresh - before.refresh, "Purchase Order refresh handlers added").toBeLessThanOrEqual(1);
    expect.soft(after.onload - before.onload, "Purchase Order onload handlers added").toBeLessThanOrEqual(1);
    expect.soft(after.routerChange - before.routerChange, "router change handlers added").toBeLessThanOrEqual(1);

    // A long wait and a short one together: when the short one gives up, the long one keeps its hooks.
    const overlap = await inErp(
      app,
      `(async () => {
        const long = __docFormBridge.waitForForm("Purchase Order", 3000);
        await __docFormBridge.waitForForm("Purchase Order", 150);
        // The bridge's own (namespaced) form-load handlers; ERPNext has its own too.
        const ours = () => { try { const e = jQuery._data(document, "events"); return ((e && e["form-load"]) || []).filter((h) => /docFormBridge/.test(h.namespace || "")).length; } catch (x) { return -1; } };
        const whileLong = ours();
        await long;
        return { whileLong };
      })()`,
      15_000,
    );
    report("form-load handlers while the long wait runs", overlap);
    expect.soft(overlap.whileLong, "the bridge's form-load handlers while the long wait runs").toBeGreaterThanOrEqual(1);
  } finally {
    if (clerk) await clerk.retire().catch((e) => report("retire-failed", String(e)));
    if (app) await app.close().catch(() => {});
  }
});

test("the usual opens, saved Bills and News in turn, add no hooks to ERPNext's page", async () => {
  test.setTimeout(240_000);
  let app = null;
  let clerk = null;
  try {
    app = await launchShell();
    await waitForE2eApi(app);
    await expect.poll(() => inErp(app, `!!(window.frappe && frappe.xcall)`), { timeout: 30_000 }).toBe(true);
    clerk = await loginAsProbeUser(app, AP_CLERK.roles, { as: AP_CLERK.name });
    await openNewDoc(app, "bill", "/app/purchase-invoice/new");
    await docQuiet(app);

    // Saved Bills the clerk can read: opening one moves ERPNext's page in place (set_route, no
    // reload), so the bridge waits for its form. A New makes its blank before the wait starts.
    const names = await inErp(app, `frappe.xcall("frappe.client.get_list", { doctype: "Purchase Invoice", fields: ["name"], order_by: "modified desc", limit_page_length: 4 }).then((r) => r.map((x) => x.name))`, 15_000);
    report("saved bills", names);
    expect(Array.isArray(names) && names.length >= 2, "two saved Bills to open").toBe(true);

    const opens = [];
    for (let i = 0; i < 8; i += 1) opens.push(i % 3 === 2 ? "new" : names[i % names.length]);
    const counts = [];
    for (const [i, which] of opens.entries()) {
      const before = ((await inErp(app, COUNT_JS, 4000)) || {}).name;
      if (which === "new") await inDoc(app, `(window.erpDoc.newDoc(), true)`, 2000);
      else await e2eCall(app, "openBill", `/app/purchase-invoice/${encodeURIComponent(which)}`);
      // Done when ERPNext shows another form than before, and the page has settled.
      await expect.poll(async () => ((await inErp(app, COUNT_JS, 4000)) || {}).name, { timeout: 30_000 }).not.toBe(before);
      await docQuiet(app);
      await sleep(500);
      const c = await inErp(app, COUNT_JS, 4000);
      report(`after open ${i + 1} (${which})`, c);
      counts.push(c);
    }
    const shape = (c) => ({ refresh: c.refresh, onload: c.onload, routerChange: c.routerChange, formLoad: c.formLoad });
    for (let i = 1; i < counts.length; i += 1) expect(shape(counts[i]), `open ${i + 1}`).toEqual(shape(counts[0]));
  } finally {
    if (clerk) await clerk.retire().catch((e) => report("retire-failed", String(e)));
    if (app) await app.close().catch(() => {});
  }
});
