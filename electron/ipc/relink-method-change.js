/**
 * Payment re-link and method change, for the Pay Outstanding board: a vendor's loose payments and
 * what they could belong to (read from ERPNext's own Payment Reconciliation tool), one re-link
 * posted through it with a permanent note of who made it, the near-certain re-links posted without
 * asking and flagged for review, and the method change run over a set of bills (void and amend,
 * one bill at a time). Moved out of main.js as it was (plan 2026-10-25 R2-5); main.js calls
 * initRelinkMethodChange(deps) once. The pure rules are src/payment-relink.js and
 * src/mode-change-plan.js; void and amend itself stays in main.js, shared with the Doc page.
 */
import { ipcMain } from "electron";
import { PE_REASON_FROM_JS, ERP_LIST_JS } from "../../src/erp-refusal-reason.js";
import {
  allocationRowFor,
  proposeRelinks,
  splitAutoRelinks,
  relinkReviewNote,
  relinkProvenanceNote,
} from "../../src/payment-relink.js";
import { modeChangeShouldStop } from "../../src/mode-change-plan.js";
import { normalizeEditableText } from "../../src/dirty-gate.js";
import { formatClientErrorReason } from "../../src/frappe-error.js";

/* What main.js lends (initRelinkMethodChange). */
/** @type {(event: string, detail?: string) => void} */
let navDebug = () => {};
/** Run a script in the ERPNext page and return its value. @type {(js: string, chaosChannel?: string, bridgeMethod?: string) => Promise<any>} */
let erpEval = async () => null;
/** Cancel a submitted document and amend it (main.js; the Doc page uses it too). @type {(doctype: string, name: string, opts?: { patch?: object|null, submit?: boolean }) => Promise<any>} */
let voidAndAmendDoc = async () => ({ ok: false, cancelled: false, notRun: true, reason: "Not ready." });

/**
 * Once, at start-up: what re-link and method change borrow from main.js, then their IPC handlers.
 * @param {{ navDebug: typeof navDebug, erpEval: typeof erpEval, voidAndAmendDoc: typeof voidAndAmendDoc }} deps
 */
export function initRelinkMethodChange(deps) {
  ({ navDebug, erpEval, voidAndAmendDoc } = deps);
  registerRelinkMethodChangeHandlers();
}

/**
 * What a supplier has loose, and what it could belong to — both read from ERPNext's **own**
 * Payment Reconciliation tool rather than from a query of ours (OI-171, after P1's amend).
 *
 * 🔴 **The tool is a virtual doctype**, so it is driven through `run_doc_method` with the document
 * passed as JSON — which its own `load_from_db` comment says is the intended path. Asking it for
 * the candidates means the rows we then hand back to `reconcile` are the rows it already believes
 * in: same filters, same outstanding amounts, same exchange rates, same cost centres. A
 * hand-rolled query would be a second opinion about which payments are reconcilable, and the
 * allocation would be validated against ERP's list, not ours.
 *
 * `amended_from` is read separately, because it is the one fact the tool does not return and the
 * only one that distinguishes "the bill this payment paid, re-issued" from "another open bill".
 *
 * @param {string} supplier
 */
