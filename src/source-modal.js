/**
 * Bill source-picker groups (museum source-modal / OI-001) — pure.
 * Submitted PO/PR selectable; drafts listed but not selectable; NIC = no source.
 * Item Receipts show linked Purchase Order number(s) when present.
 */

/**
 * @typedef {{ label: string, kind: "nic" | "po" | "pr", name?: string, draft?: boolean }} SourceItem
 * @typedef {{ name: string, items: SourceItem[] }} SourceGroup
 */

/**
 * @param {number|string|null|undefined} n
 * @returns {string}
 */
export function formatSourceMoney(n) {
  if (n == null || n === "") return "";
  const x = Number(n);
  return Number.isFinite(x) ? x.toFixed(2) : "";
}

/**
 * Unique non-empty PO names from Purchase Receipt Item rows.
 * @param {Array<{ parent?: string, purchase_order?: string }>} itemRows
 * @returns {Record<string, string[]>} parent PR name → PO names
 */
export function purchaseOrdersByReceipt(itemRows = []) {
  /** @type {Record<string, string[]>} */
  const map = {};
  for (const row of itemRows || []) {
    const parent = row && row.parent;
    const po = row && row.purchase_order;
    if (!parent || !po) continue;
    if (!map[parent]) map[parent] = [];
    if (!map[parent].includes(po)) map[parent].push(po);
  }
  return map;
}

/**
 * Attach `purchase_orders: string[]` onto PR list rows.
 * @param {object[]} receipts
 * @param {Array<{ parent?: string, purchase_order?: string }>} itemRows
 */
export function enrichReceiptsWithPurchaseOrders(receipts = [], itemRows = []) {
  const byPr = purchaseOrdersByReceipt(itemRows);
  return (receipts || []).map((r) => ({
    ...r,
    purchase_orders: byPr[r.name] || r.purchase_orders || [],
  }));
}

/**
 * @param {{ name?: string, transaction_date?: string, posting_date?: string, grand_total?: number, purchase_orders?: string[], purchase_order?: string }} row
 * @param {"po" | "pr"} kind
 * @param {boolean} [draft]
 * @returns {SourceItem}
 */
export function sourceItemFromRow(row, kind, draft = false) {
  const date = kind === "po" ? row.transaction_date : row.posting_date;
  if (draft) {
    const poBit =
      kind === "pr"
        ? (() => {
            const pos = row.purchase_orders || (row.purchase_order ? [row.purchase_order] : []);
            return pos.length ? `   ·   PO ${pos.join(", ")}` : "";
          })()
        : "";
    return {
      label: `n/a — draft   ·   ${row.name || ""}${poBit}`,
      kind,
      name: row.name,
      draft: true,
    };
  }
  const money = formatSourceMoney(row.grand_total);
  if (kind === "pr") {
    const pos = row.purchase_orders || (row.purchase_order ? [row.purchase_order] : []);
    const poLabel = pos.length ? `PO ${pos.join(", ")}` : "no PO";
    return {
      label: `${row.name || ""}   ·   ${poLabel}   ·   ${date || ""}   ·   ${money}`,
      kind,
      name: row.name,
    };
  }
  return {
    label: `${row.name || ""}   ·   ${date || ""}   ·   ${money}`,
    kind,
    name: row.name,
  };
}

/**
 * @param {{
 *   purchaseOrders?: object[],
 *   purchaseReceipts?: object[],
 *   purchaseOrdersDraft?: object[],
 *   purchaseReceiptsDraft?: object[],
 * }} lists
 * @returns {SourceGroup[]}
 */
export function buildBillSourceGroups(lists = {}) {
  const pos = lists.purchaseOrders || [];
  const prs = lists.purchaseReceipts || [];
  const posD = lists.purchaseOrdersDraft || [];
  const prsD = lists.purchaseReceiptsDraft || [];

  /** @type {SourceGroup[]} */
  const groups = [
    {
      name: "Not in computer (NIC)",
      items: [{ label: "NIC — enter this Bill manually (no source)", kind: "nic" }],
    },
  ];
  if (pos.length) {
    groups.push({
      name: `Purchase Orders — submitted (${pos.length})`,
      items: pos.map((p) => sourceItemFromRow(p, "po", false)),
    });
  }
  if (prs.length) {
    groups.push({
      name: `Item Receipts — submitted (${prs.length})`,
      items: prs.map((p) => sourceItemFromRow(p, "pr", false)),
    });
  }
  if (posD.length) {
    groups.push({
      name: "Purchase Orders — draft (not selectable)",
      items: posD.map((p) => sourceItemFromRow(p, "po", true)),
    });
  }
  if (prsD.length) {
    groups.push({
      name: "Item Receipts — draft (not selectable)",
      items: prsD.map((p) => sourceItemFromRow(p, "pr", true)),
    });
  }
  return groups;
}

/**
 * @param {SourceItem|null|undefined} it
 * @returns {boolean}
 */
export function isSelectableSourceItem(it) {
  return !!(it && !it.draft);
}
