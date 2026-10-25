/**
 * The Sources column on the Sales Order's items table (plan 2026-10-12 S4): where each line's
 * quantity comes from — `PO …-0001 ×3 (draft) · Stock ×2`, `WO … ×5 (to build)`,
 * `Not sourced ×2 (QOH ×7 Nos)`. Pure: the page fetches the rows, this decides what each line says.
 *
 * The rule agreed with 5zorro (2026-10-12):
 * - **Orders**: purchase order lines (draft or submitted), Work Orders, and the part of a Material
 *   Request line not yet ordered (the PO made from it is counted as a PO, not twice).
 * - **Stock ×N**: what ERPNext says left from stock — the line's *Delivered qty* (raised by a Delivery
 *   Note, and by a Sales Invoice with Update Stock ticked) plus stock reserved on the order — beyond
 *   what the orders above cover. ERPNext does not record which goods shipped, so a delivery is read
 *   as coming from the orders first.
 * - **Not sourced ×N (QOH ×n UOM)**: whatever is left, with the quantity on hand beside it.
 *
 * Everything is reckoned in stock units and shown in the line's own unit.
 */

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round6 = (n) => Math.round(n * 1e6) / 1e6;

/**
 * @typedef {{ kind: "po"|"wo"|"mr"|"stock"|"none", qty: number, name?: string, note?: string,
 *   route?: string, label: string }} SourcePart
 * @typedef {{ parts: SourcePart[], notSourced: number, qoh: number|null, stockUom: string }} LineSources
 */

/** "3", "2.5", "0.333" — the way a quantity reads in the column. */
export function formatSourceQty(q) {
  const n = round6(num(q));
  return String(Math.round(n * 1000) / 1000);
}

/**
 * @param {{
 *   items: Array<{ name: string, item_code?: string, stock_qty?: number, conversion_factor?: number, uom?: string,
 *     stock_uom?: string, delivered_qty?: number, warehouse?: string }>,
 *   purchaseOrders?: Array<{ name: string, docstatus?: number, sales_order_item?: string, stock_qty?: number }>,
 *   workOrders?: Array<{ name: string, docstatus?: number, status?: string, sales_order_item?: string, qty?: number }>,
 *   materialRequests?: Array<{ name: string, docstatus?: number, sales_order_item?: string, stock_qty?: number, ordered_qty?: number }>,
 *   reservations?: Array<{ voucher_detail_no?: string, reserved_qty?: number, delivered_qty?: number }>,
 *   bins?: Array<{ item_code?: string, warehouse?: string, actual_qty?: number }>,
 * }} input
 * @returns {Record<string, LineSources>} by Sales Order line name
 */
