/**
 * "Costing Assumptions!" — what a Bill line assigned to Sales Orders does to their costing, shown
 * before it happens and kept after (review 10-19 R6b-4, 5zorro 2026-10-22).
 *
 * A Sales Order line filled partly from this Bill and partly from stock is costed two ways: the
 * Bill's price for one part, stock's own rate for the other — and when stock runs negative, a
 * fallback rate that may not be what anyone paid. Anything but an exact fill is that assumption, so
 * the clerk sees it per order and says "Okay". The same box is to be readable later from the Sales
 * Order ("how did this get allocated?"), so the decision is written down when it is made: a Comment
 * opening with `COSTING_TOKEN` on the bridge Purchase Order and on each Sales Order, carrying the
 * table as text and a `data:` line to draw the box again. An order's open qty *at that moment*
 * cannot be worked out afterwards, which is why the record is needed at all.
 */

export const COSTING_TOKEN = "Costing assumptions:";
export const COSTING_TITLE = "Costing Assumptions!";
export const COSTING_LEAD =
  "This bill's cost goes to the orders below. What an order still needs beyond that is filled from " +
  "stock, costed at stock's own rate — or, if stock runs negative, at the item's fallback rate, which " +
  "may not be what you paid. What the bill buys beyond the orders goes into stock.";

/** @param {number} n */
function qtyText(n) {
  const x = Math.round(Number(n) * 1000) / 1000;
  return Number.isFinite(x) ? String(x) : "";
}

/**
 * The box's rows, as text — the same for the Bill's confirm and the Sales Order's look-back.
 * Quantities are in the item's stock unit (`plan.uom`).
 * @param {{ rows: Array<{ salesOrder: string, salesOrderItem: string, open: number, gets: number, diff: number, fromStock: boolean }>, toStock: number, uom?: string }} plan
 * @returns {{ unit: string, rows: Array<{ salesOrder: string, open: string, gets: string, fromStockQty: string, note: string, fromStock: boolean, canTick: boolean }>, stockRow: string|null }}
 */
export function costingBoxModel(plan) {
  const unit = plan && plan.uom ? String(plan.uom) : "";
  const rows = (plan && Array.isArray(plan.rows) ? plan.rows : []).map((r) => {
    const short = r.diff < 0 ? -r.diff : 0;
    let note = "";
    if (!r.salesOrderItem) note = "no line for this item";
    else if (r.fromStock) note = "all from stock (ticked)";
    else if (short > 0) note = `${qtyText(short)} from stock`;
    else note = "exact";
    return {
      salesOrder: r.salesOrder,
      open: qtyText(r.open),
      gets: qtyText(r.gets),
      fromStockQty: short > 0 ? qtyText(short) : "",
      note,
      fromStock: !!r.fromStock,
      canTick: !!r.salesOrderItem && r.open > 0,
    };
  });
  const extra = Number(plan && plan.toStock) || 0;
  return {
    unit,
    rows,
    stockRow: extra > 0 ? `${qtyText(extra)}${unit ? ` ${unit}` : ""} more than the orders need → into stock` : null,
  };
}

/**
 * The Comment that keeps the decision.
 * @param {{ bill: string, line: number, item: string, qty: number, uom?: string, po: string, by: string,
 *   plan: { rows: Array<{ salesOrder: string, salesOrderItem: string, open: number, gets: number, diff: number, fromStock: boolean }>, toStock: number } }} c
 * @returns {string}
 */
export function costingNote(c) {
  const box = costingBoxModel({ ...c.plan, uom: c.uom || c.plan.uom });
  const unit = box.unit ? ` ${box.unit}` : "";
  const lines = [
    `${COSTING_TOKEN} ${c.bill} line ${c.line}, ${c.item} × ${qtyText(c.qty)}${unit} → ${c.po} (Doc shell; ${c.by || "a person"} said Okay)`,
    "",
    ...box.rows.map((r) => `${r.salesOrder}: needed ${r.open}, from this bill ${r.gets} — ${r.note}`),
    ...(box.stockRow ? [box.stockRow] : []),
    "",
    COSTING_LEAD,
    "",
    `data: ${JSON.stringify({ v: 1, bill: c.bill, line: c.line, item: c.item, qty: c.qty, uom: box.unit, po: c.po, rows: c.plan.rows, toStock: c.plan.toStock })}`,
  ];
  // Desk shows a Comment as HTML: the text is escaped (the vendor's bill no. is typed by a person)
  // and its lines are <br>s, so it reads as written; parseCostingNote undoes both.
  return lines.map(escapeHtml).join("<br>");
}

/** @param {string} s */
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Read a costing Comment back (its content as ERPNext stores it — maybe HTML, maybe escaped).
 * @param {unknown} content
 * @returns {{ bill: string, line: number, item: string, qty: number, uom?: string, po: string, rows: any[], toStock: number }|null}
 */
export function parseCostingNote(content) {
  const text = String(content == null ? "" : content)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
  if (!text.includes(COSTING_TOKEN)) return null;
  const m = /^data: (\{.*\})\s*$/m.exec(text);
  if (!m) return null;
  try {
    const d = JSON.parse(m[1]);
    return d && d.v === 1 && Array.isArray(d.rows) ? d : null;
  } catch {
    return null;
  }
}
