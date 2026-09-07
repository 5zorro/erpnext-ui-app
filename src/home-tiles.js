/**
 * Doc Workflow Home tiles — SSoT (museum-style groups → real ERP routes).
 * Rendered by electron/home.html; not ERP Desk HTML.
 *
 * Enter Bills: same path as Vanilla / Simplified PI; open target follows last lens
 * (default Doc) via `resolveEntryOpen` — last lens wins per doctype.
 *
 * Routes use `/app/…` (Frappe Desk SPA). Exact `/desk` is allowed for Vanilla Desk root.
 *
 * AP tile washes align with `DOC_WASH_BY_PROFILE` / OI-125 (`src/doc-wash.js`).
 *
 * @typedef {"request"|"order"|"fulfill"|"invoice"|"payment"} DocWashRole
 * @typedef {{ id: string, label: string, route: string, disabled?: boolean, washRole?: DocWashRole }} HomeTile
 * @typedef {{ id: string, title: string, tiles: HomeTile[] }} HomeGroup
 */

/** @type {Set<DocWashRole>} */
export const HOME_TILE_WASH_ROLES = new Set(["request", "order", "fulfill", "invoice", "payment"]);

/** AP vendor-column tiles → doc wash role (matches bill / po / receipt Doc skins). */
export const AP_HOME_TILE_WASH = Object.freeze({
  "po-new": "order",
  "receipt-new": "fulfill",
  "bill-new": "invoice",
  "pay-bills": "payment",
});

/**
 * Shell-only routes (not `/app/…` ERP forms). Empty since Packet 4b step 5: the standalone
 * "Pay Outstanding" tile is retired now that Payment Entry is a real anchor -- "Pay Bills" /
 * "Write Checks" land on the blank Vanilla form, whose Doc tab routes to the same dashboard
 * (isNew: true → pay-outstanding.html, per lens-context.js resolveDocSkinTarget). A second door
 * to the same surface would be redundant (5zorro 2026-09-05).
 */
export const SHELL_ROUTE_TILE_IDS = Object.freeze([]);

/** @type {{ left: HomeGroup[], right: HomeGroup[] }} */
export const HOME_GROUPS = {
  left: [
    {
      id: "vendors",
      title: "Vendors",
      tiles: [
        { id: "bill-new", label: "Enter Bills", route: "/app/purchase-invoice/new", washRole: "invoice" },
        { id: "pay-bills", label: "Pay Bills", route: "/app/payment-entry/new", washRole: "payment" },
        { id: "po-new", label: "Purchase Orders", route: "/app/purchase-order/new", washRole: "order" },
        { id: "receipt-new", label: "Receive Inventory", route: "/app/purchase-receipt/new", washRole: "fulfill" },
        { id: "vendors", label: "Vendor Center", route: "/app/supplier" },
      ],
    },
    {
      id: "customers",
      title: "Customers",
      tiles: [
        { id: "estimate-new", label: "Estimates", route: "/app/quotation/new" },
        { id: "so-new", label: "Sales Orders", route: "/app/sales-order/new" },
        { id: "invoice-new", label: "Create Invoices", route: "/app/sales-invoice/new" },
        { id: "receive-pay", label: "Receive Payments", route: "/app/payment-entry/new" },
        { id: "customers", label: "Customer Center", route: "/app/customer" },
      ],
    },
    {
      id: "employees",
      title: "Employees",
      tiles: [
        { id: "employees", label: "Employees", route: "/app/employee" },
        { id: "timesheet-new", label: "Enter Time", route: "/app/timesheet/new" },
        { id: "payroll", label: "Payroll", route: "", disabled: true },
      ],
    },
  ],
  right: [
    {
      id: "company",
      title: "Company",
      tiles: [
        { id: "coa", label: "Chart of Accounts", route: "/app/account/view/tree" },
        { id: "items", label: "Items & Services", route: "/app/item" },
        { id: "je-new", label: "Journal Entry", route: "/app/journal-entry/new" },
        {
          id: "pnl",
          label: "Profit & Loss",
          route: "/app/query-report/Profit%20and%20Loss%20Statement",
        },
      ],
    },
    {
      id: "banking",
      title: "Banking",
      tiles: [
        { id: "reconcile", label: "Reconcile", route: "/app/bank-reconciliation-tool" },
        { id: "checks", label: "Write Checks", route: "/app/payment-entry/new" },
        { id: "bank-tx", label: "Bank Transactions", route: "/app/bank-transaction" },
        {
          id: "bs",
          label: "Balance Sheet",
          route: "/app/query-report/Balance%20Sheet",
        },
      ],
    },
    {
      id: "shell",
      title: "Shell",
      tiles: [
        { id: "desk", label: "Vanilla Desk", route: "/desk" },
        { id: "site-root", label: "Site root (/)", route: "/" },
        { id: "login", label: "Login", route: "/login" },
      ],
    },
  ],
};

/** Flat list for tests / simple consumers. */
export function flattenHomeTiles(groups = HOME_GROUPS) {
  /** @type {HomeTile[]} */
  const out = [];
  for (const side of [groups.left, groups.right]) {
    for (const g of side || []) {
      for (const t of g.tiles || []) out.push(t);
    }
  }
  return out;
}

/** @deprecated use flattenHomeTiles / HOME_GROUPS — kept name for older imports */
export const HOME_TILES = flattenHomeTiles();

/**
 * Validate grouped (or flat) tiles. Returns error strings; empty = OK.
 * @param {{ left?: HomeGroup[], right?: HomeGroup[] } | HomeTile[]} [input=HOME_GROUPS]
 * @returns {string[]}
 */
export function validateHomeTiles(input = HOME_GROUPS) {
  const tiles = Array.isArray(input) ? input : flattenHomeTiles(input);
  const errors = [];
  if (!tiles.length) return ["tiles must be a non-empty array"];
  const ids = new Set();
  for (const t of tiles) {
    if (!t || typeof t !== "object") {
      errors.push("tile must be an object");
      continue;
    }
    if (typeof t.id !== "string" || !t.id.trim()) errors.push("tile.id required");
    else if (ids.has(t.id)) errors.push(`duplicate id: ${t.id}`);
    else ids.add(t.id);
    if (typeof t.label !== "string" || !t.label.trim()) {
      errors.push(`tile ${t.id || "?"}: label required`);
    }
    if (t.disabled) continue;
    if (t.washRole != null && !HOME_TILE_WASH_ROLES.has(t.washRole)) {
      errors.push(`tile ${t.id || "?"}: invalid washRole ${t.washRole}`);
    }
    if (typeof t.route !== "string" || !t.route.startsWith("/")) {
      errors.push(`tile ${t.id || "?"}: route must start with /`);
    } else if (t.route.startsWith("/desk/") ) {
      // OI-118: prefer /app/…; exact /desk root is OK for Vanilla Desk tile.
      errors.push(`tile ${t.id || "?"}: use /app/… not /desk/…`);
    }
  }
  return errors;
}
