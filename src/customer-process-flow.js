/**
 * Customers Home swimlane layout (5zorro 2026-09-26) — the A/R twin of vendor-process-flow.js.
 *
 * "The flow on the home screen is estimate > sales order > sales invoice > payment receipt.
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
    steps: [
      Object.freeze({
        step: "1",
        tileIds: ["estimate-new", "so-new"],
        join: "then",
        badges: ["1", "2"],
        caption: "estimate optional",
      }),
      Object.freeze({ step: "3", tileIds: ["invoice-new"] }),
      Object.freeze({ step: "4", tileIds: ["receive-pay"] }),
      // Research, not a next step: a divider, not an arrow. Kept in this one lane (not a second
      // "As needed" lane like Vendors') so Home still fits a maximized 1080p window.
      Object.freeze({ step: "5", tileIds: ["customers"], detached: true }),
    ],
  }),
]);

/** No second lane, so nothing to bridge to. */
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
