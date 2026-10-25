/**
 * Coming back from a "create …" peek (5zorro DF-02): the clerk lands in the cell they left, and
 * when the errand saved a new record, the cell holds it. Pure: the page records where it was,
 * main says where the peek ended, this decides what to do.
 */
import { routeInfo, isNewDocRecord } from "./route-info.js";

/**
 * Where to come back to. Reads the box's own `data-row` / `data-field`: a line cell has both, a
 * header field (the Sales Order's Customer — DF-03) has only `data-field`.
 * @param {{ dataset?: Record<string, string|undefined> }|null|undefined} input
 * @param {string} doctype what the peek creates, e.g. "Item"
 * @returns {{ doctype: string, row: number|null, field: string } | null} row null = header field
 */
export function peekReturnTarget(input, doctype) {
  const ds = (input && input.dataset) || {};
  const field = ds.field ? String(ds.field) : "";
  if (!doctype || !field) return null;
  if (ds.row == null || ds.row === "") return { doctype: String(doctype), row: null, field };
  const row = Number(ds.row);
  if (!Number.isInteger(row) || row < 0) return null;
  return { doctype: String(doctype), row, field };
}

/**
 * @param {{ doctype: string, row: number|null, field: string } | null | undefined} target
 * @param {string} leftFrom the ERP route the peek was on when the clerk came back
 * @returns {{ row: number|null, field: string, fill: string } | null} `fill` is the saved record's
 *   name, or "" when the errand was abandoned / ended somewhere else (focus only); row null =
 *   a header field.
 */
export function peekReturnPlan(target, leftFrom) {
  if (!target) return null;
  const info = routeInfo(leftFrom || "");
  const slug = String(target.doctype).toLowerCase().replace(/\s+/g, "-");
  let fill = "";
  if (info.doctype === slug && info.record && !isNewDocRecord(info.record)) {
    try {
      fill = decodeURIComponent(info.record);
    } catch {
      fill = info.record;
    }
  }
  return { row: target.row, field: target.field, fill };
}

/**
 * Whether the empty-line cleanup must leave this line alone (5zorro nav incident 2026-10-12: line 2
 * of a Sales Order, create Item, Save, Esc — the line was removed instead of filled). Picking
 * "create …" puts the cell back to empty, and coming back blurs it, so the cleanup that drops a
 * line left empty saw an empty cell and removed the very line the new Item was about to land on.
 * The line is held while the errand is out (`pending`), and after the return until the clerk's
 * next move (`hold`), so an abandoned errand still lets them leave the line and have it dropped.
 * @param {{ row: number|null }|null|undefined} pending the target recorded when the peek opened
 * @param {{ row: number|null }|null|undefined} hold the line the return came back to
 * @param {number} rowIndex
 * @param {boolean} movedSinceHold the clerk has pressed a move key or clicked since the return
 */
export function peekErrandHoldsRow(pending, hold, rowIndex, movedSinceHold) {
  const ri = Number(rowIndex);
  if (pending && pending.row === ri) return true;
  return !!(hold && hold.row === ri && !movedSinceHold);
}
