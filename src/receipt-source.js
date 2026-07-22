/**
 * Item Receipt source groups (Select PO) — PO-only subset of Bill source modal.
 */

import { sourceItemFromRow } from "./source-modal.js";

/**
 * @param {{
 *   purchaseOrders?: object[],
 *   purchaseOrdersDraft?: object[],
 * }} [lists]
 * @returns {import("./source-modal.js").SourceGroup[]}
 */
export function buildReceiptSourceGroups(lists = {}) {
  const pos = lists.purchaseOrders || [];
  const posD = lists.purchaseOrdersDraft || [];

  /** @type {import("./source-modal.js").SourceGroup[]} */
  const groups = [
    {
      name: "Not in computer (NIC)",
      items: [{ label: "NIC — enter this Item Receipt manually (no source)", kind: "nic" }],
    },
  ];
  if (pos.length) {
    groups.push({
      name: `Purchase Orders — submitted (${pos.length})`,
      items: pos.map((p) => sourceItemFromRow(p, "po", false)),
    });
  }
  if (posD.length) {
    groups.push({
      name: "Purchase Orders — draft (not selectable)",
      items: posD.map((p) => sourceItemFromRow(p, "po", true)),
    });
  }
  return groups;
}
