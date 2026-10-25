/**
 * Split a whole number of units (cents, thousandths of a qty, whole items) across weights, as
 * evenly as the units allow — the one rule behind the Bill's charge allocation (5zorro 2026-10-11)
 * and a Bill line's split across Sales Orders (review 10-19 R6b-4, 5zorro 2026-10-22: "same code").
 *
 * Every share starts rounded down; the leftover units then go one at a time to the shares closest
 * to their next unit (the largest-remainder method), ties to the earlier share. 67 over ten equal
 * weights is seven 7s and three 6s; 6,667 thousandths over ten is seven 0.667 and three 0.666.
 * A weight of zero (or less, or not a number) gets nothing.
 * @param {number} totalUnits a whole number ≥ 0
 * @param {number[]} weights
 * @returns {number[]} whole units per weight, summing to `totalUnits` (all 0 when no weight is positive)
 */
export function splitUnitsByWeights(totalUnits, weights) {
  const total = Math.max(0, Math.round(Number(totalUnits) || 0));
  const w = (Array.isArray(weights) ? weights : []).map((x) => {
    const n = Number(x);
    return Number.isFinite(n) && n > 0 ? n : 0;
  });
  const sumW = w.reduce((a, b) => a + b, 0);
  if (!(total > 0) || !(sumW > 0)) return w.map(() => 0);
  const raw = w.map((wi) => (wi / sumW) * total);
  // Float noise off before flooring (0.29 × 100 is 28.999…).
  const units = raw.map((x) => Math.floor(x + 1e-9));
  let left = total - units.reduce((a, b) => a + b, 0);
  const order = raw
    .map((x, i) => ({ i, frac: w[i] > 0 ? x - Math.floor(x + 1e-9) : -1 }))
    .filter((o) => o.frac >= 0)
    .sort((a, b) => (Math.abs(b.frac - a.frac) > 1e-9 ? b.frac - a.frac : a.i - b.i));
  for (let k = 0; left > 0 && order.length; k = (k + 1) % order.length) {
    units[order[k].i] += 1;
    left -= 1;
  }
  return units;
}
