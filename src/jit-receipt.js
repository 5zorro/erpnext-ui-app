/**
 * Just-in-time Item Receipts from Bill lines (plan 2026-09-26 "DF-02 follow-ups", J — 5zorro
 * 2026-10-10). Pure: no ERPNext calls; main makes the receipts, the page keeps the who/when.
 *
 * - Per line: Received by (plain text, typed for someone else — it cannot be verified) and
 *   Received on. On Submit, before the bill: one Item Receipt per person + date (lines from several
 *   POs and lines on no PO together), qty and rate from the bill — the bill is the source of truth.
 * - No custom fields (Clean Core): the receipt says who in its own Remarks (`Received by: …`), and
 *   a draft bill keeps pending who/when in its Remarks as a `[received]` block until Submit.
 * - ERPNext refuses Update Stock on a bill once any line points at a receipt
 *   (`validate_purchase_receipt_if_update_stock`), so any line with who/when, or any line already
 *   from a receipt, puts the whole bill on the receipt route.
 */
import { unreceivedStockLines } from "./bill-receive-ask.js";

/** @typedef {{ by: string, on: string }} Received */
/** @typedef {{ line: number, item_code: string, by: string, on: string }} BlockEntry */

const BLOCK_RE = /\n*\[received\]\n([\s\S]*?)\n?\[\/received\]\n*/;
const ENTRY_RE = /^\s*(\d+)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(\d{4}-\d{2}-\d{2})?\s*$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The bill's Remarks as the clerk wrote them, without the shell's block. */
export function stripReceivedBlock(remarks) {
  return String(remarks || "").replace(BLOCK_RE, "\n").trim();
}

/**
 * @param {string} remarks
 * @returns {BlockEntry[]}
 */
export function parseReceivedBlock(remarks) {
  const m = String(remarks || "").match(BLOCK_RE);
  if (!m) return [];
  return m[1]
    .split("\n")
    .map((l) => l.match(ENTRY_RE))
    .filter(Boolean)
    .map((e) => ({ line: Number(e[1]), item_code: e[2], by: e[3], on: e[4] || "" }));
}

/**
 * The clerk's text plus the block (no block when there is nothing pending).
 * @param {string} text
 * @param {BlockEntry[]} entries
 */
export function withReceivedBlock(text, entries) {
  const body = stripReceivedBlock(text);
  const list = (entries || []).filter((e) => e && (e.by || e.on));
  if (!list.length) return body;
  const block = ["[received]", ...list.map((e) => `${e.line} | ${e.item_code} | ${e.by} | ${e.on}`), "[/received]"].join("\n");
  return body ? `${body}\n\n${block}` : block;
}

/** A line's identity in the block: its line number and item code. */
const lineNo = (row, i) => (Number(row && row.idx) > 0 ? Number(row.idx) : i + 1);

/**
 * Pending who/when (keyed by item row name) → block entries.
 * @param {any} doc Purchase Invoice
 * @param {Map<string, Received>} pending
 * @returns {BlockEntry[]}
 */
export function blockEntriesFor(doc, pending) {
  const items = Array.isArray(doc && doc.items) ? doc.items : [];
  /** @type {BlockEntry[]} */
  const out = [];
  items.forEach((row, i) => {
    const p = row && row.name ? pending.get(String(row.name)) : null;
    if (p && (p.by || p.on)) out.push({ line: lineNo(row, i), item_code: String(row.item_code || ""), by: p.by || "", on: p.on || "" });
  });
  return out;
}

/**
 * Block entries → pending, matched by line number + item code. An entry whose line moved or
 * changed item is dropped and reported, never guessed onto another line.
 * @param {any} doc
 * @param {BlockEntry[]} entries
 * @returns {{ pending: Map<string, Received>, dropped: BlockEntry[] }}
 */
