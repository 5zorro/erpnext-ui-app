/**
 * Item-table import cleaner (OI-132) — parse paste/CSV, map columns, skip dirty rows.
 * Shared by Bill · PO · IR (and future Doc item grids).
 */

import { parseMoney } from "./money.js";

/** @typedef {"data"|"header"|"skip"} ItemImportRowRole */

export const MAX_ITEM_IMPORT_ROWS = 100;

/** Virtual column targets (not ERP field names). */
export const IMPORT_COL_IGNORE = "";
export const IMPORT_COL_DESCRIPTION_APPEND = "description_append";
export const IMPORT_COL_LINE_AMOUNT = "line_amount";

/** Preferred write order so ERP autofill runs before dependent fields. */
export const ITEM_IMPORT_FIELD_ORDER = [
  "item_code",
  "description",
  "qty",
  "rate",
  "sales_order",
  "schedule_date",
  "project",
];

const HEADER_ALIASES = Object.freeze({
  item_code: [
    "item",
    "sku",
    "item code",
    "item_code",
    "part",
    "part number",
    "part #",
    "part no",
    "product",
    "product code",
  ],
  description: ["description", "desc", "details", "memo", "name"],
  description_append: ["vendor note", "note", "comment", "line note", "append"],
  qty: ["qty", "quantity", "q'ty", "units", "count", "qty ordered"],
  rate: ["rate", "cost", "unit cost", "price", "unit price", "unit rate", "unit list"],
  line_amount: [
    "extended",
    "ext",
    "line total",
    "line amount",
    "amount",
    "ext cost",
    "extended cost",
    "total",
  ],
  sales_order: ["sales order", "sales_order", "so", "so #", "so number", "deal"],
  schedule_date: [
    "required by",
    "schedule date",
    "schedule_date",
    "req by",
    "need by",
    "due date",
  ],
  project: ["project", "customer job", "customer:job", "job", "job #"],
});

/**
 * @param {string} s
 * @returns {string}
 */
