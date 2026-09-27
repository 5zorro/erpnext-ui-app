/**
 * What a Doc skin offers to *do* to the document it is showing (P1 / OI-171, the mechanism P7
 * scoped).
 *
 * 5zorro 2026-09-16, asking for void-and-amend: *"this will likely be reused on every form entry
 * doc skin. Im hoping that the architecture for this can be dynamic and easily extended to the
 * shapes of the other forms."* So this is a table, not a button: a skin declares which actions its
 * doctype has and this decides which of them are offered right now. Adding copy-as-draft (OI-175)
 * or the Bill ↔ IR switch (OI-174) is a row here, not a second mechanism.
 *
 * 🔴 **This module decides *whether* and *what to say*, never *how*.** No ERP call, no fetch, no
 * DOM. The `how` for void-and-amend is ERPNext's own cancel + `frappe.model.copy_doc`, run in the
 * ERP view — see `main.js`. That split is deliberate: the field-copy rules belong to ERPNext and
 * re-stating them here would be a second copy of a rule we do not own (it already caught us out
 * once — `copy_doc`'s `from_amend` *keeps* `no_copy` fields rather than stripping them).
 *
 * 🔴 **Nothing here makes a document read-only** (HANDOFF invariant 7). An action is *absent*
 * because ERP's own state says it cannot happen — a draft has nothing to void, an already-amended
 * document cannot be amended twice — which is the skin reflecting a fact, not imposing one.
 */

import { normalizeDoctypeKey } from "./lens-prefs.js";

/**
 * @typedef {{
 *   docstatus: number,            // 0 draft, 1 submitted, 2 cancelled — ERP's own number
 *   dirty?: boolean,              // unsaved edits on screen
 *   alreadyAmended?: boolean,     // a later amendment of this document already exists
 *   amendable?: boolean,          // the doctype carries an `amended_from` field at all
 * }} DocActionContext
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   hint: string,                 // the button's tooltip, per doctype
 *   doctypeKey: string,
 *   offered: boolean,
 *   reason: string,               // why it is NOT offered; "" when it is
 *   confirm: boolean,             // whether the clerk is asked before it runs
 * }} DocAction
 */

/**
 * Void and amend (OI-171). ERPNext's own two-step, surfaced as one action: cancel the submitted
 * document, then open an editable copy of it that points back at the original.
 *
 * Offered only on a **submitted** or **cancelled** document: a draft is already editable (nothing
 * to void), and a cancelled one takes the amend half alone.
 */
const VOID_AND_AMEND = Object.freeze({
  id: "void-and-amend",
  confirm: true,
  /**
   * 🔴 A **cancelled** document is offered the amend half alone, with no cancel to do. That is
   * ERPNext's own shape — Desk shows Amend on a cancelled document — and it is also where a
   * half-done attempt leaves one, so refusing it there would strand the exact document that most
   * needs the action (dogfood 2026-09-22).
   * @param {DocActionContext} ctx
   */
  labelFor(ctx) {
    return ctx.docstatus === 2 ? "Edit (amend this cancelled document)" : "Edit (void and amend)";
  },
  /** @param {DocActionContext} ctx */
  availability(ctx) {
    if (ctx.amendable === false) {
      return "This document type cannot be amended — it has no `amended_from` field.";
    }
    if (ctx.docstatus === 0) return "This is a draft — edit it directly, there is nothing to void.";
    if (ctx.docstatus !== 1 && ctx.docstatus !== 2) {
      return "Only a submitted or cancelled document can be amended.";
    }
    // Mirrors the check Desk makes before amending (`frappe.client.is_document_amended`): ERPNext
    // permits one amendment per document, and finding that out at insert time means finding out
    // after the cancel has already gone through.
    if (ctx.alreadyAmended) {
      return "This document has already been amended once, which is all ERPNext allows.";
    }
    if (ctx.dirty) return "Save or discard the changes on screen first.";
    return "";
  },
});

