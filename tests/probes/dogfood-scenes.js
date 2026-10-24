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
import { planPaymentTermsCreate } from "../../src/payment-term-plan.js";

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
  /** A ZZ expense account and a non-stock ZZ item booked to it (the "disabled account" refusals). */
  async function ensureZzExpense() {
    const company = frappe.defaults.get_user_default("Company") || (await list("Company", {}))[0].name;
    let account = await one("Account", { account_name: "ZZ DF Expense", company });
    if (!account) {
      const parent = (await list("Account", { company, root_type: "Expense", is_group: 1 }, ["name", "lft"], { order_by: "lft desc" }))[0].name;
      account = (await insert({ doctype: "Account", account_name: "ZZ DF Expense", parent_account: parent, company })).name;
    }
    await x("frappe.client.set_value", { doctype: "Account", name: account, fieldname: "disabled", value: 0 });
    if (!(await one("Item", { item_code: "ZZ-DF-SERVICE" }))) {
      const g = await list("Item Group", { is_group: 0 });
      await insert({ doctype: "Item", item_code: "ZZ-DF-SERVICE", item_name: "ZZ DF service", item_group: g[0].name, stock_uom: "Nos", is_stock_item: 0 });
    }
    return { company, account };
  }
  /** A ZZ bank account (Bank type, under the company's bank group), enabled or not as asked. */
  async function ensureZzBank(disabled) {
    const company = frappe.defaults.get_user_default("Company") || (await list("Company", {}))[0].name;
    let account = await one("Account", { account_name: "ZZ DF Bank", company });
    if (!account) {
      const parent = (await list("Account", { company, account_type: "Bank", is_group: 1 }))[0].name;
      account = (await insert({ doctype: "Account", account_name: "ZZ DF Bank", parent_account: parent, company, account_type: "Bank" })).name;
    }
    await x("frappe.client.set_value", { doctype: "Account", name: account, fieldname: "disabled", value: disabled ? 1 : 0 });
    return account;
  }
  async function ensureCustomer(name) {
    if (await one("Customer", { customer_name: name })) return (await list("Customer", { customer_name: name }))[0].name;
    const g = await list("Customer Group", { is_group: 0 });
    const t = await list("Territory", { is_group: 0 });
    return (await insert({ doctype: "Customer", customer_name: name, customer_group: g[0] && g[0].name, territory: t[0] && t[0].name })).name;
  }
  /** Cancel and delete the Sales Orders whose customer PO no. starts with \`tag\` (resuming held ones). */
  async function clearOrders(tag) {
    const done = [];
    const tryDo = async (label, fn) => { try { await fn(); done.push(label); } catch (e) { done.push(label + " FAILED: " + ((e && e.message) || "")); } };
    const orders = await list("Sales Order", { po_no: ["like", tag + "%"], docstatus: ["<", 2] }, ["name", "docstatus", "status"]);
    // Purchase Orders made for them (a bridge PO) first — an order cannot be cancelled under one.
    const poLines = orders.length ? await x("frappe.client.get_list", { doctype: "Purchase Order Item", parent: "Purchase Order", filters: [["sales_order", "in", orders.map((o) => o.name)]], fields: ["parent"], limit_page_length: 0 }) : [];
    for (const po of [...new Set(poLines.map((l) => l.parent))]) {
      const d = (await list("Purchase Order", { name: po }, ["name", "docstatus"]))[0];
      if (d && d.docstatus === 1) await tryDo("cancel " + po, () => x("frappe.client.cancel", { doctype: "Purchase Order", name: po }));
      if (d) await tryDo("delete " + po, () => x("frappe.client.delete", { doctype: "Purchase Order", name: po }));
    }
    for (const so of orders) {
      if (so.docstatus === 1 && (so.status === "On Hold" || so.status === "Closed"))
        await tryDo("resume " + so.name, () => x("erpnext.selling.doctype.sales_order.sales_order.update_status", { status: "Draft", name: so.name }));
      if (so.docstatus === 1) await tryDo("cancel " + so.name, () => x("frappe.client.cancel", { doctype: "Sales Order", name: so.name }));
      await tryDo("delete " + so.name, () => x("frappe.client.delete", { doctype: "Sales Order", name: so.name }));
    }
    return done;
  }
  /** A ZZ warehouse whose stock account is the ZZ account "ZZ DF Stock" (disabled or not, as asked),
   *  and a ZZ stock item that receives into it by default. */
  async function ensureZzStores(disabled) {
    const company = frappe.defaults.get_user_default("Company") || (await list("Company", {}))[0].name;
    let account = await one("Account", { account_name: "ZZ DF Stock", company });
    if (!account) {
      const parent = (await list("Account", { company, account_type: "Stock", is_group: 1 }))[0].name;
      account = (await insert({ doctype: "Account", account_name: "ZZ DF Stock", parent_account: parent, company, account_type: "Stock" })).name;
    }
    let warehouse = await one("Warehouse", { warehouse_name: "ZZ DF Stores", company });
    if (!warehouse) warehouse = (await insert({ doctype: "Warehouse", warehouse_name: "ZZ DF Stores", company, account })).name;
    if (!(await one("Item", { item_code: "ZZ-DF-STOCK" }))) {
      const g = await list("Item Group", { is_group: 0 });
      await insert({ doctype: "Item", item_code: "ZZ-DF-STOCK", item_name: "ZZ DF stock item", item_group: g[0].name, stock_uom: "Nos", is_stock_item: 1,
        item_defaults: [{ company, default_warehouse: warehouse }] });
    }
    await x("frappe.client.set_value", { doctype: "Account", name: account, fieldname: "disabled", value: disabled ? 1 : 0 });
    return { warehouse, account };
  }
  /** Cancel or delete everything a vendor has (bills first, then orders), resuming held orders. */
  async function clearVendor(supplier) {
    const done = [];
    const tryDo = async (label, fn) => { try { await fn(); done.push(label); } catch (e) { done.push(label + " FAILED: " + ((e && e.message) || "")); } };
    for (const po of await list("Purchase Order", { supplier, docstatus: 1, status: ["in", ["On Hold", "Closed"]] }))
      await tryDo("resume " + po.name, () => x("erpnext.buying.doctype.purchase_order.purchase_order.update_status", { status: "Draft", name: po.name }));
    for (const pe of await list("Payment Entry", { party_type: "Supplier", party: supplier, docstatus: ["<", 2] }, ["name", "docstatus"]))
      await tryDo((pe.docstatus === 1 ? "cancel " : "delete ") + pe.name, () => x(pe.docstatus === 1 ? "frappe.client.cancel" : "frappe.client.delete", { doctype: "Payment Entry", name: pe.name }));
    for (const dt of ["Purchase Invoice", "Purchase Receipt", "Purchase Order"]) {
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
  "batch-submit-refused": {
    title: "A vendor with 3 open bills; ERPNext takes the 2nd's cancel but refuses its amended copy's submit",
    rows: ["R9-1"],
    leaves:
      "Vendor ZZ DF BATCH SUBMIT with 3 submitted bills on Check; the 2nd is booked to the expense account ZZ DF Expense, which is then disabled — ERPNext cancels it and saves its amended copy, but refuses to submit the copy. The account and the item ZZ-DF-SERVICE stay (re-enabled by --clear).",
    look: "Pay Outstanding → ZZ DF BATCH SUBMIT → Method… → all to ACH → Apply. Expect: bill 1 ✓; bill 2's chip \"Cancelled — <name>-1 not submitted\" and the copy is a draft in ERPNext; bill 3 not attempted. Re-enable the account (Chart of Accounts › ZZ DF Expense) and submit the draft in Vanilla.",
    make: (app) =>
      inPage(
        app,
        maker(String.raw`
          const V = "ZZ DF BATCH SUBMIT";
          const { account } = await ensureZzExpense();
          const cleared = await clearVendor(V);
          await ensureModes(["Check", ...arg.methods]);
          await ensureSupplier(V);
          const bills = [];
          for (const [i, days] of [[1, 10], [2, 20], [3, 30]]) {
            const item = { item_code: "ZZ-DF-SERVICE", qty: 1, rate: i * 100 };
            if (i === 2) item.expense_account = account;
            const b = await submit({
              doctype: "Purchase Invoice", supplier: V, bill_no: "ZZ-DF-SUBMIT-" + i, mode_of_payment: "Check", items: [item],
              payment_schedule: [{ due_date: addDays(days), invoice_portion: 100, payment_amount: i * 100, mode_of_payment: "Check" }],
            });
            bills.push(b.name);
          }
          await x("frappe.client.set_value", { doctype: "Account", name: account, fieldname: "disabled", value: 1 });
          return { vendor: V, bills, disabledAccount: account, cleared };
        `),
        { methods: BOARD_METHODS },
      ),
    clear: (app) =>
      inPage(
        app,
        maker(String.raw`
          const { account } = await ensureZzExpense();
          return { reEnabled: account, cleared: await clearVendor("ZZ DF BATCH SUBMIT") };
        `),
        null,
      ),
  },
  "payment-submit-refused": {
    title: "A vendor with an open bill, and a bank account ERPNext will not post to",
    rows: ["R10c-1"],
    leaves:
      "Vendor ZZ DF PAY REFUSED with one submitted bill (250.00, due in 7 days), and the bank account ZZ DF Bank, disabled — a payment from it saves as a draft but ERPNext refuses to submit it. The account stays (enabled by --clear).",
    look: "Pay Outstanding → ZZ DF PAY REFUSED → Create payment → Pay from: type ZZ DF Bank - <company abbr> (the picker hides disabled accounts) → Submit. Expect: the drawer says the payment was saved as a draft but not submitted, naming it and ERPNext's reason, and it appears under Draft payments at once.",
    make: (app) =>
      inPage(
        app,
        maker(String.raw`
          const V = "ZZ DF PAY REFUSED";
          const cleared = await clearVendor(V);
          await ensureSupplier(V);
          const bank = await ensureZzBank(false);
          const b = await submit({
            doctype: "Purchase Invoice", supplier: V, bill_no: "ZZ-DF-PAY-1", items: [{ item_code: "SAMPLE-SKU-01", qty: 1, rate: 250 }],
            payment_schedule: [{ due_date: addDays(7), invoice_portion: 100, payment_amount: 250, mode_of_payment: "Check" }],
          });
          await ensureZzBank(true);
          return { vendor: V, bill: b.name, disabledBank: bank, cleared };
        `),
        null,
      ),
    clear: (app) =>
      inPage(
        app,
        maker(String.raw`
          const cleared = await clearVendor("ZZ DF PAY REFUSED");
          return { reEnabled: await ensureZzBank(false), cleared };
        `),
        null,
      ),
  },
  "bridge-po-refused": {
    title: "A Sales Order for a 150,000 service, and a rule that stops any Purchase Order over 99,000",
    rows: ["R2-2"],
    leaves:
      "Customer ZZ DF CUSTOMER with a submitted Sales Order (customer PO ZZ-DF-BRIDGE) for 1 × ZZ-DF-SERVICE; vendor ZZ DF BRIDGE; and an Authorization Rule: a Purchase Order over 99,000 may only be approved by Guest — so ERPNext saves such a PO but refuses its submit. 🔴 The rule applies to every PO over 99,000 on the site until --clear removes it.",
    look: "New Bill for ZZ DF BRIDGE, line ZZ-DF-SERVICE × 1 at 100,000 → Assign… → ZZ DF CUSTOMER → the ZZ-DF-BRIDGE order → Apply. Expect the status line: \"Line 1 assigned. The Purchase Order for it was not made: ERPNext refused to submit it (Can be approved by Guest). Nothing was left behind.\" and no draft PO for ZZ DF BRIDGE in ERPNext.",
    make: (app) =>
      inPage(
        app,
        maker(String.raw`
          const V = "ZZ DF BRIDGE";
          const cleared = [...(await clearVendor(V)), ...(await clearOrders("ZZ-DF-BRIDGE"))];
          const { company } = await ensureZzExpense();
          await ensureSupplier(V);
          const customer = await ensureCustomer("ZZ DF CUSTOMER");
          const so = await submit({ doctype: "Sales Order", customer, po_no: "ZZ-DF-BRIDGE", delivery_date: addDays(14),
            items: [{ item_code: "ZZ-DF-SERVICE", qty: 1, rate: 150000, delivery_date: addDays(14) }] });
          let rule = await one("Authorization Rule", { transaction: "Purchase Order", based_on: "Grand Total", approving_user: "Guest" });
          if (!rule) rule = (await insert({ doctype: "Authorization Rule", transaction: "Purchase Order", based_on: "Grand Total", value: 99000, company, approving_user: "Guest" })).name;
          return { vendor: V, customer, salesOrder: so.name, line: so.items[0].name, rule, cleared };
        `),
        null,
      ),
    clear: (app) =>
      inPage(
        app,
        maker(String.raw`
          const cleared = [...(await clearVendor("ZZ DF BRIDGE")), ...(await clearOrders("ZZ-DF-BRIDGE"))];
          for (const r of await list("Authorization Rule", { transaction: "Purchase Order", based_on: "Grand Total", approving_user: "Guest" })) {
            await x("frappe.client.delete", { doctype: "Authorization Rule", name: r.name });
            cleared.push("delete rule " + r.name);
          }
          return { cleared };
        `),
        null,
      ),
  },
  "jit-receipt-refused": {
    title: "A warehouse whose stock account ERPNext will not post to (a just-in-time receipt saves but cannot submit)",
    rows: ["R6c-4"],
    leaves:
      "Vendor ZZ DF RECEIVE; the warehouse ZZ DF Stores, whose stock account ZZ DF Stock is disabled — an Item Receipt into it saves but ERPNext refuses its submit; and the item ZZ-DF-STOCK, which receives into ZZ DF Stores by default. All stay (the account enabled by --clear).",
    look: "New Bill for ZZ DF RECEIVE: a line ZZ-DF-STOCK × 2, Rec'd by someone, then Submit. Expect: the status says ERPNext's reason, the bill is saved as a draft, and there is no draft Item Receipt for ZZ DF RECEIVE in ERPNext.",
    make: (app) =>
      inPage(
        app,
        maker(String.raw`
          const V = "ZZ DF RECEIVE";
          const cleared = await clearVendor(V);
          await ensureSupplier(V);
          const stores = await ensureZzStores(true);
          return { vendor: V, ...stores, cleared };
        `),
        null,
      ),
    clear: (app) =>
      inPage(
        app,
        maker(String.raw`
          const cleared = await clearVendor("ZZ DF RECEIVE");
          return { reEnabled: (await ensureZzStores(false)).account, cleared };
        `),
        null,
      ),
  },
  "term-half-made": {
    title: "A payment term saved without its template (a half-finished create), and one whose numbers differ from its name",
    rows: ["R10c-3"],
    leaves:
      "Payment Term NET_97_DAYS (ACH) +0 with no template (as a create that stopped after the term leaves it), and NET_98_DAYS (ACH) +0 saved with 99 credit days. Both described \"ZZ DF\"; --clear deletes them and any template made from them.",
    look: "Pay Outstanding → the terms button → 97 days, grace 0, ACH, description ZZ DF → Create: \"Created NET_97_DAYS (ACH) +0 (reusing the existing NET_97_DAYS (ACH) +0)\". Then 98 days → refused, naming the field that differs.",
    make: (app) =>
      inPage(
        app,
        maker(String.raw`
          const cleared = [];
          for (const t of await list("Payment Terms Template", { name: ["in", arg.names] })) { await x("frappe.client.delete", { doctype: "Payment Terms Template", name: t.name }); cleared.push("delete template " + t.name); }
          for (const t of await list("Payment Term", { description: "ZZ DF" })) { await x("frappe.client.delete", { doctype: "Payment Term", name: t.name }); cleared.push("delete term " + t.name); }
          await ensureModes(["ACH"]);
          const half = await insert(arg.half);
          const off = await insert(arg.off);
          return { half: half.name, off: off.name, offCreditDays: off.credit_days, cleared };
        `),
        termScene(),
      ),
    clear: (app) =>
      inPage(
        app,
        maker(String.raw`
          const cleared = [];
          for (const t of await list("Payment Terms Template", { name: ["in", arg.names] })) { await x("frappe.client.delete", { doctype: "Payment Terms Template", name: t.name }); cleared.push("delete template " + t.name); }
          for (const t of await list("Payment Term", { description: "ZZ DF" })) { await x("frappe.client.delete", { doctype: "Payment Term", name: t.name }); cleared.push("delete term " + t.name); }
          return { cleared };
        `),
        termScene(),
      ),
  },
  "find-many": {
    title: "205 draft Purchase Orders, so a Find page has a Show more",
    rows: ["R4-2"],
    leaves: "Vendor ZZ DF MANY with 205 draft Purchase Orders (1 × SAMPLE-SKU-01 each). Drafts: --clear deletes them.",
    look: "Find Purchase Orders… → scroll to the bottom → stop ERPNext (or log out in a browser tab) → Show more. Expect: the 200 rows stay; under them \"Could not read more…\" and the button reads Try again.",
    make: (app) =>
      inPage(
        app,
        maker(String.raw`
          const V = "ZZ DF MANY";
          const cleared = (await clearVendor(V)).length;
          await ensureSupplier(V);
          const doc = { doctype: "Purchase Order", supplier: V, schedule_date: addDays(30), items: [{ item_code: "SAMPLE-SKU-01", qty: 1, rate: 1, schedule_date: addDays(30) }] };
          let made = 0;
          for (let i = 0; i < 205; i += 100) {
            const n = Math.min(100, 205 - i);
            made += (await x("frappe.client.insert_many", { docs: Array.from({ length: n }, () => doc) })).length;
          }
          return { vendor: V, drafts: made, cleared };
        `),
        null,
        300_000,
      ),
    clear: (app) => inPage(app, maker(`return { cleared: (await clearVendor("ZZ DF MANY")).length };`), null, 300_000),
  },
  "split-by-need": {
    title: "Two Sales Orders for one item, needing 6 and 2",
    rows: ["R6b-4"],
    leaves:
      "Customer ZZ DF CUSTOMER with two submitted Sales Orders for SAMPLE-SKU-01: customer PO ZZ-DF-SPLIT-A needs 6, ZZ-DF-SPLIT-B needs 2. --clear cancels the Purchase Orders made for them, then the orders.",
    look: "New Bill (any vendor), a line SAMPLE-SKU-01 × 8, then × 5, then × 10, each Assign… → ZZ DF CUSTOMER → both ZZ-DF-SPLIT orders → Apply. Then open each Sales Order: the line's Sources cell ends with Costing. (The plan's R6b-4 row says what to expect.)",
    make: (app) =>
      inPage(
        app,
        maker(String.raw`
          const cleared = await clearOrders("ZZ-DF-SPLIT");
          const customer = await ensureCustomer("ZZ DF CUSTOMER");
          const orders = [];
          for (const [suffix, qty] of [["A", 6], ["B", 2]]) {
            const so = await submit({ doctype: "Sales Order", customer, po_no: "ZZ-DF-SPLIT-" + suffix, delivery_date: addDays(14),
              items: [{ item_code: "SAMPLE-SKU-01", qty, rate: 25, delivery_date: addDays(14) }] });
            orders.push(so.name + " needs " + qty);
          }
          return { customer, orders, cleared };
        `),
        null,
      ),
    clear: (app) => inPage(app, maker(`return { cleared: await clearOrders("ZZ-DF-SPLIT") };`), null),
  },
  "no-terms-vendor": {
    title: "A vendor with no payment terms",
    rows: ["R6b-1 / R6b-2"],
    leaves: "Vendor ZZ DF NO TERMS, with no payment terms template (as Create Vendor… makes one). --clear cancels or deletes its bills.",
    look: "New Bill for ZZ DF NO TERMS: type the due date first, then the lines; Save; change a qty; Save. Both saves go through; any refusal is ERPNext's one sentence.",
    make: (app) =>
      inPage(
        app,
        maker(String.raw`
          const V = "ZZ DF NO TERMS";
          const cleared = await clearVendor(V);
          await ensureSupplier(V);
          await x("frappe.client.set_value", { doctype: "Supplier", name: V, fieldname: "payment_terms", value: "" });
          return { vendor: V, cleared };
        `),
        null,
      ),
    clear: (app) => inPage(app, maker(`return { cleared: await clearVendor("ZZ DF NO TERMS") };`), null),
  },
  "long-bill": {
    title: "A 25-line draft Bill",
    rows: ["R5-1"],
    leaves: "Vendor ZZ DF LONG with one draft Bill (bill no. ZZ-DF-LONG) of 25 lines. A draft: --clear deletes it.",
    look: "Find Bills… → ZZ-DF-LONG → edit many cells, open dropdowns, scroll the line table — all day.",
    make: (app) =>
      inPage(
        app,
        maker(String.raw`
          const V = "ZZ DF LONG";
          const cleared = await clearVendor(V);
          await ensureSupplier(V);
          const codes = ["SAMPLE-SKU-01", "SAMPLE-SKU-02", "SAMPLE-SKU-03", "SAMPLE-SKU-04"];
          const bill = await insert({ doctype: "Purchase Invoice", supplier: V, bill_no: "ZZ-DF-LONG",
            items: Array.from({ length: 25 }, (_, k) => ({ item_code: codes[k % 4], qty: k + 1, rate: 10 })) });
          return { vendor: V, bill: bill.name, lines: bill.items.length, cleared };
        `),
        null,
      ),
    clear: (app) => inPage(app, maker(`return { cleared: await clearVendor("ZZ DF LONG") };`), null),
  },
  "bill-from-po": {
    title: "A draft Bill made from a Purchase Order (its PO and receipt columns load in the background)",
    rows: ["R6c-2"],
    leaves: "Vendor ZZ DF ENRICH with a submitted Purchase Order (2 × SAMPLE-SKU-01) and a draft Bill made from it (bill no. ZZ-DF-ENRICH). --clear deletes the draft and cancels the order.",
    look: "Under npm run start:chaos (or with ERPNext stopped once the Bill is open): open the draft ZZ-DF-ENRICH and wait ~2 minutes. Expect the PO/receipt fields to say \"Couldn't load — press Refresh\", and Save to say Refresh, not wait.",
    make: (app) =>
      inPage(
        app,
        maker(String.raw`
          const V = "ZZ DF ENRICH";
          const cleared = await clearVendor(V);
          await ensureSupplier(V);
          const po = await submit({ doctype: "Purchase Order", supplier: V, schedule_date: addDays(7), items: [{ item_code: "SAMPLE-SKU-01", qty: 2, rate: 10, schedule_date: addDays(7) }] });
          const pi = await x("erpnext.buying.doctype.purchase_order.purchase_order.make_purchase_invoice", { source_name: po.name });
          pi.bill_no = "ZZ-DF-ENRICH";
          const bill = await insert(pi);
          return { vendor: V, po: po.name, bill: bill.name, cleared };
        `),
        null,
      ),
    clear: (app) => inPage(app, maker(`return { cleared: await clearVendor("ZZ DF ENRICH") };`), null),
  },
};

/** R10c-3's terms, as the board's own planner names and shapes them. */
export const TERM_INPUT = { method: "ACH", dueDateBasedOn: "Day(s) after invoice date", description: "ZZ DF", graceDays: 0 };
function termScene() {
  const half = planPaymentTermsCreate({ ...TERM_INPUT, contractDays: 97 }).plans[0];
  const off = planPaymentTermsCreate({ ...TERM_INPUT, contractDays: 98 }).plans[0];
  return { half: half.term, off: { ...off.term, credit_days: 99 }, names: [half.name, off.name] };
}

/** Scene names that serve a plan row — its whole id, or one part of it ("R6b-1" for "R6b-1 / R6b-2"). */
export const scenesForRow = (row) =>
  Object.keys(SCENES).filter((k) => SCENES[k].rows.some((r) => r === row || r.split(" / ").includes(row)));
