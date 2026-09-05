/**
 * Link search normalizers — T1 Doc pickers (Vendor, Item, …).
 * ERP returns search_link rows; Doc HTML displays { value, description }.
 */
import { vendorActivitySuffix } from "./vendor-activity.js";

/**
 * @typedef {{ value: string, description: string, action?: string, activity?: string, company?: string, companyMismatch?: boolean }} LinkOption
 */

/** Sentinel value: empty Supplier search → open Vanilla “new Supplier”. */
export const LINK_ACTION_CREATE_SUPPLIER = "__doc_create_supplier__";
export const LINK_ACTION_CREATE_PROJECT = "__doc_create_project__";
/** Soft-peek Vanilla Payment Terms Template form (shared Bill · PO). */
export const LINK_ACTION_CREATE_PAYMENT_TERMS = "__doc_create_payment_terms__";
export const PAYMENT_TERMS_TEMPLATE_DOCTYPE = "Payment Terms Template";
export const PAYMENT_TERMS_TEMPLATE_NEW_ROUTE = "/app/payment-terms-template/new";

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
 * When Link search has no rows (or always for Terms), offer create-via-peek actions.
 * @param {LinkOption[]} rows
 * @param {string} doctype
 * @returns {LinkOption[]}
 */
export function withEmptySearchActions(rows, doctype) {
  const list = Array.isArray(rows) ? [...rows] : [];
  if (doctype === PAYMENT_TERMS_TEMPLATE_DOCTYPE) {
    // Always offer create — Vanilla Link also lets clerks add Terms when templates already exist.
    if (!list.some((o) => isCreatePaymentTermsLinkAction(o))) {
      list.push({
        value: LINK_ACTION_CREATE_PAYMENT_TERMS,
        description: "Create new Payment Terms…",
        action: "create_payment_terms",
      });
    }
    return list;
  }
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
  if (doctype === "Project") {
    return [
      {
        value: LINK_ACTION_CREATE_PROJECT,
        description: "No projects found — create Project…",
        action: "create_project",
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
 * @param {LinkOption|string|null|undefined} optOrValue
 * @returns {boolean}
 */
export function isCreatePaymentTermsLinkAction(optOrValue) {
  if (optOrValue == null) return false;
  if (typeof optOrValue === "string") return optOrValue === LINK_ACTION_CREATE_PAYMENT_TERMS;
  return (
    optOrValue.value === LINK_ACTION_CREATE_PAYMENT_TERMS ||
    optOrValue.action === "create_payment_terms"
  );
}

/**
 * @param {LinkOption|string|null|undefined} optOrValue
 * @returns {boolean}
 */
export function isCreateProjectLinkAction(optOrValue) {
  if (optOrValue == null) return false;
  if (typeof optOrValue === "string") return optOrValue === LINK_ACTION_CREATE_PROJECT;
  return optOrValue.value === LINK_ACTION_CREATE_PROJECT || optOrValue.action === "create_project";
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
    if (isCreateSupplierLinkAction(o) || isCreatePaymentTermsLinkAction(o) || isCreateProjectLinkAction(o)) {
      continue;
    }
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
  if (isCreatePaymentTermsLinkAction(opt)) return opt.description || "Create new Payment Terms…";
  if (isCreateProjectLinkAction(opt)) return opt.description || "Create Project…";
  let label = opt.description || opt.value;
  if (opt.description && opt.description !== opt.value) {
    label = `${opt.description} (${opt.value})`;
  }
  const suf = vendorActivitySuffix(opt.activity);
  if (suf) label = `${label} · ${suf}`;
  if (opt.companyMismatch) {
    const co = opt.company ? String(opt.company).trim() : "";
    label = co ? `${label} · other company (${co})` : `${label} · other company`;
  }
  return label;
}

/**
 * @param {LinkOption|null|undefined} opt
 * @returns {string}
 */
export function linkOptionClassNames(opt) {
  const bits = ["link-opt"];
  if (
    isCreateSupplierLinkAction(opt) ||
    isCreatePaymentTermsLinkAction(opt) ||
    isCreateProjectLinkAction(opt)
  ) {
    bits.push("link-action");
  }
  if (opt && (opt.activity === "idle" || opt.activity === "never" || opt.companyMismatch)) {
    bits.push("link-opt-muted");
  }
  if (opt && opt.companyMismatch) bits.push("link-opt-company-mismatch");
  return bits.join(" ");
}

/** Doctypes used by Bill Doc Link fields. */
export const BILL_LINK_DOCTYPES = {
  supplier: "Supplier",
  payment_terms_template: "Payment Terms Template",
  item_code: "Item",
  project: "Project",
  account_head: "Account",
  sales_order: "Sales Order",
  mode_of_payment: "Mode of Payment",
  cash_bank_account: "Account",
};

/**
 * @param {string} field ERP fieldname
 * @returns {string|null}
 */
export function linkDoctypeForBillField(field) {
  if (typeof field !== "string") return null;
  return BILL_LINK_DOCTYPES[field] || null;
}
