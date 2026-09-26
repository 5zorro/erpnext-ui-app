/**
 * Sample rows for the Find page mockups (implementation-plan-2026-09-26, stage F1).
 *
 * ponytail: static, deterministic fixtures so the page can be judged before sample data and a
 * live list query exist. Delete this file when stage F3 reads real rows over HTTP — nothing
 * else depends on it but `find-doc.html`.
 */

import { findSkinFor } from "./find-skin-registry.js";

/** Naming-series prefixes as this sandbox prints them, so sample names look familiar. */
const NAME_PREFIX = Object.freeze({
  quotation: "SAL-QTN-2026-",
  "sales-order": "SAL-ORD-2026-",
  "purchase-order": "PUR-ORD-2026-",
  "purchase-receipt": "MAT-PRE-2026-",
  "purchase-invoice": "ACC-PINV-2026-",
  "payment-entry": "ACC-PAY-2026-",
  "sales-invoice": "ACC-SINV-2026-",
});

const METHODS = ["Check", "ACH", "Wire Transfer", "Credit Card"];

/**
 * Small deterministic generator (mulberry32) — same rows every load, so a screenshot today and
 * one tomorrow can be compared.
 * @param {number} seed
 */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** @param {string} s */
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * @param {number} n
 * @param {number} w
 */
function pad(n, w) {
  return String(n).padStart(w, "0");
}

/**
 * ISO date `days` before 2026-09-26 (fixed, so the mock does not drift with the clock).
 * @param {number} days
 */
function isoDaysBefore(days) {
  const d = new Date(Date.UTC(2026, 8, 26) - days * 86400000);
  return d.toISOString().slice(0, 10);
}

/**
 * @param {string} doctypeKey
 * @param {{ count?: number, direction?: "Pay"|"Receive" }} [opts]
 * @returns {Array<Record<string, string|number>>} rows keyed by the skin's column fields, plus
 *   `name`, `party` (display) and `items` for the peek drawer
 */
export function findSkinSampleRows(doctypeKey, opts = {}) {
  const skin = findSkinFor(doctypeKey);
  if (!skin) return [];
  const count = Math.max(0, Math.min(40, Number(opts.count) || 12));
  const receive = skin.directional && opts.direction === "Receive";
  const partyWord = receive || skin.desk === "ar" ? "Customer" : "Vendor";
  const rand = rng(hash(`${skin.doctypeKey}:${receive ? "R" : "P"}`));
  const prefix = NAME_PREFIX[skin.doctypeKey] || "DOC-2026-";
  const statuses = skin.statuses;
  const rows = [];
  for (let i = 0; i < count; i++) {
    // Bell-ish spread: a few parties own most rows, like real activity.
    const partyNo = 1 + Math.floor(Math.pow(rand(), 1.8) * 6);
    const party = `SAMPLE ${partyWord} ${pad(partyNo, 2)}`;
    const age = Math.floor(rand() * 75);
    const total = Math.round((150 + rand() * 9800) * 100) / 100;
    const status = statuses[Math.floor(rand() * statuses.length)];
    const settled = /Paid|Completed|Ordered|Submitted/.test(status) && !/Partly/.test(status);
    const partial = /Partly|Partially|To Bill|To Receive and Bill|To Deliver and Bill/.test(status);
    const frac = settled ? 1 : partial ? Math.round(rand() * 80 + 10) / 100 : 0;
    const name = `${prefix}${pad(180 + i * 7 + Math.floor(rand() * 5), 5)}`;
    /** @type {Record<string, string|number>} */
    const row = { name, party, status };
    for (const col of skin.columns) {
      if (col.field in row) continue;
      if (col.kind === "date") {
        const later = /due|valid|delivery|schedule/.test(col.field);
        row[col.field] = isoDaysBefore(later ? age - 30 : age);
      } else if (col.kind === "money") {
        row[col.field] = /outstanding|unallocated/.test(col.field)
          ? Math.round(total * (1 - frac) * 100) / 100
          : total;
      } else if (col.kind === "percent") {
        row[col.field] = Math.round(frac * 100);
      } else if (col.field === "mode_of_payment") {
        row[col.field] = METHODS[Math.floor(rand() * METHODS.length)];
      } else if (col.field === "title") {
        row[col.field] = `L-${pad(4100 + i * 3, 5)}`;
      } else {
        row[col.field] = `${partyWord === "Vendor" ? "V" : "C"}${pad(Math.floor(rand() * 90000) + 10000, 5)}`;
      }
    }
    row[skin.party.field] = party;
    row.items = sampleLines(rand, total);
    rows.push(row);
  }
  return rows;
}

/**
 * Three to five lines that add up to the document total, for the peek drawer.
 * @param {() => number} rand
 * @param {number} total
 */
function sampleLines(rand, total) {
  const n = 3 + Math.floor(rand() * 3);
  const weights = Array.from({ length: n }, () => 0.2 + rand());
  const sum = weights.reduce((a, b) => a + b, 0);
  let left = Math.round(total * 100);
  return weights.map((w, i) => {
    const cents = i === n - 1 ? left : Math.round((total * 100 * w) / sum);
    left -= cents;
    const qty = 1 + Math.floor(rand() * 12);
    return {
      item: `SAMPLE-ITEM-${pad(Math.floor(rand() * 900) + 100, 4)}`,
      qty,
      amount: cents / 100,
    };
  });
}

/**
 * Rows grouped by party for the card layout, busiest party first.
 * @param {Array<Record<string, any>>} rows
 * @returns {Array<{ party: string, rows: Array<Record<string, any>> }>}
 */
export function groupRowsByParty(rows) {
  /** @type {Map<string, Array<Record<string, any>>>} */
  const by = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const key = String(r.party || "");
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(r);
  }
  return [...by.entries()]
    .map(([party, list]) => ({ party, rows: list }))
    .sort((a, b) => b.rows.length - a.rows.length || a.party.localeCompare(b.party));
}
