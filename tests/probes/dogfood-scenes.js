/**
 * Dogfood scenes (plan 10-19 § Dogfood check and setup): the records one row of the plan's
 * *Dogfood residuals* table needs, made on the sandbox. The same maker serves two callers:
 * - a probe tagged `@dogfood <row>` makes the scene, checks the row, and clears it;
 * - `npm run dogfood:setup -- <row>` makes it and leaves it for 5zorro, printing where to look.
 *
 * Every scene's records are named `ZZ DF …`. A scene clears its own earlier records before making
 * new ones, so setup can be run again. Submitted documents are cancelled, never deleted — ERPNext
 * keeps a cancelled document its ledger entries link to — so a clear leaves those, cancelled.
 *
 * The makers run inside the ERPNext page as real functions (`inPage`), with `frappe.xcall` only
 * (`docs/gotchas.md` G19). Shared records a scene needs and leaves in place (said in its `leaves`):
 * the payment methods the Pay Outstanding board offers, which a blank ERPNext does not have.
 */
import { inErp } from "./probe-helpers.js";

/**
 * Run `fn(arg)` in the ERPNext page. `fn` must be self-contained (it is sent as source). A throw
 * comes back as `{ error }` with ERPNext's own message when there is one.
 * @template T
 * @param {any} app @param {(arg: T) => Promise<any>} fn @param {T} arg @param {number} [ms]
 */
export async function inPage(app, fn, arg, ms = 90_000) {
  const res = await inErp(
    app,
    `(async () => {
      try { return await (${fn.toString()})(${JSON.stringify(arg)}); }
      catch (e) {
        let why = (e && e.message) || "";
        try { why = why || JSON.parse(JSON.parse(frappe.last_response._server_messages)[0]).message; } catch (e2) {}
        return { error: why || String(e) };
      }
    })()`,
    ms,
  );
  return res;
}

/** Steps every maker uses, sent with each one (the page has no module system). */
const PAGE_HELPERS = String.raw`
  const x = (m, a) => frappe.xcall(m, a);
  const list = (doctype, filters, fields = ["name"], extra = {}) => x("frappe.client.get_list", { doctype, filters, fields, limit_page_length: 0, ...extra });
  const insert = (doc) => x("frappe.client.insert", { doc });
  const submit = async (doc) => x("frappe.client.submit", { doc: await insert(doc) });
  const one = async (doctype, filters) => ((await list(doctype, filters))[0] || {}).name || "";
  const today = frappe.datetime.get_today();
  const addDays = (n) => frappe.datetime.add_days(today, n);
  async function ensureSupplier(name) {
    if (await one("Supplier", { supplier_name: name })) return name;
    const g = await list("Supplier Group", { is_group: 0 });
    return (await insert({ doctype: "Supplier", supplier_name: name, supplier_group: g[0] && g[0].name })).name;
  }
  async function ensureModes(names) {
    for (const m of names) if (!(await one("Mode of Payment", { name: m }))) await insert({ doctype: "Mode of Payment", mode_of_payment: m, type: "Bank" });
  }
  /** Cancel or delete everything a vendor has (bills first, then orders), resuming held orders. */
  async function clearVendor(supplier) {
    const done = [];
    const tryDo = async (label, fn) => { try { await fn(); done.push(label); } catch (e) { done.push(label + " FAILED: " + ((e && e.message) || "")); } };
    for (const po of await list("Purchase Order", { supplier, docstatus: 1, status: ["in", ["On Hold", "Closed"]] }))
      await tryDo("resume " + po.name, () => x("erpnext.buying.doctype.purchase_order.purchase_order.update_status", { status: "Draft", name: po.name }));
    for (const dt of ["Purchase Invoice", "Purchase Order"]) {
      for (const d of await list(dt, { supplier, docstatus: ["<", 2] }, ["name", "docstatus"], { order_by: "creation desc" })) {
        if (d.docstatus === 1) await tryDo("cancel " + d.name, () => x("frappe.client.cancel", { doctype: dt, name: d.name }));
        else await tryDo("delete " + d.name, () => x("frappe.client.delete", { doctype: dt, name: d.name }));
      }
    }
    return done;
  }
`;

/** A maker: `PAGE_HELPERS` in scope, then the scene's body. */
const maker = (body) => new Function("arg", `return (async () => { ${PAGE_HELPERS}\n${body} })();`);

/** The payment methods Pay Outstanding knows (`KNOWN_PAYMENT_METHODS`), plus ERPNext's own Check. */
const BOARD_METHODS = ["USPS_Check", "ACH", "DOM_WIRE", "INT_WIRE"];

/**
 * @typedef {{ title: string, rows: string[], leaves: string, look: string,
 *   make: (app: any) => Promise<any>, clear: (app: any) => Promise<any> }} Scene
 */

/** @type {Record<string, Scene>} */
export const SCENES = {
  "batch-cancel-refused": {
    title: "A vendor with 4 open bills; ERPNext refuses to cancel the 3rd",
    rows: ["R9"],
    leaves:
      "Vendor ZZ DF BATCH with 4 submitted bills on Check (due in 10/20/30/40 days); the 3rd came from a Purchase Order that is On Hold, so ERPNext refuses to cancel it. Also makes sure the board's payment methods (USPS_Check, ACH, DOM_WIRE, INT_WIRE) exist.",
    look: "Pay Outstanding → ZZ DF BATCH → Method… → change all to ACH → Apply. Expect: bills 1–2 change, the 3rd is refused (its order is On Hold), the 4th is not attempted; resume the order in Vanilla (Purchase Order › Status › Resume), then Try again on the remaining 2.",
    make: (app) =>
      inPage(
        app,
        maker(String.raw`
          const V = "ZZ DF BATCH";
          const cleared = await clearVendor(V);
          await ensureModes(["Check", ...arg.methods]);
          await ensureSupplier(V);
          const bills = [];
          let po = "";
          for (const [i, days] of [[1, 10], [2, 20], [3, 30], [4, 40]]) {
            const item = { item_code: "SAMPLE-SKU-01", qty: i, rate: 100 };
            if (i === 3) {
              const o = await submit({ doctype: "Purchase Order", supplier: V, schedule_date: addDays(5), items: [{ ...item, schedule_date: addDays(5) }] });
              po = o.name;
              Object.assign(item, { purchase_order: po, po_detail: o.items[0].name });
            }
            const b = await submit({
              doctype: "Purchase Invoice", supplier: V, bill_no: "ZZ-DF-BATCH-" + i, mode_of_payment: "Check", items: [item],
              payment_schedule: [{ due_date: addDays(days), invoice_portion: 100, payment_amount: i * 100, mode_of_payment: "Check" }],
            });
            bills.push(b.name);
          }
          await x("erpnext.buying.doctype.purchase_order.purchase_order.update_status", { status: "On Hold", name: po });
          return { vendor: V, bills, heldPo: po, cleared };
        `),
        { methods: BOARD_METHODS },
      ),
    clear: (app) => inPage(app, maker(`return { cleared: await clearVendor("ZZ DF BATCH") };`), null),
  },
};

/** Scene names that serve a plan row. */
export const scenesForRow = (row) => Object.keys(SCENES).filter((k) => SCENES[k].rows.includes(row));
