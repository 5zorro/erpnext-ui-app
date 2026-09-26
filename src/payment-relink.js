/**
 * Putting a loose payment back on the bill it actually paid (OI-171, after P1's amend).
 *
 * 🔴 **ERPNext keeps no record of what the payment used to pay.** Cancelling an invoice runs
 * `unlink_ref_doc_from_payment_entries` (`accounts/utils.py:1025`), which sets the Payment Entry
 * Reference row's `allocated_amount` to 0 and then *deletes* the row
 * (`clear_unallocated_reference_document_rows`), blanks `against_voucher` on the ledger entries,
 * and leaves nothing in the document's version history because it writes through the query builder
 * rather than the ORM. Verified on this sandbox 2026-09-26: after the amend, nothing anywhere on
 * `ACC-PAY-2026-00002` still names `ACC-PINV-2026-00231`.
 *
 * So the pairing cannot be *looked up*. It can only be **inferred** — which is why everything here
 * produces a proposal with a stated confidence and a reason, and never an allocation that posts on
 * its own.
 *
 * 🔴 **Why infer at all, when ERPNext will happily allocate for you?** Because its own
 * `allocate_entries` is greedy over invoices sorted by posting date and knows nothing about
 * amendments — on this very sandbox it would put the loose 9.00 against a 107.00 bill and leave the
 * amended 9.00 bill outstanding. The one fact it ignores is the one that settles the case: an
 * amendment carries `amended_from`, and a payment stranded by an amend is looking for exactly such
 * an invoice.
 *
 * Nothing here talks to ERP, and nothing here does accounting. The chosen pairing is handed to
 * ERPNext's own Payment Reconciliation to post.
 */

/**
 * @typedef {{
 *   name: string,
 *   unallocated: number,
 *   supplier?: string,
 * }} LoosePayment
 *
 * @typedef {{
 *   name: string,
 *   outstanding: number,
 *   amendedFrom?: string,   // set when this invoice IS an amendment of another
 *   supplier?: string,
 * }} OpenInvoice
 *
 * @typedef {{
 *   payment: string,
 *   amount: number,          // what would be allocated
 *   invoice: string,
 *   confidence: "high"|"low",
 *   why: string,
 * }} RelinkProposal
 */

const CENT = 0.005;

/** @param {unknown} v */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** @param {unknown} v */
function text(v) {
  return v == null ? "" : String(v).trim();
}

/** @param {number} a @param {number} b */
function sameMoney(a, b) {
  return Math.abs(a - b) < CENT;
}

/**
 * Propose where each loose payment belongs.
 *
 * The rules, in order, and each one is a sentence the UI can show:
 *
 * 1. **An amendment whose outstanding is exactly this payment's loose amount** — high confidence.
 *    That is the shape a void-and-amend leaves behind, down to the cent, and nothing else in a
 *    supplier's ledger looks like it by accident.
 * 2. **Exactly one amendment among the open invoices, amount fits** — low confidence. Probably the
 *    one, but an amendment that was also partly paid, or a second payment in flight, breaks it.
 * 3. **More than one amendment matches, or none does** — no proposal. Said out loud, with the
 *    candidates, so the clerk goes to Payment Reconciliation knowing what they are choosing between
 *    rather than being handed a guess.
 *
 * @param {{ payments?: LoosePayment[], invoices?: OpenInvoice[] }} input
 * @returns {{
 *   proposals: RelinkProposal[],
 *   unmatched: Array<{ payment: string, amount: number, why: string, candidates: string[] }>,
 * }}
 */