export function pendingFromBlock(doc, entries) {
  const items = Array.isArray(doc && doc.items) ? doc.items : [];
  /** @type {Map<string, Received>} */
  const pending = new Map();
  /** @type {BlockEntry[]} */
  const dropped = [];
  for (const e of entries || []) {
    const i = items.findIndex((row, k) => lineNo(row, k) === e.line);
    const row = i >= 0 ? items[i] : null;
    if (row && row.name && String(row.item_code || "") === e.item_code && !row.pr_detail) {
      pending.set(String(row.name), { by: e.by, on: e.on });
    } else dropped.push(e);
  }
  return { pending, dropped };
}

/**
 * A save renames a new draft's item rows; carry pending who/when across by line + item code.
 * @param {Map<string, Received>} pending
 * @param {any[]} oldItems
 * @param {any[]} newItems
 * @returns {Map<string, Received>}
 */
export function remapPending(pending, oldItems, newItems) {
  const next = new Map();
  const fresh = Array.isArray(newItems) ? newItems : [];
  const names = new Set(fresh.map((r) => r && String(r.name)));
  const old = Array.isArray(oldItems) ? oldItems : [];
  for (const [name, val] of pending) {
    if (names.has(name)) {
      next.set(name, val);
      continue;
    }
    const k = old.findIndex((r) => r && String(r.name) === name);
    if (k < 0) continue;
    const was = old[k];
    const j = fresh.findIndex((r, n) => lineNo(r, n) === lineNo(was, k) && String(r.item_code || "") === String(was.item_code || ""));
    if (j >= 0 && fresh[j].name) next.set(String(fresh[j].name), val);
  }
  return next;
}

/** `Received by: <name>` — the receipt's own record of who (5zorro: Remarks, no custom field). */
export function receiptRemarks(by, billName) {
  const lines = [`Received by: ${String(by || "").trim()}`];
  if (billName) lines.push(madeFromBillToken(billName));
  return lines.join("\n");
}

/**
 * Who received an existing receipt: its Remarks line, else whoever created it.
 * @param {{ remarks?: string, owner?: string, owner_name?: string }} receipt
 */
export function receivedByOf(receipt) {
  const m = String((receipt && receipt.remarks) || "").match(/^Received by:\s*(.+?)\s*$/m);
  if (m) return m[1];
  return String((receipt && (receipt.owner_name || receipt.owner)) || "");
}

/**
 * The default Received on: the day before the invoice date (5zorro 2026-10-10 — common ERP
 * practice, so goods sold the day they are billed are not costed as sold before they arrived).
 * @param {string} isoDate YYYY-MM-DD
 * @returns {string} YYYY-MM-DD, or "" for no date
 */
export function dayBefore(isoDate) {
  const s = String(isoDate || "");
  if (!ISO_RE.test(s)) return "";
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) - 86400000);
  return t.toISOString().slice(0, 10);
}

/**
 * What Submit does with stock lines.
 * @param {{ doc: any, stockCodes: Iterable<string>, pending: Map<string, Received> }} input
 * @returns {{
 *   route: "receipts" | "update-stock",
 *   groups: { by: string, on: string, rows: number[] }[],
 *   missing: number[],
 * }} rows are item indexes into doc.items
 */
