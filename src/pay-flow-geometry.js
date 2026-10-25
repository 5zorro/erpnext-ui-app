/**
 * Pay Outstanding vendor card geometry — where rows, aggregate nodes, ribbon strands and braces
 * sit (HANDOFF § Pay Outstanding flow). Pure numbers and SVG path strings; the board page only
 * draws them. Moved out of `pay-outstanding.src.html` (review 10-19 R10b-3) so the rules each
 * paid for with a bug are pinned by tests:
 *
 * - the SVG owns the geometry: row *i*'s centre is `i * ROW_HEIGHT + ROW_HEIGHT / 2`;
 * - an aggregate's span is `memberCount * ROW_HEIGHT` — member count, **never** dollar share (that
 *   drew a 4-row-tall payment fed by 5 rows);
 * - a ribbon bundle is centred in its span, never spread to fill it;
 * - a brace is sized to the bundle's real extent, never less than `MIN_BRACE_H`.
 */

export const ROW_HEIGHT = 34;
export const MIN_STROKE = 2;
export const MAX_STROKE = 16;
/** Horizontal gutter reserved for the brace, so it never overlaps the strands. */
export const BRACE_ZONE = 20;
/** A two-strand bundle is only ~8px tall; a brace that small reads as a smudge. */
export const MIN_BRACE_H = 18;
/** The least vertical room a strand takes in its bundle, however thin it is drawn. */
const MIN_STRAND_PITCH = 4;

/**
 * Centre Y of schedule row `i` in the card's flow coordinates.
 * @param {number} i
 * @param {number} [rowHeight]
 */
export function rowCenterY(i, rowHeight = ROW_HEIGHT) {
  return i * rowHeight + rowHeight / 2;
}

/**
 * Stack aggregate nodes top to bottom, each as tall as the rows it draws from (at least one row).
 * An aggregate row is as tall as its members — NOT proportional to its dollar amount, which is
 * what the board did until 2026-09-08 ("if this mockup is to try to be production, it should look
 * sane"). Row-count sizing also makes all three columns exactly the schedule's height, and lines a
 * node up with its own block of rows whenever its members are contiguous under the current sort.
 * @param {number[]} memberCounts
 * @param {number} [rowHeight]
 * @returns {Array<{ y0: number, y1: number }>}
 */
export function stackSpans(memberCounts, rowHeight = ROW_HEIGHT) {
  const out = [];
  let cur = 0;
  for (const n of memberCounts) {
    const h = Math.max(rowHeight, (Number(n) || 0) * rowHeight);
    out.push({ y0: cur, y1: cur + h });
    cur += h;
  }
  return out;
}

/**
 * Stroke width for one strand: its share of the vendor's total, scaled and clamped.
 * @param {number} amount
 * @param {number} vendorTotal
 */
export function strokeForShare(amount, vendorTotal) {
  const share = vendorTotal > 0 ? amount / vendorTotal : 0;
  const scaled = share * MAX_STROKE * 4; // heuristic scale; clamped below regardless
  return Math.min(MAX_STROKE, Math.max(MIN_STROKE, scaled));
}

/**
 * Where each strand of one span meets its aggregate, and the brace around them.
 *
 * The strands converge into a **bundle** centred in the aggregate's span, each as thick as its own
 * amount — so the bundle's total thickness reads as the group's size. It is deliberately NOT spread
 * to fill the span: a first pass did, which made every strand a near-horizontal line and erased the
 * convergence ("I now see no flow at all for the stress test of 90 small payments" — 5zorro
 * 2026-09-08, reverted). Centred rather than pinned to the top edge (option B, same day): "it keeps
 * the ribbon height, and because they are not forced to move as far, there is less overlap".
 *
 * The brace is sized to the bundle's real extent, not the span's — bracing an 8-row cell when the
 * flow fills its top fifth implies something to catch in the other four fifths — and is only drawn
 * for two or more strands.
 *
 * @param {{ y0: number, y1: number, keys: string[] }} span
 * @param {Map<string, number>} pointY row key → centre Y on the other side
 * @param {Map<string, number>} amountByKey
 * @param {(amount: number) => number} strokeFor
 * @returns {{ strands: Array<{ key: string, sy: number, stroke: number, py: number }>, brace: { top: number, bot: number }|null }}
 */
export function placeStrands(span, pointY, amountByKey, strokeFor) {
  const mid = (span.y0 + span.y1) / 2;
  const bundleH = span.keys.reduce(
    (t, k) => t + Math.max(strokeFor(amountByKey.get(k) || 0), MIN_STRAND_PITCH),
    0,
  );
  let used = mid - bundleH / 2;
  const strands = [];
  for (const key of span.keys) {
    const py = pointY.has(key) ? pointY.get(key) : mid;
    const stroke = strokeFor(amountByKey.get(key) || 0);
    const sy = Math.min(span.y1, used + stroke / 2);
    used += Math.max(stroke, MIN_STRAND_PITCH);
    strands.push({ key, sy, stroke, py });
  }
  let brace = null;
  if (strands.length > 1) {
    let top = Math.min(...strands.map((st) => st.sy - st.stroke / 2));
    let bot = Math.max(...strands.map((st) => st.sy + st.stroke / 2));
    if (bot - top < MIN_BRACE_H) {
      const m = (top + bot) / 2;
      top = m - MIN_BRACE_H / 2;
      bot = m + MIN_BRACE_H / 2;
    }
    brace = { top, bot };
  }
  return { strands, brace };
}

/**
 * A curly brace from y0 to y1 whose stem points at the aggregate node — so "these ten
 * installments are that one invoice" is legible before tracing a ribbon.
 * @param {number} y0 @param {number} y1 @param {number} width flow-column width
 * @param {"left"|"right"} spanSide which side the aggregate node is on
 */
export function bracePath(y0, y1, width, spanSide) {
  const onLeft = spanSide === "left";
  const tipX = onLeft ? 2 : width - 2; // stem tip, pointing at the node
  const spineX = onLeft ? 9 : width - 9;
  const curlX = onLeft ? 15 : width - 15; // curls lean toward the many rows
  const mid = (y0 + y1) / 2;
  const r = Math.min(5, Math.max(2, (y1 - y0) / 8));
  return [
    `M ${curlX} ${y0}`,
    `Q ${spineX} ${y0} ${spineX} ${y0 + r}`,
    `L ${spineX} ${mid - r}`,
    `Q ${spineX} ${mid} ${tipX} ${mid}`,
    `Q ${spineX} ${mid} ${spineX} ${mid + r}`,
    `L ${spineX} ${y1 - r}`,
    `Q ${spineX} ${y1} ${curlX} ${y1}`,
  ].join(" ");
}

/** Ribbon path: horizontal-ish cubic bezier from (x1,y1) to (x2,y2). */
export function ribbonPath(x1, y1, x2, y2) {
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
}
