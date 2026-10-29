/**
 * The Bill's informal link dialog, its words and lists without the screen (OI-147/164/165; plan
 * 2026-10-25 R6a-2). One dialog, three doors:
 * - "bill": *Informal link to Bill…* — a plain-text token in Remarks, never `return_against`;
 * - "so": *Informal link to Sales Order…*;
 * - "bill" with purpose "source": the same Bill list, opened when the clerk flips Credit memo →
 *   Yes with no Bill behind it ("Which Bill is this credit against?"); Decide later adds nothing.
 * The dialog is src/bill-informal-link-modal-ui.js.
 */

/** @typedef {"bill"|"so"} InformalLinkKind */
/** @typedef {{ value: string, description?: string }} InformalLinkRow */

/**
 * The dialog's fixed words and test ids for a door.
 * @param {InformalLinkKind} kind
 * @param {"link"|"source"} [purpose]
 */
export function informalLinkView(kind, purpose = "link") {
  const isBill = kind === "bill";
  const sourcePick = isBill && purpose === "source";
  const label = isBill ? "Bill" : "Sales Order";
  const dialogLabel = sourcePick ? "Which Bill is this credit against?" : `Informal link to ${label}`;
  const subtitle = sourcePick
    ? " — same vendor by default; type/paste a name to search any vendor. Skip this and the credit posts with no Bill behind it."
    : isBill
      ? " — same vendor by default; type/paste a name to search any vendor"
      : " (Sales Order picker — not restricted by vendor)";
  return {
    isBill,
    sourcePick,
    label,
    dialogLabel,
    title: `${dialogLabel}${subtitle}`,
    placeholder: isBill ? "Search Bills…" : "Filter Sales Orders…",
    clearText: sourcePick ? "Decide later" : "Clear link",
    testId: sourcePick ? "bill-credit-source-picker" : `bill-informal-link-picker-${kind}`,
    rowTestId: sourcePick ? "bill-credit-source-row" : `bill-informal-link-${kind}-row`,
  };
}

/**
 * The rows shown for what is typed: value or description contains it, any case. Bills are
 * searched on ERPNext as well; Sales Orders are fetched once and only filtered here.
 * @param {InformalLinkRow[]} rows
 * @param {string} query
 */
export function filterInformalLinkRows(rows, query) {
  const q = String(query || "").trim().toLowerCase();
  return q ? rows.filter((r) => `${r.value} ${r.description || ""}`.toLowerCase().includes(q)) : rows;
}

/** A row's words: "name — description", or the name when there is nothing more to say. */
export const informalLinkRowLabel = (r) => (r.description && r.description !== r.value ? `${r.value} — ${r.description}` : r.value);

/** What an empty list says: the vendor's own Bills are none, or nothing matches what was typed. */
export function informalLinkEmptyText(isBill, query, supplier) {
  return isBill && !String(query || "").trim()
    ? `No submitted Bills found for ${supplier || "this vendor"}. Type to search any vendor.`
    : "No matches.";
}

/**
 * Sales Orders from the picker's list as rows: the customer and total as the description.
 * @param {Array<{ name: string, customer?: string, customer_name?: string, grand_total?: number|string }>} orders
 * @returns {InformalLinkRow[]}
 */
export function salesOrderLinkRows(orders) {
  return (orders || []).map((so) => ({
    value: so.name,
    description: `${so.customer_name || so.customer || ""}${so.grand_total ? ` — $${so.grand_total}` : ""}`.trim(),
  }));
}

/** The status line while a link is written or cleared, and after it was. */
export function informalLinkStatus(label, name) {
  return name
    ? { working: `Linking informally to ${label} ${name}…`, done: `Noted in Remarks: informal link to ${label} ${name}.` }
    : { working: `Clearing informal ${label} link…`, done: `Informal ${label} link cleared.` };
}

/** "Decide later" on the source door: nothing is written, and the warning stays. */
export const DECIDE_LATER_STATUS =
  "Credit memo left with no Bill behind it — the Return Against warning below stays up until you link one.";
