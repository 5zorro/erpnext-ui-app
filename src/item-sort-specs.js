/**
 * Multi-column item-grid sort specs (display order only).
 * Tie-break is always line number / rowIndex ascending (stable, unique).
 */

/**
 * @typedef {{ key: string, asc: boolean }} SortSpec
 */

/**
 * @param {unknown} va
 * @param {unknown} vb
 * @returns {number} -1 | 0 | 1
 */
export function compareSortValues(va, vb) {
  const na = Number(va);
  const nb = Number(vb);
  if (
    Number.isFinite(na) &&
    Number.isFinite(nb) &&
    String(va ?? "").trim() !== "" &&
    String(vb ?? "").trim() !== ""
  ) {
    return na === nb ? 0 : na < nb ? -1 : 1;
  }
  const sa = String(va ?? "").toLowerCase();
  const sb = String(vb ?? "").toLowerCase();
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/**
 * Apply a header click to the sort stack.
 * - Normal click: replace stack with this column (toggle asc if same sole key).
 * - Ctrl/Cmd click: add/update this column in the stack (toggle if already present).
 * @param {SortSpec[]} specs
 * @param {string} sortKey
 * @param {{ ctrlKey?: boolean, metaKey?: boolean }} [mods]
 * @returns {SortSpec[]}
 */
export function applyHeaderSortClick(specs, sortKey, mods = {}) {
  const key = String(sortKey || "").trim();
  if (!key) return Array.isArray(specs) ? specs.map((s) => ({ ...s })) : [];
  const multi = !!(mods.ctrlKey || mods.metaKey);
  const prev = Array.isArray(specs) ? specs.map((s) => ({ key: s.key, asc: !!s.asc })) : [];

  if (!multi) {
    if (prev.length === 1 && prev[0].key === key) {
      return [{ key, asc: !prev[0].asc }];
    }
    return [{ key, asc: true }];
  }

  const idx = prev.findIndex((s) => s.key === key);
  if (idx >= 0) {
    const next = prev.map((s) => ({ ...s }));
    next[idx] = { key, asc: !next[idx].asc };
    return next;
  }
  return [...prev, { key, asc: true }];
}

/**
 * @param {SortSpec[]|null|undefined} specs
 * @param {string} [fallbackKey="lineNo"]
 * @returns {SortSpec[]}
 */
export function normalizeSortSpecs(specs, fallbackKey = "lineNo") {
  const list = Array.isArray(specs)
    ? specs.filter((s) => s && s.key).map((s) => ({ key: String(s.key), asc: s.asc !== false }))
    : [];
  if (list.length) return list;
  return [{ key: fallbackKey, asc: true }];
}

/**
 * @param {SortSpec[]} specs
 * @param {string} sortKey
 * @returns {{ active: boolean, primary: boolean, asc: boolean, rank: number }}
 */
export function sortHeaderState(specs, sortKey) {
  const list = normalizeSortSpecs(specs);
  const idx = list.findIndex((s) => s.key === sortKey);
  if (idx < 0) return { active: false, primary: false, asc: true, rank: -1 };
  return {
    active: true,
    primary: idx === 0,
    asc: list[idx].asc,
    rank: idx + 1,
  };
}

/**
 * Arrow marks for multi-sort headers (▲ / ▼ plus rank when multi).
 * @param {SortSpec[]} specs
 * @param {string} sortKey
 */
export function sortHeaderArrow(specs, sortKey) {
  const st = sortHeaderState(specs, sortKey);
  if (!st.active) return "";
  const arrow = st.asc ? " ▲" : " ▼";
  const list = normalizeSortSpecs(specs);
  if (list.length <= 1) return arrow;
  return `${arrow}${st.rank}`;
}

/**
 * Compare two rows with sort specs; always tie-break by tieBreakAsc (unique line id).
 * @param {T} a
 * @param {T} b
 * @param {SortSpec[]} specs
 * @param {(row: T, key: string) => unknown} getValue
 * @param {(row: T) => number} tieBreakAsc
 * @template T
 */
export function compareBySortSpecs(a, b, specs, getValue, tieBreakAsc) {
  const list = normalizeSortSpecs(specs);
  for (const spec of list) {
    const cmp = compareSortValues(getValue(a, spec.key), getValue(b, spec.key));
    if (cmp !== 0) return cmp * (spec.asc ? 1 : -1);
  }
  const ta = tieBreakAsc(a);
  const tb = tieBreakAsc(b);
  return ta === tb ? 0 : ta < tb ? -1 : 1;
}
