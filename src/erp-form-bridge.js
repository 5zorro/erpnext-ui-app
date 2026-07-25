/**
 * Doc ↔ Vanilla form bridge — pure helpers (SSoT for settle rules).
 * Page script: electron/erp-form-bridge-page.js (injected into ERP WebContents).
 *
 * Template for Bill / PO / IR: event-driven waits (form hooks + frappe.after_ajax),
 * not fixed sleeps or main-process poll loops.
 */

export const DOC_FORM_BRIDGE_VERSION = 6;

/**
 * @param {object|null|undefined} frm cur_frm-like
 * @param {string|null|undefined} doctype
 */
export function formMatchesDoctype(frm, doctype) {
  if (!frm || !frm.doc) return false;
  if (!doctype) return true;
  return frm.doctype === doctype || frm.doc.doctype === doctype;
}

/**
 * @param {unknown} s
 * @returns {string}
 */
export function stripHtmlPlain(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Does a field have a value for mandatory checks? Mirrors Frappe has_value / Check quirks.
 * @param {unknown} value
 * @param {string} [fieldtype]
 */
export function isMandatoryValuePresent(value, fieldtype) {
  if (fieldtype === "Check") return true;
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return !Number.isNaN(value);
  return stripHtmlPlain(value) !== "";
}

/**
 * Build human blockers from a live-meta snapshot (no Frappe runtime).
 * Used by unit tests and by the injected bridge after it evaluates depends_on.
 *
 * @param {{
 *   parent?: Array<{ label: string, required: boolean, present: boolean }>,
 *   tables?: Array<{
 *     label: string,
 *     totalRows: number,
 *     missing?: Array<{ label: string, rows: number[] }>,
 *   }>,
 *   promptNameMissing?: boolean,
 * }} snap
 * @returns {string[]}
 */
export function listMandatoryBlockersFromSnap(snap = {}) {
  const lines = [];
  if (snap.promptNameMissing) {
    lines.push("Name is required.");
  }
  for (const f of snap.parent || []) {
    if (f && f.required && !f.present) {
      lines.push(`${stripHtmlPlain(f.label) || "Field"} is required.`);
    }
  }
  for (const te of snap.tables || []) {
    if (!te) continue;
    const tableLabel = stripHtmlPlain(te.label) || "Table";
    const total = Number(te.totalRows) || 0;
    for (const miss of te.missing || []) {
      if (!miss) continue;
      const fieldLabel = stripHtmlPlain(miss.label) || "Field";
      const rows = Array.isArray(miss.rows)
        ? [...new Set(miss.rows.map((n) => Number(n)).filter((n) => n > 0))].sort((a, b) => a - b)
        : [];
      if (!rows.length) continue;
      if (total > 0 && rows.length === total) {
        lines.push(`In ${tableLabel}, ${fieldLabel} is required in every row.`);
      } else if (rows.length === 1) {
        lines.push(`In ${tableLabel}, ${fieldLabel} is required in row ${rows[0]}.`);
      } else {
        lines.push(`In ${tableLabel}, ${fieldLabel} is required in rows ${rows.join(", ")}.`);
      }
    }
  }
  return lines;
}

/**
 * Merge Doc-skin + live-meta blockers (order-preserving unique).
 * @param {...(string[]|null|undefined)} lists
 * @returns {string[]}
 */
export function mergeSaveBlockers(...lists) {
  const out = [];
  const seen = new Set();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const line = stripHtmlPlain(raw);
      if (!line) continue;
      const key = line.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(line);
    }
  }
  return out;
}

/**
 * After item_code set: still need master description / rate?
 * @param {object|null|undefined} row
 */
export function rowNeedsItemEnrichment(row) {
  if (!row || !row.item_code) return false;
  const needDesc = !stripHtmlPlain(row.description);
  const needRate = row.rate == null || Number(row.rate) === 0;
  return needDesc || needRate;
}

/**
 * Map Item get_value / master fields → child row patches.
 * @param {object|null|undefined} itemMsg
 * @param {object|null|undefined} row
 * @returns {{ description?: string, rate?: number }}
 */
export function pickItemAutofillFields(itemMsg, row) {
  const out = {};
  if (!itemMsg || typeof itemMsg !== "object") return out;
  const needDesc = !row || !stripHtmlPlain(row.description);
  const needRate = !row || row.rate == null || Number(row.rate) === 0;
  if (needDesc) {
    const desc = stripHtmlPlain(itemMsg.description) || itemMsg.item_name || itemMsg.name;
    if (desc) out.description = desc;
  }
  if (needRate) {
    const rate = Number(itemMsg.last_purchase_rate || itemMsg.standard_rate || 0);
    if (rate) out.rate = rate;
  }
  return out;
}
