/**
 * Credit-memo mode for the shared source-selection modal (OI-166).
 *
 * The modal asks one question — *where does this Bill come from?* — and this module owns the
 * second answer to it: not a Purchase Order or an Item Receipt, but the **Bill this credit is
 * against** (`return_against`). Before this existed the two answers lived behind two different
 * doors: the source modal after the vendor pick, and a separate picker opened by the header
 * **Credit memo?** switch.
 *
 * Pure: arity, group shapes and labels only. Fetching, DOM and the write path stay with the
 * hosts — in particular the write path is still `planCreditMemoSource()` in `credit-memo.js`,
 * never a freeform `is_return` flip (museum OI-147: that silently books to an accrual
 * placeholder GL account instead of the item's real expense account).
 */

/** @typedef {import("./source-modal.js").SourceGroup} SourceGroup */
/** @typedef {import("./source-modal.js").SourceItem} SourceItem */

export const CREDIT_SOURCE_GROUP_ID = "credit_bills";
export const CREDIT_NIC_GROUP_ID = "credit_nic";

/**
 * `return_against` is a single Link, so credit mode is single-pick regardless of what the host
 * asked for. Multi-select merge is a PO/IR idea: one Bill can bill three orders, but one credit
 * memo cannot credit three Bills.
 *
 * @param {boolean} creditOn
 * @param {"single"|"multi"|null|undefined} baseMode
 * @returns {"single"|"multi"}
 */
export function sourceModalArity(creditOn, baseMode) {
  if (creditOn) return "single";
  return baseMode === "single" ? "single" : "multi";
}

/**
 * @param {"single"|"multi"} mode
 * @param {boolean} creditOn
 * @returns {string}
 */
export function sourceModalTitleHint(mode, creditOn) {
  if (creditOn) {
    return "Credit memo — which Bill is this against? · Tab: group · ↑/↓: item · Enter: select";
  }
  return mode === "single"
    ? "Source Selection — Tab: group · ↑/↓: item · Enter: select"
    : "Source Selection — Tab: group · ↑/↓: move · Space: check · Enter: pull";
}

/**
 * @param {"single"|"multi"} mode
 * @param {boolean} creditOn
 * @returns {string}
 */
export function sourceModalPickLabel(mode, creditOn) {
  if (creditOn) return "Use this Bill";
  return mode === "single" ? "Select this source" : "Pull selected";
}

/**
 * View state for the foot switch. It is **click-only and never in the tab order** — the modal
 * owns Tab for group navigation, so a focusable control in the button row would be a key the
 * clerk can see but not reach. Every control in `.src-foot` follows that rule.
 *
 * @param {boolean} creditOn
 * @returns {{ on: boolean, ariaChecked: "true"|"false", ariaLabel: string, title: string }}
 */
export function creditSwitchView(creditOn) {
  const on = !!creditOn;
  return {
    on,
    ariaChecked: on ? "true" : "false",
    ariaLabel: on ? "Credit memo: Yes" : "Credit memo: No",
    title: on
      ? "Listing this vendor's submitted Bills — pick the one this credit is against."
      : "Listing Purchase Orders and Item Receipts. Switch on to credit a Bill instead.",
  };
}

/**
 * One `searchLink` row (`{ value, description }`) as a modal item.
 * @param {{ value?: unknown, description?: unknown }|null|undefined} row
 * @returns {SourceItem|null}
 */
export function creditSourceItemFromRow(row) {
  if (!row || typeof row !== "object") return null;
  const name = row.value != null ? String(row.value).trim() : "";
  if (!name) return null;
  const desc = row.description != null ? String(row.description).trim() : "";
  return {
    label: desc && desc !== name ? `${name}   ·   ${desc}` : name,
    kind: "bill",
    name,
  };
}

/**
 * The escape hatch, kept as a group rather than a second footer button: it is the same
 * "Decide later" the standalone picker offered. Choosing it writes nothing at all — the credit
 * keeps whatever `return_against` it already had, and the orphan warning stays up if empty.
 * @returns {SourceGroup}
 */