export function proposeRelinks(input = {}) {
  const payments = (Array.isArray(input.payments) ? input.payments : []).filter(
    (p) => p && text(p.name) && num(p.unallocated) > 0,
  );
  const invoices = (Array.isArray(input.invoices) ? input.invoices : []).filter(
    (i) => i && text(i.name) && num(i.outstanding) > 0,
  );

  /** @type {RelinkProposal[]} */
  const proposals = [];
  /** @type {Array<{ payment: string, amount: number, why: string, candidates: string[] }>} */
  const unmatched = [];

  // An invoice can only be proposed once per run: two payments both "obviously" belonging to the
  // same bill is precisely the case where a second allocation would overdraw it.
  const claimed = new Set();

  for (const pay of payments) {
    const loose = num(pay.unallocated);
    const open = invoices.filter(
      (i) =>
        !claimed.has(i.name) &&
        // Never across parties. An allocation is posted against one supplier's account.
        (!pay.supplier || !i.supplier || pay.supplier === i.supplier),
    );
    const amendments = open.filter((i) => text(i.amendedFrom));

    const exact = amendments.filter((i) => sameMoney(num(i.outstanding), loose));
    if (exact.length === 1) {
      claimed.add(exact[0].name);
      proposals.push({
        payment: pay.name,
        invoice: exact[0].name,
        amount: loose,
        confidence: "high",
        why: `${exact[0].name} is an amendment of ${text(exact[0].amendedFrom)} and its outstanding is exactly this payment's loose amount.`,
      });
      continue;
    }

    if (exact.length > 1) {
      unmatched.push({
        payment: pay.name,
        amount: loose,
        why: `${exact.length} amended bills are open for exactly this amount, so which one this paid cannot be told apart.`,
        candidates: exact.map((i) => i.name),
      });
      continue;
    }

    if (amendments.length === 1) {
      const only = amendments[0];
      const amount = Math.min(loose, num(only.outstanding));
      claimed.add(only.name);
      proposals.push({
        payment: pay.name,
        invoice: only.name,
        amount,
        confidence: "low",
        why:
          `${only.name} is the only amended bill open for this supplier (amended from ${text(only.amendedFrom)}), ` +
          `but its outstanding is ${fmt(num(only.outstanding))} and this payment has ${fmt(loose)} loose — check before posting.`,
      });
      continue;
    }

    unmatched.push({
      payment: pay.name,
      amount: loose,
      why: amendments.length
        ? `${amendments.length} amended bills are open for this supplier and none matches this amount.`
        : "No amended bill is open for this supplier, so this payment was probably not stranded by an amend.",
      candidates: amendments.map((i) => i.name),
    });
  }

  return { proposals, unmatched };
}

/** @param {number} n */
function fmt(n) {
  return Number(n).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/**
 * One line for the chip, and the longer sentence for the confirm.
 *
 * 🔴 A `low` proposal says so in the button itself. A one-click action whose label looks identical
 * whether the answer is certain or a guess is how a guess gets clicked.
 *
 * @param {RelinkProposal} p
 */
export function describeRelink(p) {
  const certain = p.confidence === "high";
  return {
    chip: `${fmt(p.amount)} unapplied → ${p.invoice}`,
    button: certain ? "Re-link" : "Re-link (check first)",
    title: certain ? `Re-link ${p.payment} to ${p.invoice}?` : `Re-link ${p.payment} — please check`,
    lines: [
      `${fmt(p.amount)} from ${p.payment} will be applied to ${p.invoice}.`,
      p.why,
      // The clerk is not being asked to trust our arithmetic — ERPNext does the posting.
      "ERPNext's own Payment Reconciliation posts this, the same as doing it by hand in Vanilla.",
      certain
        ? ""
        : "🔴 This is the only candidate, not a certain match. Open Payment Reconciliation instead if you would rather choose.",
    ].filter(Boolean),
  };
}

/**
 * The `allocation` row Payment Reconciliation's `reconcile` expects, built from a proposal plus the
 * rows ERP itself returned from `get_unreconciled_entries`.
 *
 * 🔴 **Built from ERP's own rows, never from ours.** `validate_allocation` checks each row against
 * the `invoices` and `payments` lists on the same document, and the exchange-rate and cost-centre
 * fields come from them too — so the pairing is the only thing we contribute. Re-deriving the rest
 * would be inventing accounting we do not own.
 *
 * @param {RelinkProposal} p
 * @param {Array<Record<string, any>>} erpPayments rows from `get_unreconciled_entries`
 * @param {Array<Record<string, any>>} erpInvoices rows from `get_unreconciled_entries`
 * @returns {Record<string, any>|null} null when ERP's lists no longer contain the pairing
 */
export function allocationRowFor(p, erpPayments, erpInvoices) {
  const pay = (Array.isArray(erpPayments) ? erpPayments : []).find(
    (r) => r && text(r.reference_name) === text(p.payment),
  );
  const inv = (Array.isArray(erpInvoices) ? erpInvoices : []).find(
    (r) => r && text(r.invoice_number) === text(p.invoice),
  );
  if (!pay || !inv) return null;
  // Clamp to what ERP currently says is available, so a board read a minute ago cannot overdraw a
  // bill that has been part-paid since.
  const amount = Math.min(num(p.amount), num(pay.amount), num(inv.outstanding_amount));
  if (!(amount > 0)) return null;
  return {
    reference_type: pay.reference_type,
    reference_name: pay.reference_name,
    reference_row: pay.reference_row,
    invoice_type: inv.invoice_type,
    invoice_number: inv.invoice_number,
    unreconciled_amount: pay.amount,
    amount: pay.amount,
    allocated_amount: amount,
    difference_amount: pay.difference_amount,
    currency: inv.currency,
    cost_center: pay.cost_center,
  };
}
