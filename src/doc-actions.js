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
 * Offered only on a **submitted** document, because that is the only state the pair applies to:
 * a draft is already editable (nothing to void), and a cancelled document is either already
 * amended or is amended by `Amend` on its own, which is stage 2's problem, not a Bill's.
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
 * Stage 1 is the Bill alone, deliberately: the action writes to ERP, and proving it on the skin
 * 5zorro dogfoods daily is worth more than four untested rows.
 */
const ACTIONS_BY_DOCTYPE = Object.freeze({
  "purchase-invoice": [VOID_AND_AMEND],
});

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
      doctypeKey,
      offered: reason === "",
      reason,
      confirm: action.confirm,
    };
  });
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
 * What the clerk is told before a void-and-amend runs — the specific consequences, not a generic
 * "are you sure".
 *
 * 🔴 The three facts here are the ones that are **invisible on the form** and irreversible once the
 * cancel goes through:
 *
 * 1. **Payments get detached.** This sandbox has Accounts Settings'
 *    `unlink_payment_on_cancellation_of_invoice` on, so cancelling a bill with payments against it
 *    does not stop — `unlink_ref_doc_from_payment_entries` quietly removes the allocation
 *    (`accounts_controller.py:2048`). The payments stay submitted and become unallocated, and the
 *    bill's outstanding goes back up. Nothing on screen would otherwise say so.
 * 2. **The ERPNext ID changes.** `_set_amended_name` (`naming.py:549`) names the amendment
 *    `<original>-1`. The vendor's own invoice number does not change — which is the point of
 *    OI-170, and worth saying here while the clerk is looking at both.
 * 3. **It can only be done once.**
 *
 * @param {{
 *   name?: string,
 *   docstatus?: number,
 *   supplierRef?: string,
 *   linkedPaymentCount?: number,
 *   unlinksPaymentsOnCancel?: boolean,
 * }} facts read from the live document, not guessed — `linkedPaymentCount` of `null`/absent means
 *   "not checked", which is said out loud rather than rendered as zero.
 * @returns {{ title: string, lines: string[], severity: "warn"|"info" }}
 */
export function describeVoidAndAmend(facts = {}) {
  const name = String(facts.name || "").trim();
  const lines = [];
  // Already cancelled: the cancel has happened, so there is nothing to warn about losing. Saying
  // "will be cancelled" here would be describing something that already occurred — and this is the
  // state a half-done attempt leaves behind, so it is a path clerks will actually meet.
  const alreadyCancelled = facts.docstatus === 2;

  if (alreadyCancelled) {
    lines.push(
      name
        ? `${name} is already cancelled. An editable copy of it will be created.`
        : "This document is already cancelled. An editable copy of it will be created.",
    );
  } else {
    lines.push(
      name
        ? `${name} will be cancelled, and an editable copy of it created.`
        : "This document will be cancelled, and an editable copy of it created.",
    );
  }

  const amendedName = name ? `${name}-1` : "";
  const idLine = amendedName
    ? `The copy gets a new ERPNext ID — ${amendedName}. `
    : "The copy gets a new ERPNext ID. ";
  lines.push(
    idLine +
      (facts.supplierRef
        ? `The vendor's own number, ${facts.supplierRef}, stays the same.`
        : "The vendor's own invoice number stays the same."),
  );

  const count = Number(facts.linkedPaymentCount);
  const counted = Number.isFinite(count) && count >= 0;
  let severity = /** @type {"warn"|"info"} */ ("info");
  if (alreadyCancelled) {
    // Whatever the cancel did to its payments, it did already.
    lines.push("A document can only be amended once.");
    return { title: name ? `Amend ${name}?` : "Amend this document?", lines, severity };
  }
  if (!counted) {
    lines.push(
      "Payments against this bill could not be checked. If there are any, cancelling may detach them.",
    );
    severity = "warn";
  } else if (count > 0) {
    // Only warn about detaching when the site actually detaches. With the setting off, ERPNext
    // refuses the cancel instead — a different outcome, and promising the wrong one is worse than
    // saying nothing.
    if (facts.unlinksPaymentsOnCancel === false) {
      lines.push(
        `${plural(count, "payment")} already applied to this bill. ERPNext will refuse to cancel it until ${count === 1 ? "that payment is" : "those payments are"} cancelled first.`,
      );
    } else {
      lines.push(
        `🔴 ${plural(count, "payment")} applied to this bill will be **detached**, not cancelled. ` +
          `${count === 1 ? "It stays" : "They stay"} submitted but unallocated, this bill's outstanding goes back up, ` +
          `and ${count === 1 ? "it has" : "they have"} to be applied to the amended bill by hand.`,
      );
    }
    severity = "warn";
  }

  lines.push("A document can only be amended once.");

  return {
    title: name ? `Void and amend ${name}?` : "Void and amend this document?",
    lines,
    severity,
  };
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
 * Verified 2026-09-22 by running the **Desk-identical** sequence (`copy_doc(doc, 1)` + insert)
 * against a real cancelled bill: it fails the same way, so pressing Amend in Vanilla fails too.
 * This is upstream behaviour, not our write path.
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
