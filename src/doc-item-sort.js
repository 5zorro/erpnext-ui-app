/**
 * Doc-skin item grid sort (PO / shared) — display order only; ERP rowIndex stays for writes.
 */

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
 * @param {string} sortKey
 * @param {boolean} [asc=true]
 * @returns {Array<{ rowIndex: number, cells: Array<string|number> }>}
 */
export function sortDocItemRowModels(doc, cols, readRows, sortKey, asc = true) {
  const rows = typeof readRows === "function" ? readRows(doc) : [];
  const list = Array.isArray(rows) ? rows : [];
  const colList = Array.isArray(cols) ? cols : [];
  const key = sortKey || (colList[0] && colList[0].sortKey) || "lineNo";
  const ci = colList.findIndex((c) => c && c.sortKey === key);
  const dir = asc ? 1 : -1;
  /** @type {Array<{ rowIndex: number, cells: Array<string|number> }>} */
  const models = list.map((cells, rowIndex) => ({
    rowIndex,
    cells: Array.isArray(cells) ? cells : [],
  }));
  models.sort((a, b) => {
    const va = ci >= 0 ? a.cells[ci] : a.rowIndex;
    const vb = ci >= 0 ? b.cells[ci] : b.rowIndex;
    const na = Number(va);
    const nb = Number(vb);
    let cmp = 0;
    if (Number.isFinite(na) && Number.isFinite(nb) && String(va).trim() !== "" && String(vb).trim() !== "") {
      cmp = na - nb;
    } else {
      const sa = String(va ?? "").toLowerCase();
      const sb = String(vb ?? "").toLowerCase();
      cmp = sa < sb ? -1 : sa > sb ? 1 : 0;
    }
    if (cmp === 0) return a.rowIndex - b.rowIndex;
    return cmp * dir;
  });
  return models;
}