export function jitPlan({ doc, stockCodes, pending }) {
  const items = Array.isArray(doc && doc.items) ? doc.items : [];
  const open = new Set(unreceivedStockLines(doc, stockCodes));
  const hasReceiptSource = items.some((r) => r && (r.pr_detail || r.purchase_receipt));
  /** @type {Map<string, { by: string, on: string, rows: number[] }>} */
  const groups = new Map();
  /** @type {number[]} */
  const missing = [];
  // Half a who/when is still the clerk saying "this goes through a receipt".
  let anyTyped = false;
  items.forEach((row, i) => {
    if (!open.has(row)) return;
    const p = row.name ? pending.get(String(row.name)) : null;
    const by = p && p.by ? String(p.by).trim() : "";
    const on = p && ISO_RE.test(String(p.on || "")) ? String(p.on) : "";
    if (by || on) anyTyped = true;
    if (!by || !on) {
      missing.push(i);
      return;
    }
    const key = `${on}\u0000${by.toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, { by, on, rows: [] });
    groups.get(key).rows.push(i);
  });
  const ordered = [...groups.values()].sort((a, b) => (a.on === b.on ? a.by.localeCompare(b.by) : a.on < b.on ? -1 : 1));
  const route = anyTyped || hasReceiptSource ? "receipts" : "update-stock";
  return { route, groups: ordered, missing: route === "receipts" ? missing : [] };
}

/**
 * The Item Receipt for one person + date, from the bill's own lines (qty, rate, warehouse, PO link).
 * @param {{ bill: any, group: { by: string, on: string, rows: number[] }, defaultWarehouse?: string }} input
 * @returns {{ ok: true, doc: any } | { ok: false, reason: string }}
 */
export function receiptDocFor({ bill, group, defaultWarehouse = "" }) {
  const b = bill || {};
  const items = [];
  for (const i of group.rows) {
    const r = (b.items || [])[i];
    if (!r) return { ok: false, reason: `Line ${i + 1} is gone — refresh and retry.` };
    const warehouse = r.warehouse || b.set_warehouse || defaultWarehouse;
    if (!warehouse) return { ok: false, reason: `Line ${lineNo(r, i)} (${r.item_code}) has no warehouse to receive into.` };
    const line = {
      item_code: r.item_code,
      item_name: r.item_name,
      description: r.description,
      qty: r.qty,
      uom: r.uom,
      stock_uom: r.stock_uom,
      conversion_factor: r.conversion_factor || 1,
      rate: r.rate,
      price_list_rate: r.price_list_rate || r.rate,
      warehouse,
    };
    if (r.purchase_order && r.po_detail) {
      line.purchase_order = r.purchase_order;
      line.purchase_order_item = r.po_detail;
    }
    if (r.project) line.project = r.project;
    if (r.cost_center) line.cost_center = r.cost_center;
    items.push(line);
  }
  return {
    ok: true,
    doc: {
      doctype: "Purchase Receipt",
      supplier: b.supplier,
      company: b.company,
      posting_date: group.on,
      set_posting_time: 1,
      currency: b.currency,
      conversion_rate: b.conversion_rate,
      buying_price_list: b.buying_price_list,
      remarks: receiptRemarks(group.by, b.name && !String(b.name).startsWith("new-") ? b.name : ""),
      items,
    },
  };
}

/** The token a just-in-time receipt carries in its Remarks, naming the bill it was made for. */
export function madeFromBillToken(billName) {
  return `Made from bill ${billName} by the Doc shell`;
}

/**
 * A receipt already made from this bill for this person + date, whose lines cover the group's
 * lines (same item, same qty, each receipt line used once). Reusing it keeps a retried Submit
 * from receiving the same goods twice — the first dogfood run made a receipt, then the bill's
 * save was refused, leaving the receipt submitted and the bill unlinked (5zorro 2026-10-10).
 * @param {{ bill: any, group: { by: string, on: string, rows: number[] }, receipts: { name: string, posting_date: string, remarks: string, items: { name: string, item_code: string, qty: number }[] }[] }} input
 * @returns {{ name: string, prDetails: string[] } | null} prDetails in group.rows order
 */
export function matchExistingReceipt({ bill, group, receipts }) {
  const token = madeFromBillToken(bill && bill.name);
  for (const r of receipts || []) {
    if (!r || !String(r.remarks || "").includes(token)) continue;
    if (String(r.posting_date) !== group.on) continue;
    if (receivedByOf(r).toLowerCase() !== String(group.by).toLowerCase()) continue;
    const free = [...(r.items || [])];
    const prDetails = [];
    for (const i of group.rows) {
      const line = (bill.items || [])[i];
      const k = free.findIndex((it) => line && it.item_code === line.item_code && Math.abs(Number(it.qty) - Number(line.qty)) < 1e-9);
      if (k < 0) break;
      prDetails.push(free[k].name);
      free.splice(k, 1);
    }
    if (prDetails.length === group.rows.length) return { name: r.name, prDetails };
  }
  return null;
}
