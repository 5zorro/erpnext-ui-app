/**
 * The right-click menu on a Find page row (5zorro 2026-10-11, DF-01: "right clicked on a row … no
 * options related to this row appeared"). Four groups, broad to narrow to the page itself, about
 * three items each and twelve at most (5zorro: "around 12 or less, about 4 in each"):
 *
 *   party     — the vendor / customer the row belongs to
 *   document  — this one bill / order / payment
 *   view      — looking at it and editing it
 *   page      — the assumptions this Find page makes (what it hides, where it hands off)
 *
 * A placeholder is listed but disabled ("not built yet"), so the menu shows where the idea goes
 * and dogfood decides what fills it. Pure: the page renders the list and runs the ids it knows.
 */
import { findSkinFor, findSkinEntryLabel, findPartyLabel } from "./find-skin-registry.js";

export const FIND_ROW_MENU_MAX_ITEMS = 12;
export const FIND_ROW_MENU_MAX_PER_GROUP = 5;

/**
 * @typedef {{ id: string, group: "party"|"document"|"view"|"page", label: string, enabled: boolean,
 *   hint?: string, checked?: boolean, route?: string }} FindRowMenuItem
 * @typedef {{ id: string, title: string, items: FindRowMenuItem[] }} FindRowMenuGroup
 */

const NOT_BUILT = "Not built yet — a placeholder for dogfood to decide";

/** The party's own record: Supplier or Customer (a payment goes by its direction). */
export function findPartyDoctype(skin, direction) {
  if (!skin) return "";
  return findPartyLabel(skin, direction) === "Customer" ? "Customer" : "Supplier";
}

/**
 * @param {{
 *   doctypeKey: string,
 *   row: { name: string, party?: string, docstatus?: number|string } & Record<string, unknown>,
 *   direction?: string,
 *   showCancelled?: boolean,
 *   status?: string,
 * }} input
 * @returns {FindRowMenuGroup[]} empty when there is no Find page for the doctype
 */
export function findRowMenu({ doctypeKey, row, direction = "Pay", showCancelled = false, status = "" }) {
  const skin = findSkinFor(doctypeKey);
  if (!skin || !row || !row.name) return [];
  const partyWord = findPartyLabel(skin, direction);
  const partyDt = findPartyDoctype(skin, direction);
  const partyId = String(row[skin.party.field] ?? "").trim();
  const partyShown = String(row.party || partyId || "").trim();
  const noun = skin.directional ? "payment" : findSkinEntryLabel(doctypeKey).toLowerCase();
  const slug = partyDt.toLowerCase();

  /** @type {FindRowMenuGroup[]} */
  const groups = [
    {
      id: "party",
      title: partyShown ? `${partyWord} · ${partyShown}` : partyWord,
      items: [
        { id: "party-only", group: "party", label: `Show only ${partyShown || "this " + partyWord.toLowerCase()} here`, enabled: !!partyId },
        {
          id: "party-open",
          group: "party",
          label: `Open the ${partyWord.toLowerCase()} record`,
          enabled: !!partyId,
          route: partyId ? `/app/${slug}/${encodeURIComponent(partyId)}` : "",
        },
        { id: "party-new", group: "party", label: `New ${noun} for this ${partyWord.toLowerCase()}`, enabled: false, hint: NOT_BUILT },
      ],
    },
    {
      id: "document",
      title: `This ${noun} · ${row.name}`,
      items: [
        { id: "doc-copy", group: "document", label: `Copy ${row.name}`, enabled: true },
        { id: "doc-linked", group: "document", label: "Linked documents…", enabled: false, hint: NOT_BUILT },
        // DF-01's three-step delete (bill → payment → ledger) wants one path; this is where it goes.
        { id: "doc-cancel", group: "document", label: "Cancel or delete…", enabled: false, hint: NOT_BUILT },
      ],
    },
    {
      id: "view",
      title: "View & edit",
      items: [
        { id: "view-peek", group: "view", label: "Peek", enabled: true },
        { id: "view-open", group: "view", label: `Open this ${noun}`, enabled: true, route: `/app/${doctypeKey}/${encodeURIComponent(row.name)}` },
        { id: "view-print", group: "view", label: "Print…", enabled: false, hint: NOT_BUILT },
      ],
    },
    {
      id: "page",
      title: "This page",
      items: [
        {
          id: "page-cancelled",
          group: "page",
          label: "Show cancelled",
          enabled: status !== "Cancelled",
          checked: showCancelled || status === "Cancelled",
        },
        { id: "page-vanilla", group: "page", label: "Search in Vanilla list", enabled: true },
        { id: "page-settings", group: "page", label: "Page settings…", enabled: false, hint: NOT_BUILT },
      ],
    },
  ];
  return groups;
}