/**
 * Which actions each doctype has. A skin gets its actions by being in this table — that is the
 * whole extension point. Doctypes are keyed the way the rest of the app keys them
 * (`normalizeDoctypeKey`), so "Purchase Invoice", "purchase_invoice" and "purchase-invoice" are
 * one thing.
 *
 * Stage 1 (2026-09-22) was the Bill alone, to prove the write path on the skin 5zorro dogfoods
 * daily. Stage 2 (2026-09-24) adds the other three submittable skins — and each one is a row here
 * plus a {@link CANCEL_COST} entry, which is the extension point behaving as advertised.
 */
const ACTIONS_BY_DOCTYPE = Object.freeze({
  "purchase-invoice": [VOID_AND_AMEND],
  "purchase-order": [VOID_AND_AMEND],
  "purchase-receipt": [VOID_AND_AMEND],
  "payment-entry": [VOID_AND_AMEND],
});

/**
 * 🔴 **What cancelling this kind of document actually costs, and what has to be read to know it.**
 *
 * Every doctype here has one invisible, irreversible consequence, and it is a *different* one each
 * time. A single "are you sure" over four documents would be wrong about three of them:
 *
 * | Doctype | The thing nothing on screen says |
 * |---|---|
 * | Purchase Invoice | payments applied to it get **detached** (this site unlinks rather than refusing) |
 * | Purchase Order | receipts and bills raised against it **refuse** the cancel until they are cancelled |
 * | Purchase Receipt | the **stock comes back off the shelf**, and stays off until the amendment is submitted |
 * | Payment Entry | the invoices it paid go **back to outstanding**, and stay there until the amendment is submitted |
 *
 * `probes` is read by the shell, not interpreted here — this module still decides *whether* and
 * *what to say*, never *how*. Each probe is a plain description of a query so the ERP side can run
 * it without carrying a second copy of which field links what (see `main.js::voidAndAmendFacts`).
 *
 * 🔴 **Blockers are named, not enforced.** When a submitted document links back, ERPNext refuses
 * the cancel in `check_no_back_links_exist` (`document.py:1578`, run *after* `on_cancel`) and the
 * whole transaction rolls back — so a refusal changes nothing and cannot strand a document. That
 * makes it safe to let ERP be the one that says no, and wrong for this skin to pre-empt it: our
 * list of what links to what is an approximation of a rule we do not own, and blocking on it would
 * refuse legal amendments whenever the approximation is short. So the confirm *names* what it
 * found and the clerk decides.
 *
 * @typedef {{
 *   parent: string,            // the doctype that would block the cancel
 *   child?: string,            // its child table, when the link lives on a row rather than the header
 *   field: string,             // the fieldname holding this document's name
 *   label: string,             // what to call it in a sentence a clerk reads
 * }} CancelBlockerProbe
 */
const CANCEL_COST = Object.freeze({
  "purchase-invoice": {
    noun: "Bill",
    erpDoctype: "Purchase Invoice",
    // Submitted Payment Entries allocated to this bill. Whether they detach or refuse is the
    // site's own `unlink_payment_on_cancellation_of_invoice`, which is why it is read rather than
    // assumed — the two outcomes need opposite sentences.
    payments: true,
    unlinkSetting: true,
    blockers: [
      { parent: "Purchase Invoice", field: "return_against", label: "credit memo", isReturn: true },
    ],
  },
  "purchase-order": {
    noun: "Purchase Order",
    erpDoctype: "Purchase Order",
    blockers: [
      {
        parent: "Purchase Receipt",
        child: "Purchase Receipt Item",
        field: "purchase_order",
        label: "Item Receipt",
      },
      {
        parent: "Purchase Invoice",
        child: "Purchase Invoice Item",
        field: "purchase_order",
        label: "Bill",
      },
    ],
  },
  "purchase-receipt": {
    noun: "Item Receipt",
    erpDoctype: "Purchase Receipt",
    // Cancelling reverses the stock ledger (`purchase_receipt.py::on_cancel` →
    // `update_stock_ledger`). The amendment arrives as a *draft*, so between the two the quantity
    // is not on hand — on a receipt that is the whole point of the document.
    reversesStock: true,
    blockers: [
      {
        parent: "Purchase Invoice",
        child: "Purchase Invoice Item",
        field: "purchase_receipt",
        label: "Bill",
      },
      {
        parent: "Purchase Receipt",
        field: "return_against",
        label: "return",
        isReturn: true,
      },
    ],
  },
  "payment-entry": {
    noun: "Payment",
    erpDoctype: "Payment Entry",
    // The mirror image of the Bill case: here the allocations are this document's own child rows,
    // so cancelling puts every invoice it paid back to outstanding.
    allocations: true,
    blockers: [],
  },
});

