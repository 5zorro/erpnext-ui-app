/**
 * Create ▾ on the Sales Order, the whole of it (plan 2026-10-12 S5): Vanilla's Create entries, in
 * Vanilla's order and under Vanilla's conditions (`sales_order.js` `refresh`), each in its
 * document's wash, as a list or as a flowchart (the clerk's choice).
 *
 * Purchase Order is the shell's own (S2: every PO a draft, drafts count as ordered). Every other
 * entry runs **Vanilla's own button** on the order's Vanilla form — the same dialogs and the same
 * ERPNext code (`cur_frm.cscript[handler]`), so nothing here re-implements a mapper.
 * Pure: which entries, when, how they look, where they sit in the flow.
 */

/**
 * @typedef {"before"|"make"|"ship"|"bill"|"paid"|"also"} FlowStage
 * @typedef {{ id: string, label: string, doctype: string, handler: string|null, args?: unknown[],
 *   role: string, desk: "ap"|"ar"|"", stage: FlowStage, countOf: string, show: (d: SoFacts) => boolean }} CreateEntry
 * @typedef {{ perDelivered: number, perBilled: number, perPicked: number, subcontracted: boolean,
 *   internalCustomer: boolean, orderType: string }} SoFacts
 */

const sale = (f) => ["Sales", "Shopping Cart"].includes(f.orderType) || !["Sales", "Shopping Cart", "Maintenance"].includes(f.orderType);
const maintenance = (f) => f.orderType === "Maintenance" || !["Sales", "Shopping Cart", "Maintenance"].includes(f.orderType);

/** In Vanilla's order. `countOf`: the linked doctype the form dashboard counts for this entry. */
/** @type {readonly CreateEntry[]} */
export const SO_CREATE_CATALOG = Object.freeze([
  { id: "pick-list", label: "Pick List", doctype: "Pick List", handler: "create_pick_list", role: "fulfill", desk: "ar", stage: "ship", countOf: "Pick List",
    show: (f) => f.perPicked < 100 && f.perDelivered < 100 && !f.subcontracted },
  { id: "delivery-note", label: "Delivery Note", doctype: "Delivery Note", handler: "make_delivery_note_based_on_delivery_date", args: [true], role: "fulfill", desk: "ar", stage: "ship", countOf: "Delivery Note",
    show: (f) => f.perDelivered < 100 && sale(f) },
  { id: "work-order", label: "Work Order", doctype: "Work Order", handler: "make_work_order", role: "order", desk: "", stage: "make", countOf: "Work Order",
    show: (f) => f.perDelivered < 100 && sale(f) && !f.subcontracted },
  { id: "production-plan", label: "Production Plan", doctype: "Production Plan", handler: "make_production_plan", role: "request", desk: "", stage: "make", countOf: "Production Plan",
    show: (f) => f.perDelivered < 100 && sale(f) && !f.subcontracted },
  { id: "sales-invoice", label: "Sales Invoice", doctype: "Sales Invoice", handler: "make_sales_invoice", role: "invoice", desk: "ar", stage: "bill", countOf: "Sales Invoice",
    show: (f) => f.perBilled < 100 || f.subcontracted },
  { id: "material-request", label: "Material Request", doctype: "Material Request", handler: "make_material_request", role: "request", desk: "ap", stage: "make", countOf: "Material Request",
    show: (f) => (!f.orderType || (sale(f) && f.perDelivered < 100)) && !f.subcontracted },
  { id: "raw-materials", label: "Request for Raw Materials", doctype: "Material Request", handler: "make_raw_material_request", role: "request", desk: "ap", stage: "make", countOf: "",
    show: (f) => (!f.orderType || (sale(f) && f.perDelivered < 100)) && !f.subcontracted },
  { id: "purchase-order", label: "Purchase Order", doctype: "Purchase Order", handler: null, role: "order", desk: "ap", stage: "make", countOf: "Purchase Order",
    show: (f) => !f.internalCustomer && !f.subcontracted },
  { id: "maintenance-visit", label: "Maintenance Visit", doctype: "Maintenance Visit", handler: "make_maintenance_visit", role: "", desk: "", stage: "also", countOf: "Maintenance Visit",
    show: (f) => f.perDelivered < 100 && maintenance(f) },
  { id: "maintenance-schedule", label: "Maintenance Schedule", doctype: "Maintenance Schedule", handler: "make_maintenance_schedule", role: "", desk: "", stage: "also", countOf: "Maintenance Schedule",
    show: (f) => f.perDelivered < 100 && maintenance(f) },
  { id: "project", label: "Project", doctype: "Project", handler: "make_project", role: "", desk: "", stage: "also", countOf: "Project",
    show: (f) => f.perDelivered < 100 },
  { id: "payment-request", label: "Payment Request", doctype: "Payment Request", handler: "make_payment_request_with_schedule", role: "payment", desk: "ar", stage: "paid", countOf: "Payment Request",
    show: (f) => f.perBilled < 100 },
  { id: "payment", label: "Payment", doctype: "Payment Entry", handler: "make_payment_entry", role: "payment", desk: "ar", stage: "paid", countOf: "Payment Entry",
    show: (f) => f.perBilled < 100 },
].map((e) => Object.freeze(e)));

