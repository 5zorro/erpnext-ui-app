/**
 * "Change how we pay this vendor" — the just-in-time, possibly-multi-bill method change
 * (P1 stage 3 / OI-169 + OI-171).
 *
 * 5zorro 2026-09-16: *"all payment methods are generally the same for a single vendor, so if it is
 * weird, then there is a reason… If there is a way to have a 'click here to batch amend all of
 * vendor x's payments to be mode y, so if i have 5 payments for a bill that is 'check' that i don't
 * have to amend it 5 times by clicking in 5 spots."*
 *
 * 🔴 **The thing that makes this cheap: five payments are not five amends.** The dashboard's rows
 * are *installments* — `payment_schedule` rows — and a bill's installments all live inside one
 * document. Changing five of them is one cancel, one copy, one insert. So this module's first job
 * is to collapse the clerk's row-level selection into invoice-level work, and the count it reports
 * is the count of documents that will actually be cancelled.
 *
 * 🔴 **Nothing here writes, and nothing here decides what a document *is*.** The output is an inert
 * plan: which invoices, which schedule rows inside them, and what the clerk is told before any of
 * it happens. `main.js` executes it; `void-amend-flow.js` owns the single-document case.
 *
 * Rows are matched by **due date**, not by index or by `installmentKey`. `installmentKey` is the
 * dashboard's own ordinal over *unpaid* rows sorted by date (`outstanding-bills.js`), so it does
 * not survive a trip to ERP; `idx` is not carried at all. Due date does identify a row, because
 * ERPNext refuses a payment schedule with two rows sharing one (verified 2026-09-22).
 */

/**
 * @typedef {{
 *   invoice: string,
 *   installmentKey: string,
 *   supplier: string,
 *   dueDate: string,
 *   outstanding: number,
 *   modeOfPayment?: string,
 * }} PlannableRow  a subset of `OutstandingBillRow` — everything this module reads
 *
 * @typedef {{
 *   setHeader?: Record<string, string>,
 *   setScheduleRows: Array<{ matchDueDate: string, set: Record<string, string> }>,
 * }} AmendPatch  inert instructions the ERP side applies to the amended draft before inserting it
 *
 * @typedef {{
 *   invoice: string,
 *   supplier: string,
 *   selected: PlannableRow[],
 *   changing: PlannableRow[],
 *   knownRows: number,
 *   allSelected: boolean,
 *   alreadyThere: boolean,
 *   fromModes: string[],
 *   outstanding: number,
 *   linkedPaymentCount: number|null,
 *   isAmendment: boolean,
 *   patch: AmendPatch,
 * }} InvoiceWork
 */

import { predictAmendedName } from "./doc-actions.js";

/** @param {unknown} v */
function text(v) {
  return v == null ? "" : String(v).trim();
}