/**
 * What the shell must read from the live document before offering the confirm, for this doctype.
 *
 * Returns a plain, inert description — no ERP call, no field access. `null` for a doctype that has
 * no void-and-amend row, which is the shell's cue not to offer the action at all.
 *
 * @param {string|null|undefined} doctype
 * @returns {{
 *   noun: string,
 *   erpDoctype: string,
 *   payments: boolean,
 *   unlinkSetting: boolean,
 *   allocations: boolean,
 *   reversesStock: boolean,
 *   blockers: CancelBlockerProbe[],
 * }|null}
 */
export function voidAmendProbes(doctype) {
  const key = normalizeDoctypeKey(doctype);
  const cost = CANCEL_COST[key];
  if (!cost || !ACTIONS_BY_DOCTYPE[key]) return null;
  return {
    noun: cost.noun,
    erpDoctype: cost.erpDoctype,
    payments: cost.payments === true,
    unlinkSetting: cost.unlinkSetting === true,
    allocations: cost.allocations === true,
    reversesStock: cost.reversesStock === true,
    blockers: (cost.blockers || []).map((b) => Object.freeze({ ...b })),
  };
}

/**
 * The noun a clerk would use for this doctype, for sentences that have to name it.
 * @param {string|null|undefined} doctype
 */
export function docActionNoun(doctype) {
  const cost = CANCEL_COST[normalizeDoctypeKey(doctype)];
  return (cost && cost.noun) || "document";
}

/**
 * Every action this doctype declares, each marked offered or not, with the reason when not.
 *
 * Returns the un-offered ones too, on purpose: a skin that knows *why* an action is missing can say
 * so, and "already amended once" is a far better answer than a button that quietly is not there.
 *
 * @param {string|null|undefined} doctype
 * @param {DocActionContext|null|undefined} ctx
 * @returns {DocAction[]}
 */
export function docActionsFor(doctype, ctx) {
  const doctypeKey = normalizeDoctypeKey(doctype);
  const declared = ACTIONS_BY_DOCTYPE[doctypeKey] || [];
  const state = normalizeContext(ctx);
  return declared.map((action) => {
    const reason = action.availability(state);
    return {
      id: action.id,
      label: action.labelFor(state),
      // The tooltip is the registry's job too, or every skin would hand-write a sentence about a
      // doctype and the four would drift apart — the PO and Item Receipt buttons inherited the
      // Bill's wording verbatim until this existed.
      hint: voidAmendHint(doctypeKey, state),
      doctypeKey,
      offered: reason === "",
      reason,
      confirm: action.confirm,
    };
  });
}

/**
 * The button's tooltip: what the action does to *this* doctype, in one sentence.
 * @param {string} doctypeKey @param {DocActionContext} ctx
 */
function voidAmendHint(doctypeKey, ctx) {
  const cost = CANCEL_COST[doctypeKey];
  if (!cost) return "";
  const noun = cost.noun;
  const opening =
    ctx.docstatus === 2
      ? `Open an editable copy of this cancelled ${noun} (ERPNext's own amend).`
      : `Cancel this submitted ${noun} and open an editable copy of it (ERPNext's own void-and-amend).`;
  const extra = cost.payments
    ? " Payments applied to it are detached and must be re-applied by hand."
    : cost.reversesStock
      ? " The received quantity comes off the shelf until the copy is submitted."
      : cost.allocations
        ? " The bills it pays go back to outstanding until the copy is submitted."
        : " Anything submitted against it will refuse the cancel, harmlessly.";
  return `${opening} The copy gets a new ERPNext ID; the number you track by does not change.${extra}`;
}

/**
 * Just the ones to render. Sugar over {@link docActionsFor} for the common case.
 * @param {string|null|undefined} doctype
 * @param {DocActionContext|null|undefined} ctx
 * @returns {DocAction[]}
 */
