/**
 * Link search normalizers — T1 Doc pickers (Vendor, Item, …).
 * ERP returns search_link rows; Doc HTML displays { value, description }.
 */

/**
 * @typedef {{ value: string, description: string, action?: string }} LinkOption
 */

/** Sentinel value: empty Supplier search → open Vanilla “new Supplier”. */
export const LINK_ACTION_CREATE_SUPPLIER = "__doc_create_supplier__";

/**
 * Normalize frappe.desk.search.search_link (or list-like) payloads.
 * @param {unknown} message
 * @returns {LinkOption[]}
 */
export function normalizeSearchLinkResults(message) {
  if (!Array.isArray(message)) return [];
  /** @type {LinkOption[]} */
  const out = [];
  for (const row of message) {
    if (typeof row === "string") {
      const v = row.trim();
      if (v) out.push({ value: v, description: v });
      continue;
    }
    if (!row || typeof row !== "object") continue;
    const r = /** @type {Record<string, unknown>} */ (row);
    const value = String(r.value ?? r.name ?? "").trim();
    if (!value) continue;
    const description = String(
      r.description ?? r.supplier_name ?? r.item_name ?? r.label ?? value,
    ).trim();
    out.push({ value, description: description || value });
  }
  return out;
}

/**
 * When Supplier search has no rows, offer a single “Go to Vendor add…” action.
 * @param {LinkOption[]} rows
 * @param {string} doctype
 * @returns {LinkOption[]}
 */
export function withEmptySearchActions(rows, doctype) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length) return list;
  if (doctype === "Supplier") {
    return [
      {
        value: LINK_ACTION_CREATE_SUPPLIER,
        description: "Go to Vendor add…",
        action: "create_supplier",
      },
    ];
  }
  return list;
}

/**
 * @param {LinkOption|string|null|undefined} optOrValue
 * @returns {boolean}
 */
export function isCreateSupplierLinkAction(optOrValue) {
  if (optOrValue == null) return false;
  if (typeof optOrValue === "string") return optOrValue === LINK_ACTION_CREATE_SUPPLIER;
  return optOrValue.value === LINK_ACTION_CREATE_SUPPLIER || optOrValue.action === "create_supplier";
}

/**
 * Client-side refine (when ERP returns a broad list or for offline fixtures).
 * @param {LinkOption[]} options
 * @param {string} query
 * @param {{ limit?: number }} [opts]
 * @returns {LinkOption[]}
 */
export function filterLinkOptions(options, query, opts = {}) {
  const list = Array.isArray(options) ? options : [];
  const limit = opts.limit ?? 20;
  const q = String(query || "")
    .trim()
    .toLowerCase();
  if (!q) return list.slice(0, limit);
  const scored = [];
  for (const o of list) {
    if (!o || !o.value) continue;
    if (isCreateSupplierLinkAction(o)) continue;
    const hay = `${o.value} ${o.description || ""}`.toLowerCase();
    if (!hay.includes(q)) continue;
    const starts = o.value.toLowerCase().startsWith(q) || (o.description || "").toLowerCase().startsWith(q);
    scored.push({ o, rank: starts ? 0 : 1 });
  }
  scored.sort((a, b) => a.rank - b.rank || a.o.value.localeCompare(b.o.value));
  return scored.slice(0, limit).map((s) => s.o);
}

/**
 * Display label for a row (description if distinct, else value).
 * @param {LinkOption|null|undefined} opt
 */
export function linkOptionLabel(opt) {
  if (!opt || !opt.value) return "";
  if (isCreateSupplierLinkAction(opt)) return opt.description || "Go to Vendor add…";
  if (opt.description && opt.description !== opt.value) {
    return `${opt.description} (${opt.value})`;
  }
  return opt.description || opt.value;
}

/** Doctypes used by Bill Doc Link fields. */
export const BILL_LINK_DOCTYPES = {
  supplier: "Supplier",
  payment_terms_template: "Payment Terms Template",
  item_code: "Item",
  project: "Project",
};

/**
 * @param {string} field ERP fieldname
 * @returns {string|null}
 */
export function linkDoctypeForBillField(field) {
  if (typeof field !== "string") return null;
  return BILL_LINK_DOCTYPES[field] || null;
}
