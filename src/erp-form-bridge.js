/**
 * Doc ↔ Vanilla form bridge — pure helpers (SSoT for settle rules).
 * Page script: electron/erp-form-bridge-page.js (injected into ERP WebContents).
 *
 * Template for Bill / PO / IR: event-driven waits (form hooks + frappe.after_ajax),
 * not fixed sleeps or main-process poll loops.
 */

export const DOC_FORM_BRIDGE_VERSION = 3;

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
