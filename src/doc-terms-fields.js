/**
 * ERP terms fields — Payment Terms Template (link) vs freeform Terms and Conditions (text).
 * Same `terms` fieldname on PO, Purchase Receipt, and Purchase Invoice.
 */

export const ERP_PAYMENT_TERMS_FIELD = "payment_terms_template";
export const ERP_FREEFORM_TERMS_FIELD = "terms";

export const PAYMENT_TERMS_HEADER_LABEL = "Payment terms";
export const FREEFORM_TERMS_LABEL = "Terms and conditions";
/** Bill notes section — editable ERP `terms`; not the readonly PO/IR source block. */
export const BILL_FREEFORM_TERMS_LABEL = "Bill terms and conditions (optional)";
export const SOURCE_TERMS_READONLY_LABEL = "Terms from sources (read-only)";

/**
 * Strip HTML for display in readonly source-terms blocks (ERP Text Editor values).
 * @param {unknown} raw
 * @returns {string}
 */
export function plainTermsText(raw) {
  if (raw == null || raw === "") return "";
  const s = String(raw);
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}
