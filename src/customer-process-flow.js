/**
 * Customers Home swimlane layout (5zorro 2026-09-26) — the A/R twin of vendor-process-flow.js.
 *
 * First pass (same day): "estimate > sales order > sales invoice > payment receipt.
 * Sometimes the estimate is skipped… arrange the tiles to be where estimate is above sales order
 * (like the AP part… material order and purchase order) just with a tiny arrow pointing down."
 *
 * Same shape as the Vendors lanes, so home.html draws both with one renderer. Tile id / label /
 * route / washRole stay the SSoT in HOME_GROUPS (home-tiles.js).
 *
 * A step marked `detached` is drawn after a divider rather than an arrow.
 * A stacked step's `join` says how its tiles relate: "either" (Vendors' PO / Material Request —
 * alternative sources) or "then" (Estimate ↓ Sales Order — the first may be skipped, and leads
 * into the second). A "then" stack numbers its tiles as separate steps (`badges`).
 */

/** @typedef {import("./vendor-process-flow.js").FlowLane} FlowLane */
/** @typedef {import("./vendor-process-flow.js").FlowBridge} FlowBridge */

export const CUSTOMER_FLOW_LANES = Object.freeze([
  Object.freeze({
    id: "daily",
    label: "Daily",
    shortLabel: "Daily",
    subtitle: "Estimate → Order → Invoice → Payment received",
    sequential: true,
    // The mirror of Vendors' shape (5zorro 2026-09-26): Vendors fans *in* (two sources stacked,
    // then one line), Customers fans *out* — Estimate → Sales Order → the two things an order
    // leads to, stacked. It puts the Sales Order in the middle, where the work is.
    steps: [
      Object.freeze({ step: "1", tileIds: ["estimate-new"], caption: "optional" }),
      Object.freeze({ step: "2", tileIds: ["so-new"] }),
      Object.freeze({
        step: "3",
        tileIds: ["invoice-new", "receive-pay"],
        join: "then",
        badges: ["3", "4"],
        caption: "invoice, then get paid",
      }),
    ],
  }),
  // Research, not a step the payment depends on — its own lane, as Vendor Center is.
  Object.freeze({
    id: "weekly",
    label: "Weekly / monthly",
    shortLabel: "As needed",
    subtitle: "Follow up & research",
    sequential: false,
    steps: [Object.freeze({ step: "5", tileIds: ["customers"] })],
  }),
]);

/** Home draws bridges between lanes; Customers' second lane needs no explanation. */
export const CUSTOMER_FLOW_BRIDGES = Object.freeze([]);

/** @returns {string[]} every tile id in CUSTOMER_FLOW_LANES, in order, deduped */
export function customerFlowTileIds() {
  const out = [];
  for (const lane of CUSTOMER_FLOW_LANES) {
    for (const step of lane.steps) {
      for (const id of step.tileIds) if (!out.includes(id)) out.push(id);
    }
  }
  return out;
}
