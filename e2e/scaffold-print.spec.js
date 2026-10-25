/**
 * Printing convention (plan 2026-09-26 "Printing"): print in place, ERPNext renders, never a popup.
 * Against the live sandbox. Never saves a document; never opens a file dialog it leaves waiting
 * except the last step, which the app's close dismisses.
 */
import { test, expect } from "@playwright/test";
import { launchShell, e2eCall, e2eGet, waitForE2eApi } from "./helpers.js";

/** @param {import('@playwright/test').ElectronApplication} app @param {string} view @param {string} js */
const inView = (app, view, js) => e2eCall(app, "execInView", view, js);

async function anyBill(app) {
  return inView(
    app,
    "erp",
    `(async () => {
      const r = await frappe.db.get_list("Purchase Invoice", { fields: ["name"], filters: { docstatus: 1 }, limit: 1 });
      return r[0] ? r[0].name : "";
    })()`,
  );
}

test.describe("scaffold: printing in place", () => {
  /** @type {import('@playwright/test').ElectronApplication | undefined} */
  let app;
  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
    app = undefined;
  });

  test("Doc Bill → Print opens the dialog in place; ERPNext's PDF arrives; the queue takes it; Frappe's PDF popup is caught", async () => {
    test.setTimeout(150_000);
    app = await launchShell();
    await waitForE2eApi(app);
    await expect.poll(async () => e2eCall(app, "getErpUrl"), { timeout: 30_000 }).toMatch(/\/(app|desk)\b/);
    const bill = await anyBill(app).catch(() => "");
    test.skip(!bill, "sandbox has no submitted bill");

    // ERPNext renders the PDF; the shell fetches it over the ERP view's own session.
    const pdf = await e2eCall(app, "fetchPrintPdf", { doctype: "Purchase Invoice", name: bill });
    expect(pdf.ok, pdf.reason).toBe(true);
    expect(pdf.head).toBe("%PDF-");

    await e2eCall(app, "openBill", `/app/purchase-invoice/${encodeURIComponent(bill)}`);
    await expect.poll(async () => e2eCall(app, "getActiveDocSkin"), { timeout: 20_000 }).toBe("bill");
    await new Promise((r) => setTimeout(r, 4000));
    const windowsBefore = await e2eCall(app, "windowCount");

    await inView(app, "docForm", `document.getElementById("btn-print").click(); true`);
    await expect
      .poll(async () => inView(app, "docForm", `!!document.querySelector('[data-testid="print-format"]')`), { timeout: 15_000 })
      .toBe(true);
    expect(await e2eGet(app, "surfaceMode")).toBe("doc"); // in place: the page never moved
    const formats = await inView(app, "docForm", `[...document.querySelectorAll('[data-testid="print-format"] option')].map((o) => o.textContent)`);
    expect(formats.some((f) => /Purchase Invoice/.test(f))).toBe(true);

    await inView(app, "docForm", `document.querySelector('[data-testid="print-queue-add"]').click(); true`);
    await expect.poll(async () => (await e2eCall(app, "getPrintQueue")).map((q) => q.name), { timeout: 5_000 }).toEqual([bill]);

    // Vanilla's own PDF button window.opens this; the shell catches it instead of a popup.
    await inView(app, "erp", `window.open("/api/method/frappe.utils.print_format.download_pdf?doctype=Purchase%20Invoice&name=${encodeURIComponent(bill)}"); true`);
    await new Promise((r) => setTimeout(r, 1500));
    expect(await e2eCall(app, "windowCount")).toBe(windowsBefore);
  });
});