export function soLineSources(input) {
  const i = input || /** @type {any} */ ({});
  /** @type {Record<string, LineSources>} */
  const out = {};
  const byLine = (rows, key = "sales_order_item") => {
    /** @type {Map<string, any[]>} */
    const m = new Map();
    for (const r of Array.isArray(rows) ? rows : []) {
      const k = r && r[key] ? String(r[key]) : "";
      if (!k) continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return m;
  };
  const pos = byLine(i.purchaseOrders);
  const wos = byLine(i.workOrders);
  const mrs = byLine(i.materialRequests);
  const res = byLine(i.reservations, "voucher_detail_no");

  for (const it of Array.isArray(i.items) ? i.items : []) {
    if (!it || !it.name) continue;
    const cf = num(it.conversion_factor) || 1;
    const lineStock = num(it.stock_qty) || num(/** @type {any} */ (it).qty) * cf;
    const uom = String(it.uom || it.stock_uom || "");
    const shown = (stockQty) => round6(stockQty / cf);
    /** @type {SourcePart[]} */
    const parts = [];
    let orders = 0;

    for (const [name, rows] of groupByName(pos.get(it.name))) {
      const q = rows.reduce((a, r) => a + num(r.stock_qty), 0);
      if (q <= 0) continue;
      orders += q;
      const draft = rows.every((r) => num(r.docstatus) === 0);
      parts.push(part("po", name, shown(q), uom, draft ? "draft" : "", `/app/purchase-order/${encodeURIComponent(name)}`));
    }
    for (const [name, rows] of groupByName(wos.get(it.name))) {
      const q = rows.reduce((a, r) => a + num(r.qty), 0);
      if (q <= 0) continue;
      orders += q;
      const st = String(rows[0].status || "");
      const note = num(rows[0].docstatus) === 0 ? "draft" : st === "Completed" ? "built" : "to build";
      parts.push(part("wo", name, shown(q), uom, note, `/app/work-order/${encodeURIComponent(name)}`));
    }
    for (const [name, rows] of groupByName(mrs.get(it.name))) {
      const q = rows.reduce((a, r) => a + Math.max(0, num(r.stock_qty) - num(r.ordered_qty)), 0);
      if (q <= 0) continue;
      orders += q;
      parts.push(part("mr", name, shown(q), uom, "requested", `/app/material-request/${encodeURIComponent(name)}`));
    }

    const reservedLeft = (res.get(it.name) || []).reduce((a, r) => a + Math.max(0, num(r.reserved_qty) - num(r.delivered_qty)), 0);
    const fromStock = Math.max(0, Math.min(num(it.delivered_qty) * cf + reservedLeft, lineStock) - orders);
    if (fromStock > 0) parts.push(part("stock", "", shown(fromStock), uom, "", ""));

    const left = round6(Math.max(0, lineStock - orders - fromStock));
    const qoh = qohFor(i.bins, it);
    const stockUom = String(it.stock_uom || uom);
    if (left > 0) {
      const qohBit = qoh == null ? "" : ` (QOH ×${formatSourceQty(qoh)} ${stockUom})`.replace(/ \)$/, ")");
      parts.push({ kind: "none", qty: shown(left), label: `Not sourced ×${formatSourceQty(shown(left))}${qohBit}` });
    }
    out[it.name] = { parts, notSourced: shown(left), qoh, stockUom };
  }
  return out;
}

/** @returns {SourcePart} */
function part(kind, name, qty, uom, note, route) {
  const word = kind === "po" ? "PO" : kind === "wo" ? "WO" : kind === "mr" ? "MR" : "Stock";
  const label = `${word}${name ? ` ${name}` : ""} ×${formatSourceQty(qty)}${note ? ` (${note})` : ""}`;
  /** @type {SourcePart} */
  const p = { kind, qty, label };
  if (name) p.name = name;
  if (note) p.note = note;
  if (route) p.route = route;
  return p;
}

/** Rows grouped by document name, in first-seen order. */
function groupByName(rows) {
  /** @type {Map<string, any[]>} */
  const m = new Map();
  for (const r of rows || []) {
    const n = String(r.name || "");
    if (!n) continue;
    if (!m.has(n)) m.set(n, []);
    m.get(n).push(r);
  }
  return m;
}

/** Quantity on hand: the line's warehouse when it names one, else every warehouse. null = not read. */
function qohFor(bins, it) {
  if (!Array.isArray(bins)) return null;
  const code = String(it.item_code || "");
  const rows = bins.filter((b) => b && String(b.item_code || "") === code);
  const wh = String(it.warehouse || "");
  const pick = wh ? rows.filter((b) => String(b.warehouse || "") === wh) : rows;
  return round6(pick.reduce((a, b) => a + num(b.actual_qty), 0));
}

/** The wash role each source wears (src/doc-wash.js): orders blue, a request pale blue, stock amber. */
export const SOURCE_PART_WASH_ROLE = Object.freeze({ po: "order", wo: "order", mr: "request", stock: "fulfill" });

/**
 * Which desk each source belongs to, for the desk hatch (5zorro 2026-10-12: "apply the hatches like
 * how doc wash on the Home page does it"): a PO and a Material Request are A/P documents on this
 * A/R page; a Work Order and stock are on neither desk.
 */
export const SOURCE_PART_DESK = Object.freeze({ po: "ap", mr: "ap", wo: "", stock: "" });
