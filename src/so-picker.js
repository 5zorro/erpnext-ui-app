/**
 * Bill Sales Order picker — customer filter, SKU preference, implied margin (OI-134).
 * Shared ranking/labels for OI-028 / OI-036 later; do not fork a second SO SSoT.
 */

/** Non-color-only negative-margin marker (a11y). */
export const NEGATIVE_MARGIN_MARK = "(!)";

/**
 * @param {Array<{ item_code?: string }>|null|undefined} lines
 * @returns {string[]}
 */
export function billLineSkus(lines) {
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  for (const row of lines || []) {
    if (!row || row.item_code == null) continue;
    const code = String(row.item_code).trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

/**
 * @param {Array<{ item_code?: string }>|null|undefined} soItems
 * @returns {string[]}
 */
export function salesOrderLineSkus(soItems) {
  return billLineSkus(soItems);
}

/**
 * @param {string[]} billSkus
 * @param {string[]} soSkus
 * @returns {boolean}
 */
export function salesOrderMatchesBillSkus(billSkus, soSkus) {
  const bill = Array.isArray(billSkus) ? billSkus : [];
  const so = Array.isArray(soSkus) ? soSkus : [];
  if (!bill.length || !so.length) return false;
  const soSet = new Set(so);
  return bill.some((sku) => soSet.has(sku));
}

/**
 * Implied margin for matching SKUs: Σ(SO line amount) − Σ(Bill cost on matched lines).
 * Returns null when Bill has no lines or no SKU overlap.
 *
 * @param {Array<{ item_code?: string, qty?: number, rate?: number, amount?: number }>} billLines
 * @param {Array<{ item_code?: string, qty?: number, rate?: number, amount?: number }>} soItems
 * @returns {number|null}
 */
export function impliedMarginForBillAndSo(billLines, soItems) {
  const bill = Array.isArray(billLines) ? billLines : [];
  const so = Array.isArray(soItems) ? soItems : [];
  if (!bill.length || !so.length) return null;

  /** @type {Record<string, { qty: number, amount: number }>} */
  const billBySku = {};
  for (const row of bill) {
    if (!row || !row.item_code) continue;
    const code = String(row.item_code).trim();
    if (!code) continue;
    const qty = Number(row.qty);
    const rate = Number(row.rate);
    let amount = Number(row.amount);
    if (!Number.isFinite(amount)) {
      amount = Number.isFinite(qty) && Number.isFinite(rate) ? qty * rate : NaN;
    }
    if (!Number.isFinite(amount)) continue;
    if (!billBySku[code]) billBySku[code] = { qty: 0, amount: 0 };
    billBySku[code].qty += Number.isFinite(qty) ? qty : 0;
    billBySku[code].amount += amount;
  }

  let selling = 0;
  let matched = false;
  for (const row of so) {
    if (!row || !row.item_code) continue;
    const code = String(row.item_code).trim();
    if (!billBySku[code]) continue;
    matched = true;
    const qty = Number(row.qty);
    const rate = Number(row.rate);
    let amount = Number(row.amount);
    if (!Number.isFinite(amount)) {
      amount = Number.isFinite(qty) && Number.isFinite(rate) ? qty * rate : NaN;
    }
    if (Number.isFinite(amount)) selling += amount;
  }
  if (!matched) return null;

  let cost = 0;
  for (const code of Object.keys(billBySku)) {
    if (!so.some((r) => r && String(r.item_code || "").trim() === code)) continue;
    cost += billBySku[code].amount;
  }
  return selling - cost;
}

/**
 * @param {number|null|undefined} margin
 * @returns {boolean}
 */
export function isNegativeImpliedMargin(margin) {
  return margin != null && Number.isFinite(Number(margin)) && Number(margin) < 0;
}

/**
 * @param {number|null|undefined} n
 * @returns {string}
 */
export function formatImpliedMargin(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toFixed(2);
}

/**
 * @param {number|string|null|undefined} n
 * @returns {string}
 */
export function formatSoMoney(n) {
  if (n == null || n === "") return "";
  const x = Number(n);
  return Number.isFinite(x) ? x.toFixed(2) : "";
}

/**
 * Enrich one Sales Order row for picker UI.
 * @param {object} so
 * @param {Array<{ item_code?: string, qty?: number, rate?: number, amount?: number }>} billLines
 * @returns {object}
 */
export function enrichSalesOrderForPicker(so, billLines = []) {
  const row = so && typeof so === "object" ? so : {};
  const items = Array.isArray(row.items) ? row.items : [];
  const billSkus = billLineSkus(billLines);
  const soSkus = salesOrderLineSkus(items);
  const skuMatch = salesOrderMatchesBillSkus(billSkus, soSkus);
  const margin = impliedMarginForBillAndSo(billLines, items);
  const draft = Number(row.docstatus) === 0;
  const negative = isNegativeImpliedMargin(margin);
  return {
    ...row,
    skuMatch,
    impliedMargin: margin,
    negativeMargin: negative,
    draft,
  };
}

/**
 * @param {object} enriched from enrichSalesOrderForPicker
 * @returns {string}
 */
export function formatSalesOrderPickerLabel(enriched) {
  const row = enriched && typeof enriched === "object" ? enriched : {};
  const name = row.name != null ? String(row.name) : "";
  const customer = row.customer_name || row.customer || "";
  const money = formatSoMoney(row.grand_total);
  const skuBit = row.skuMatch ? "SKU match" : "no SKU match";
  const marginBit = `margin ${formatImpliedMargin(row.impliedMargin)}`;
  const caution = row.negativeMargin ? `${NEGATIVE_MARGIN_MARK} ` : "";
  if (row.draft) {
    return `${caution}n/a — draft   ·   ${name}   ·   ${customer}`;
  }
  return `${caution}${name}   ·   ${customer}   ·   ${money}   ·   ${skuBit}   ·   ${marginBit}`;
}

/**
 * Rank SO rows for Bill picker: submitted + SKU match first, then margin desc, drafts last.
 * @param {object[]} orders raw SO rows with optional `items` child arrays
 * @param {Array<{ item_code?: string, qty?: number, rate?: number, amount?: number }>} billLines
 * @returns {object[]}
 */
export function rankSalesOrdersForBill(orders, billLines = []) {
  const enriched = (orders || []).map((so) => enrichSalesOrderForPicker(so, billLines));
  return enriched.sort((a, b) => {
    if (a.draft !== b.draft) return a.draft ? 1 : -1;
    if (a.skuMatch !== b.skuMatch) return a.skuMatch ? -1 : 1;
    const ma = a.impliedMargin;
    const mb = b.impliedMargin;
    if (ma != null && mb != null && ma !== mb) return mb - ma;
    if (ma != null && mb == null) return -1;
    if (ma == null && mb != null) return 1;
    const da = String(a.transaction_date || a.delivery_date || "");
    const db = String(b.transaction_date || b.delivery_date || "");
    return db.localeCompare(da);
  });
}

/**
 * @param {object} enriched
 * @returns {boolean}
 */
export function isSelectableSalesOrderRow(enriched) {
  return !!(enriched && !enriched.draft && enriched.name);
}
