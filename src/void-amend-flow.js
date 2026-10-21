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

/**
 * Documents this page is voiding right now (review 10-19 R9-3). The button stays clickable while
 * the write runs, and a second run confirmed before the first lands would cancel nothing new but
 * could insert a second amendment — so a second click for the same document is refused here,
 * before anything is read or asked.
 * @type {Set<string>}
 */
const voidingNow = new Set();

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

  const busyKey = `${doctype}\u0000${name}`;
  if (voidingNow.has(busyKey)) {
    const why = `${name} is already being voided — wait for that to finish.`;
    setStatus(why, "warn");
    return stopped(why);
  }
  voidingNow.add(busyKey);
  try {
    return await runVoidAndAmendOnce(deps, { doctype, name, setStatus, noun });
  } finally {
    voidingNow.delete(busyKey);
  }
}

/**
 * @param {VoidAmendRunDeps} deps
 * @param {{ doctype: string, name: string, setStatus: (text: string, cls?: string) => void, noun: string }} ctx
 * @returns {Promise<VoidAmendRunResult>}
 */
async function runVoidAndAmendOnce(deps, { doctype, name, setStatus, noun }) {
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
    // A refusal before anything was sent (view not ready, already being voided) ran nothing.
    ran: !(result && result.notRun),
    ok: told.ok,
    amendedName: (result && String(result.amendedName || "")) || "",
    strandedName: told.strandedName,
    reason: told.ok ? "" : `${told.headline} ${told.detail}`.trim(),
  };
}

/**
 * What a void-and-amend attempt actually did, from whatever the ERP page sent back (review 10-19
 * R9-1, R9-2). Lives here, not in main, so every branch is testable.
 *
 * - Every return the injected script makes says `cancelled: true|false` explicitly. So a result
 *   **without** that key did not come from the script finishing — the page reloaded or died
 *   mid-way, and the cancel may well have landed. That is reported like losing contact, never as
 *   "nothing was changed".
 * - The exception is a refusal made *before* anything was sent (the ERP view not ready, or showing
 *   another website, or this document already being voided): those carry `notRun: true`.
 * - A failure after the insert keeps `amendedName`: the amended copy exists (only its submit was
 *   refused), and saying otherwise sends the clerk to re-enter a bill that is already there.
 *
 * @param {unknown} raw
 * @param {string} name the document that was asked for
 * @param {(reason: unknown) => string} [formatReason]
 */
export function voidAmendOutcome(raw, name, formatReason = (r) => String(r || "")) {
  const nm = String(name || "");
  const lostContact =
    "The shell lost contact with ERP during the void and amend. Check the document in ERPNext before retrying.";
  if (!(raw && typeof raw === "object")) {
    return { ok: false, cancelled: true, uncertain: true, name: nm, amendedName: "", step: "unknown", reason: lostContact };
  }
  const r = /** @type {Record<string, any>} */ (raw);
  if (r.ok) return r;
  const reason = formatReason(r.reason || r) || "Void and amend failed.";
  if (r.notRun) {
    return { ok: false, cancelled: false, notRun: true, name: nm, amendedName: "", step: r.step || "not-run", reason };
  }
  if (r.cancelled === undefined) {
    return {
      ok: false,
      cancelled: true,
      uncertain: true,
      name: nm,
      amendedName: "",
      step: r.step || "unknown",
      reason: `${reason} ${lostContact}`.trim(),
    };
  }
  return {
    ok: false,
    cancelled: !!r.cancelled,
    name: String(r.name || nm),
    amendedName: String(r.amendedName || ""),
    step: r.step,
    reason,
    droppedRows: r.droppedRows,
    patched: r.patched,
  };
}

/** @param {unknown} err */
function errText(err) {
  if (err && typeof err === "object" && "message" in err) {
    return String(/** @type {{ message?: unknown }} */ (err).message);
  }
  return String(err);
}
