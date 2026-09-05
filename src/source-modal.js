/**
 * Bill source-picker groups (museum source-modal / OI-001) — pure.
 * Submitted PO/PR selectable; drafts listed but not selectable; NIC = no source.
 * Item Receipts show linked Purchase Order number(s) when present.
 * Multi-select (Vanilla-like): Space toggles check; Enter finalizes checked set.
 */

/**
 * @typedef {{ label: string, kind: "nic" | "po" | "pr", name?: string, draft?: boolean, loading?: boolean }} SourceItem
 * @typedef {{ id?: string, name: string, items: SourceItem[], loading?: boolean, error?: string }} SourceGroup
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
 * Stable key for checkbox selection (NIC has no name).
 * @param {SourceItem|null|undefined} it
 * @returns {string}
 */
export function sourceItemKey(it) {
  if (!it || typeof it !== "object") return "";
  if (it.kind === "nic") return "nic";
  if (!it.name) return "";
  return `${it.kind}:${it.name}`;
}

/**
 * @param {string|null|undefined} key
 * @param {SourceGroup[]} groups
 * @returns {SourceItem|null}
 */
export function findSourceItemByKey(key, groups) {
  if (!key || !Array.isArray(groups)) return null;
  for (const g of groups) {
    for (const it of g.items || []) {
      if (sourceItemKey(it) === key) return it;
    }
  }
  return null;
}

/**
 * Toggle check for one item. NIC is exclusive vs PO/PR.
 * @param {Iterable<string>|null|undefined} selectedKeys
 * @param {SourceItem|null|undefined} item
 * @returns {string[]} new selection (immutable)
 */
export function toggleSourceSelection(selectedKeys, item) {
  if (!isSelectableSourceItem(item)) {
    return selectedKeys ? [...selectedKeys] : [];
  }
  const key = sourceItemKey(item);
  if (!key) return selectedKeys ? [...selectedKeys] : [];
  const prev = new Set(selectedKeys || []);
  if (item.kind === "nic") {
    if (prev.has("nic")) return [];
    return ["nic"];
  }
  prev.delete("nic");
  if (prev.has(key)) prev.delete(key);
  else prev.add(key);
  return [...prev];
}

/**
 * What to pull on Enter / primary button.
 * - Any checks → those items (NIC alone → nic; NIC+others never coexist).
 * - No checks → implied NIC (highlight alone does not commit a PO/PR).
 * @param {SourceGroup[]} groups
 * @param {Iterable<string>|null|undefined} selectedKeys
 * @param {SourceItem|null|undefined} activeItem
 * @returns {{ mode: "nic"|"merge"|"none", items: SourceItem[], reason?: string }}
 */
export function resolveSourcesToCommit(groups, selectedKeys, activeItem) {
  const keys = [...(selectedKeys || [])].filter(Boolean);
  if (keys.includes("nic")) {
    return { mode: "nic", items: [{ label: "NIC", kind: "nic" }] };
  }
  if (keys.length) {
    /** @type {SourceItem[]} */
    const items = [];
    for (const k of keys) {
      const it = findSourceItemByKey(k, groups);
      if (it && isSelectableSourceItem(it) && it.kind !== "nic") items.push(it);
    }
    if (!items.length) return { mode: "none", items: [], reason: "no_valid_selection" };
    return { mode: "merge", items };
  }
  return { mode: "nic", items: [{ label: "NIC", kind: "nic" }] };
}

/**
 * Combine several mapped PI payloads into one mergeFromMapped argument.
 * First doc wins for header fields; items are concatenated in selection order.
 * @param {object[]} mappedDocs
 * @returns {object|null}
 */
export function combineMappedBillSources(mappedDocs) {
  const list = Array.isArray(mappedDocs) ? mappedDocs.filter((d) => d && typeof d === "object") : [];
  if (!list.length) return null;
  const first = list[0];
  /** @type {object[]} */
  const items = [];
  for (const doc of list) {
    if (Array.isArray(doc.items)) items.push(...doc.items);
  }
  if (!items.length) return null;
  return { ...first, items };
}

