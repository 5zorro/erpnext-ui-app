/**
 * Purchase Invoice list Find prefill from Ref dupe warning (OI-054).
 * List query uses ERP standard filters (all matches) — not the trailing-6 pattern window.
 */

/**
 * @param {import("./bill-ref-check.js").BillRefCheckResult|null|undefined} result
 * @returns {boolean}
 */
export function billRefCheckHasDupeWarning(result) {
  return !!(
    result &&
    result.status === "warn" &&
    Array.isArray(result.warnings) &&
    result.warnings.some((w) => w && w.code === "duplicate")
  );
}

/**
 * @param {{ billNo?: string|null, supplier?: string|null }} ctx
 * @returns {{ billNo: string, supplier?: string }|null}
 */
export function billFindPrefillFromDupeWarning(ctx = {}) {
  const billNo = ctx.billNo != null ? String(ctx.billNo).trim() : "";
  if (!billNo) return null;
  const supplier = ctx.supplier != null ? String(ctx.supplier).trim() : "";
  return supplier ? { billNo, supplier } : { billNo };
}
