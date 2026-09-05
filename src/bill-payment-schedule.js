/**
 * Bill header due_date ↔ payment_schedule alignment (OI-142).
 * ERP SSoT: installments live in payment_schedule; header due_date is clerk-facing
 * “when is this due?” — last schedule row when multi-row Terms apply.
 */

/**
 * @param {object|null|undefined} doc
 * @returns {string}
 */
export function headerDueDateFromPaymentSchedule(doc) {
  const sched = doc && Array.isArray(doc.payment_schedule) ? doc.payment_schedule : [];
  for (let i = sched.length - 1; i >= 0; i--) {
    const row = sched[i];
    if (row && row.due_date != null && String(row.due_date).trim()) {
      return String(row.due_date).trim();
    }
  }
  return "";
}

/**
 * @param {object|null|undefined} row
 * @returns {string}
 */
export function paymentScheduleRowDueDate(row) {
  if (!row || row.due_date == null) return "";
  return String(row.due_date).trim();
}

/**
 * Plan how a header due_date edit should write back to payment_schedule.
 * @param {object|null|undefined} doc
 * @param {string|null|undefined} newDueDate ISO yyyy-mm-dd
 * @returns {{
 *   action: "noop"|"create_row"|"update_row"|"update_last_row",
 *   index?: number,
 *   due_date?: string,
 *   multiInstallment?: boolean,
 * }}
 */
export function planDueDateScheduleSync(doc, newDueDate) {
  const due = newDueDate != null ? String(newDueDate).trim() : "";
  if (!due) return { action: "noop" };
  const sched = doc && Array.isArray(doc.payment_schedule) ? doc.payment_schedule : [];
  if (!sched.length) return { action: "create_row", due_date: due };
  if (sched.length === 1) {
    return { action: "update_row", index: 0, due_date: due };
  }
  return {
    action: "update_last_row",
    index: sched.length - 1,
    due_date: due,
    multiInstallment: true,
  };
}

/**
 * Whether header due_date disagrees with schedule SSoT (last row).
 * @param {object|null|undefined} doc
 * @returns {boolean}
 */
export function headerDueDateDiffersFromSchedule(doc) {
  const header =
    doc && doc.due_date != null ? String(doc.due_date).trim() : "";
  const fromSched = headerDueDateFromPaymentSchedule(doc);
  if (!header || !fromSched) return false;
  return header !== fromSched;
}

/**
 * Header due_date to paint when schedule exists (schedule wins over stale header).
 * @param {object|null|undefined} doc
 * @returns {string}
 */
export function billDueDateForPaint(doc) {
  const fromSched = headerDueDateFromPaymentSchedule(doc);
  if (fromSched) return fromSched;
  return doc && doc.due_date != null ? String(doc.due_date).trim() : "";
}

/**
 * When header due_date exists but payment_schedule is empty, plan a single schedule row (OI-142).
 * @param {object|null|undefined} doc
 * @returns {{ action: "noop"|"need_row", due_date?: string, payment_amount?: number|string }}
 */
export function planPaymentScheduleMinRow(doc) {
  if (!doc || typeof doc !== "object") return { action: "noop" };
  const sched = Array.isArray(doc.payment_schedule) ? doc.payment_schedule : [];
  if (sched.length > 0) return { action: "noop" };
  const due = doc.due_date != null ? String(doc.due_date).trim() : "";
  if (!due) return { action: "noop" };
  const payment_amount =
    doc.grand_total != null && doc.grand_total !== ""
      ? doc.grand_total
      : doc.rounded_total != null && doc.rounded_total !== ""
        ? doc.rounded_total
        : 0;
  return { action: "need_row", due_date: due, payment_amount };
}

/**
 * Clerk-facing hint when header due_date edit touches a multi-installment schedule.
 * @param {{ multiInstallment?: boolean }|null|undefined} plan
 * @returns {string|null}
 */
export function dueDateMultiInstallmentHint(plan) {
  if (!plan || !plan.multiInstallment) return null;
  return "Multi-installment Terms — header due date updates the last installment only.";
}