export function offeredDocActions(doctype, ctx) {
  return docActionsFor(doctype, ctx).filter((a) => a.offered);
}

/**
 * @param {string|null|undefined} doctype
 * @param {string} actionId
 * @param {DocActionContext|null|undefined} ctx
 * @returns {DocAction|null}
 */
export function docActionById(doctype, actionId, ctx) {
  return docActionsFor(doctype, ctx).find((a) => a.id === actionId) || null;
}

/**
 * 🔴 What ERPNext will actually call the amendment — mirroring `_set_amended_name`
 * (`frappe/model/naming.py:549`), because guessing it wrong in a confirm is worse than not saying.
 *
 * The obvious guess, `<name>-1`, is right exactly once. Amending an amendment does **not** stack
 * another suffix: Frappe strips the trailing counter and increments it, so `ACC-PINV-…-00231-1`
 * becomes `…-00231-2`. The sandbox already holds a `-2`, and the batch confirm was cheerfully
 * promising `…-00231-1-1` until this was read (2026-09-26).
 *
 * And the whole scheme is a **site setting**: with `Document Naming Settings.default_amend_naming`
 * on "Default Naming" (or a per-doctype override), the amendment takes a fresh series name instead
 * and no prediction is possible. So `amendCounter: false` returns "" and the caller says nothing
 * rather than something untrue.
 *
 * @param {string} sourceName the document being amended
 * @param {{ isAmendment?: boolean, amendCounter?: boolean }} [site]
 *   `isAmendment` — the source is itself an amendment (it carries `amended_from`).
 *   `amendCounter` — the site appends a counter; default true, which is Frappe's own default.
 * @returns {string} the predicted name, or "" when it cannot be known
 */
export function predictAmendedName(sourceName, site = {}) {
  const name = String(sourceName || "").trim();
  if (!name) return "";
  if (site.amendCounter === false) return "";
  if (!site.isAmendment) return `${name}-1`;
  const parts = name.split("-");
  const tail = Number(parts[parts.length - 1]);
  // A source flagged as an amendment whose name does not end in a counter means the site changed
  // its naming rule between the two. Frappe would read `cint("")` as 0 and produce `<prefix>-1`;
  // saying nothing is honester than reproducing that.
  if (parts.length < 2 || !Number.isInteger(tail)) return "";
  return `${parts.slice(0, -1).join("-")}-${tail + 1}`;
}

/**
 * What the clerk is told before a void-and-amend runs — the specific consequences, not a generic
 * "are you sure".
 *
 * 🔴 The facts here are the ones that are **invisible on the form** and irreversible once the
 * cancel goes through, and which ones apply depends entirely on the doctype — see
 * {@link CANCEL_COST} for the table. Three sentences are common to all of them:
 *
 * 1. **The ERPNext ID changes.** `_set_amended_name` (`naming.py:549`) names the amendment
 *    `<original>-1`. The number the clerk actually tracks by — the vendor's invoice number, the
 *    PO's logbook number — does not change, which is the point of OI-170 and worth saying here
 *    while both are on screen.
 * 2. **Whatever links back will refuse the cancel**, harmlessly — see {@link CANCEL_COST}.
 * 3. **It can only be done once.**
 *
 * @param {{
 *   name?: string,
 *   doctype?: string,
 *   docstatus?: number,
 *   supplierRef?: string,
 *   supplierRefLabel?: string,
 *   linkedPaymentCount?: number,
 *   unlinksPaymentsOnCancel?: boolean,
 *   blockers?: Array<{ label?: string, name?: string }>,
 *   blockersChecked?: boolean,
 *   allocatedInvoiceCount?: number,
 *   isAmendment?: boolean,
 *   amendCounter?: boolean,
 * }} facts read from the live document, not guessed — a count of `null`/absent means "not
 *   checked", which is said out loud rather than rendered as zero.
 * @returns {{ title: string, lines: string[], severity: "warn"|"info" }}
 */