export function normalizeImportHeaderCell(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[_#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {Array<{ label?: string, field?: string|null, displayOnly?: boolean }>} itemCols
 * @returns {Array<{ field: string, label: string }>}
 */
export function editableImportFields(itemCols) {
  if (!Array.isArray(itemCols)) return [];
  return itemCols
    .filter(
      (c) =>
        c &&
        typeof c.field === "string" &&
        c.field &&
        !c.field.startsWith("__") &&
        !c.displayOnly,
    )
    .map((c) => ({ field: c.field, label: c.label || c.field }));
}

/**
 * Dropdown options for column mapping (ERP fields + virtual roles).
 * @param {Array<{ label?: string, field?: string|null, displayOnly?: boolean }>} itemCols
 * @returns {Array<{ value: string, label: string }>}
 */
export function importColumnOptions(itemCols) {
  const fields = editableImportFields(itemCols);
  return [
    { value: IMPORT_COL_IGNORE, label: "(ignore column)" },
    ...fields.map((f) => ({ value: f.field, label: f.label })),
    { value: IMPORT_COL_DESCRIPTION_APPEND, label: "Description (append to item name)" },
    { value: IMPORT_COL_LINE_AMOUNT, label: "Extended amount (÷ qty → rate)" },
  ];
}

/**
 * @param {string} line
 * @returns {"tab"|","}
 */
export function detectGridDelimiter(line) {
  const tab = (line.match(/\t/g) || []).length;
  const comma = (line.match(/,/g) || []).length;
  if (tab > comma) return "tab";
  return ",";
}

/**
 * @param {string} line
 * @param {"tab"|","} delim
 * @returns {string[]}
 */
export function splitGridLine(line, delim) {
  if (delim === "tab") {
    return String(line).split("\t").map((s) => s.trim());
  }
  /** @type {string[]} */
  const out = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
      continue;
    }
    if (!inQuote && c === ",") {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out.map((s) => s.replace(/^"|"$/g, "").replace(/""/g, '"'));
}

/**
 * @param {string} text
 * @returns {{ rows: string[][], delimiter: "tab"|",", warnings: string[] }}
 */
export function parseGridText(text) {
  const warnings = [];
  const raw = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  const lines = raw.split("\n").map((l) => l.trimEnd());
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (!nonEmpty.length) {
    return { rows: [], delimiter: "tab", warnings: ["Paste or choose a CSV with at least one row."] };
  }
  const delimiter = detectGridDelimiter(nonEmpty[0]);
  const rows = nonEmpty.map((line) => splitGridLine(line, delimiter));
  const widths = rows.map((r) => r.length);
  const maxW = Math.max(...widths, 0);
  const minW = Math.min(...widths, 0);
  if (maxW !== minW) {
    warnings.push("Rows have uneven column counts — short rows were padded with blanks.");
  }
  const normalized = rows.map((r) => {
    const copy = [...r];
    while (copy.length < maxW) copy.push("");
    return copy;
  });
  return { rows: normalized, delimiter, warnings };
}

/**
 * @param {string} cell
 * @param {Array<{ value: string, label: string }>} options
 * @returns {string|null}
 */
export function matchHeaderCellToImportColumn(cell, options) {
  const norm = normalizeImportHeaderCell(cell);
  if (!norm) return null;
  for (const opt of options) {
    if (!opt.value) continue;
    const labelNorm = normalizeImportHeaderCell(opt.label);
    if (norm === labelNorm || norm === opt.value) return opt.value;
    const aliases = HEADER_ALIASES[opt.value];
    if (aliases && aliases.includes(norm)) return opt.value;
  }
  return null;
}

/**
 * @param {string[][]} rows
 * @param {Array<{ value: string, label: string }>} options
 * @returns {boolean}
 */
export function detectHeaderRow(rows, options) {
  if (!rows.length || !options.length) return false;
  const hits = rows[0].filter((cell) => matchHeaderCellToImportColumn(cell, options)).length;
  return hits >= 2;
}

/**
 * @param {string[]} headerRow
 * @param {Array<{ value: string, label: string }>} options
 * @param {number} colCount
 * @returns {string[]}
 */
export function guessColumnMap(headerRow, options, colCount) {
  /** @type {string[]} */
  const map = [];
  for (let i = 0; i < colCount; i++) {
    const fromHeader =
      headerRow && headerRow[i] != null ? matchHeaderCellToImportColumn(headerRow[i], options) : null;
    map.push(fromHeader || IMPORT_COL_IGNORE);
  }
  if (map.some((v) => v && v !== IMPORT_COL_IGNORE)) return map;
  const positional = ["item_code", "description", "qty", "rate"];
  for (let i = 0; i < colCount; i++) {
    const field = positional[i];
    const opt = options.find((o) => o.value === field);
    map[i] = opt ? field : IMPORT_COL_IGNORE;
  }
  return map;
}

/**
 * @param {number} rowCount
 * @param {boolean} hasHeaderRow
 * @returns {ItemImportRowRole[]}
 */
export function defaultRowRoles(rowCount, hasHeaderRow) {
  /** @type {ItemImportRowRole[]} */
  const roles = [];
  for (let i = 0; i < rowCount; i++) {
    if (hasHeaderRow && i === 0) roles.push("header");
    else roles.push("data");
  }
  return roles;
}

/**
 * Mark the first N rows as ignored (header/junk).
 * @param {ItemImportRowRole[]} rowRoles
 * @param {number} n
 * @returns {ItemImportRowRole[]}
 */
export function applyIgnoreFirstRows(rowRoles, n) {
  const count = Math.max(0, Math.min(Number(n) || 0, rowRoles.length));
  return rowRoles.map((role, i) => {
    if (i < count) return "skip";
    return role === "header" ? "data" : role;
  });
}

/**
 * @param {ItemImportRowRole} role
 * @returns {boolean}
 */
export function isIgnoredImportRow(role) {
  return role === "header" || role === "skip";
}

/**
 * Row is junk when every mapped cell is blank.
 * @param {string[]} row
 * @param {string[]} columnMap
 * @returns {boolean}
 */
export function isBlankImportDataRow(row, columnMap) {
  if (!row || !columnMap.length) return true;
  for (let ci = 0; ci < columnMap.length; ci++) {
    if (!columnMap[ci] || columnMap[ci] === IMPORT_COL_IGNORE) continue;
    if (String(row[ci] ?? "").trim()) return false;
  }
  return true;
}

/**
 * @param {string[][]} rows
 * @param {{ columnMap: string[], rowRoles: ItemImportRowRole[], editableFields: Array<{ field: string }> }} opts
 * @returns {Record<string, string>[]}
 */
export function rowsToImportRecords(rows, opts) {
  const { columnMap, rowRoles, editableFields } = opts;
  const allowed = new Set(editableFields.map((f) => f.field));
  /** @type {Record<string, string>[]} */
  const out = [];
  for (let ri = 0; ri < rows.length; ri++) {
    const role = rowRoles[ri] || "data";
    if (isIgnoredImportRow(role)) continue;
    const row = rows[ri];
    if (isBlankImportDataRow(row, columnMap)) continue;
    /** @type {Record<string, string>} */
    const rec = {};
    for (let ci = 0; ci < columnMap.length; ci++) {
      const target = columnMap[ci];
      if (!target || target === IMPORT_COL_IGNORE) continue;
      const val = String(row[ci] ?? "").trim();
      if (!val) continue;
      if (target === IMPORT_COL_DESCRIPTION_APPEND) {
        rec._appendDescription = rec._appendDescription
          ? `${rec._appendDescription} ${val}`
          : val;
      } else if (target === IMPORT_COL_LINE_AMOUNT) {
        rec._lineAmount = val;
      } else if (allowed.has(target)) {
        rec[target] = val;
      }
    }
    if (Object.keys(rec).length) out.push(rec);
  }
  return out;
}

/**
 * Turn raw mapped record into ERP writes + optional description append.
 * @param {Record<string, string>} rec
 * @returns {{ writes: Record<string, string>, appendDescription?: string }}
 */
export function resolveImportRecord(rec) {
  /** @type {Record<string, string>} */
  const writes = {};
  if (rec.item_code) writes.item_code = rec.item_code;
  if (rec.description) writes.description = rec.description;
  if (rec.qty) writes.qty = rec.qty;
  if (rec.rate) writes.rate = rec.rate;
  if (rec.sales_order) writes.sales_order = rec.sales_order;
  if (rec.schedule_date) writes.schedule_date = rec.schedule_date;
  if (rec.project) writes.project = rec.project;

  if (rec._lineAmount && rec.qty && !writes.rate) {
    const amt = parseMoney(rec._lineAmount);
    const qty = Number(rec.qty);
    if (amt != null && Number.isFinite(qty) && qty > 0) {
      writes.rate = String(amt / qty);
    }
  }

  const appendDescription = rec._appendDescription ? String(rec._appendDescription).trim() : "";
  return {
    writes,
    appendDescription: appendDescription || undefined,
  };
}

/**
 * @param {Record<string, string>[]} records
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 */
export function validateImportRecords(records) {
  const errors = [];
  const warnings = [];
  if (!records.length) {
    errors.push("No data rows to import — check column mapping and ignored rows.");
  }
  if (records.length > MAX_ITEM_IMPORT_ROWS) {
    errors.push(`Too many rows (${records.length}). Import at most ${MAX_ITEM_IMPORT_ROWS} at a time.`);
  }
  const missingSku = records.filter((r) => !r.item_code).length;
  if (missingSku && missingSku === records.length) {
    warnings.push("No Item/SKU column mapped — lines may import with description/qty only.");
  }
  const amountNoQty = records.filter((r) => r._lineAmount && !r.qty).length;
  if (amountNoQty) {
    warnings.push(
      `${amountNoQty} row(s) map extended amount but not Qty — rate cannot be calculated.`,
    );
  }
  return { ok: !errors.length, errors, warnings };
}

/**
 * @param {Record<string, string>} writes
 * @returns {string[]}
 */
export function importFieldWriteOrder(writes) {
  const keys = Object.keys(writes);
  return [
    ...ITEM_IMPORT_FIELD_ORDER.filter((f) => keys.includes(f)),
    ...keys.filter((k) => !ITEM_IMPORT_FIELD_ORDER.includes(k)).sort(),
  ];
}

/**
 * Merge ERP description with an append fragment after item autofill.
 * @param {string|null|undefined} existing
 * @param {string|null|undefined} append
 * @param {string|null|undefined} replace
 * @returns {string}
 */
export function mergeImportDescription(existing, append, replace) {
  let base = replace != null && String(replace).trim() !== "" ? String(replace).trim() : String(existing || "").trim();
  const extra = append != null ? String(append).trim() : "";
  if (!extra) return base;
  if (!base) return extra;
  if (base.includes(extra)) return base;
  return `${base} — ${extra}`;
}
