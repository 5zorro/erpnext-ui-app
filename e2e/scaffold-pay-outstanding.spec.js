/**
 * Scaffold — OI-161 Doc Pay skin (Packet 4, v2).
 * pay-outstanding.html is now a persistent WebContentsView (surfaceMode "pay-outstanding"),
 * hosted in the main window like chrome/home/hist/erp/docForm -- not a standalone popup
 * (5zorro 2026-09-05: "stay in window unless I spawn a second all-purpose window"). Drive it via
 * execInView, same as every other view (gotcha #1: WebContentsView is not a reliable Page).
 */
import { test, expect } from "@playwright/test";
import { launchShell, e2eCall, e2eGet, waitForE2eApi } from "./helpers.js";

/**
 * Packet 4b step 5 retired the standalone "Pay Outstanding" Home tile -- Payment Entry is the
 * real anchor now. Reach the same dashboard the way a clerk does today: "Pay Bills" tile → blank
 * Vanilla Payment Entry → toolbar Doc tab (isNew: true routes to pay-outstanding.html per
 * lens-context.js resolveDocSkinTarget).
 * @param {import('@playwright/test').ElectronApplication} app
 */
async function openPayOutstandingViaPaymentEntry(app) {
  await e2eCall(app, "execInView", "home", `document.querySelector('[data-testid="tile-pay-bills"]').click(); true`);
  await expect
    .poll(async () => e2eCall(app, "getErpUrl"), { timeout: 15_000 })
    .toMatch(/payment-entry\/new/);
  await e2eCall(app, "execInView", "chrome", `document.querySelector('[data-testid="lens-doc"]').click(); true`);
  await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 10_000 }).toBe("pay-outstanding");
}