export function describeVoidAndAmend(facts = {}) {
  const name = String(facts.name || "").trim();
  const cost = CANCEL_COST[normalizeDoctypeKey(facts.doctype)] || CANCEL_COST["purchase-invoice"];
  const lines = [];
  // Already cancelled: the cancel has happened, so there is nothing to warn about losing. Saying
  // "will be cancelled" here would be describing something that already occurred — and this is the
  // state a half-done attempt leaves behind, so it is a path clerks will actually meet.
  const alreadyCancelled = facts.docstatus === 2;
  let severity = /** @type {"warn"|"info"} */ ("info");

  if (alreadyCancelled) {
    lines.push(
      name
        ? `${name} is already cancelled. An editable copy of it will be created.`
        : `This ${cost.noun} is already cancelled. An editable copy of it will be created.`,
    );
  } else {
    lines.push(
      name
        ? `${name} will be cancelled, and an editable copy of it created.`
        : `This ${cost.noun} will be cancelled, and an editable copy of it created.`,
    );
  }

  const amendedName = predictAmendedName(name, {
    isAmendment: facts.isAmendment === true,
    amendCounter: facts.amendCounter !== false,
  });
  const idLine = amendedName
    ? `The copy gets a new ERPNext ID — ${amendedName}. `
    : "The copy gets a new ERPNext ID. ";
  const refLabel = String(facts.supplierRefLabel || "").trim();
  lines.push(
    idLine +
      (facts.supplierRef
        ? `${refLabel || "The vendor's own number"}, ${facts.supplierRef}, stays the same.`
        : `${refLabel || "The vendor's own invoice number"} stays the same.`),
  );

  // --- the doctype's own sharp edge -------------------------------------------------------
  if (cost.payments) {
    const count = Number(facts.linkedPaymentCount);
    const counted = Number.isFinite(count) && count >= 0;
    if (alreadyCancelled) {
      // Whatever the cancel did to its payments, it did already.
    } else if (!counted) {
      lines.push(
        `Payments against this ${cost.noun} could not be checked. If there are any, cancelling may detach them.`,
      );
      severity = "warn";
    } else if (count > 0) {
      // Only warn about detaching when the site actually detaches. With the setting off, ERPNext
      // refuses the cancel instead — a different outcome, and promising the wrong one is worse than
      // saying nothing.
      if (facts.unlinksPaymentsOnCancel === false) {
        lines.push(
          `${plural(count, "payment")} already applied to this ${cost.noun}. ERPNext will refuse to cancel it until ${count === 1 ? "that payment is" : "those payments are"} cancelled first.`,
        );
      } else {
        lines.push(
          `🔴 ${plural(count, "payment")} applied to this ${cost.noun} will be **detached**, not cancelled. ` +
            `${count === 1 ? "It stays" : "They stay"} submitted but unallocated, this ${cost.noun}'s outstanding goes back up, ` +
            `and ${count === 1 ? "it has" : "they have"} to be applied to the amended ${cost.noun} by hand.`,
        );
      }
      severity = "warn";
    }
  }

  if (cost.reversesStock) {
    // True whether or not the cancel has happened yet: before, it is what is about to occur;
    // after, it is the state the shelf is in right now and stays in until the amendment is
    // submitted. A receipt whose quantity is not on hand is the whole document undone.
    lines.push(
      alreadyCancelled
        ? "🔴 The received quantity is **off the shelf** right now — cancelling reversed it. It comes back when the amended receipt is submitted, not when it is created."
        : "🔴 Cancelling takes the received quantity **back off the shelf**. The amendment arrives as a draft, so the stock stays off until you submit it.",
    );
    severity = "warn";
  }

  if (cost.allocations) {
    const count = Number(facts.allocatedInvoiceCount);
    const counted = Number.isFinite(count) && count >= 0;
    if (!counted) {
      lines.push(
        `The bills this ${cost.noun} pays could not be checked. If there are any, they go back to outstanding while it is cancelled.`,
      );
      severity = "warn";
    } else if (count > 0) {
      lines.push(
        alreadyCancelled
          ? `🔴 ${plural(count, "bill")} this payment covered ${count === 1 ? "is" : "are"} **outstanding again** right now, and stay${count === 1 ? "s" : ""} that way until the amended payment is submitted.`
          : `🔴 ${plural(count, "bill")} this payment covers go **back to outstanding**. The amendment arrives as a draft, so they stay outstanding until you submit it.`,
      );
      severity = "warn";
    }
  }

  // --- what will refuse the cancel ---------------------------------------------------------
  if (!alreadyCancelled) {
    const found = (Array.isArray(facts.blockers) ? facts.blockers : []).filter(
      (b) => b && (b.name || b.label),
    );
    if (found.length) {
      const named = found
        .slice(0, 4)
        .map((b) => `${b.label || "document"} ${b.name || ""}`.trim())
        .join(", ");
      const more = found.length > 4 ? `, and ${found.length - 4} more` : "";
      lines.push(
        `ERPNext will refuse to cancel this while ${named}${more} ${found.length === 1 ? "is" : "are"} submitted against it. ` +
          "A refusal changes nothing — cancel those first, or amend them instead.",
      );
      severity = "warn";
    } else if (facts.blockersChecked === false) {
      lines.push(
        "What links to this could not be checked. If anything submitted does, ERPNext refuses the cancel and nothing changes.",
      );
    }
  }

  lines.push("A document can only be amended once.");

  const title = alreadyCancelled
    ? name
      ? `Amend ${name}?`
      : `Amend this ${cost.noun}?`
    : name
      ? `Void and amend ${name}?`
      : `Void and amend this ${cost.noun}?`;
  return { title, lines, severity };
}

