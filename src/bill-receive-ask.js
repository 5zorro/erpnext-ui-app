/**
 * "Receive these with the bill?" — asked at Save on the Doc Bill (plan 2026-09-26, DF-01 R).
 *
 * ERPNext's own way to receive goods on the bill itself is the Purchase Invoice's `update_stock`
 * ("Update Stock"). Left off, a stock line with no Item Receipt behind it is booked to Stock
 * Received But Not Billed (`purchase_invoice.py set_expense_account`) and the goods never reach
 * inventory until someone enters a receipt. Simplified shows ERPNext's "Expense Head Changed"
 * message after the fact; the Doc skin showed nothing. This asks before the save, while the
 * choice can still be made — `update_stock` is not allow_on_submit.
 *
 * Pure: the stock-item lookup, the warehouse default and the "ask at save" setting come from main.
 */

/**
 * Customize Form opened on Purchase Invoice — where "Update Stock" can be defaulted on for every
 * new bill (a Property Setter; a site setting, not code). Customize Form reads `doc_type` from
 * route_options (customize_form.js onload).
 */
export const UPDATE_STOCK_DEFAULT_ROUTE = `/app/customize-form?${new URLSearchParams({
  doc_type: "Purchase Invoice",
}).toString()}`;

/** @param {unknown} raw @returns {{ askAtSave: boolean }} */
export function mergeReceiveAskPrefs(raw) {
  const r = raw && typeof raw === "object" ? /** @type {any} */ (raw) : {};
  return { askAtSave: r.askAtSave !== false };
}

const truthy = (v) => v === 1 || v === true || v === "1";

/**
 * Lines the bill would leave un-received: stock items with no receipt behind them and not shipped
 * straight to a customer. A drop-ship line (`delivered_by_supplier`) is never received by us, and
 * ERPNext skips the SRBNB swap for it too.
 * @param {any} doc Purchase Invoice
 * @param {Iterable<string>} stockCodes item codes whose Item has is_stock_item
 * @returns {any[]}
 */
export function unreceivedStockLines(doc, stockCodes) {
  const stock = new Set(stockCodes || []);
  return (Array.isArray(doc && doc.items) ? doc.items : []).filter(
    (r) =>
      r &&
      stock.has(String(r.item_code || "")) &&
      !r.pr_detail &&
      !r.purchase_receipt &&
      !truthy(r.delivered_by_supplier) &&
      Number(r.qty) > 0,
  );
}

/**
 * Whether to ask, and why not when not. One answer per document: "bill only" is remembered for the
 * session under every name the bill has had (a new draft is renamed on its first save).
 * @param {{
 *   doc: any,
 *   stockCodes: Iterable<string>,
 *   askAtSave: boolean,
 *   answered?: Set<string>,
 * }} input
 * @returns {{ ask: boolean, lines: any[], why: string }}
 */
export function receiveAskDecision({ doc, stockCodes, askAtSave, answered }) {
  const d = doc || {};
  const none = (why) => ({ ask: false, lines: [], why });
  if (Number(d.docstatus || 0) !== 0) return none("not a draft");
  if (truthy(d.update_stock)) return none("already receives with the bill");
  if (truthy(d.is_return)) return none("credit memo");
  if (String(d.is_opening || "No") === "Yes") return none("opening entry");
  if (answered && answered.has(String(d.name || ""))) return none("answered for this bill");
  const lines = unreceivedStockLines(d, stockCodes);
  if (!lines.length) return none("no unreceived stock lines");
  if (!askAtSave) return { ask: false, lines, why: "ask at save is off" };
  return { ask: true, lines, why: "" };
}

/**
 * Dialog wording.
 * @param {{ lineCount: number, warehouse: string, perpetual?: boolean }} input
 */
export function receiveAskCopy({ lineCount, warehouse, perpetual = true }) {
  const lines = lineCount === 1 ? "1 stock line has" : `${lineCount} stock lines have`;
  const where = warehouse ? `into ${warehouse}` : "into the warehouse on each line";
  return {
    title: "Receive these items with this bill?",
    body:
      `${lines} no Item Receipt behind ${lineCount === 1 ? "it" : "them"}. ` +
      (perpetual
        ? "Bill only: ERPNext parks the cost in Stock Received But Not Billed and inventory does not go up until an Item Receipt is entered. "
        : "Bill only: inventory does not go up until an Item Receipt is entered. ") +
      `Receive with this bill: ERPNext's own Update Stock — submitting the bill adds the goods ${where}, no Item Receipt needed. ` +
      "This can only be chosen before the bill is submitted.",
    receive: `Receive with this bill${warehouse ? ` (${warehouse})` : ""}`,
    billOnly: "Bill only — receive later",
    cancel: "Cancel",
    dontAsk: "Don't ask at save (bills stay bill-only unless Update Stock is on)",
    defaultLink: "Make ‘receive with the bill’ the default for every new bill (site setting)…",
  };
}

/**
 * Status line after a save that left stock un-received, when the question is switched off.
 * @param {number} lineCount
 */
export function receiveAskOffNote(lineCount) {
  return `${lineCount} stock line${lineCount === 1 ? "" : "s"} not received (Update Stock is off) — enter an Item Receipt, or turn ‘ask at save’ back on.`;
}
