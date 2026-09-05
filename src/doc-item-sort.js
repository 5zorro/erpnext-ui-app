/**
 * Doc-skin item grid sort (PO / shared) — display order only; ERP rowIndex stays for writes.
 */

import {
  applyHeaderSortClick,
  compareBySortSpecs,
  normalizeSortSpecs,
  sortHeaderArrow,
  sortHeaderState,
} from "./item-sort-specs.js";

export {
  applyHeaderSortClick,
  normalizeSortSpecs,
  sortHeaderArrow,
  sortHeaderState,
} from "./item-sort-specs.js";

/**
 * @param {number} rowIndex
 * @param {object|null|undefined} item
 * @returns {string}
 */
export function formatDocLineNumber(rowIndex, item) {
  const row = item && typeof item === "object" ? item : {};
  const idx = Number(row.idx);
  if (Number.isFinite(idx) && idx > 0) return String(idx);
  return String(rowIndex + 1);
}

/**
 * @param {Array<{ label?: string, sortKey?: string }>|null|undefined} cols
 * @returns {Array<{ label: string, sortKey: string }>}
 */
export function sortableHeadersFromCols(cols) {
  return (Array.isArray(cols) ? cols : [])
    .filter((c) => c && c.sortKey)
    .map((c) => ({ label: String(c.label || c.sortKey), sortKey: String(c.sortKey) }));
}

/**
 * @param {object|null|undefined} doc
 * @param {Array<{ sortKey?: string }>|null|undefined} cols
 * @param {(doc: object|null|undefined) => Array<Array<string|number>>} readRows
 * @param {string|import("./item-sort-specs.js").SortSpec[]} sortKeyOrSpecs
 * @param {boolean} [asc=true] ignored when sortKeyOrSpecs is a SortSpec[]
 * @returns {Array<{ rowIndex: number, cells: Array<string|number> }>}
 */
export function sortDocItemRowModels(doc, cols, readRows, sortKeyOrSpecs, asc = true) {
  const rows = typeof readRows === "function" ? readRows(doc) : [];
  const list = Array.isArray(rows) ? rows : [];
  const colList = Array.isArray(cols) ? cols : [];
  /** @type {import("./item-sort-specs.js").SortSpec[]} */
  const specs = Array.isArray(sortKeyOrSpecs)
    ? normalizeSortSpecs(sortKeyOrSpecs)
    : normalizeSortSpecs([{ key: sortKeyOrSpecs || "lineNo", asc }]);

  /** @type {Array<{ rowIndex: number, cells: Array<string|number>, lineNo: number }>} */
  const models = list.map((cells, rowIndex) => {
    const cellList = Array.isArray(cells) ? cells : [];
    const lineCi = colList.findIndex((c) => c && c.sortKey === "lineNo");
    const lineRaw = lineCi >= 0 ? cellList[lineCi] : rowIndex + 1;
    const lineNo = Number(lineRaw);
    return {
      rowIndex,
      cells: cellList,
      lineNo: Number.isFinite(lineNo) && lineNo > 0 ? lineNo : rowIndex + 1,
    };
  });

  models.sort((a, b) =>
    compareBySortSpecs(
      a,
      b,
      specs,
      (row, key) => {
        if (key === "lineNo") return row.lineNo;
        const ci = colList.findIndex((c) => c && c.sortKey === key);
        return ci >= 0 ? row.cells[ci] : row.rowIndex;
      },
      (row) => row.lineNo,
    ),
  );
  return models.map(({ rowIndex, cells }) => ({ rowIndex, cells }));
}