/** @param {number} n @param {string} noun */
function plural(n, noun) {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/**
 * Turn a row-level selection into invoice-level work.
 *
 * @param {{
 *   rows?: PlannableRow[],
 *   targetMode?: string,
 *   selectedKeys?: string[]|Set<string>|null,   // null/absent = every row, which is the default
 *                                               // 5zorro asked for: the method is a vendor fact,
 *                                               // and a single bill opting out is the exception
 *   paymentsByInvoice?: Record<string, number>|null,
 *   amendmentsByInvoice?: Record<string, boolean>|null,  // which of them are themselves amendments
 * }} input
 * @returns {{
 *   targetMode: string,
 *   work: InvoiceWork[],        // invoices that will actually be amended
 *   skipped: InvoiceWork[],     // already on the target mode — nothing to do, and saying so beats
 *                               // cancelling a document to write the value it already holds
 *   amendCount: number,
 *   rowCount: number,
 *   atRisk: InvoiceWork[],      // has submitted payments against it, which the cancel detaches
 *   blocked: string,            // "" when the plan can run
 * }}
 */
export function planModeChange(input = {}) {
  const targetMode = text(input.targetMode);
  const rows = Array.isArray(input.rows) ? input.rows.filter((r) => r && text(r.invoice)) : [];
  const selection =
    input.selectedKeys == null
      ? null
      : new Set(
          (input.selectedKeys instanceof Set
            ? [...input.selectedKeys]
            : Array.isArray(input.selectedKeys)
              ? input.selectedKeys
              : []
          ).map(text),
        );
  const payments = input.paymentsByInvoice || null;

  /** @type {Map<string, { all: PlannableRow[], selected: PlannableRow[] }>} */
  const byInvoice = new Map();
  for (const r of rows) {
    const key = text(r.invoice);
    if (!byInvoice.has(key)) byInvoice.set(key, { all: [], selected: [] });
    const bucket = byInvoice.get(key);
    bucket.all.push(r);
    if (selection === null || selection.has(text(r.installmentKey))) bucket.selected.push(r);
  }

  /** @type {InvoiceWork[]} */
  const work = [];
  /** @type {InvoiceWork[]} */
  const skipped = [];
  for (const [invoice, bucket] of byInvoice) {
    if (!bucket.selected.length) continue;
    const changing = bucket.selected.filter((r) => text(r.modeOfPayment) !== targetMode);
    const allSelected = bucket.selected.length === bucket.all.length;
    const entry = {
      invoice,
      supplier: text(bucket.selected[0].supplier),
      selected: bucket.selected,
      changing,
      knownRows: bucket.all.length,
      allSelected,
      alreadyThere: changing.length === 0,
      fromModes: [...new Set(bucket.selected.map((r) => text(r.modeOfPayment)).filter(Boolean))],
      outstanding: bucket.selected.reduce((s, r) => s + (Number(r.outstanding) || 0), 0),
      linkedPaymentCount:
        payments && Number.isFinite(Number(payments[invoice])) ? Number(payments[invoice]) : null,
      isAmendment: input.amendmentsByInvoice ? input.amendmentsByInvoice[invoice] === true : false,
      patch: buildPatch(changing, targetMode, allSelected),
    };
    if (entry.alreadyThere) skipped.push(entry);
    else work.push(entry);
  }

  const blocked = !targetMode
    ? "Pick the method to change to."
    : !work.length
      ? skipped.length
        ? `Every bill selected is already on ${targetMode}.`
        : "Nothing selected."
      : "";

  return {
    targetMode,
    work,
    skipped,
    amendCount: work.length,
    rowCount: work.reduce((s, w) => s + w.changing.length, 0),
    atRisk: work.filter((w) => (w.linkedPaymentCount ?? 0) > 0),
    blocked,
  };
}

/**
 * @param {PlannableRow[]} changing
 * @param {string} targetMode
 * @param {boolean} allSelected
 * @returns {AmendPatch}
 */
function buildPatch(changing, targetMode, allSelected) {
  /** @type {AmendPatch} */
  const patch = {
    setScheduleRows: changing
      .map((r) => text(r.dueDate))
      .filter(Boolean)
      .map((dueDate) => ({ matchDueDate: dueDate, set: { mode_of_payment: targetMode } })),
  };
  // The header's own `mode_of_payment` is the bill's default method, so it is only honest to move
  // it when *every* row moves. Change one installment of three and the header would then describe
  // something that is no longer true of the other two.
  if (allSelected) patch.setHeader = { mode_of_payment: targetMode };
  return patch;
}

/**
 * What the clerk is told before a batch runs. Same principle as the single-document confirm: name
 * the consequences that are invisible on the dashboard, and count the documents rather than the
 * rows, because documents are what get cancelled.
 *
 * @param {ReturnType<typeof planModeChange>} plan
 * @param {{ supplier?: string, unlinksPaymentsOnCancel?: boolean, amendCounter?: boolean }} [ctx]
 * @returns {{ title: string, lines: string[], severity: "warn"|"info" }}
 */
export function describeModeChange(plan, ctx = {}) {
  const supplier = text(ctx.supplier);
  const lines = [];
  let severity = /** @type {"warn"|"info"} */ ("info");

  const from = [...new Set(plan.work.flatMap((w) => w.fromModes))];
  const fromText = from.length === 0 ? "no method set" : from.length === 1 ? from[0] : from.join(" / ");
  lines.push(
    `${plural(plan.rowCount, "payment")} across ${plural(plan.amendCount, "bill")}` +
      `${supplier ? ` for ${supplier}` : ""} move from ${fromText} to ${plan.targetMode}.`,
  );

  // 🔴 The count that matters. Five installments on one bill is one cancel, and a clerk who thinks
  // it is five is bracing for the wrong thing entirely.
  //
  // The new IDs are predicted the way Frappe names them, not by appending "-1": amending an
  // amendment strips the counter and increments it, so a bill already at `-1` becomes `-2`. Under
  // a site that does not use the amend counter nothing is predicted, and the examples are dropped.
  const renames = plan.work
    .map((w) => {
      const to = predictAmendedName(w.invoice, {
        isAmendment: w.isAmendment === true,
        amendCounter: ctx.amendCounter !== false,
      });
      return to ? `${w.invoice} → ${to}` : "";
    })
    .filter(Boolean);
  lines.push(
    `That is ${plural(plan.amendCount, "cancel")} — ERPNext cannot change the method on a submitted ` +
      `bill, so each one is cancelled and replaced by an amended copy with a new ERPNext ID` +
      (renames.length
        ? ` (${renames.slice(0, 3).join(", ")}${renames.length > 3 ? ", …" : ""})`
        : "") +
      `. The vendor's own numbers do not change.`,
  );

  if (plan.skipped.length) {
    lines.push(
      `${plural(plan.skipped.length, "bill")} already on ${plan.targetMode} ${plan.skipped.length === 1 ? "is" : "are"} left alone.`,
    );
  }

  if (plan.atRisk.length) {
    const names = plan.atRisk.map((w) => w.invoice).slice(0, 3).join(", ");
    const more = plan.atRisk.length > 3 ? `, and ${plan.atRisk.length - 3} more` : "";
    lines.push(
      ctx.unlinksPaymentsOnCancel === false
        ? `${plural(plan.atRisk.length, "bill")} already ${plan.atRisk.length === 1 ? "has a payment" : "have payments"} against ${plan.atRisk.length === 1 ? "it" : "them"} (${names}${more}). ERPNext will refuse to cancel ${plan.atRisk.length === 1 ? "it" : "those"}, and the rest still run.`
        : `🔴 ${plural(plan.atRisk.length, "bill")} already ${plan.atRisk.length === 1 ? "has a payment" : "have payments"} against ${plan.atRisk.length === 1 ? "it" : "them"} (${names}${more}). Cancelling **detaches** ${plan.atRisk.length === 1 ? "that payment" : "those payments"} — ${plan.atRisk.length === 1 ? "it stays" : "they stay"} submitted but unallocated and must be re-applied by hand.`,
    );
    severity = "warn";
  }

  // 🔴 Each bill is its own cancel-then-insert, so a batch can stop halfway. Said before, not
  // discovered after.
  if (plan.amendCount > 1) {
    lines.push(
      "Each bill is done separately and reported separately — if one fails, the ones before it have already happened.",
    );
    severity = "warn";
  }

  return {
    title: supplier ? `Change ${supplier}'s method to ${plan.targetMode}?` : `Change method to ${plan.targetMode}?`,
    lines,
    severity,
  };
}

/**
 * The per-bill outcome, as a batch. 🔴 **A batch that reports one outcome for five documents will
 * be wrong about at least one of them** (the plan's own words), so there is no single "it worked".
 *
 * @param {Array<{
 *   invoice?: string,
 *   ok?: boolean,
 *   cancelled?: boolean,
 *   amendedName?: string,
 *   verified?: boolean,
 *   reason?: string,
 * }>} results
 * @returns {{
 *   ok: boolean,
 *   headline: string,
 *   lines: string[],
 *   stranded: string[],     // cancelled with no replacement — the outcome that needs a human now
 *   unverified: string[],   // amended, but ERP did not read back the method we asked for
 * }}
 */
export function summarizeModeChange(results = []) {
  const rows = Array.isArray(results) ? results : [];
  const done = rows.filter((r) => r && r.ok);
  const stranded = rows.filter((r) => r && !r.ok && r.cancelled).map((r) => text(r.invoice));
  const failed = rows.filter((r) => r && !r.ok && !r.cancelled);
  const unverified = done.filter((r) => r.verified === false).map((r) => text(r.invoice));

  const lines = rows.map((r) => {
    const name = text(r.invoice);
    if (r.ok) {
      return r.verified === false
        ? `${name} → ${text(r.amendedName)} — amended, but ERPNext did not read the method back. Check it.`
        : `${name} → ${text(r.amendedName)} ✓`;
    }
    if (r.cancelled) {
      return `${name} — CANCELLED, not replaced. ${text(r.reason)} Amend it before re-entering anything.`;
    }
    return `${name} — not changed. ${text(r.reason)}`;
  });

  const headline = stranded.length
    ? `${plural(stranded.length, "bill")} ${stranded.length === 1 ? "is" : "are"} cancelled with no replacement — fix ${stranded.length === 1 ? "that" : "those"} first.`
    : failed.length
      ? `${done.length} of ${rows.length} changed; ${plural(failed.length, "bill")} unchanged.`
      : unverified.length
        ? `${plural(done.length, "bill")} amended, but ${unverified.length} could not be verified.`
        : `${plural(done.length, "bill")} changed.`;

  return { ok: !stranded.length && !failed.length && !unverified.length, headline, lines, stranded, unverified };
}
