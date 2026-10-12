/**
 * Create ▾ › Purchase Order… on the Sales Order Doc skin (plan 2026-10-12 S2). Mirrors Vanilla's
 * Create › Purchase Order (`sales_order.js` `make_purchase_order`): tick the lines still to order,
 * give each a vendor, and ERPNext's own `make_purchase_order` builds one PO per vendor. Here every
 * PO is saved as a draft (5zorro), so — unlike Vanilla — the quantity already on draft POs for this
 * order counts as ordered: ERPNext only raises a line's `ordered_qty` when its PO is submitted, and
 * a second Create would otherwise order the same goods again.
 * Pure: which lines, how much, what to send, what to say.
 */

/** The Create menu's entries on a Sales Order, in the order Vanilla lists them that are built. */
export const SO_CREATE_ENTRIES = Object.freeze([
  // washProfile: the Doc skin whose wash the entry wears (src/doc-wash.js DOC_WASH_BY_PROFILE).
  Object.freeze({ id: "purchase-order", label: "Purchase Order…", doctypeKey: "purchase-order", washProfile: "po" }),
]);

/** Order statuses that take no new purchase orders (Vanilla hides Create › Purchase Order). */
const NO_PO_STATUSES = new Set(["Closed", "On Hold", "Completed", "Cancelled"]);

/**
 * @param {{ docstatus?: number|string, status?: string }|null|undefined} doc
 * @returns {{ ok: boolean, reason?: string }}
 */