/** The flowchart's columns, left to right, and what each is called. */
export const FLOW_STAGES = Object.freeze([
  Object.freeze({ id: "before", label: "Before" }),
  Object.freeze({ id: "order", label: "This order" }),
  Object.freeze({ id: "make", label: "Buy or make" }),
  Object.freeze({ id: "ship", label: "Ship" }),
  Object.freeze({ id: "bill", label: "Bill" }),
  Object.freeze({ id: "paid", label: "Get paid" }),
  Object.freeze({ id: "also", label: "Also" }),
]);

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * @param {Record<string, any>|null|undefined} doc
 * @returns {SoFacts}
 */
export function soFacts(doc) {
  const d = doc || {};
  return {
    perDelivered: num(d.per_delivered),
    perBilled: num(d.per_billed),
    perPicked: num(d.per_picked),
    subcontracted: !!Number(d.is_subcontracted || 0),
    internalCustomer: !!Number(d.is_internal_customer || 0),
    orderType: String(d.order_type || ""),
  };
}

/** Statuses on which Vanilla offers no Create at all. */
const NO_CREATE_STATUSES = new Set(["Closed", "On Hold", "Cancelled"]);

/**
 * The entries Vanilla would show for this order, in its order. A draft or a closed / held order
 * shows none (with the reason).
 * @param {Record<string, any>|null|undefined} doc
 * @returns {{ ok: boolean, reason?: string, entries: CreateEntry[] }}
 */
export function soCreateEntries(doc) {
  if (!doc) return { ok: false, reason: "No Sales Order loaded.", entries: [] };
  if (Number(doc.docstatus) !== 1) return { ok: false, reason: "Submit the Sales Order first — Create works from a submitted order.", entries: [] };
  if (NO_CREATE_STATUSES.has(String(doc.status || ""))) return { ok: false, reason: `This order is ${doc.status} — nothing more is created from it.`, entries: [] };
  const f = soFacts(doc);
  return { ok: true, entries: SO_CREATE_CATALOG.filter((e) => e.show(f)) };
}

/**
 * The flowchart: every catalog entry in its column, whether or not it can be created now, with the
 * count of what already exists (Frappe's form-dashboard counts), plus the order before it.
 * @param {Record<string, any>|null|undefined} doc
 * @param {Record<string, number>} counts linked doctype → how many
 * @returns {Array<{ stage: string, label: string, boxes: Array<{ id: string, label: string, role: string, desk: string,
 *   made: number, canCreate: boolean, current?: boolean }> }>}
 */
export function soCreateFlow(doc, counts = {}) {
  const avail = new Set(soCreateEntries(doc).entries.map((e) => e.id));
  const c = counts || {};
  return FLOW_STAGES.map((st) => {
    /** @type {Array<{ id: string, label: string, role: string, desk: string, made: number, canCreate: boolean, current?: boolean }>} */
    let boxes;
    if (st.id === "before") boxes = [{ id: "quotation", label: "Estimate", role: "request", desk: "ar", made: num(c.Quotation), canCreate: false }];
    else if (st.id === "order") boxes = [{ id: "sales-order", label: (doc && doc.name) || "Sales Order", role: "order", desk: "ar", made: 1, canCreate: false, current: true }];
    else {
      boxes = SO_CREATE_CATALOG.filter((e) => e.stage === st.id).map((e) => ({
        id: e.id,
        label: e.label,
        role: e.role,
        desk: e.desk,
        made: e.countOf ? num(c[e.countOf]) : 0,
        canCreate: avail.has(e.id),
      }));
    }
    return { stage: st.id, label: st.label, boxes };
  }).filter((col) => col.boxes.length);
}

/**
 * Frappe's `get_open_count` answer → linked doctype → count.
 * @param {any} message the `message` of `frappe.desk.notifications.get_open_count`
 * @returns {Record<string, number>}
 */
export function linkedCounts(message) {
  /** @type {Record<string, number>} */
  const out = {};
  const rows = message && message.count && Array.isArray(message.count.external_links_found) ? message.count.external_links_found : [];
  for (const r of rows) if (r && r.doctype) out[String(r.doctype)] = num(r.count);
  return out;
}

/** The clerk's view of Create: a list (Vanilla's shape) or a flowchart. */
export const CREATE_VIEW_KEY = "so-create-view";
/** @param {unknown} v @returns {"list"|"flow"} */
export function normalizeCreateView(v) {
  return v === "flow" ? "flow" : "list";
}
