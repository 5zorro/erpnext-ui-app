/**
 * Launcher tiles — SSoT for splash Home links (real ERP routes only).
 * @typedef {{ id: string, label: string, route: string }} HomeTile
 */

/** @type {HomeTile[]} */
export const HOME_TILES = [
  { id: "desk", label: "Desk / Login", route: "/desk" },
  { id: "bills", label: "Bills", route: "/desk/purchase-invoice" },
  { id: "bill-new", label: "Enter Bill", route: "/desk/purchase-invoice/new" },
  { id: "po", label: "Purchase Orders", route: "/desk/purchase-order" },
  { id: "items", label: "Items", route: "/desk/item" },
  { id: "vendors", label: "Vendors", route: "/desk/supplier" },
];

/**
 * Validate tile list (unit-tested). Returns error strings; empty = OK.
 * @param {HomeTile[]} [tiles=HOME_TILES]
 * @returns {string[]}
 */
export function validateHomeTiles(tiles = HOME_TILES) {
  const errors = [];
  if (!Array.isArray(tiles) || tiles.length === 0) {
    return ["tiles must be a non-empty array"];
  }
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
    if (typeof t.route !== "string" || !t.route.startsWith("/")) {
      errors.push(`tile ${t.id || "?"}: route must start with /`);
    }
  }
  return errors;
}
