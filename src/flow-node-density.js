/**
 * How much an aggregate node in the Pay Outstanding flow view may show, given how tall its span is
 * (Packet 4b).
 *
 * The flow SVG owns the geometry: a schedule row is exactly `ROW_HEIGHT`, and an aggregate's span
 * is its member count x `ROW_HEIGHT`, which is what makes all three columns the same height and the
 * ribbons land on their rows (see `pay-outstanding.src.html`). So a one-member aggregate gets 34px
 * and cannot be given more — the column's alignment is not negotiable.
 *
 * That leaves one lever: the node fits its **content** to the height it is given, rather than the
 * row stretching to fit the content. Measured 2026-09-08 on SUP-DAILY-LG, a suggested-payment node
 * wanted 67px in a 34px box — 89 of 92 nodes overflowed and 88 of them printed their text straight
 * over their neighbour's, which is what 5zorro hit: *"i have difficulty seeing the actual info
 * between the overlap of the proposed payment info, the create payment button, and whatever else."*
 *
 * Pure: decides what to show. The page applies it as a class.
 */

/** @typedef {"compact"|"medium"|"full"} FlowNodeDensity */
/** @typedef {{ density: FlowNodeDensity, rows: number, stacked: boolean, showSub: boolean }} FlowNodePlan */

export const FLOW_NODE_DENSITIES = Object.freeze(["compact", "medium", "full"]);

/** Below this many rows of height, a node has one line to work with and no more. */
export const STACKED_MIN_ROWS = 2;
/** At or above this many rows, there is room for the explanatory sub-line as well. */
export const FULL_MIN_ROWS = 3;

/**
 * @param {number} spanHeightPx the node's box height, as the SVG computed it
 * @param {number} rowHeightPx one schedule row
 * @returns {FlowNodeDensity}
 */
export function flowNodeDensity(spanHeightPx, rowHeightPx) {
  const rows = rowsIn(spanHeightPx, rowHeightPx);
  if (rows >= FULL_MIN_ROWS) return "full";
  if (rows >= STACKED_MIN_ROWS) return "medium";
  return "compact";
}

/**
 * The full plan for a node, so the builder and the tests agree on one rule rather than each
 * re-deriving "is there room for the sub-line".
 *
 * The booleans are really a capacity in content lines: `stacked` means a second line fits, and
 * `showSub` a third. The two node types spend those lines differently, which is why this returns
 * capacity rather than a layout — a suggested payment spends its second line on the Create payment
 * button, so its explanatory sub-line has to wait for a third; an invoice node has no button and
 * spends its second line on the sub-line directly.
 *
 * - `compact` (1 row): one line — everything on it, side by side.
 * - `medium` (2 rows): two lines.
 * - `full` (3+ rows): everything.
 *
 * Deliberately says nothing about whether a *label* fits beside an icon: that is a width question,
 * and a one-line node has width to spare (measured: a labelled Create payment button leaves 32px
 * of slack in the narrowest column this grid produces). Height is the only thing scarce here.
 *
 * @param {number} spanHeightPx
 * @param {number} rowHeightPx
 * @returns {FlowNodePlan}
 */
export function flowNodePlan(spanHeightPx, rowHeightPx) {
  const rows = rowsIn(spanHeightPx, rowHeightPx);
  const density = flowNodeDensity(spanHeightPx, rowHeightPx);
  return {
    density,
    rows,
    stacked: density !== "compact",
    showSub: density === "full",
  };
}

/**
 * Height in whole rows. Junk (a zero/negative/non-finite row height, a missing span) resolves to a
 * single row, so an unknown geometry degrades to the layout that cannot overflow.
 * @param {number} spanHeightPx @param {number} rowHeightPx
 */
function rowsIn(spanHeightPx, rowHeightPx) {
  const span = Number(spanHeightPx);
  const row = Number(rowHeightPx);
  if (!Number.isFinite(span) || !Number.isFinite(row) || row <= 0 || span <= 0) return 1;
  // A hair of tolerance: a 1px border or a sub-pixel layout must not demote a 2-row node to one
  // line. The SVG works in whole rows, so anything within a pixel of N rows *is* N rows.
  return Math.max(1, Math.floor(span / row + 1 / row));
}
