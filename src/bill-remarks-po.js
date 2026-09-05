/**
 * Bill remarks search hint from linked PO logbook # (OI-121 / T5 brainstorm).
 * Prefill only when remarks empty — logbook title first, else ERP PO name.
 */

/**
 * @param {Array<{ name?: string, title?: string|null }>} poRows
 * @returns {string}
 */
export function billRemarksPoSearchHint(poRows) {
  const rows = Array.isArray(poRows) ? poRows : [];
  if (!rows.length) return "";
  const parts = rows
    .map((row) => {
      const title = row && row.title != null ? String(row.title).trim() : "";
      const name = row && row.name != null ? String(row.name).trim() : "";
      if (title && name) return `PO# ${title} (${name})`;
      if (title) return `PO# ${title}`;
      if (name) return `PO ${name}`;
      return "";
    })
    .filter(Boolean);
  return parts.join("; ");
}

/**
 * @param {object|null|undefined} doc
 * @param {Array<{ name?: string, title?: string|null }>} poRows
 * @returns {boolean}
 */
export function shouldPrefillBillRemarksFromPo(doc, poRows) {
  const remarks = doc && doc.remarks != null ? String(doc.remarks).trim() : "";
  if (remarks) return false;
  return billRemarksPoSearchHint(poRows).length > 0;
}