async function paymentRelinkFacts(supplier) {
  const party = normalizeEditableText(supplier);
  if (!party) return { ok: false, reason: "Supplier required." };
  const payload = JSON.stringify({ party });
  const raw = await erpEval(`(async () => {
    ${ERP_LIST_JS}
    ${PE_REASON_FROM_JS}
    try {
      if (!window.frappe || !frappe.call) return { ok: false, reason: "ERP Desk not ready." };
      var i = ${payload};
      var company = frappe.defaults.get_user_default("Company");
      if (!company) {
        var cs = await xList("Company", { limit: 1 });
        company = cs && cs[0] && cs[0].name;
      }
      if (!company) return { ok: false, reason: "No Company configured." };
      var account = await frappe.xcall("erpnext.accounts.party.get_party_account", {
        party_type: "Supplier", party: i.party, company: company,
      });
      var doc = {
        doctype: "Payment Reconciliation",
        company: company,
        party_type: "Supplier",
        party: i.party,
        receivable_payable_account: account,
      };
      var res = await frappe.call({
        method: "run_doc_method",
        args: { docs: JSON.stringify(doc), method: "get_unreconciled_entries" },
      });
      var got = (res && res.docs && res.docs[0]) || {};
      var invoices = got.invoices || [];
      // The tool does not say which of these is an amendment, and that is the whole question.
      var amendedFrom = {};
      var createdOf = {};
      if (invoices.length) {
        var names = invoices.map(function (r) { return r.invoice_number; });
        var av = await frappe.call({
          method: "frappe.client.get_list",
          args: {
            doctype: "Purchase Invoice",
            filters: [["name", "in", names]],
            fields: ["name", "amended_from", "creation"],
            limit_page_length: 0,
          },
        });
        var rows = (av && av.message) || [];
        for (var a = 0; a < rows.length; a++) {
          amendedFrom[rows[a].name] = rows[a].amended_from || "";
          createdOf[rows[a].name] = rows[a].creation || "";
        }
      }
      // The payments' own creation, for the same reason: an auto-link is only defensible when the
      // payment is older than the amendment it is being attached to.
      if ((got.payments || []).length) {
        try {
          var pn = got.payments.map(function (r) { return r.reference_name; });
          var pv = await frappe.call({
            method: "frappe.client.get_list",
            args: {
              doctype: "Payment Entry",
              filters: [["name", "in", pn]],
              fields: ["name", "creation"],
              limit_page_length: 0,
            },
          });
          var prows = (pv && pv.message) || [];
          for (var b2 = 0; b2 < prows.length; b2++) createdOf[prows[b2].name] = prows[b2].creation || "";
        } catch (eCr) { /* unknown creation simply blocks the auto-link */ }
      }
      // Read, never assumed — same rule as every other site setting the shell depends on. With
      // auto-reconcile on, a loose payment may clear itself within the job interval (and may clear
      // itself onto the WRONG bill, since ERPNext allocates oldest-first), so the advice differs.
      var autoReconcile = null;
      try {
        var ar = await frappe.xcall("frappe.client.get_single_value", {
          doctype: "Accounts Settings", field: "auto_reconcile_payments",
        });
        autoReconcile = !!Number(ar);
      } catch (eAr) {
        autoReconcile = null;
      }
      return {
        ok: true,
        company: company,
        account: account,
        payments: got.payments || [],
        invoices: invoices,
        amendedFrom: amendedFrom,
        createdOf: createdOf,
        autoReconcile: autoReconcile,
      };
    } catch (e) {
      return { ok: false, reason: reasonFrom(e), step: "get_unreconciled_entries" };
    }
  })()`);
  if (!(raw && typeof raw === "object") || !raw.ok) {
    return {
      ok: false,
      reason: formatClientErrorReason((raw && raw.reason) || raw, "Could not read this vendor's unapplied payments."),
    };
  }
  return raw;
}

/**
 * Post one re-link, through ERPNext's own reconciler.
 *
 * 🔴 **We choose the pairing; ERPNext does the accounting.** `reconcile` runs
 * `reconcile_against_document`, which cancels the Payment Entry, rewrites its references, splits
 * where it has to and re-submits — none of which is ours to reimplement. The `allocation` row is
 * built from the rows the *fetch* returned (see `allocationRowFor`), so `validate_allocation` is
 * checking ERP's own numbers against themselves and the only thing we contributed is which invoice.
 *
 * The fetch is repeated here rather than trusting what the page held: between reading the board and
 * clicking, the bill may have been part-paid, and allocating a stale amount would throw mid-post.
 *
 * @param {{ supplier: string, payment: string, invoice: string, amount: number }} req
 */
