/**
 * Header due_date from ERPNext payment_schedule after Terms template settles.
 * @deprecated import from bill-payment-schedule.js — re-export for existing callers
 */
export { headerDueDateFromPaymentSchedule } from "./bill-payment-schedule.js";

/**
 * One-line due-date settle summary for nav/focus logs (no vendor text).
 * @param {object|null|undefined} settle
 * @returns {string}
 */
export function formatDueDateSettleLog(settle) {
  const s = settle && typeof settle === "object" ? settle : {};
  return [
    `field=${s.field || "?"}`,
    `ok=${s.ok ? "1" : "0"}`,
    `src=${s.source || "-"}`,
    `due=${s.due_date || "-"}`,
    `sched=${s.schedule_rows != null ? s.schedule_rows : "-"}`,
    `ms=${s.waited_ms != null ? s.waited_ms : "-"}`,
    s.reason ? `reason=${s.reason}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * @param {import("./bill-enrich-pending.js").BillEnrichPending|null|undefined} pending
 * @param {number} round
 * @returns {string}
 */
export function formatEnrichPendingLog(pending, round) {
  const p = pending && typeof pending === "object" ? pending : {};
  return `round=${round} linkedPos=${p.linkedPos ? 1 : 0} linkedReceipts=${p.linkedReceipts ? 1 : 0} lineContext=${p.lineContext ? 1 : 0}`;
}

/**
 * Whether setHeader should run Vanilla payment-terms settlement.
 * @param {string|null|undefined} doctype
 * @param {string|null|undefined} field
 * @returns {boolean}
 */
export function shouldSettlePaymentTermsAfterHeader(doctype, field) {
  const dt = doctype != null ? String(doctype).trim() : "";
  const fld = field != null ? String(field).trim() : "";
  if (fld !== "payment_terms_template" && fld !== "bill_date") return false;
  return dt === "Purchase Invoice" || dt === "Sales Invoice";
}
