/**
 * The blind receiving sheet: what gets printed for a receiver to check a delivery against. Pure —
 * takes a Purchase Order as ERPNext returns it and gives back the printable model; no DOM, no
 * network.
 *
 * Blind means the receiver counts what arrived without being told what was ordered (spec §5). A
 * Purchase Order row carries the ordered quantity under more names than `qty` — `stock_qty`,
 * `received_qty`, `fg_item_qty`, and `total_weight`, which is weight × quantity and gives the count
 * away to anyone with the unit weight. So the model is built from an allowlist of what the sheet
 * shows, never by deleting what it should not: a field ERPNext adds in a later version stays off
 * the sheet until someone adds it here on purpose.
 */

import { buildLabelPayload } from "./label-payload.js";

/**
 * Build the sheet model.
 *
 * Every line gets a barcode payload for its item number (R1: the item, not the order line — one
 * format for the sheet, the shelf label and the item sticker). An item number no label can carry
 * does not stop the sheet: its line prints without a barcode, and `keyedByHand` lists it so the
 * page can say which lines must be typed in.
 *
 * Throws unless the order is submitted: a draft can still change under the receiver, and a
 * cancelled order has nothing to receive against.
 */
export function buildBlindPoSheet(po, { prefix } = {}) {
  if (!po || typeof po !== "object") throw new Error("blind sheet: no purchase order");
  if (po.docstatus !== 1) {
    throw new Error(`blind sheet: ${po.name || "this order"} is not submitted, so it cannot be received against`);
  }

  const lines = (po.items || []).map((row, index) => {
    const itemNumber = row.item_code;
    const line = {
      lineNumber: row.idx || index + 1,
      itemNumber,
      description: row.item_name || itemNumber,
      unit: row.uom || row.stock_uom || "",
      payload: null,
    };
    try {
      line.payload = buildLabelPayload(itemNumber, { prefix });
    } catch (err) {
      if (/prefix is required/.test(err.message)) throw err;
      // Leave payload null; the line is still on the sheet and gets counted by hand.
    }
    return line;
  });

  return {
    orderNumber: po.name,
    supplier: po.supplier_name || po.supplier,
    orderDate: po.transaction_date || "",
    lineCount: lines.length,
    lines,
    keyedByHand: lines.filter((line) => line.payload === null).map((line) => line.lineNumber),
  };
}
