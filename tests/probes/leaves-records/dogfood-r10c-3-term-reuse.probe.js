/**
 * @dogfood R10c-3
 * Plan 10-19 dogfood row R10c-3 (the payment-term create that had never run live): the board's
 * term dialog creating a term that ERPNext already has with the same numbers — as a create that
 * stopped after the term leaves it — and one whose existing term has different numbers. Questions:
 * is the first "Created … (reusing the existing …)", with the template made around the existing
 * term; is the second refused, naming the field that differs, with nothing made?
 *
 * 🔴 LEAVES RECORDS (run with --leaves-records, sandbox only): scene `term-half-made`
 * (tests/probes/dogfood-scenes.js) — two Payment Terms described "ZZ DF" and the template made
 * from one; all deleted after (masters, so they can be). The ACH payment method stays.
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../../e2e/helpers.js";
import { sleep, inBoard, openBoard, openNewDoc, assertSandboxSite, keepScene, report } from "../probe-helpers.js";
import { SCENES, TERM_INPUT, inPage } from "../dogfood-scenes.js";

const scene = SCENES["term-half-made"];

/** Fill the dialog's Custom… shape with `days`, Create, and return what it says when done. */
async function createTerm(app, days) {
  await inBoard(
    app,
    `(() => { document.querySelector('[data-testid="term-modal-open"]').click();
      const v = (id, val) => { const e = document.getElementById(id); e.value = val; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); };
      const shape = document.getElementById("term-shape");
      shape.value = [...shape.options].find((o) => /custom/i.test(o.textContent)).value; shape.dispatchEvent(new Event("change", { bubbles: true }));
      v("term-days", ${JSON.stringify(String(days))}); v("term-grace", "0"); v("term-discount", ""); v("term-discount-days", "");
      v("term-method", ${JSON.stringify(TERM_INPUT.method)}); v("term-description", ${JSON.stringify(TERM_INPUT.description)});
      v("term-installments", "1");
      document.getElementById("term-create").click(); return true; })()`,
  );
  await expect.poll(() => inBoard(app, `document.getElementById("term-msg").textContent`), { timeout: 60_000 }).not.toMatch(/^(Creating .*)?$/);
  const said = await inBoard(app, `({ text: document.getElementById("term-msg").textContent, cls: document.getElementById("term-msg").className, preview: document.getElementById("term-preview-name").textContent })`);
  await inBoard(app, `(() => { document.getElementById("term-modal").hidden = true; return true; })()`);
  return said;
}

test("R10c-3: a term ERPNext already has is reused; one with other numbers is refused", async () => {
  const app = await launchShell();
  try {
    await waitForE2eApi(app);
    await openNewDoc(app, "bill", "/app/purchase-invoice/new");
    await sleep(1500);
    report("site", { companies: await assertSandboxSite(app) });
    const made = await scene.make(app);
    report("scene", made);
    expect(made && made.error).toBeFalsy();
    await openBoard(app);

    const same = await createTerm(app, 97);
    report("same-numbers", same);
    expect(same.text).toBe(`Created ${made.half} (reusing the existing ${made.half}). It applies to bills entered from now on.`);
    const other = await createTerm(app, 98);
    report("other-numbers", other);
    expect(other.cls).toMatch(/bad/);
    expect(other.text).toMatch(/already exists, but its credit period \(days\) is 99, not 98\./);

    const erp = await inPage(app, async (names) => ({
      templates: await frappe.xcall("frappe.client.get_list", { doctype: "Payment Terms Template", filters: { name: ["in", names] }, fields: ["name"] }),
      terms: await frappe.xcall("frappe.client.get_list", { doctype: "Payment Term", filters: { description: "ZZ DF" }, fields: ["name", "credit_days"] }),
    }), [made.half, made.off]);
    report("erpnext", erp);
    expect(erp.templates.map((t) => t.name)).toEqual([made.half]);
    expect(erp.terms.length).toBe(2);
  } finally {
    if (!keepScene()) report("clear", await scene.clear(app));
    await app.close().catch(() => {});
  }
});