async function relinkPayment(req) {
  const party = normalizeEditableText(req && req.supplier);
  const payment = normalizeEditableText(req && req.payment);
  const invoice = normalizeEditableText(req && req.invoice);
  const amount = Number(req && req.amount);
  if (!party || !payment || !invoice || !(amount > 0)) {
    return { ok: false, reason: "Supplier, payment, bill and amount are all required." };
  }
  const facts = await paymentRelinkFacts(party);
  if (!facts.ok) return facts;
  const row = allocationRowFor(
    { payment, invoice, amount, confidence: "high", why: "" },
    facts.payments,
    facts.invoices,
  );
  if (!row) {
    return {
      ok: false,
      reason: `ERPNext no longer offers ${payment} against ${invoice} — it may have been reconciled or part-paid since this screen was drawn. Reopen Pay Outstanding.`,
    };
  }
  const payload = JSON.stringify({
    doc: {
      doctype: "Payment Reconciliation",
      company: facts.company,
      party_type: "Supplier",
      party,
      receivable_payable_account: facts.account,
      payments: facts.payments,
      invoices: facts.invoices,
      allocation: [row],
    },
  });
  const raw = await erpEval(`(async () => {
    ${PE_REASON_FROM_JS}
    try {
      if (!window.frappe || !frappe.call) return { ok: false, reason: "ERP Desk not ready." };
      var i = ${payload};
      var res = await frappe.call({
        method: "run_doc_method",
        args: { docs: JSON.stringify(i.doc), method: "reconcile" },
      });
      if (res && res.exc) return { ok: false, reason: reasonFrom(res) };
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: reasonFrom(e), step: "reconcile" };
    }
  })()`);
  if (!(raw && typeof raw === "object")) {
    return {
      ok: false,
      reason: "The shell lost contact with ERP during the re-link. Check the payment in ERPNext before retrying.",
    };
  }
  if (!raw.ok) {
    return { ok: false, reason: formatClientErrorReason(raw.reason || raw, "ERPNext refused the re-link.") };
  }
  // Posted. Now say who did it — permanently, and whichever path got here.
  const note = relinkProvenanceNote(
    { payment, invoice, amount: row.allocated_amount, confidence: "high", auto: req.auto === true, why: req.why || "" },
    { auto: req.auto === true, user: req.user || "" },
  );
  const noted = await commentRelinkProvenance(payment, note);
  return {
    ok: true,
    payment,
    invoice,
    amount: row.allocated_amount,
    provenanceRecorded: noted.ok,
    provenanceReason: noted.reason || "",
  };
}

/**
 * The review flag an auto-link leaves behind, and the way it gets cleared.
 *
 * 🔴 **It lives in ERPNext, not in the shell.** The payment now carries an allocation nobody
 * typed; the only thing that stops that feeling like a glitch is an explanation attached to the
 * document itself, visible to anyone who opens it in a plain browser. Frappe's assignment (a ToDo
 * plus `_assign` on the document) is the native object for "somebody still has to look at this" —
 * it has an Open/Closed status, it shows on the form, and it needs no custom field, so nothing
 * about the site's schema changes.
 *
 * @param {string} payment @param {string} note
 */
async function flagRelinkForReview(payment, note) {
  const nm = normalizeEditableText(payment);
  if (!nm) return { ok: false, reason: "Payment required." };
  const payload = JSON.stringify({ name: nm, note });
  const raw = await erpEval(`(async () => {
    ${PE_REASON_FROM_JS}
    try {
      if (!window.frappe || !frappe.call) return { ok: false, reason: "ERP Desk not ready." };
      var i = ${payload};
      await frappe.xcall("frappe.desk.form.assign_to.add", {
        doctype: "Payment Entry",
        name: i.name,
        assign_to: [frappe.session.user],
        description: i.note,
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: reasonFrom(e) };
    }
  })()`);
  return raw && raw.ok ? { ok: true } : { ok: false, reason: (raw && raw.reason) || "Could not flag for review." };
}

