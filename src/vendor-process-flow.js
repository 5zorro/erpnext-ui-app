/**
 * Vendors Home swimlane layout (dogfood feedback, 2026-09-06).
 *
 * Tile id / label / route / washRole stay the SSoT in HOME_GROUPS (home-tiles.js);
 * this module only says how to arrange the Vendors tiles into a process-flow view:
 * a Daily request → receipt → bill pipeline, and a Weekly/Monthly lane holding two
 * independent tasks (Pay Bills, Vendor Center) that both consume Daily's output but
 * do not feed one another.
 */

/** @typedef {{ step: string, tileIds: string[] }} FlowStep */
/**
 * @typedef {{ id: string, label: string, shortLabel: string, subtitle: string,
 *   sequential: boolean, steps: FlowStep[] }} FlowLane
 */
/** @typedef {{ fromStep: string, label: string }} FlowBridge */

/**
 * `shortLabel` is what the rail actually shows (rotated 90°, minimal width);
 * `label` + `subtitle` carry the full cadence/description for a title tooltip
 * (dogfood feedback 2026-09-06: the rail's own text ate too much horizontal
 * room once it stayed on-screen — collapse it, don't delete the information).
 */
export const VENDOR_FLOW_LANES = Object.freeze([
  Object.freeze({
    id: "daily",
    label: "Daily",
    shortLabel: "Daily",
    subtitle: "Request → Receipt → Finalized Transaction",
    sequential: true,
    steps: [
      Object.freeze({ step: "1", tileIds: ["po-new", "mr-new"] }),
      Object.freeze({ step: "2", tileIds: ["receipt-new"] }),
      Object.freeze({ step: "3", tileIds: ["bill-new"] }),
    ],
  }),
  Object.freeze({
    id: "weekly",
    label: "Weekly / monthly",
    shortLabel: "As needed",
    subtitle: "Settle & research",
    sequential: false,
    steps: [
      Object.freeze({ step: "4", tileIds: ["pay-bills"] }),
      Object.freeze({ step: "5", tileIds: ["vendors"] }),
    ],
  }),
]);

/**
 * Daily → Weekly hand-offs. Both weekly tasks read from the same upstream step
 * (posted bills); neither is downstream of the other, so each gets its own bridge
 * instead of one tile chaining into the next (dogfood feedback: no fake arrow into
 * Vendor Center).
 */
export const VENDOR_FLOW_BRIDGES = Object.freeze([
  Object.freeze({ fromStep: "3", label: "Posted bills queue up for the weekly pay run" }),
  Object.freeze({ fromStep: "3", label: "Entered bills get checked against vendor statements" }),
]);

/** @returns {string[]} every tile id referenced anywhere in VENDOR_FLOW_LANES, in order, deduped */
export function vendorFlowTileIds() {
  const seen = new Set();
  const out = [];
  for (const lane of VENDOR_FLOW_LANES) {
    for (const step of lane.steps) {
      for (const id of step.tileIds) {
        if (!seen.has(id)) {
          seen.add(id);
          out.push(id);
        }
      }
    }
  }
  return out;
}

/** @returns {Set<string>} the step values that exist across all lanes */
export function vendorFlowStepIds() {
  const out = new Set();
  for (const lane of VENDOR_FLOW_LANES) {
    for (const step of lane.steps) out.add(step.step);
  }
  return out;
}