/**
 * The two steps, named, so a failure between them can be reported as what it is. Cancel can succeed
 * and the insert still fail, which leaves a cancelled document and no replacement — the one outcome
 * a flat "it failed" would actively mislead about.
 *
 * @param {{ ok?: boolean, step?: string, cancelled?: boolean, name?: string, amendedName?: string, reason?: string }} result
 * @returns {{ ok: boolean, headline: string, detail: string, strandedName: string }} `strandedName`
 *   is the cancelled document left without an amendment — "" whenever there isn't one.
 */
export function describeVoidAndAmendResult(result = {}) {
  const name = String(result.name || "").trim();
  const amended = String(result.amendedName || "").trim();
  const reason = String(result.reason || "").trim();

  if (result.ok) {
    const detail = name ? `${name} is cancelled and stays in ERPNext as the record of what it was.` : "";
    // Rows that could not come across are said out loud. They are ERPNext's own derived accounting
    // rows and it rebuilds them, but a clerk comparing the two documents would otherwise find
    // something missing with nothing anywhere explaining it.
    const dropped = Array.isArray(result.droppedRows) ? result.droppedRows : [];
    const tables = [...new Set(dropped)];
    const droppedNote = tables.length
      ? ` ${plural(dropped.length, "row")} in ${tables.join(", ")} referred to ${name || "the cancelled document"} and did not carry over; ERPNext recalculates them.`
      : "";
    return {
      ok: true,
      headline: amended ? `Amended as ${amended}.` : "Amended.",
      detail: `${detail}${droppedNote}`.trim(),
      strandedName: "",
    };
  }

  // The dangerous half. The cancel went through, so the bill is no longer live, and the clerk needs
  // to know that before anything else — including that retrying means amending the cancelled one.
  if (result.cancelled) {
    return {
      ok: false,
      headline: name ? `${name} was cancelled, but the amended copy was not created.` : "Cancelled, but not amended.",
      detail:
        (reason ? `${reason} ` : "") +
        "The bill is cancelled in ERPNext right now. Retry the amend against it, or amend it in Vanilla — do not re-enter it as a new bill, or it will exist twice.",
      strandedName: name,
    };
  }

  return {
    ok: false,
    headline: "Nothing was changed.",
    detail: reason || "The void and amend did not start.",
    strandedName: "",
  };
}