/**
 * The durable half of the record: a Comment on the payment saying who made the allocation.
 *
 * 🔴 **Why this is separate from the review flag.** An assignment closes, and a closed one is
 * invisible — so on its own it cannot answer "was this typed by a person or posted by a rule?",
 * which is the question a reviewer needs *after* the review (5zorro 2026-09-26). A Comment never
 * closes, shows in the Desk timeline, and needs no custom field.
 *
 * Failing to write it does **not** fail the re-link: the allocation is already posted and correct,
 * and refusing to report success over a missing annotation would be the wrong trade. It is
 * reported instead, so the caller can say the record is thinner than it should be.
 *
 * @param {string} payment @param {string} content
 */
async function commentRelinkProvenance(payment, content) {
  const nm = normalizeEditableText(payment);
  if (!nm) return { ok: false, reason: "Payment required." };
  const payload = JSON.stringify({ name: nm, content });
  const raw = await erpEval(`(async () => {
    ${PE_REASON_FROM_JS}
    try {
      if (!window.frappe || !frappe.call) return { ok: false, reason: "ERP Desk not ready." };
      var i = ${payload};
      await frappe.xcall("frappe.desk.form.utils.add_comment", {
        reference_doctype: "Payment Entry",
        reference_name: i.name,
        content: i.content,
        comment_email: frappe.session.user,
        comment_by: frappe.session.user_fullname || frappe.session.user,
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: reasonFrom(e) };
    }
  })()`);
  return raw && raw.ok ? { ok: true } : { ok: false, reason: (raw && raw.reason) || "Could not write the provenance comment." };
}

/**
 * Post the near-certain re-links for one supplier without asking, and flag each for review.
 *
 * 🔴 **Why posting beats asking here** (5zorro 2026-09-26): an unallocated payment *is* an open end
 * in the accounting. Holding the books wrong until somebody clicks is worse than making them right
 * and asking somebody to check — the first leaves a real error outstanding, the second leaves only
 * a question. So the click moved from *before* the posting to *after* it, and became optional.
 *
 * Only `auto` proposals qualify: exact amount, a single candidate, same supplier, and the payment
 * demonstrably older than the amendment. Everything else still waits for a click.
 *
 * @param {string} supplier
 */
async function autoRelinkForSupplier(supplier) {
  const facts = await paymentRelinkFacts(supplier);
  if (!facts.ok) return { ok: false, reason: facts.reason, posted: [] };
  const { proposals } = proposeRelinks({
    payments: (facts.payments || []).map((p) => ({
      name: p.reference_name,
      unallocated: p.amount,
      supplier,
      created: (facts.createdOf || {})[p.reference_name] || "",
    })),
    invoices: (facts.invoices || []).map((i) => ({
      name: i.invoice_number,
      outstanding: i.outstanding_amount,
      amendedFrom: (facts.amendedFrom || {})[i.invoice_number] || "",
      supplier,
      created: (facts.createdOf || {})[i.invoice_number] || "",
    })),
  });
  const { auto, cappedOut } = splitAutoRelinks(proposals);
  if (!auto.length) return { ok: true, posted: [], cappedOut };

  const posted = [];
  for (const p of auto) {
    const res = await relinkPayment({
      supplier,
      payment: p.payment,
      invoice: p.invoice,
      amount: p.amount,
      auto: true,
      why: p.why,
    });
    navDebug(
      "auto-relink",
      `${supplier} ${p.payment} -> ${p.invoice} ok=${res.ok ? 1 : 0}${res.reason ? ` reason=${res.reason}` : ""}`,
    );
    if (!res.ok) {
      // Stop at the first refusal. The rest are re-proposed next time from fresh facts, which is
      // safer than pressing on against a ledger that just disagreed with us.
      return { ok: false, reason: res.reason, posted, cappedOut };
    }
    const flag = await flagRelinkForReview(p.payment, relinkReviewNote(p));
    // Review 10-19 R9-4: an auto-link with no review flag or no provenance comment must leave a trace.
    navDebug(
      "auto-relink",
      `${p.payment} provenance=${res.provenanceRecorded ? 1 : `0 (${res.provenanceReason || "?"})`} flagged=${flag.ok ? 1 : `0 (${flag.reason || "?"})`}`,
    );
    posted.push({ ...p, flagged: flag.ok, flagReason: flag.reason || "" });
  }
  return { ok: true, posted, cappedOut };
}

