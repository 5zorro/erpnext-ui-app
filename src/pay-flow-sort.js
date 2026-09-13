/**
 * Row order for the Pay Outstanding flow view (Packet 4b).
 *
 * The two aggregate columns want opposite row orders, so a sort can only ever line one of them up
 * (measured 2026-09-08 on 5zorro's 3-invoices x 3-installments case; see
 * `docs/mockups/pay-flow-shapes.html` section 2). That makes the sort a real choice about which
 * relationship the clerk is reading, and it makes *aggregate* ordering matter too: whichever side
 * cannot be contiguous should at least cross as little as possible.
 */

/** @typedef {"date"|"invoice"} ScheduleSortMode */

const str = (v) => (v == null ? "" : String(v));
const byDue = (a, b) => str(a && a.dueDate).localeCompare(str(b && b.dueDate));

/**
 * @param {ScheduleSortMode|string|null|undefined} mode
 * @returns {ScheduleSortMode}
 */
export function normalizeSortMode(mode) {
  return mode === "invoice" ? "invoice" : "date";
}

/**
 * "date": globally chronological (the default). "invoice": each invoice's installments contiguous,
 * chronological within, and the **invoices themselves ordered by their earliest due date** — not
 * alphabetically, which is what this did until 2026-09-08. Alphabetical order is arbitrary next to
 * a column of dates: it put a bill due in three months above one that is already overdue. Earliest
 * -due keeps an urgency spine while still grouping by invoice.
 *
 * @param {Array<{ invoice?: string, dueDate?: string }>} bills
 * @param {ScheduleSortMode|string} mode
 */
export function sortBillsForSchedule(bills, mode) {
  const rows = Array.isArray(bills) ? bills.slice() : [];
  if (normalizeSortMode(mode) === "date") return rows.sort(byDue);

  /** @type {Map<string, string>} invoice -> its earliest due date */
  const firstDue = new Map();
  for (const b of rows.slice().sort(byDue)) {
    const inv = str(b && b.invoice);
    if (!firstDue.has(inv)) firstDue.set(inv, str(b && b.dueDate));
  }
  return rows.sort((a, b) => {
    const ia = str(a && a.invoice);
    const ib = str(b && b.invoice);
    if (ia === ib) return byDue(a, b);
    const d = str(firstDue.get(ia)).localeCompare(str(firstDue.get(ib)));
    // Two invoices due the same day still need a stable order, or the column reshuffles on
    // every render for no visible reason.
    return d || ia.localeCompare(ib);
  });
}

/**
 * `installmentKey -> row position`, for the active row order.
 * @param {Array<{ installmentKey?: string }>} sortedBills
 * @returns {Map<string, number>}
 */
export function rowIndexOf(sortedBills) {
  const map = new Map();
  (Array.isArray(sortedBills) ? sortedBills : []).forEach((b, i) => {
    const k = str(b && b.installmentKey);
    if (k && !map.has(k)) map.set(k, i);
  });
  return map;
}

/**
 * Order aggregate rows by where their first member actually sits, so the column follows the sort
 * instead of fighting it. Suggested payments used to be ordered by `payOn` unconditionally, which
 * is right under the date sort and arbitrary under the invoice sort — every mismatch there is a
 * crossing the picture did not need.
 *
 * Aggregates with no member in the current rows sort last, keeping their relative order.
 *
 * @template T
 * @param {T[]} items
 * @param {(item: T) => string[]} keysOf
 * @param {Map<string, number>} rowIndex
 * @returns {T[]} a new array
 */
export function orderAggregatesByFirstRow(items, keysOf, rowIndex) {
  const list = Array.isArray(items) ? items.slice() : [];
  const idx = new Map();
  list.forEach((item, i) => {
    const positions = (keysOf(item) || [])
      .map((k) => rowIndex.get(str(k)))
      .filter((n) => typeof n === "number");
    idx.set(item, positions.length ? Math.min(...positions) : Number.POSITIVE_INFINITY);
  });
  // Index as the tiebreak keeps this a stable sort on every engine.
  return list
    .map((item, i) => ({ item, i }))
    .sort((a, b) => idx.get(a.item) - idx.get(b.item) || a.i - b.i)
    .map((e) => e.item);
}

/**
 * Are every aggregate's members consecutive rows under the active order? Used to explain the
 * tradeoff on the sort control rather than leaving the clerk to discover it.
 * @param {Array<{ keys?: string[] }>} items
 * @param {Map<string, number>} rowIndex
 */
export function aggregatesAreContiguous(items, rowIndex) {
  for (const it of Array.isArray(items) ? items : []) {
    const idx = (it && it.keys ? it.keys : [])
      .map((k) => rowIndex.get(str(k)))
      .filter((n) => typeof n === "number")
      .sort((a, b) => a - b);
    for (let i = 1; i < idx.length; i += 1) {
      if (idx[i] !== idx[i - 1] + 1) return false;
    }
  }
  return true;
}
