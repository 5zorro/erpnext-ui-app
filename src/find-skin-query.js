/**
 * Find pages, live (implementation-plan-2026-09-26, stage F3) — what the page's searches mean as
 * a Frappe list query, and how a returned document reads on the page.
 *
 * The Vanilla list and the Find page ask ERPNext the same question: the same doctype, the same
 * fields the registry names, the Vanilla list's own order (`creation desc` — every one of these
 * doctypes sets `sort_field: creation`, checked on the sandbox 2026-09-26). main.js sends it over
 * HTTP (`/api/resource`, the G1 path), never through the hidden ERP page.
 *
 * The page can also sort by any column it shows (server-side, so the order covers every matching
 * document, not just the ones loaded), load the next page, and remember its last search
 * (`findSavedSearch`) — 5zorro 2026-09-26.
 *
 * Differences from Vanilla, on purpose:
 *   - A search box matches *part* of a value (`like %text%`) — the page searches as you type,
 *     where Vanilla's `?field=value` filters are exact. "Search in Vanilla list →" still hands
 *     over exact filters.
 *   - The party box matches the party's id *or* its display name (`or_filters`).
 */

import { findSkinFor, findSearchValues } from "./find-skin-registry.js";

/** Newest documents shown; one more is asked for, to know whether there are more. */
export const FIND_LIST_LIMIT = 200;

/** Vanilla's list order for all seven doctypes (DocType `sort_field` / `sort_order`). */
export const FIND_LIST_ORDER = "creation desc";

/**
 * @typedef {{
 *   doctype: string,
 *   fields: string[],
 *   filters: Array<[string, string, string]>,
 *   orFilters: Array<[string, string, string]>,
 *   orderBy: string,
 *   limit: number,
 *   start: number,
 * }} FindListQuery
 *
 * @typedef {{ field: string, dir: "asc"|"desc" }} FindSort
 */

/**
 * Fields a Find page may sort by: its own columns, the document number, and Vanilla's default.
 * @param {string} doctypeKey
 * @returns {string[]}
 */
export function findSortableFields(doctypeKey) {
  const skin = findSkinFor(doctypeKey);
  if (!skin) return [];
  return [...new Set(["creation", "name", ...skin.columns.map((c) => c.field)])];
}

/**
 * A sort the page may send, or Vanilla's default. Anything else is dropped — it becomes an SQL
 * ORDER BY on the server, so only known fieldnames and asc/desc get through.
 * @param {string} doctypeKey
 * @param {unknown} sort
 * @returns {FindSort}
 */
export function findSortFor(doctypeKey, sort) {
  const s = sort && typeof sort === "object" ? /** @type {Record<string, unknown>} */ (sort) : {};
  const field = typeof s.field === "string" ? s.field : "";
  const dir = s.dir === "asc" ? "asc" : "desc";
  if (field && findSortableFields(doctypeKey).includes(field)) return { field, dir };
  return { field: "creation", dir: "desc" };
}

/**
 * Next sort after a click on a column heading: same column flips, a new column starts with its
 * natural order (dates, money and percents biggest/newest first; text A→Z).
 * @param {string} doctypeKey
 * @param {FindSort} current
 * @param {string} field
 * @returns {FindSort}
 */
export function findNextSort(doctypeKey, current, field) {
  const skin = findSkinFor(doctypeKey);
  if (current && current.field === field) {
    return findSortFor(doctypeKey, { field, dir: current.dir === "asc" ? "desc" : "asc" });
  }
  const col = skin ? skin.columns.find((c) => c.field === field) : null;
  const textish = !col || col.kind === "text" || col.kind === "status";
  return findSortFor(doctypeKey, { field, dir: textish ? "asc" : "desc" });
}

/**
 * @param {string} text
 * @returns {string}
 */
function likeValue(text) {
  return `%${text}%`;
}

/**
 * @param {string} doctypeKey
 * @param {{
 *   values?: Record<string, unknown>,
 *   status?: string,
 *   direction?: string,
 *   sort?: unknown,
 *   start?: unknown,
 * }} [opts]
 * @returns {FindListQuery|null} null when there is no Find page for this doctype
 */
