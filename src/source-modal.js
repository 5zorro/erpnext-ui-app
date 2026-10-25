/**
 * Bill source-picker groups (museum source-modal / OI-001) — pure.
 * Submitted PO/PR selectable; drafts listed but not selectable; NIC = no source.
 * Item Receipts show linked Purchase Order number(s) when present.
 * Multi-select (Vanilla-like): Space toggles check; Enter finalizes checked set.
 */

/**
 * @typedef {{ label: string, kind: "nic" | "po" | "pr" | "mr" | "sq" | "so", name?: string, draft?: boolean, loading?: boolean }} SourceItem
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
 * @param {{ name?: string, title?: string, transaction_date?: string, posting_date?: string, grand_total?: number, purchase_orders?: string[], purchase_order?: string }} row
 * @param {"po" | "pr"} kind
 * @param {boolean} [draft]
 * @returns {SourceItem}
 */
export function sourceItemFromRow(row, kind, draft = false) {
  // The Purchase Order's sources (plan 2026-10-12 S3) — always submitted, so never a draft row.
  if (kind === "mr" || kind === "sq" || kind === "so") return poSourceItemFromRow(row, kind);
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
    const pos = row.purchase_orders || (row.purchase_order ? [row.purchase_order] : null);
    // "no PO" only when the receipt's lines were read and name none (review R7-3).
    const poBit = pos ? `   ·   ${pos.length ? `PO ${pos.join(", ")}` : "no PO"}` : "";
    return {
      label: `${row.name || ""}${poBit}   ·   ${date || ""}   ·   ${money}`,
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
 * A Material Request, Supplier Quotation or Sales Order as a PO source row. What tells them apart
 * at a glance: an MR's title and when it is needed, a quotation's total and how long it is good
 * for, a Sales Order's customer and how many lines are still to order.
 * @param {{ name?: string, title?: string, transaction_date?: string, schedule_date?: string, valid_till?: string,
 *   grand_total?: number, customer?: string, customer_name?: string, lines_to_order?: number }} row
 * @param {"mr" | "sq" | "so"} kind
 * @returns {SourceItem}
 */
export function poSourceItemFromRow(row, kind) {
  const r = row || {};
  const sep = "   ·   ";
  const bits = [String(r.name || "")];
  if (kind === "mr") {
    const title = r.title != null && String(r.title).trim() && String(r.title).trim() !== r.name ? String(r.title).trim() : "";
    if (title) bits.push(title);
    if (r.transaction_date) bits.push(String(r.transaction_date));
    if (r.schedule_date) bits.push(`needed by ${r.schedule_date}`);
  } else if (kind === "sq") {
    if (r.transaction_date) bits.push(String(r.transaction_date));
    const money = formatSourceMoney(r.grand_total);
    if (money) bits.push(money);
    if (r.valid_till) bits.push(`good till ${r.valid_till}`);
  } else {
    const who = String(r.customer_name || r.customer || "").trim();
    if (who) bits.push(who);
    if (r.transaction_date) bits.push(String(r.transaction_date));
    const n = Number(r.lines_to_order);
    if (Number.isFinite(n) && n > 0) bits.push(`${n} line${n === 1 ? "" : "s"} to order`);
  }
  return { label: bits.join(sep), kind, name: r.name };
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
