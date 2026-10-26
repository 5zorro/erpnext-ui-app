/**
 * T-1 (plan 2026-10-25, DF-03): the lines table's order holds still while the clerk types in it.
 * Every repaint used to sort again, so a line whose sorted value was just edited moved to its new
 * place under the cursor ("it jumped to the wrong row"). While the order is held, a repaint keeps
 * the lines where they were shown, a new line goes at the bottom, and a deleted one drops out. The
 * order is re-sorted when the clerk asks for it (header, 🔄) or clicks away from the table
 * (`src/item-table-keys-ui.js` decides when). Pure — no DOM.
 */

/**
 * @template {{ rowIndex: number }} M
 * @param {M[]} sorted the lines in the current sort's order
 * @param {(rowIndex: number) => string} keyOf a line's lasting identity (ERPNext's row `name`)
 * @param {readonly string[]|null} held the lines' keys in the order last shown; null: not holding
 * @returns {{ models: M[], outOfDate: boolean }} `outOfDate`: the order shown is not the sort's
 */
export function holdLineOrder(sorted, keyOf, held) {
  if (!held) return { models: sorted, outOfDate: false };
  /** @type {Map<string, M>} */
  const byKey = new Map(sorted.map((m) => [keyOf(m.rowIndex), m]));
  /** @type {M[]} */
  const models = [];
  for (const key of held) {
    const m = byKey.get(key);
    if (!m) continue;
    models.push(m);
    byKey.delete(key);
  }
  models.push(...[...byKey.values()].sort((a, b) => a.rowIndex - b.rowIndex));
  return { models, outOfDate: models.some((m, i) => m !== sorted[i]) };
}