test.describe("scaffold: pay outstanding", () => {
  /** @type {import('@playwright/test').ElectronApplication | undefined} */
  let app;

  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
    app = undefined;
  });

  test("Home tile shows the in-window dashboard; Home button returns to Home", async () => {
    test.setTimeout(90_000);
    try {
      app = await launchShell();
    } catch (err) {
      test.skip(true, `launch skip-OK: ${err?.message || err}`);
      return;
    }
    await waitForE2eApi(app);

    // getErpUrl is a function-valued __erpE2e key — must invoke via e2eCall, not e2eGet
    // (e2e/GOTCHAS.md #8: a function silently structured-clones to undefined through e2eGet).
    await expect
      .poll(async () => e2eCall(app, "getErpUrl"), { timeout: 30_000 })
      .toMatch(/\/(app|desk|login)\b/);

    // get-outstanding-bills needs a logged-in erp view (gotcha #5: login-vs-session is not
    // guaranteed). Log in with the local sandbox's own default (frappe_docker demo credential,
    // not a real secret) so this scaffold can actually exercise real data end to end; skip
    // gracefully rather than hard-fail if a different environment's password doesn't match.
    const erpUrl = await e2eCall(app, "getErpUrl");
    if (/\/login\b/.test(erpUrl)) {
      const pwd = process.env.E2E_ERP_PASSWORD || "admin";
      await e2eCall(
        app,
        "execInView",
        "erp",
        `fetch("/api/method/login", {
           method: "POST",
           headers: { "Content-Type": "application/x-www-form-urlencoded" },
           body: "usr=Administrator&pwd=" + encodeURIComponent(${JSON.stringify(pwd)}),
           credentials: "include",
         }).then((r) => r.json())`,
      );
      await e2eCall(app, "openErp", "/desk");
      const loggedIn = await expect
        .poll(async () => e2eCall(app, "getErpUrl"), { timeout: 15_000 })
        .toMatch(/\/desk\b/)
        .then(() => true)
        .catch(() => false);
      if (!loggedIn) {
        test.skip(true, "sandbox login skip-OK: E2E_ERP_PASSWORD doesn't match this environment");
        return;
      }
    }

    await openPayOutstandingViaPaymentEntry(app);

    const title = await e2eCall(
      app,
      "execInView",
      "payOutstanding",
      `document.querySelector('[data-testid="pay-outstanding-title"]')?.textContent || ""`,
    );
    expect(title).toBe("Pay Outstanding");

    // SUP-DAILY / SUP-DAILY-LG (Packet G) should always be present in the sandbox.
    await expect
      .poll(
        async () =>
          e2eCall(app, "execInView", "payOutstanding", `document.querySelectorAll('[data-testid="vendor-card"]').length`),
        { timeout: 20_000 },
      )
      .toBeGreaterThan(0);

    const groupCount = await e2eCall(
      app,
      "execInView",
      "payOutstanding",
      `document.querySelectorAll('[data-testid="group-node"]').length`,
    );
    expect(groupCount).toBeGreaterThan(0);

    // Expand one group's rationale (collapsed by default per OI-161 "suggestion only").
    const beforeHidden = await e2eCall(
      app,
      "execInView",
      "payOutstanding",
      `document.querySelector('[data-testid="group-rationale"]').hidden`,
    );
    expect(beforeHidden).toBe(true);
    await e2eCall(
      app,
      "execInView",
      "payOutstanding",
      `document.querySelector('[data-testid="group-node"]').click(); true`,
    );
    const afterHidden = await e2eCall(
      app,
      "execInView",
      "payOutstanding",
      `document.querySelector('[data-testid="group-rationale"]').hidden`,
    );
    expect(afterHidden).toBe(false);

    // The Sankey ribbon layers actually drew something.
    const ribbonCount = await e2eCall(
      app,
      "execInView",
      "payOutstanding",
      `document.querySelectorAll('svg.flow-svg path').length`,
    );
    expect(ribbonCount).toBeGreaterThan(0);

    // Home button (always-visible chrome toolbar) returns to Home from this surface too.
    await e2eCall(app, "execInView", "chrome", `document.querySelector('[data-testid="btn-home"]').click(); true`);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 10_000 }).toBe("home");
  });

  test("Packet 4b step 3: a dirty check drawer gates Home navigation with Stay/Discard", async () => {
    test.setTimeout(90_000);
    try {
      app = await launchShell();
    } catch (err) {
      test.skip(true, `launch skip-OK: ${err?.message || err}`);
      return;
    }
    await waitForE2eApi(app);

    const erpUrl = await e2eCall(app, "getErpUrl");
    if (/\/login\b/.test(erpUrl)) {
      const pwd = process.env.E2E_ERP_PASSWORD || "admin";
      await e2eCall(
        app,
        "execInView",
        "erp",
        `fetch("/api/method/login", {
           method: "POST",
           headers: { "Content-Type": "application/x-www-form-urlencoded" },
           body: "usr=Administrator&pwd=" + encodeURIComponent(${JSON.stringify(pwd)}),
           credentials: "include",
         }).then((r) => r.json())`,
      );
      await e2eCall(app, "openErp", "/desk");
      const loggedIn = await expect
        .poll(async () => e2eCall(app, "getErpUrl"), { timeout: 15_000 })
        .toMatch(/\/desk\b/)
        .then(() => true)
        .catch(() => false);
      if (!loggedIn) {
        test.skip(true, "sandbox login skip-OK: E2E_ERP_PASSWORD doesn't match this environment");
        return;
      }
    }

    // Stub the native dialog (gotcha #7: Playwright cannot intercept dialog.* directly) so the
    // gate's Stay/Discard prompt is answerable from the test instead of hanging forever.
    await app.evaluate(({ dialog }) => {
      globalThis.__dialogCalls = [];
      globalThis.__dialogResponse = 1; // default: "Stay"
      dialog.showMessageBox = (...args) => {
        const opts = args.length > 1 ? args[1] : args[0];
        globalThis.__dialogCalls.push(opts);
        return Promise.resolve({ response: globalThis.__dialogResponse });
      };
    });

    await openPayOutstandingViaPaymentEntry(app);

    // Not dirty yet — Home must proceed with no prompt at all (this is the pre-step-3 behavior,
    // still the correct one for a clean drawer).
    await e2eCall(app, "execInView", "chrome", `document.querySelector('[data-testid="btn-home"]').click(); true`);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 10_000 }).toBe("home");
    let dialogCalls = await app.evaluate(() => globalThis.__dialogCalls.length);
    expect(dialogCalls).toBe(0);

    // Back to Pay Outstanding, mark the drawer dirty (no real input exists yet — this is the
    // renderer-side call step 4's write path will make on an actual field change), then try to
    // leave via Home: must prompt, and "Stay" must keep the surface put.
    await openPayOutstandingViaPaymentEntry(app);
    await e2eCall(app, "execInView", "payOutstanding", `window.erpPayOutstanding.setDirty(true); true`);

    await app.evaluate(() => { globalThis.__dialogResponse = 1; }); // "Stay"
    await e2eCall(app, "execInView", "chrome", `document.querySelector('[data-testid="btn-home"]').click(); true`);
    await expect
      .poll(async () => app.evaluate(() => globalThis.__dialogCalls.length), { timeout: 10_000 })
      .toBe(1);
    expect(await e2eGet(app, "surfaceMode")).toBe("pay-outstanding");

    // Same dirty drawer, this time "Discard and continue" — navigation must proceed.
    await app.evaluate(() => { globalThis.__dialogResponse = 0; }); // "Discard and continue"
    await e2eCall(app, "execInView", "chrome", `document.querySelector('[data-testid="btn-home"]').click(); true`);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 10_000 }).toBe("home");
    dialogCalls = await app.evaluate(() => globalThis.__dialogCalls.length);
    expect(dialogCalls).toBe(2);

    // The discard must have cleared the flag — reopening Pay Outstanding and leaving again
    // proceeds with no further prompt (a stale dirty flag must not survive a resolved gate).
    await openPayOutstandingViaPaymentEntry(app);
    await e2eCall(app, "execInView", "chrome", `document.querySelector('[data-testid="btn-home"]').click(); true`);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 10_000 }).toBe("home");
    dialogCalls = await app.evaluate(() => globalThis.__dialogCalls.length);
    expect(dialogCalls).toBe(2);
  });

  test("Packet 4b step 5: an existing Payment Entry opens as a read-only check document", async () => {
    test.setTimeout(90_000);
    try {
      app = await launchShell();
    } catch (err) {
      test.skip(true, `launch skip-OK: ${err?.message || err}`);
      return;
    }
    await waitForE2eApi(app);

    const erpUrl = await e2eCall(app, "getErpUrl");
    if (/\/login\b/.test(erpUrl)) {
      const pwd = process.env.E2E_ERP_PASSWORD || "admin";
      await e2eCall(
        app,
        "execInView",
        "erp",
        `fetch("/api/method/login", {
           method: "POST",
           headers: { "Content-Type": "application/x-www-form-urlencoded" },
           body: "usr=Administrator&pwd=" + encodeURIComponent(${JSON.stringify(pwd)}),
           credentials: "include",
         }).then((r) => r.json())`,
      );
      await e2eCall(app, "openErp", "/desk");
      const loggedIn = await expect
        .poll(async () => e2eCall(app, "getErpUrl"), { timeout: 15_000 })
        .toMatch(/\/desk\b/)
        .then(() => true)
        .catch(() => false);
      if (!loggedIn) {
        test.skip(true, "sandbox login skip-OK: E2E_ERP_PASSWORD doesn't match this environment");
        return;
      }
    }

    // Find a real submitted "Pay" Payment Entry and a real "Receive" one already in the sandbox
    // (this test only reads -- no Payment Entry is created here).
    const found = await e2eCall(
      app,
      "execInView",
      "erp",
      `frappe.call({
         method: "frappe.client.get_list",
         args: {
           doctype: "Payment Entry",
           filters: [["docstatus", "=", 1]],
           fields: ["name", "party", "paid_amount", "payment_type"],
           limit_page_length: 50,
         },
       }).then((r) => {
         var rows = (r && r.message) || [];
         var pay = rows.find((d) => d.payment_type === "Pay");
         var receive = rows.find((d) => d.payment_type === "Receive");
         return { pay: pay || null, receive: receive || null };
       })`,
    );
    if (!found || !found.pay) {
      test.skip(true, "no submitted Pay-type Payment Entry in this sandbox to view");
      return;
    }

    await e2eCall(app, "openErp", `/app/payment-entry/${encodeURIComponent(found.pay.name)}`);
    await expect
      .poll(async () => e2eCall(app, "getErpUrl"), { timeout: 15_000 })
      .toMatch(new RegExp(found.pay.name));
    await e2eCall(app, "execInView", "chrome", `document.querySelector('[data-testid="lens-doc"]').click(); true`);
    await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 10_000 }).toBe("payment-doc");

    // paintCheckDoc only runs once getPaymentEntry's IPC round-trip (a real ERP fetch) resolves --
    // poll for the badge to leave the fragment's static default rather than reading once.
    await expect
      .poll(
        async () =>
          e2eCall(
            app,
            "execInView",
            "paymentDoc",
            `document.querySelector('[data-testid="check-doc-badge"]')?.textContent || ""`,
          ),
        { timeout: 15_000 },
      )
      .not.toBe("Preview — not yet saved");

    const rendered = await e2eCall(
      app,
      "execInView",
      "paymentDoc",
      `({
         badge: document.querySelector('[data-testid="check-doc-badge"]')?.textContent || "",
         payee: document.querySelector('[data-testid="check-doc-payee"]')?.textContent || "",
         amount: document.querySelector('[data-testid="check-doc-amount"]')?.textContent || "",
         mopDisabled: document.getElementById("check-doc-mop")?.disabled,
         writeActionsHidden: document.querySelector('[data-testid="check-doc-write-actions"]')?.hidden,
         // Ask what the clerk can SEE, not what the property says. These disagreed:
         // .check-doc-write-actions carried an author "display: flex", which beats the UA
         // sheet's [hidden] { display: none }, so hidden was true while a "Create & submit
         // Payment Entry" button stayed on screen over a submitted document (found 2026-09-07).
         writeActionsOnScreen: !!document
           .querySelector('[data-testid="check-doc-write-actions"]')?.getClientRects().length,
         submitOnScreen: !!document
           .querySelector('[data-testid="check-doc-submit"]')?.getClientRects().length,
       })`,
    );
    expect(rendered.badge).toMatch(/Submitted Payment Entry/);
    expect(rendered.payee).toBe(found.pay.party);
    expect(rendered.mopDisabled).toBe(true);
    expect(rendered.writeActionsHidden).toBe(true);
    expect(rendered.writeActionsOnScreen).toBe(false);
    expect(rendered.submitOnScreen).toBe(false);

    if (found.receive) {
      await e2eCall(app, "openErp", `/app/payment-entry/${encodeURIComponent(found.receive.name)}`);
      await expect
        .poll(async () => e2eCall(app, "getErpUrl"), { timeout: 15_000 })
        .toMatch(new RegExp(found.receive.name));
      await e2eCall(app, "execInView", "chrome", `document.querySelector('[data-testid="lens-doc"]').click(); true`);
      await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 10_000 }).toBe("payment-doc");
      const notPayVisible = await expect
        .poll(
          async () =>
            e2eCall(app, "execInView", "paymentDoc", `document.getElementById("not-pay").hidden`),
          { timeout: 10_000 },
        )
        .toBe(false)
        .then(() => true)
        .catch(() => false);
      expect(notPayVisible).toBe(true);
    }
  });
});
