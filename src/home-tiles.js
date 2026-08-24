/**
 * Doc Workflow Home tiles — SSoT (museum-style groups → real ERP routes).
 * Rendered by electron/home.html; not ERP Desk HTML.
 *
 * Enter Bills: same path as Vanilla / Simplified PI; open target follows last lens
 * (default Doc) via `resolveEntryOpen` — last lens wins per doctype.
 *
 * Routes use `/app/…` (Frappe Desk SPA). Exact `/desk` is allowed for Vanilla Desk root.
 *
 * @typedef {{ id: string, icon: string, label: string, route: string, disabled?: boolean }} HomeTile
 * @typedef {{ id: string, title: string, tiles: HomeTile[] }} HomeGroup
 */

/** @type {{ left: HomeGroup[], right: HomeGroup[] }} */
export const HOME_GROUPS = {
  left: [
    {
      id: "vendors",
      title: "Vendors",
      tiles: [
        { id: "bill-new", icon: "🧾", label: "Enter Bills", route: "/app/purchase-invoice/new" },
        { id: "pay-bills", icon: "💵", label: "Pay Bills", route: "/app/payment-entry/new" },
        { id: "po-new", icon: "📦", label: "Purchase Orders", route: "/app/purchase-order/new" },
        { id: "receipt-new", icon: "📥", label: "Receive Inventory", route: "/app/purchase-receipt/new" },
        { id: "vendors", icon: "🏢", label: "Vendor Center", route: "/app/supplier" },
      ],
    },
    {
      id: "customers",
      title: "Customers",
      tiles: [
        { id: "estimate-new", icon: "📝", label: "Estimates", route: "/app/quotation/new" },
        { id: "so-new", icon: "📋", label: "Sales Orders", route: "/app/sales-order/new" },
        { id: "invoice-new", icon: "🧾", label: "Create Invoices", route: "/app/sales-invoice/new" },
        { id: "receive-pay", icon: "💰", label: "Receive Payments", route: "/app/payment-entry/new" },
        { id: "customers", icon: "👤", label: "Customer Center", route: "/app/customer" },
      ],
    },
    {
      id: "employees",
      title: "Employees",
      tiles: [
        { id: "employees", icon: "👥", label: "Employees", route: "/app/employee" },
        { id: "timesheet-new", icon: "⏱️", label: "Enter Time", route: "/app/timesheet/new" },
        { id: "payroll", icon: "💳", label: "Payroll", route: "", disabled: true },
      ],
    },
  ],
  right: [
    {
      id: "company",
      title: "Company",
      tiles: [
        { id: "coa", icon: "📚", label: "Chart of Accounts", route: "/app/account/view/tree" },
        { id: "items", icon: "🏷️", label: "Items & Services", route: "/app/item" },
        { id: "je-new", icon: "📒", label: "Journal Entry", route: "/app/journal-entry/new" },
        {
          id: "pnl",
          icon: "📈",
          label: "Profit & Loss",
          route: "/app/query-report/Profit%20and%20Loss%20Statement",
        },
      ],
    },
    {
      id: "banking",
      title: "Banking",
      tiles: [
        { id: "reconcile", icon: "🔁", label: "Reconcile", route: "/app/bank-reconciliation-tool" },
        { id: "checks", icon: "🖊️", label: "Write Checks", route: "/app/payment-entry/new" },
        { id: "bank-tx", icon: "🏦", label: "Bank Transactions", route: "/app/bank-transaction" },
        {
          id: "bs",
          icon: "📊",
          label: "Balance Sheet",
          route: "/app/query-report/Balance%20Sheet",
        },
      ],
    },
    {
      id: "shell",
      title: "Shell",
      tiles: [
        { id: "desk", icon: "🖥️", label: "Vanilla Desk", route: "/desk" },
        { id: "site-root", icon: "🏠", label: "Site root (/)", route: "/" },
        { id: "login", icon: "🔑", label: "Login", route: "/login" },
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
    if (typeof t.route !== "string" || !t.route.startsWith("/")) {
      errors.push(`tile ${t.id || "?"}: route must start with /`);
    } else if (t.route.startsWith("/desk/") ) {
      // OI-118: prefer /app/…; exact /desk root is OK for Vanilla Desk tile.
      errors.push(`tile ${t.id || "?"}: use /app/… not /desk/…`);
    }
  }
  return errors;
}
