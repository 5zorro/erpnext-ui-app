/**
 * Bill Due Date vs Payment Terms Template (header due_date is separate in ERP).
 * When Terms are set, Due Date is calculated (and for multi-installment templates the
 * schedule lives in payment_schedule — header due_date is usually the last installment).
 */

/**
 * @param {unknown} termsOrDoc payment_terms_template string or Bill doc
 * @returns {boolean}
 */
export function hasBillPaymentTerms(termsOrDoc) {
  if (termsOrDoc == null) return false;
  if (typeof termsOrDoc === "string") return !!String(termsOrDoc).trim();
  if (typeof termsOrDoc === "object") {
    return !!String(
      /** @type {{ payment_terms_template?: unknown }} */ (termsOrDoc).payment_terms_template ||
        "",
    ).trim();
  }
  return false;
}

/**
 * When Terms are chosen, Bill Due Date is generated — out of Tab order but still
 * clickable/editable for freehand override.
 * @param {unknown} termsOrDoc
 * @param {{ editable?: boolean }} [opts]
 * @returns {{ tabbable: boolean, readOnly: boolean, hint: string }}
 */
export function billDueDateFieldMode(termsOrDoc, opts = {}) {
  const editable = opts.editable !== false;
  if (!editable) {
    return {
      tabbable: false,
      readOnly: true,
      hint: "Locked on submitted Bills.",
    };
  }
  if (hasBillPaymentTerms(termsOrDoc)) {
    return {
      tabbable: false,
      readOnly: false,
      hint: "From Terms (not in Tab order) — click to edit.",
    };
  }
  return {
    tabbable: true,
    readOnly: false,
    hint: "Digits and / - . only · Tab once to leave · MM/DD fills nearest year",
  };
}
