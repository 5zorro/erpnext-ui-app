/**
 * Scaffold — Doc Bill WebContentsView (M3c).
 * Does not require a logged-in ERP form; asserts the bill surface mounts.
 */
import { test, expect } from "@playwright/test";
import { launchShell, e2eCall, e2eGet, waitForE2eApi } from "./helpers.js";

test.describe("scaffold: Doc Bill view", () => {
  /** @type {import('@playwright/test').ElectronApplication | undefined} */
  let app;

  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
    app = undefined;
  });

  test("openBill shows bill surface and root", async () => {
    test.setTimeout(90_000);
    try {
      app = await launchShell();
    } catch (err) {
      test.skip(true, `launch skip-OK: ${err?.message || err}`);
      return;
    }
    await waitForE2eApi(app);

    await e2eCall(app, "openBill", "/app/purchase-invoice/new");
    // getActiveDocSkin is a function on __erpE2e — e2eGet reads properties, so it must
    // be invoked with e2eCall (a function value cannot cross the bridge; it arrives undefined).
    await expect
      .poll(async () => e2eCall(app, "getActiveDocSkin"), { timeout: 15_000 })
      .toBe("bill");

    const title = await e2eCall(
      app,
      "execInView",
      "docForm",
      `document.querySelector('[data-testid="bill-root"]') ? "ok" : ""`,
    );
    expect(title).toBe("ok");

    const chip = await e2eCall(
      app,
      "execInView",
      "docForm",
      `document.querySelector('[data-testid="bill-due-chip"]')?.className || ""`,
    );
    // class is "due-status <state>" (idle/match/mismatch) — the word "chip" is only in the testid.
    expect(chip).toMatch(/due-status/);
  });

  // P1 / OI-171. Read-only on purpose: this test never clicks the button, because clicking it
  // cancels a real document in the sandbox. It proves the gate — present on a submitted Bill,
  // withheld on a draft — which is the part that decides whether a clerk can reach the write at all.
  test("P1 / OI-171: Edit (void and amend) is offered on a submitted Bill, withheld on a draft", async () => {
    test.setTimeout(90_000);
    try {
      app = await launchShell();
    } catch (err) {
      test.skip(true, `launch skip-OK: ${err?.message || err}`);
      return;
    }
    await waitForE2eApi(app);

    const visible = async () =>
      e2eCall(
        app,
        "execInView",
        "docForm",
        `(() => {
           const b = document.querySelector('[data-testid="bill-void-amend"]');
           return b ? { present: true, hidden: !!b.hidden, label: (b.textContent || "").trim() } : { present: false };
         })()`,
      );

    // A brand-new Bill: the button exists in the markup but has nothing to void.
    await e2eCall(app, "openBill", "/app/purchase-invoice/new");
    await expect.poll(async () => e2eCall(app, "getActiveDocSkin"), { timeout: 15_000 }).toBe("bill");
    const onDraft = await visible();
    expect(onDraft.present).toBe(true);
    expect(onDraft.hidden).toBe(true);
    expect(onDraft.label).toMatch(/void and amend/i);

    // Now a real submitted one, if the sandbox has any.
    const submitted = await e2eCall(
      app,
      "execInView",
      "erp",
      `frappe.call({
         method: "frappe.client.get_list",
         args: {
           doctype: "Purchase Invoice",
           filters: [["docstatus", "=", 1], ["is_return", "=", 0]],
           fields: ["name"],
           limit_page_length: 1,
         },
       }).then((r) => {
         var rows = (r && r.message) || [];
         return rows.length ? rows[0] : null;
       })`,
    );
    if (!submitted || !submitted.name) {
      test.skip(true, "no submitted Purchase Invoice in this sandbox to gate against");
      return;
    }

    await e2eCall(app, "openBill", `/app/purchase-invoice/${encodeURIComponent(submitted.name)}`);
    await expect
      .poll(async () => (await visible()).hidden, { timeout: 20_000 })
      .toBe(false);
  });
});
