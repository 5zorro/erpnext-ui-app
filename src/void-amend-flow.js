/**
 * The void-and-amend click, once, for every skin that offers it (P1 stage 2 / OI-171).
 *
 * Stage 1 proved the flow inside `bill-form-page.js`. Four skins offering it means four copies of
 * a sequence whose whole value is being careful in the same way every time — read first, name the
 * consequences, write, then report the half-done case as itself. So it lives here, with the DOM
 * and the ERP bridge injected, and each skin is the ~10 lines that supply them.
 *
 * 🔴 **No DOM, no IPC, no ERP call.** `confirm`, `setStatus` and `api` all arrive as arguments,
 * which is what makes the dangerous path — cancel succeeded, insert failed — testable without a
 * running ERP. That path has happened for real (dogfood 2026-09-22) and is the reason this is a
 * module rather than an event handler.
 */

import {
  offeredDocActions,
  describeVoidAndAmend,
  describeVoidAndAmendResult,
  docActionNoun,
} from "./doc-actions.js";

/**
 * @typedef {{
 *   voidAmendFacts?: (doctype: string, name: string) => Promise<any>,
 *   voidAndAmend?: (doctype: string, name: string) => Promise<any>,
 * }} VoidAmendApi
 *
 * @typedef {{
 *   doctype: string,
 *   name: string,
 *   docstatus: number|string|null|undefined,
 *   dirty?: boolean,
 *   supplierRef?: string,
 *   supplierRefLabel?: string,
 *   api: VoidAmendApi|null|undefined,
 *   confirm: (title: string, body: string) => boolean|Promise<boolean>,
 *   setStatus: (text: string, cls?: string) => void,
 * }} VoidAmendRunDeps
 *
 * @typedef {{
 *   ran: boolean,          // whether the write was attempted at all
 *   ok: boolean,           // whether the amendment exists now
 *   amendedName: string,   // "" unless ok
 *   strandedName: string,  // a document cancelled with no replacement; "" whenever there isn't one
 *   reason: string,
 * }} VoidAmendRunResult
 */

/** @param {string} reason */
function stopped(reason) {
  return { ran: false, ok: false, amendedName: "", strandedName: "", reason };
}

/**
 * Markdown emphasis is for the terminal-style panels elsewhere; a native confirm renders it
 * literally, so strip it on the way out.
 * @param {string[]} lines
 */
export function confirmBodyFromLines(lines) {
  return (Array.isArray(lines) ? lines : []).map((l) => String(l).replace(/\*\*/g, "")).join("\n\n");
}

/**
 * Read, ask, write, report.
 *
 * @param {VoidAmendRunDeps} deps
 * @returns {Promise<VoidAmendRunResult>}
 */
export async function runVoidAndAmend(deps) {
  const doctype = String((deps && deps.doctype) || "").trim();
  const name = String((deps && deps.name) || "").trim();
  const setStatus = (deps && deps.setStatus) || (() => {});
  const noun = docActionNoun(doctype);

  const [action] = offeredDocActions(doctype, {
    docstatus: deps && deps.docstatus,
    dirty: deps && deps.dirty === true,
  });
  if (!name || !action) {
    const why = `Only a saved, submitted ${noun} with no unsaved changes can be voided and amended.`;
    setStatus(why, "warn");
    return stopped(why);
  }

  const api = deps && deps.api;
  if (!api || !api.voidAndAmend || !api.voidAmendFacts) {
    // Not "restart the shell": this is a wiring gap (each skin's preload and API adapter has to
    // name every method it forwards), and a restart cannot fix it. Saying the wrong remedy costs
    // more than saying none — dogfood 2026-09-22.
    const why = `Void and amend is not wired into this build — the ${noun} page's API adapter is missing it.`;
    setStatus(why, "err");
    return stopped(why);
  }

  // Read first, ask second. What matters — whether ERP will allow it at all, and what comes
  // unstuck when it does — is invisible on the form, and a confirm that cannot name it is not
  // worth showing.
  setStatus(`Checking what voiding ${name} would affect…`);
  let facts;
  try {
    facts = await api.voidAmendFacts(doctype, name);
  } catch (err) {
    const why = `Could not check ${name}: ${errText(err)}`;
    setStatus(why, "err");
    return stopped(why);
  }
  if (!facts || !facts.ok) {
    const why = (facts && facts.reason) || `Could not check ${name}.`;
    setStatus(why, "err");
    return stopped(why);
  }
  if (facts.alreadyAmended) {
    const why = `${name} has already been amended once, which is all ERPNext allows. Open the amendment and edit that instead.`;
    setStatus(why, "warn");
    return stopped(why);
  }

  const warning = describeVoidAndAmend({
    name,
    doctype,
    docstatus: Number(deps.docstatus),
    supplierRef: deps.supplierRef || "",
    supplierRefLabel: deps.supplierRefLabel || "",
    linkedPaymentCount: facts.linkedPaymentCount,
    unlinksPaymentsOnCancel: facts.unlinksPaymentsOnCancel,
    allocatedInvoiceCount: facts.allocatedInvoiceCount,
    blockers: facts.blockers,
    blockersChecked: facts.blockersChecked,
    isAmendment: facts.isAmendment,
    amendCounter: facts.amendCounter,
  });
  setStatus("");
  const agreed = await deps.confirm(warning.title, confirmBodyFromLines(warning.lines));
  if (!agreed) return stopped("");

  setStatus(`Voiding ${name} and creating the amended copy…`);
  let result;
  try {
    result = await api.voidAndAmend(doctype, name);
  } catch (err) {
    // 🔴 The worst case: the cancel may or may not have landed, and this page cannot tell. Say
    // that, rather than implying nothing happened — a clerk who believes nothing happened
    // re-enters the document and it then exists twice.
    const why =
      `Lost contact while voiding ${name}: ${errText(err)}. ` +
      `Check the ${noun} in ERPNext before retrying — it may already be cancelled.`;
    setStatus(why, "err");
    return { ran: true, ok: false, amendedName: "", strandedName: name, reason: why };
  }

  const told = describeVoidAndAmendResult(result);
  setStatus(`${told.headline}${told.detail ? ` ${told.detail}` : ""}`, told.ok ? "" : "err");
  return {
    ran: true,
    ok: told.ok,
    amendedName: (result && String(result.amendedName || "")) || "",
    strandedName: told.strandedName,
    reason: told.ok ? "" : `${told.headline} ${told.detail}`.trim(),
  };
}

/** @param {unknown} err */
function errText(err) {
  if (err && typeof err === "object" && "message" in err) {
    return String(/** @type {{ message?: unknown }} */ (err).message);
  }
  return String(err);
}
