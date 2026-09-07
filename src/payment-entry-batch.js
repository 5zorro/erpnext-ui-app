/**
 * Merge N single-invoice Payment Entry drafts into one multi-reference Payment Entry payload.
 *
 * Why this exists (Packet 4b step 4, revised 2026-09-06 -- 5zorro: "this is a group of
 * unrelated invoices instead of 1 invoice, and the payment date is not the same"): ERPNext's
 * own `get_payment_entry` server call only accepts one (dt, dn) at a time -- there is no
 * server call for "one payment covering N unrelated invoices." The batch drawer needs exactly
 * that, so the shell calls get_payment_entry once per unique invoice (letting ERPNext compute
 * each invoice's own account / currency / exchange rate / early-payment discount correctly,
 * rather than reimplementing that logic shell-side) and merges the results here. Reused by
 * createBatchPaymentEntryForBills (electron/main.js).
 */

/** Header fields that must agree across every source draft before they can share one PE. */
const HEADER_MATCH_FIELDS = Object.freeze([
  "company",
  "party_type",
  "party",
  "payment_type",
  "paid_from",
  "paid_to",
  "paid_from_account_currency",
  "paid_to_account_currency",
]);

/** @param {unknown} x */
function round2(x) {
  return Math.round((Number(x) || 0) * 100) / 100;
}

/**
 * @param {object[]} peDocs raw Payment Entry drafts, one per invoice, from get_payment_entry
 * @returns {{ ok: true, doc: object } | { ok: false, reason: string }}
 */
export function mergeSinglePaymentEntries(peDocs) {
  const docs = Array.isArray(peDocs) ? peDocs.filter((d) => d && typeof d === "object") : [];
  if (!docs.length) return { ok: false, reason: "No Payment Entry drafts to merge." };

  const base = docs[0];
  for (const field of HEADER_MATCH_FIELDS) {
    for (const d of docs.slice(1)) {
      const a = base[field] ?? "";
      const b = d[field] ?? "";
      if (a !== b) {
        return {
          ok: false,
          reason: `Cannot batch these bills into one payment: ${field} differs (${JSON.stringify(a)} vs ${JSON.stringify(b)}).`,
        };
      }
    }
  }

  const references = [];
  for (const d of docs) {
    for (const ref of Array.isArray(d.references) ? d.references : []) {
      references.push({ ...ref });
    }
  }
  if (!references.length) {
    return { ok: false, reason: "None of these bills produced a payable reference." };
  }

  const totalAllocated = round2(
    references.reduce((sum, r) => sum + (Number(r.allocated_amount) || 0), 0),
  );

  return {
    ok: true,
    doc: {
      ...base,
      references,
      paid_amount: totalAllocated,
      received_amount: totalAllocated,
    },
  };
}
