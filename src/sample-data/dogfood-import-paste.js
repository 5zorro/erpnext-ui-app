/**
 * Messy vendor spreadsheet paste grids for OI-132 Import lines dogfood.
 * Pure — emits TSV/CSV for emit-dogfood-sources.js.
 */

/** @typedef {import("./dogfood-ap-sources.js").DogfoodSourceDoc} DogfoodSourceDoc */

/** 11-column vendor export layout (0-based indices documented in README). */
export const MESSY_VENDOR_11COL = Object.freeze({
  colCount: 11,
  junkRow1: [
    "MA INC — OPEN ORDER EXPORT",
    "Run date: 07/15/2026",
    "Internal use only",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ],
  headerRow: [
    "Line #",
    "Dept",
    "Vendor note",
    "SKU",
    "Mfg part",
    "Qty ordered",
    "UOM",
    "Unit list",
    "Disc %",
    "Extended",
    "Ship date",
  ],
  /** Suggested Import lines mapping (column index → import target). */
  suggestedMap: Object.freeze({
    2: "description_append",
    3: "item_code",
    5: "qty",
    9: "line_amount",
  }),
  ignoreLeadingRows: 2,
});

/**
 * @param {import("./dogfood-ap-sources.js").SourceLine} line
 * @param {number} lineNo
 * @returns {string[]}
 */
export function buildMessyVendorDataRow(line, lineNo) {
  const ext = (Number(line.qty) * Number(line.rate)).toFixed(2);
  return [
    String(lineNo),
    "WH-01",
    `Lot note: ${line.description}`,
    line.sku,
    `MFG-${line.sku}`,
    String(line.qty),
    line.uom || "EA",
    String(line.rate),
    "0",
    ext,
    "08/15/2026",
  ];
}

/**
 * @param {DogfoodSourceDoc} doc
 * @param {{ junkRow1?: string[], headerRow?: string[], colCount?: number }} [profile]
 * @returns {{ rows: string[][], tsv: string, csv: string, suggestedMap: Record<number, string>, ignoreLeadingRows: number }}
 */
export function buildMessyImportPaste(doc, profile = MESSY_VENDOR_11COL) {
  /** @type {string[][]} */
  const rows = [];
  rows.push([...(profile.junkRow1 || MESSY_VENDOR_11COL.junkRow1)]);
  rows.push([...(profile.headerRow || MESSY_VENDOR_11COL.headerRow)]);
  (doc.lines || []).forEach((line, i) => {
    rows.push(buildMessyVendorDataRow(line, i + 1));
  });
  const colCount = profile.colCount || MESSY_VENDOR_11COL.colCount;
  const normalized = rows.map((r) => {
    const copy = [...r];
    while (copy.length < colCount) copy.push("");
    return copy.slice(0, colCount);
  });
  const tsv = normalized.map((r) => r.join("\t")).join("\n");
  const csv = normalized
    .map((r) =>
      r
        .map((c) => {
          const s = String(c ?? "");
          return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
  return {
    rows: normalized,
    tsv,
    csv,
    suggestedMap: { ...MESSY_VENDOR_11COL.suggestedMap },
    ignoreLeadingRows: MESSY_VENDOR_11COL.ignoreLeadingRows,
  };
}