function registerRelinkMethodChangeHandlers() {
  ipcMain.handle("payment-relink-facts", async (_e, supplier) => {
    const facts = await paymentRelinkFacts(supplier);
    navDebug(
      "payment-relink-facts",
      `${supplier} ok=${facts.ok ? 1 : 0} payments=${(facts.payments || []).length} invoices=${(facts.invoices || []).length}${facts.reason ? ` reason=${facts.reason}` : ""}`,
    );
    return facts;
  });

  ipcMain.handle("relink-reviews", async () => {
    const raw = await erpEval(`(async () => {
      ${PE_REASON_FROM_JS}
      try {
        if (!window.frappe || !frappe.call) return { ok: false, reason: "ERP Desk not ready." };
        var res = await frappe.call({
          method: "frappe.client.get_list",
          args: {
            doctype: "ToDo",
            filters: [
              ["reference_type", "=", "Payment Entry"],
              ["status", "=", "Open"],
              ["description", "like", "%Auto-linked by the Doc shell%"],
            ],
            fields: ["name", "reference_name", "description", "allocated_to"],
            limit_page_length: 0,
          },
        });
        var todos = (res && res.message) || [];
        // 🔴 Whose payment each one is, read rather than parsed out of the note. The bill it was
        // linked to has left the board by then — it is paid — so the vendor cannot be recovered from
        // what is on screen, and matching a supplier name inside prose would break on the first
        // vendor whose name appears in another vendor's note.
        var partyOf = {};
        if (todos.length) {
          try {
            var names = todos.map(function (t) { return t.reference_name; });
            var pe = await frappe.call({
              method: "frappe.client.get_list",
              args: {
                doctype: "Payment Entry",
                filters: [["name", "in", names]],
                fields: ["name", "party"],
                limit_page_length: 0,
              },
            });
            var prows = (pe && pe.message) || [];
            for (var k = 0; k < prows.length; k++) partyOf[prows[k].name] = prows[k].party || "";
          } catch (eP) { /* an unattributed review still shows, just not on a vendor card */ }
        }
        for (var t2 = 0; t2 < todos.length; t2++) {
          todos[t2].party = partyOf[todos[t2].reference_name] || "";
        }
        return { ok: true, reviews: todos };
      } catch (e) {
        return { ok: false, reason: reasonFrom(e) };
      }
    })()`);
    if (!(raw && raw.ok)) {
      return { ok: false, reason: formatClientErrorReason((raw && raw.reason) || raw, "Could not read pending reviews.") };
    }
    return raw;
  });

  ipcMain.handle("relink-review-close", async (_e, payment) => {
    const nm = normalizeEditableText(payment);
    if (!nm) return { ok: false, reason: "Payment required." };
    const payload = JSON.stringify({ name: nm });
    const raw = await erpEval(`(async () => {
      ${PE_REASON_FROM_JS}
      try {
        var i = ${payload};
        await frappe.xcall("frappe.desk.form.assign_to.close", {
          doctype: "Payment Entry", name: i.name, assign_to: frappe.session.user,
        });
        return { ok: true };
      } catch (e) {
        return { ok: false, reason: reasonFrom(e) };
      }
    })()`);
    navDebug("relink-review-close", `${nm} ok=${raw && raw.ok ? 1 : 0}`);
    if (!(raw && raw.ok)) {
      return { ok: false, reason: formatClientErrorReason((raw && raw.reason) || raw, "Could not close the review.") };
    }
    return { ok: true };
  });

  ipcMain.handle("auto-relink", async (_e, supplier) => {
    const out = await autoRelinkForSupplier(supplier);
    navDebug(
      "auto-relink",
      `${supplier} posted=${(out.posted || []).length} ok=${out.ok ? 1 : 0}${out.reason ? ` reason=${out.reason}` : ""}`,
    );
    return out;
  });

  ipcMain.handle("payment-relink", async (_e, req) => {
    navDebug("payment-relink", `start ${req && req.supplier} ${req && req.payment} -> ${req && req.invoice}`);
    const out = await relinkPayment(req);
    navDebug(
      "payment-relink",
      `${req && req.payment} ok=${out.ok ? 1 : 0}${out.ok ? ` provenance=${out.provenanceRecorded ? 1 : `0 (${out.provenanceReason || "?"})`}` : ""}${out.reason ? ` reason=${out.reason}` : ""}`,
    );
    return out;
  });

  /**
   * P1 stage 3 — what the batch confirm needs before it can name its consequences: which of these
   * bills already has a submitted payment against it, and whether this site detaches or refuses.
   *
   * One query for the whole set rather than one per bill. A vendor with twelve outstanding bills is
   * an ordinary case, and twelve round trips to draw one confirm is how a dashboard gets slow enough
   * that a clerk stops reading it.
   */
  ipcMain.handle("mode-change-facts", async (_e, invoices) => {
    const names = (Array.isArray(invoices) ? invoices : [])
      .map((n) => normalizeEditableText(n))
      .filter(Boolean);
    if (!names.length) return { ok: true, paymentsByInvoice: {}, unlinksPaymentsOnCancel: undefined };
    const payload = JSON.stringify({ names });
    const raw = await erpEval(`(async () => {
      ${PE_REASON_FROM_JS}
      try {
        if (!window.frappe || !frappe.call) return { ok: false, reason: "ERP Desk not ready." };
        var i = ${payload};
        var counts = {};
        try {
          var res = await frappe.call({
            method: "frappe.client.get_list",
            args: {
              doctype: "Payment Entry Reference",
              filters: [
                ["reference_doctype", "=", "Purchase Invoice"],
                ["reference_name", "in", i.names],
                ["docstatus", "=", 1],
              ],
              fields: ["reference_name", "parent"],
              limit_page_length: 0,
              parent: "Payment Entry",
            },
          });
          var rows = (res && res.message) || [];
          for (var r = 0; r < rows.length; r++) {
            var key = rows[r].reference_name;
            counts[key] = (counts[key] || 0) + 1;
          }
        } catch (ePaid) {
          return { ok: false, reason: reasonFrom(ePaid), step: "payments" };
        }
        var unlinks = null;
        try {
          var sVal = await frappe.xcall("frappe.client.get_single_value", {
            doctype: "Accounts Settings", field: "unlink_payment_on_cancellation_of_invoice",
          });
          unlinks = !!Number(sVal);
        } catch (eSet) {
          unlinks = null;
        }
        // Same two inputs the single-document confirm reads, for the same reason: amending an
        // amendment gives \`<prefix>-2\`, not \`<name>-1\`.
        var amendments = {};
        try {
          var av = await frappe.call({
            method: "frappe.client.get_list",
            args: {
              doctype: "Purchase Invoice",
              filters: [["name", "in", i.names]],
              fields: ["name", "amended_from"],
              limit_page_length: 0,
            },
          });
          var arows = (av && av.message) || [];
          for (var a = 0; a < arows.length; a++) amendments[arows[a].name] = !!arows[a].amended_from;
        } catch (eAmend) {
          amendments = {};
        }
        var amendCounter = null;
        try {
          var rule = await frappe.xcall("frappe.client.get_single_value", {
            doctype: "Document Naming Settings", field: "default_amend_naming",
          });
          amendCounter = String(rule || "") !== "Default Naming";
        } catch (eRule) {
          amendCounter = null;
        }
        return { ok: true, counts: counts, unlinks: unlinks, amendments: amendments, amendCounter: amendCounter };
      } catch (e) {
        return { ok: false, reason: reasonFrom(e), step: "unknown" };
      }
    })()`);
    if (!(raw && typeof raw === "object") || !raw.ok) {
      return {
        ok: false,
        reason: formatClientErrorReason((raw && raw.reason) || raw, "Could not read payments against these bills."),
      };
    }
    return {
      ok: true,
      paymentsByInvoice: raw.counts || {},
      unlinksPaymentsOnCancel: raw.unlinks === null ? undefined : !!raw.unlinks,
      amendmentsByInvoice: raw.amendments || {},
      amendCounter: raw.amendCounter === null ? false : raw.amendCounter !== false,
    };
  });

  /**
   * P1 stage 3 — run the plan, one bill at a time, and report one outcome per bill.
   *
   * 🔴 **Sequential, and it stops at the first bill that did not go as asked** (`modeChangeShouldStop`;
   * review 10-19, 5zorro 2026-10-20). Each bill is its own cancel-then-insert-then-submit, and
   * whatever made ERPNext refuse one usually refuses the next — carrying on would pile up cancelled
   * originals to sort out by hand. The rest are reported as not attempted, which they are, and the
   * panel offers "Try again" on them (`modeChangeRemainder`).
   *
   * Progress goes to the asking page as `mode-change-progress` events, one before and one after each
   * bill, so the panel's per-bill chips move while the batch runs.
   *
   * Every bill is submitted after the amend. An amended bill sitting as a draft is not outstanding,
   * so a batch that left drafts behind would take the vendor's bills *off* the very dashboard the
   * clerk is standing on.
   */
  ipcMain.handle("run-mode-change", async (e, work) => {
    const items = (Array.isArray(work) ? work : [])
      .map((w) => ({
        invoice: normalizeEditableText(w && w.invoice),
        patch: w && w.patch && typeof w.patch === "object" ? w.patch : null,
      }))
      .filter((w) => w.invoice && w.patch);
    if (!items.length) return { ok: false, reason: "Nothing to change.", results: [] };

    const progress = (payload) => {
      try {
        if (e && e.sender && !e.sender.isDestroyed()) e.sender.send("mode-change-progress", payload);
      } catch {
        /* the panel's chips are a courtesy; the returned results are the record */
      }
    };
    navDebug("run-mode-change", `start ${items.length} bill(s): ${items.map((i) => i.invoice).join(",")}`);
    const results = [];
    let stopped = "";
    for (const item of items) {
      if (stopped) {
        const skipped = { invoice: item.invoice, ok: false, cancelled: false, notAttempted: true, reason: `Not attempted — stopped after ${stopped}.` };
        results.push(skipped);
        progress(skipped);
        continue;
      }
      progress({ invoice: item.invoice, phase: "working" });
      const r = await voidAndAmendDoc("Purchase Invoice", item.invoice, { patch: item.patch, submit: true });
      navDebug(
        "run-mode-change",
        `${item.invoice} ok=${r && r.ok ? 1 : 0} cancelled=${r && r.cancelled ? 1 : 0}${r && r.uncertain ? " uncertain=1" : ""} step=${(r && r.step) || ""} amended=${(r && r.amendedName) || ""} verified=${r && r.verified ? (r.verified.ok ? 1 : 0) : "?"}${r && r.reason ? ` reason=${r.reason}` : ""}`,
      );
      const one = {
        invoice: item.invoice,
        ok: !!(r && r.ok),
        cancelled: !!(r && r.cancelled),
        uncertain: !!(r && r.uncertain),
        amendedName: (r && r.amendedName) || "",
        // `undefined` when nothing was read back; `false` only when ERP was read and disagreed.
        verified: r && r.verified ? r.verified.ok === true : undefined,
        mismatches: (r && r.verified && r.verified.mismatches) || [],
        missedRows: (r && r.patched && r.patched.missed) || [],
        reason: (r && r.reason) || "",
        step: (r && r.step) || "",
      };
      results.push(one);
      progress(one);
      if (modeChangeShouldStop(one)) stopped = item.invoice;
    }
    navDebug("run-mode-change", `done ok=${results.filter((r) => r.ok).length}/${results.length}${stopped ? ` stopped=${stopped}` : ""}`);
    // The dashboard is now describing documents that no longer exist under those names.
    return { ok: results.every((r) => r.ok), results, stopped };
  });
}