/**
 * 🔴 The one place we deviate from `frappe.model.copy_doc`'s output, and why.
 *
 * ERPNext cannot amend a document whose child rows link back to it. `Tax Withholding Entry` rows
 * on a Purchase Invoice carry two Dynamic Links (`taxable_name`, `withholding_name`) pointing at
 * the invoice itself, with `no_copy = 0`; `copy_doc(doc, from_amend)` keeps them, and
 * `Document.insert` runs `_validate_links()` (`document.py:477`) **before** `before_insert` and
 * `validate` — so ERPNext's own recomputation of those rows never gets the chance to fix them, and
 * the insert dies on *"Cannot link cancelled document: Row #1: Taxable Document Name: …"*.
 *
 * 🔴 **Vanilla's Amend button does not hit this**, and 5zorro proved it by hand 2026-09-24. Not
 * because Desk copies differently — `copy_doc` is the same call — but because Desk routes the copy
 * to a *form*, and the Purchase Invoice form's `onload` runs `frm.clear_table(
 * "tax_withholding_entries")` on any new document (`purchase_invoice.js:706`; Sales Invoice and
 * Payment Entry carry the same clear). By the time a human presses Save the table is empty. We
 * never open a form, so nothing clears it for us, and the rows go to `insert` intact.
 *
 * Clearing them costs nothing: `_generate_withholding_entries` (`tax_withholding_entry.py:388`)
 * empties and rebuilds the table during `validate`, so the rows we send are discarded regardless —
 * they only ever get as far as failing `_validate_links`. The exception is
 * `override_tax_withholding_entries`, where the rows are hand-set and *not* regenerated; that
 * override is lost on amend, in Vanilla exactly as here, because Desk's clear is unconditional.
 *
 * The rule: a copied child row that links back to the document being amended is stale **by
 * construction** — the amendment is a different document, and a row describing a relationship to
 * the superseded one cannot be true of it. Those rows are dropped; ERPNext rebuilds the ones it
 * derives when the amendment validates. Only rows naming the source are touched, so a row pointing
 * anywhere else survives, and the parent's own `amended_from` is untouched because only child
 * tables are walked.
 *
 * Exported as source text because it has to run inside the ERP view alongside `copy_doc` — same
 * shape as `PE_REASON_FROM_JS`, but with the rule kept here where it can be tested rather than
 * hand-written into a template string.
 */
export const DROP_STALE_AMEND_ROWS_JS = String.raw`function dropStaleAmendRows(draft, sourceName) {
  var dropped = [];
  if (!draft || !sourceName) return dropped;
  for (var key in draft) {
    if (!Object.prototype.hasOwnProperty.call(draft, key)) continue;
    var rows = draft[key];
    if (!Array.isArray(rows) || !rows.length) continue;
    var kept = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var stale = false;
      if (row && typeof row === "object") {
        for (var f in row) {
          if (!Object.prototype.hasOwnProperty.call(row, f)) continue;
          if (row[f] === sourceName) { stale = true; break; }
        }
      }
      if (stale) dropped.push(key);
      else kept.push(row);
    }
    if (dropped.length && kept.length !== rows.length) draft[key] = kept;
  }
  return dropped;
}`;

/**
 * 🔴 The second thing done to the amended draft before it is inserted (P1 stage 3).
 *
 * An amendment exists to *change* something — stage 3's whole point is that a submitted bill's
 * method cannot be edited, so changing it means cancel, copy, change the copy, insert. This applies
 * that change, from an inert description built in `src/mode-change-plan.js`.
 *
 * 🔴 **Schedule rows are matched by due date, never by index.** `copy_doc` preserves order today,
 * but the plan is built from the dashboard's own ordinal over *unpaid* rows — which is not the
 * document's row order the moment one installment has been paid. Due date does identify a row,
 * because ERPNext refuses a payment schedule with two rows sharing one (verified 2026-09-22).
 *
 * A row the patch names and the draft does not have is reported as **missed**, not thrown. By the
 * time this runs the original is already cancelled, so refusing to insert would trade a wrong
 * field for a document that does not exist at all. The caller says which rows missed.
 */
