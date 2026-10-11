/**
 * Coming back from a "create …" peek (5zorro DF-02): the clerk lands in the cell they left, and
 * when the errand saved a new record, the cell holds it. Pure: the page records where it was,
 * main says where the peek ended, this decides what to do.
 */
import { routeInfo, isNewDocRecord } from "./route-info.js";

/**
 * Where to come back to. Reads a line cell's own `data-row` / `data-field`; a header field
 * (no row) has nothing to come back to here.
 * @param {{ dataset?: Record<string, string|undefined> }|null|undefined} input
 * @param {string} doctype what the peek creates, e.g. "Item"
 * @returns {{ doctype: string, row: number, field: string } | null}
 */
export function peekReturnTarget(input, doctype) {
  const ds = (input && input.dataset) || {};
  const row = Number(ds.row);
  const field = ds.field ? String(ds.field) : "";
  if (!doctype || !field || !Number.isInteger(row) || row < 0) return null;
  return { doctype: String(doctype), row, field };
}

/**
 * @param {{ doctype: string, row: number, field: string } | null | undefined} target
 * @param {string} leftFrom the ERP route the peek was on when the clerk came back
 * @returns {{ row: number, field: string, fill: string } | null} `fill` is the saved record's
 *   name, or "" when the errand was abandoned / ended somewhere else (focus only).
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
