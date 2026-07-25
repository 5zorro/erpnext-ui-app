/**
 * Doc Workflow Home tiles — SSoT (museum-style groups → real ERP routes).
 * Rendered by electron/home.html; not ERP Desk HTML.
 *
 * Enter Bills: same path as Vanilla / Simplified PI; open target follows last lens
 * (default Doc) via `resolveEntryOpen` once M3c wires it — today route is Vanilla ERP.
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
        { id: "pay-bills", icon: "💵", label: "Pay Bills", route: "/desk/payment-entry/new" },
        { id: "po-new", icon: "📦", label: "Purchase Orders", route: "/app/purchase-order/new" },
        { id: "receipt-new", icon: "📥", label: "Receive Inventory", route: "/app/purchase-receipt/new" },
        { id: "vendors", icon: "🏢", label: "Vendor Center", route: "/desk/supplier" },
      ],
    },
    {
      id: "customers",
      title: "Customers",
      tiles: [
        { id: "estimate-new", icon: "📝", label: "Estimates", route: "/desk/quotation/new" },
        { id: "so-new", icon: "📋", label: "Sales Orders", route: "/desk/sales-order/new" },
        { id: "invoice-new", icon: "🧾", label: "Create Invoices", route: "/desk/sales-invoice/new" },
        { id: "receive-pay", icon: "💰", label: "Receive Payments", route: "/desk/payment-entry/new" },
        { id: "customers", icon: "👤", label: "Customer Center", route: "/desk/customer" },
      ],
    },
    {
      id: "employees",
      title: "Employees",
      tiles: [
        { id: "employees", icon: "👥", label: "Employees", route: "/desk/employee" },
        { id: "timesheet-new", icon: "⏱️", label: "Enter Time", route: "/desk/timesheet/new" },
        { id: "payroll", icon: "💳", label: "Payroll", route: "", disabled: true },
      ],
    },
  ],
  right: [
    {
      id: "company",
      title: "Company",
      tiles: [
        { id: "coa", icon: "📚", label: "Chart of Accounts", route: "/desk/account/view/tree" },
        { id: "items", icon: "🏷️", label: "Items & Services", route: "/desk/item" },
        { id: "je-new", icon: "📒", label: "Journal Entry", route: "/desk/journal-entry/new" },
        {
          id: "pnl",
          icon: "📈",
          label: "Profit & Loss",
          route: "/desk/query-report/Profit%20and%20Loss%20Statement",
        },
      ],
    },
    {
      id: "banking",
      title: "Banking",
      tiles: [
        { id: "reconcile", icon: "🔁", label: "Reconcile", route: "/desk/bank-reconciliation-tool" },
        { id: "checks", icon: "🖊️", label: "Write Checks", route: "/desk/payment-entry/new" },
        { id: "bank-tx", icon: "🏦", label: "Bank Transactions", route: "/desk/bank-transaction" },
        {
          id: "bs",
          icon: "📊",
          label: "Balance Sheet",
          route: "/desk/query-report/Balance%20Sheet",
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
    }
  }
  return errors;
}