export const APPLY_AMEND_PATCH_JS = String.raw`function applyAmendPatch(draft, patch) {
  var out = { applied: [], missed: [] };
  if (!draft || !patch) return out;
  if (patch.setHeader) {
    for (var k in patch.setHeader) {
      if (!Object.prototype.hasOwnProperty.call(patch.setHeader, k)) continue;
      draft[k] = patch.setHeader[k];
      out.applied.push(k);
    }
  }
  var specs = patch.setScheduleRows || [];
  var sched = (draft && draft.payment_schedule) || [];
  for (var i = 0; i < specs.length; i++) {
    var spec = specs[i];
    if (!spec || !spec.matchDueDate) continue;
    var target = null;
    for (var j = 0; j < sched.length; j++) {
      var row = sched[j];
      if (row && String(row.due_date || "").slice(0, 10) === String(spec.matchDueDate).slice(0, 10)) {
        target = row;
        break;
      }
    }
    if (!target) { out.missed.push(spec.matchDueDate); continue; }
    for (var f in spec.set) {
      if (!Object.prototype.hasOwnProperty.call(spec.set, f)) continue;
      target[f] = spec.set[f];
    }
    out.applied.push("payment_schedule@" + spec.matchDueDate);
  }
  return out;
}

function verifyAmendPatch(doc, patch) {
  var out = { ok: true, mismatches: [] };
  if (!doc || !patch) return out;
  if (patch.setHeader) {
    for (var k in patch.setHeader) {
      if (!Object.prototype.hasOwnProperty.call(patch.setHeader, k)) continue;
      if (String(doc[k] || "") !== String(patch.setHeader[k] || "")) {
        out.ok = false;
        out.mismatches.push(k);
      }
    }
  }
  var specs = patch.setScheduleRows || [];
  var sched = (doc && doc.payment_schedule) || [];
  for (var i = 0; i < specs.length; i++) {
    var spec = specs[i];
    if (!spec || !spec.matchDueDate) continue;
    var target = null;
    for (var j = 0; j < sched.length; j++) {
      var row = sched[j];
      if (row && String(row.due_date || "").slice(0, 10) === String(spec.matchDueDate).slice(0, 10)) {
        target = row;
        break;
      }
    }
    if (!target) { out.ok = false; out.mismatches.push("payment_schedule@" + spec.matchDueDate); continue; }
    for (var f in spec.set) {
      if (!Object.prototype.hasOwnProperty.call(spec.set, f)) continue;
      if (String(target[f] || "") !== String(spec.set[f] || "")) {
        out.ok = false;
        out.mismatches.push("payment_schedule@" + spec.matchDueDate + "." + f);
      }
    }
  }
  return out;
}`;

/**
 * The same two rules as testable functions, evaluated from the shipped source so they cannot drift
 * from what actually runs in the ERP view.
 *
 * @param {Record<string, any>} draft mutated in place
 * @param {import("./mode-change-plan.js").AmendPatch|null} patch
 * @returns {{ applied: string[], missed: string[] }}
 */
export function applyAmendPatch(draft, patch) {
  // eslint-disable-next-line no-new-func
  const fn = new Function(`${APPLY_AMEND_PATCH_JS}; return applyAmendPatch;`)();
  return fn(draft, patch);
}

/**
 * @param {Record<string, any>|null} doc as ERP handed it back after the insert
 * @param {import("./mode-change-plan.js").AmendPatch|null} patch
 * @returns {{ ok: boolean, mismatches: string[] }}
 */
export function verifyAmendPatch(doc, patch) {
  // eslint-disable-next-line no-new-func
  const fn = new Function(`${APPLY_AMEND_PATCH_JS}; return verifyAmendPatch;`)();
  return fn(doc, patch);
}

/**
 * The same rule as a testable function. Kept in step with {@link DROP_STALE_AMEND_ROWS_JS} by the
 * unit test, which evaluates that source and runs both against the same inputs.
 *
 * @param {Record<string, unknown>} draft the amended copy, mutated in place
 * @param {string} sourceName the document being amended
 * @returns {string[]} the child table each dropped row came from, one entry per row
 */
export function dropStaleAmendRows(draft, sourceName) {
  // eslint-disable-next-line no-new-func
  const fn = new Function(`${DROP_STALE_AMEND_ROWS_JS}; return dropStaleAmendRows;`)();
  return fn(draft, sourceName);
}

/** @param {number} n @param {string} noun */
function plural(n, noun) {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** @param {DocActionContext|null|undefined} ctx */
function normalizeContext(ctx) {
  const c = ctx && typeof ctx === "object" ? ctx : {};
  return {
    docstatus: Number.isFinite(Number(c.docstatus)) ? Number(c.docstatus) : -1,
    dirty: c.dirty === true,
    alreadyAmended: c.alreadyAmended === true,
    amendable: c.amendable !== false,
  };
}