export function canCreatePoFrom(doc) {
  if (!doc) return { ok: false, reason: "No Sales Order loaded." };
  if (Number(doc.docstatus) !== 1) return { ok: false, reason: "Submit the Sales Order first — ERPNext makes purchase orders only from a submitted order." };
  if (NO_PO_STATUSES.has(String(doc.status || ""))) return { ok: false, reason: `This order is ${doc.status} — it takes no new purchase orders.` };
  return { ok: true };
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round6 = (n) => Math.round(n * 1e6) / 1e6;

/**
 * The lines still to order, in the line's own unit: (stock qty − ordered − on draft POs) ÷
 * conversion factor, as Vanilla's `set_po_items_data` does, less the drafts.
 * @param {{ items?: Array<Record<string, any>> }|null|undefined} doc the Sales Order
 * @param {Record<string, { stockQty: number, pos: string[] }>} [onDrafts] by Sales Order line name
 * @returns {Array<{ rowName: string, itemCode: string, itemName: string, pendingQty: number, uom: string,
 *   supplier: string, onDraftPos: string[], fullyOnDrafts: boolean }>}
 */
export function poPendingLines(doc, onDrafts = {}) {
  const items = doc && Array.isArray(doc.items) ? doc.items : [];
  const out = [];
  for (const d of items) {
    if (!d || !d.item_code || !d.name) continue;
    const cf = num(d.conversion_factor) || 1;
    const drafts = onDrafts[d.name] || { stockQty: 0, pos: [] };
    const leftStock = num(d.stock_qty) - num(d.ordered_qty);
    if (leftStock <= 0) continue;
    const pendingQty = round6((leftStock - num(drafts.stockQty)) / cf);
    out.push({
      rowName: String(d.name),
      itemCode: String(d.item_code),
      itemName: String(d.item_name || ""),
      pendingQty: Math.max(0, pendingQty),
      uom: String(d.uom || d.stock_uom || ""),
      supplier: String(d.supplier || ""),
      onDraftPos: [...new Set(drafts.pos || [])],
      fullyOnDrafts: pendingQty <= 0,
    });
  }
  return out;
}

/**
 * Sum the draft PO lines that point at this order, by Sales Order line.
 * @param {Array<{ name?: string, sales_order_item?: string, stock_qty?: number|string }>} rows
 * @returns {Record<string, { stockQty: number, pos: string[] }>}
 */
export function draftQtyBySoLine(rows) {
  /** @type {Record<string, { stockQty: number, pos: string[] }>} */
  const acc = {};
  for (const r of Array.isArray(rows) ? rows : []) {
    const key = r && r.sales_order_item ? String(r.sales_order_item) : "";
    if (!key) continue;
    const slot = acc[key] || (acc[key] = { stockQty: 0, pos: [] });
    slot.stockQty = round6(slot.stockQty + num(r.stock_qty));
    if (r.name && !slot.pos.includes(String(r.name))) slot.pos.push(String(r.name));
  }
  return acc;
}

/**
 * What the clerk ticked, checked the way ERPNext will read it.
 * @param {Array<{ rowName: string, itemCode: string, itemName?: string, pendingQty: number, uom?: string,
 *   supplier: string, ticked: boolean }>} picks
 * @returns {{ ok: true, selectedItems: Array<Record<string, any>> } | { ok: false, reason: string }}
 */
export function poSelection(picks) {
  const ticked = (Array.isArray(picks) ? picks : []).filter((p) => p && p.ticked && p.pendingQty > 0);
  if (!ticked.length) return { ok: false, reason: "Tick at least one line to order." };
  const noVendor = ticked.filter((p) => !String(p.supplier || "").trim());
  if (noVendor.length) {
    return { ok: false, reason: `Every ticked line needs a vendor — missing on ${noVendor.map((p) => p.itemCode).join(", ")}.` };
  }
  // ERPNext maps by item code (`items_to_map[item_code] = supplier`): one item, one vendor.
  /** @type {Map<string, string>} */
  const vendorByItem = new Map();
  for (const p of ticked) {
    const v = String(p.supplier).trim();
    const had = vendorByItem.get(p.itemCode);
    if (had && had !== v) {
      return { ok: false, reason: `${p.itemCode} is on two lines with two vendors — ERPNext orders one item from one vendor at a time. Give both the same vendor, or untick one.` };
    }
    vendorByItem.set(p.itemCode, v);
  }
  return {
    ok: true,
    selectedItems: ticked.map((p) => ({
      name: p.rowName,
      item_code: p.itemCode,
      item_name: p.itemName || "",
      pending_qty: p.pendingQty,
      uom: p.uom || "",
      supplier: String(p.supplier).trim(),
    })),
  };
}

/**
 * The status line after Create, staying on the Sales Order (5zorro: Drafts' yellow and the Sources
 * column are the trail).
 * @param {string[]} names saved draft POs
 * @param {Array<{ supplier?: string, reason: string }>} [failed]
 * @returns {string}
 */
export function createdPosMessage(names, failed = []) {
  const list = Array.isArray(names) ? names : [];
  const bits = [];
  if (list.length === 1) bits.push(`Purchase order ${list[0]} saved as a draft (see Drafts).`);
  else if (list.length > 1) bits.push(`${list.length} purchase orders saved as drafts: ${list.join(", ")} (see Drafts).`);
  for (const f of Array.isArray(failed) ? failed : []) {
    bits.push(`Not saved${f.supplier ? ` for ${f.supplier}` : ""}: ${f.reason}`);
  }
  return bits.join(" ") || "No purchase order was made.";
}

/**
 * The PO source picker's Sales Order list (plan 2026-10-12 S3): ERPNext lists orders one row per
 * line here (child fields in `get_list`), so roll them up and keep the orders with a line still to
 * order — stock qty above ordered qty, as `make_purchase_order` filters them.
 * @param {Array<{ name?: string, customer?: string, customer_name?: string, transaction_date?: string,
 *   stock_qty?: number|string, ordered_qty?: number|string }>} lineRows
 * @returns {Array<{ name: string, customer: string, customer_name: string, transaction_date: string, lines_to_order: number }>}
 */
export function salesOrdersToOrder(lineRows) {
  /** @type {Map<string, { name: string, customer: string, customer_name: string, transaction_date: string, lines_to_order: number }>} */
  const by = new Map();
  for (const r of Array.isArray(lineRows) ? lineRows : []) {
    if (!r || !r.name) continue;
    const name = String(r.name);
    if (!by.has(name)) {
      by.set(name, {
        name,
        customer: String(r.customer || ""),
        customer_name: String(r.customer_name || ""),
        transaction_date: String(r.transaction_date || ""),
        lines_to_order: 0,
      });
    }
    if (num(r.stock_qty) > num(r.ordered_qty)) by.get(name).lines_to_order += 1;
  }
  return [...by.values()].filter((o) => o.lines_to_order > 0);
}