export function findListQuery(doctypeKey, opts = {}) {
  const skin = findSkinFor(doctypeKey);
  if (!skin) return null;
  const fields = [
    "name",
    "docstatus",
    "status",
    skin.party.field,
    skin.party.nameField,
    ...skin.columns.map((c) => c.field),
  ];
  /** @type {Array<[string, string, string]>} */
  const filters = [];
  /** @type {Array<[string, string, string]>} */
  const orFilters = [];
  const values = findSearchValues(skin, opts.values);
  for (const s of skin.searches) {
    const v = values[s.field];
    if (!v) continue;
    if (s.id === "party") {
      orFilters.push([skin.party.field, "like", likeValue(v)], [skin.party.nameField, "like", likeValue(v)]);
    } else {
      filters.push([s.field, "like", likeValue(v)]);
    }
  }
  const status = opts.status != null ? String(opts.status).trim() : "";
  if (status && skin.statuses.includes(status)) filters.push(["status", "=", status]);
  if (skin.directional) {
    const dir = opts.direction === "Receive" ? "Receive" : "Pay";
    filters.push(["payment_type", "=", dir]);
  }
  return {
    doctype: skin.doctype,
    fields: [...new Set(fields)],
    filters,
    orFilters,
    orderBy: (() => {
      const sort = findSortFor(skin.doctypeKey, opts.sort);
      return `${sort.field} ${sort.dir}`;
    })(),
    limit: FIND_LIST_LIMIT + 1,
    start: Number.isInteger(Number(opts.start)) && Number(opts.start) > 0 ? Number(opts.start) : 0,
  };
}

/**
 * @typedef {Record<string, unknown> & { name: string, party: string }} FindRow
 */

/**
 * List rows as the page shows them: `party` is the display name, falling back to the id.
 * Also says whether the list was cut at FIND_LIST_LIMIT.
 * @param {string} doctypeKey
 * @param {unknown} rows as returned by /api/resource
 * @returns {{ rows: FindRow[], more: boolean }}
 */
export function findRowsFromList(doctypeKey, rows) {
  const skin = findSkinFor(doctypeKey);
  const list = Array.isArray(rows) ? rows.filter((r) => r && typeof r === "object") : [];
  if (!skin) return { rows: [], more: false };
  const more = list.length > FIND_LIST_LIMIT;
  return {
    more,
    rows: list.slice(0, FIND_LIST_LIMIT).map((r) => {
      const row = /** @type {Record<string, unknown>} */ (r);
      const id = String(row[skin.party.field] ?? "").trim();
      const shown = String(row[skin.party.nameField] ?? "").trim();
      return { ...row, name: String(row.name ?? ""), party: shown || id || "—" };
    }),
  };
}

/**
 * Group rows by party, keeping the list's own order (newest first) inside each group and
 * ordering groups by their newest document.
 * @param {FindRow[]} rows
 * @returns {Array<{ party: string, rows: FindRow[] }>}
 */
export function groupRowsByParty(rows) {
  /** @type {Map<string, FindRow[]>} */
  const byParty = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const key = r.party || "—";
    if (!byParty.has(key)) byParty.set(key, []);
    /** @type {FindRow[]} */ (byParty.get(key)).push(r);
  }
  return [...byParty.entries()].map(([party, list]) => ({ party, rows: list }));
}

/**
 * The peek drawer's lines, from the full document: its items, or — for a payment — the
 * documents it was applied to.
 * @param {string} doctypeKey
 * @param {object|null|undefined} doc
 * @returns {{ heads: [string, string, string], lines: Array<{ label: string, qty: string, amount: number }> }}
 */
export function findPeekLines(doctypeKey, doc) {
  const skin = findSkinFor(doctypeKey);
  const d = doc && typeof doc === "object" ? /** @type {Record<string, any>} */ (doc) : {};
  if (skin && skin.directional) {
    const refs = Array.isArray(d.references) ? d.references : [];
    return {
      heads: ["Applied to", "", "Amount"],
      lines: refs.map((r) => ({
        label: `${r.reference_doctype || ""} ${r.reference_name || ""}`.trim(),
        qty: "",
        amount: Number(r.allocated_amount) || 0,
      })),
    };
  }
  const items = Array.isArray(d.items) ? d.items : [];
  return {
    heads: ["Item", "Qty", "Amount"],
    lines: items.map((it) => ({
      label: [it.item_code, it.item_name && it.item_name !== it.item_code ? it.item_name : ""]
        .filter(Boolean)
        .join(" — "),
      qty: it.qty == null ? "" : String(it.qty),
      amount: Number(it.amount) || 0,
    })),
  };
}

/**
 * The last search a Find page remembers (per doctype; main keeps them in
 * `userData/find-doc-searches.json`). Whatever was
 * stored is re-checked against the registry, so a renamed field or a stale status is dropped
 * rather than sent to ERPNext.
 * @param {string} doctypeKey
 * @param {unknown} raw parsed JSON, possibly corrupt or absent
 * `direction` is kept for completeness; the page takes Pay / Receive from the app-wide remembered
 * direction instead (main passes it on the address).
 * @returns {{ values: Record<string, string>, status: string, direction: "Pay"|"Receive", sort: FindSort }}
 */
export function findSavedSearch(doctypeKey, raw) {
  const skin = findSkinFor(doctypeKey);
  const r = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  const values = findSearchValues(skin, /** @type {Record<string, unknown>} */ (r.values));
  const status = typeof r.status === "string" && skin && skin.statuses.includes(r.status) ? r.status : "";
  return {
    values,
    status,
    direction: r.direction === "Receive" ? "Receive" : "Pay",
    sort: findSortFor(doctypeKey, r.sort),
  };
}
