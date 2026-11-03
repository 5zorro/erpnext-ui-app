/**
 * Bill: a Payment terms name typed in full and left without picking from the list is written
 * (museum OI-196). Before, the box's `change` handler called `isCreatePaymentTermsLinkAction`,
 * which the Bill page never imported: the handler threw, the typed name was never written, and
 * nothing said so. Found by the no-undef check, not by a clerk.
 *
 * New Bill, vendor picked, then the terms box: type the other template's whole name (not the one
 * ERPNext filled from the vendor), and leave by moving to Memo, which does not pick from the list
 * (Tab / Enter would). ERPNext's document must end on the typed name.
 *
 * Acts as the AP clerk. Makes no records (the draft is left unsaved).
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../e2e/helpers.js";
import { keys, inDoc, inErp, focusTestId, openNewDoc, report, docQuiet, searchDone, settle, closeSourcePickers } from "./probe-helpers.js";
import { loginAsProbeUser, AP_CLERK } from "./probe-user.js";

const VENDOR = "SUMMIT TRADERS";

const terms = (app) =>
  inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); return { erp: (s && s.doc && s.doc.payment_terms_template) || "", box: document.getElementById("f-terms").value }; })()`);

test("a Payment terms name typed and left without a pick is written (museum OI-196)", async () => {
  test.setTimeout(180_000);
  let app = null;
  let clerk = null;
  const errors = [];
  try {
    app = await launchShell();
    await waitForE2eApi(app);
    await expect.poll(() => inErp(app, `!!(window.frappe && frappe.xcall)`), { timeout: 30_000 }).toBe(true);
    await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; }); // leaving: Discard
    const names = await inErp(app, `frappe.xcall("frappe.client.get_list", { doctype: "Payment Terms Template", fields: ["name"], limit_page_length: 20 }).then((r) => r.map((x) => x.name))`);
    clerk = await loginAsProbeUser(app, AP_CLERK.roles, { as: AP_CLERK.name });
    await openNewDoc(app, "bill", "/app/purchase-invoice/new");
    await docQuiet(app);
    const page = app.windows().find((w) => /doc-form\.html/.test(w.url()));
    if (page) page.on("pageerror", (e) => errors.push(String(e.message || e)));

    await focusTestId(app, "bill-vendor");
    await keys(app, VENDOR);
    await searchDone(app);
    await keys(app, "\t");
    await settle();
    await closeSourcePickers(app);
    await docQuiet(app, { timeout: 30_000 });

    const before = await terms(app);
    const want = (names || []).find((n) => n !== before.erp);
    report("terms", { templates: names, fromVendor: before.erp, typing: want });
    expect(want, "the sandbox needs two Payment Terms Templates").toBeTruthy();

    await focusTestId(app, "bill-terms");
    await inDoc(app, `(() => { const i = document.getElementById("f-terms"); i.select(); return true; })()`);
    await keys(app, want);
    await searchDone(app);
    // Leave without a pick: focus moves to Memo (the box's change fires; the list is not used).
    await inDoc(app, `(() => { document.getElementById("f-memo").focus(); return true; })()`);
    await settle();
    await docQuiet(app, { timeout: 30_000 });

    const after = await terms(app);
    report("after leaving the box", { ...after, pageErrors: errors });
    expect(errors.filter((e) => /isCreatePaymentTermsLinkAction/.test(e))).toEqual([]);
    expect(after.erp).toBe(want);
    expect(after.box).toBe(want);
  } finally {
    if (clerk) await clerk.retire().catch((e) => report("retire-failed", String(e)));
    if (app) await app.close().catch(() => {});
  }
});