function creditNicGroup() {
  return {
    id: CREDIT_NIC_GROUP_ID,
    name: "No Bill behind it",
    items: [
      {
        label: "Decide later — leave Return Against empty (the orphan warning stays up)",
        kind: "nic",
      },
    ],
  };
}

/**
 * @param {string|null|undefined} supplier
 * @returns {SourceGroup[]}
 */
export function buildCreditSourceLoadingGroups(supplier) {
  const sup = supplier != null ? String(supplier).trim() : "";
  return [
    creditNicGroup(),
    {
      id: CREDIT_SOURCE_GROUP_ID,
      name: sup ? `Submitted Bills — ${sup}` : "Submitted Bills",
      loading: true,
      items: [{ label: "Loading…", kind: "bill", draft: true, loading: true }],
    },
  ];
}

/**
 * Credit-mode groups from fetched rows.
 *
 * Scope is deliberately the **current vendor**: the modal only opens once a supplier is set, and
 * `make_debit_note` rejects a source Bill from another supplier anyway. Cross-vendor search
 * stays on the header switch's picker until this modal grows a search field.
 *
 * @param {Array<{ value?: unknown, description?: unknown }>|null|undefined} rows
 * @param {{ supplier?: string, exclude?: string }} [opts]
 * @returns {SourceGroup[]}
 */
export function buildCreditSourceGroups(rows, opts = {}) {
  const sup = opts.supplier != null ? String(opts.supplier).trim() : "";
  const exclude = opts.exclude != null ? String(opts.exclude).trim() : "";
  const list = Array.isArray(rows) ? rows : [];
  /** @type {SourceItem[]} */
  const items = [];
  for (const row of list) {
    const it = creditSourceItemFromRow(row);
    // Never offer the document back to itself as its own source.
    if (it && it.name !== exclude) items.push(it);
  }
  if (!items.length) {
    items.push({
      label: sup
        ? `No submitted Bills found for ${sup}.`
        : "No submitted Bills found for this vendor.",
      kind: "bill",
      draft: true,
    });
  }
  return [
    creditNicGroup(),
    {
      id: CREDIT_SOURCE_GROUP_ID,
      name: sup ? `Submitted Bills — ${sup}` : "Submitted Bills",
      items,
    },
  ];
}

/**
 * @param {string|null|undefined} message
 * @param {string|null|undefined} supplier
 * @returns {SourceGroup[]}
 */
export function buildCreditSourceErrorGroups(message, supplier) {
  const msg = message != null ? String(message).trim() : "";
  const sup = supplier != null ? String(supplier).trim() : "";
  return [
    creditNicGroup(),
    {
      id: CREDIT_SOURCE_GROUP_ID,
      name: sup ? `Submitted Bills — ${sup}` : "Submitted Bills",
      error: msg || "Load failed",
      items: [{ label: msg || "Could not load Bills.", kind: "bill", draft: true }],
    },
  ];
}

/**
 * What the host should do with a chosen item while credit mode is on.
 *
 * `"decline"` is the NIC row: it declines to add a link, and — unlike a cleared field — must not
 * strip a `return_against` the document already has.
 *
 * @param {SourceItem|{ mode?: string, items?: SourceItem[] }|null|undefined} choice
 * @returns {{ action: "link"|"decline"|"ignore", name: string }}
 */
export function classifyCreditSourceChoice(choice) {
  if (!choice || typeof choice !== "object") return { action: "ignore", name: "" };
  /** @type {SourceItem|null} */
  let it = null;
  if ("kind" in choice && choice.kind) {
    it = /** @type {SourceItem} */ (choice);
  } else {
    const items = Array.isArray(/** @type {any} */ (choice).items)
      ? /** @type {any} */ (choice).items
      : [];
    it = items.length === 1 ? items[0] : null;
    if (!it && /** @type {any} */ (choice).mode === "nic") {
      return { action: "decline", name: "" };
    }
  }
  if (!it) return { action: "ignore", name: "" };
  if (it.kind === "nic") return { action: "decline", name: "" };
  if (it.kind !== "bill") return { action: "ignore", name: "" };
  const name = it.name != null ? String(it.name).trim() : "";
  return name ? { action: "link", name } : { action: "ignore", name: "" };
}