/**
 * Keyboard action for the source modal (multi-select).
 * @param {string} key
 * @returns {"tab"|"up"|"down"|"toggle"|"finalize"|"cancel"|"none"}
 */
export function sourceModalKeyAction(key) {
  if (key === "Tab") return "tab";
  if (key === "ArrowDown") return "down";
  if (key === "ArrowUp") return "up";
  if (key === " " || key === "Spacebar" || key === "Space") return "toggle";
  if (key === "Enter") return "finalize";
  if (key === "Escape") return "cancel";
  return "none";
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
 * @param {{ name?: string, title?: string, transaction_date?: string, posting_date?: string, grand_total?: number, purchase_orders?: string[], purchase_order?: string }} row
 * @param {"po" | "pr"} kind
 * @param {boolean} [draft]
 * @returns {SourceItem}
 */
export function sourceItemFromRow(row, kind, draft = false) {
  const date = kind === "po" ? row.transaction_date : row.posting_date;
  const logbook =
    kind === "po" && row.title != null && String(row.title).trim()
      ? String(row.title).trim()
      : "";
  if (draft) {
    const poBit =
      kind === "pr"
        ? (() => {
            const pos = row.purchase_orders || (row.purchase_order ? [row.purchase_order] : []);
            return pos.length ? `   ·   PO ${pos.join(", ")}` : "";
          })()
        : "";
    const titleBit = logbook ? `   ·   ${logbook}` : "";
    return {
      label: `n/a — draft   ·   ${row.name || ""}${titleBit}${poBit}`,
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
  // Submitted PO: ERP name + logbook PO# (OI-121 title) when present.
  const titleBit = logbook ? `   ·   ${logbook}` : "";
  return {
    label: `${row.name || ""}${titleBit}   ·   ${date || ""}   ·   ${money}`,
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
      id: "nic",
      name: "Not in computer (NIC)",
      items: [{ label: "NIC — enter this Bill manually (no source)", kind: "nic" }],
    },
  ];
  if (pos.length) {
    groups.push({
      id: "po_submitted",
      name: `Purchase Orders — submitted (${pos.length})`,
      items: pos.map((p) => sourceItemFromRow(p, "po", false)),
    });
  }
  if (prs.length) {
    groups.push({
      id: "pr_submitted",
      name: `Item Receipts — submitted (${prs.length})`,
      items: prs.map((p) => sourceItemFromRow(p, "pr", false)),
    });
  }
  if (posD.length) {
    groups.push({
      id: "po_draft",
      name: "Purchase Orders — draft (not selectable)",
      items: posD.map((p) => sourceItemFromRow(p, "po", true)),
    });
  }
  if (prsD.length) {
    groups.push({
      id: "pr_draft",
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
  return !!(it && !it.draft && !it.loading);
}

/**
 * @param {SourceGroup|null|undefined} group
 * @returns {boolean}
 */
export function groupHasSelectableItem(group) {
  return !!(group && Array.isArray(group.items) && group.items.some(isSelectableSourceItem));
}

/**
 * @param {SourceGroup|null|undefined} group
 * @returns {number}
 */
export function firstSelectableItemIndex(group) {
  const items = group && Array.isArray(group.items) ? group.items : [];
  for (let i = 0; i < items.length; i++) {
    if (isSelectableSourceItem(items[i])) return i;
  }
  return 0;
}

/**
 * Tab order: skip groups with no selectable rows (draft-only / loading placeholders).
 * @param {SourceGroup[]} groups
 * @param {number} fromGi
 * @param {number} dir 1 forward, -1 backward
 * @returns {number}
 */
export function nextSelectableGroupIndex(groups, fromGi, dir) {
  const list = Array.isArray(groups) ? groups : [];
  const n = list.length;
  if (n === 0) return 0;
  const step = dir >= 0 ? 1 : -1;
  for (let i = 1; i <= n; i++) {
    const idx = (fromGi + step * i + n * 16) % n;
    if (groupHasSelectableItem(list[idx])) return idx;
  }
  return fromGi;
}
