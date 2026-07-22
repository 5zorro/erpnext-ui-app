/**
 * Bill toolbar action flow contracts (T3 hardening / OI-056–059).
 * Pure classifiers for save-gate phases, Find list confirmation, Print identity,
 * and the dogfood action matrix — no Electron / Frappe.
 */

import { amountDueMatchesGrandTotal, billCompareTotal, BILL_EXPENSE_NOTE } from "./bill-map.js";
import { normalizeAppRoute, isNewDocRecord, routeInfo } from "./route-info.js";
import { commitGateContinues } from "./bill-toolbar.js";

/** @typedef {"idle"|"validating"|"saving"|"submitting"|"success"|"error"} CommitGatePhase */
/** @typedef {"find"|"new"|"print"} CommitGateAction */
/** @typedef {"discard"|"save"|"submit"|"cancel"} CommitGateChoice */
/**
 * A gate trigger is whatever asked to leave the current dirty Bill: a toolbar
 * action (Find/New/Print) or a main-process navigation (Home/Vanilla/Recent).
 * Both drive the SAME in-page commit-gate — this is the SSoT that keeps them
 * from diverging into two dialogs.
 * @typedef {{ kind: "toolbar"|"nav", action?: CommitGateAction, navToken?: string, label?: string }} GateTrigger
 */

/**
 * SSoT title label for the commit-gate, whatever opened it.
 * @param {GateTrigger|null|undefined} trigger
 * @returns {string}
 */
export function gateTriggerLabel(trigger) {
  if (!trigger) return "continue";
  if (trigger.kind === "nav") return trigger.label || "leaving this Bill";
  switch (trigger.action) {
    case "find":
      return "Find Bill…";
    case "new":
      return "New Bill";
    case "print":
      return "Print";
    default:
      return trigger.action || "continue";
  }
}

/**
 * SSoT for "what happens after the gate resolves" — shared by toolbar actions and
 * navigation so the two entry points can never disagree on discard/save/continue.
 * @param {GateTrigger|null|undefined} trigger
 * @param {CommitGateChoice|null} choice already normalized (null on unknown/cancel)
 * @returns {{ then: "close"|"run-action"|"proceed-nav" }}
 */
export function nextAfterGate(trigger, choice) {
  if (!trigger || !commitGateContinues(choice)) {
    return { then: "close" };
  }
  return { then: trigger.kind === "nav" ? "proceed-nav" : "run-action" };
}

export const BILL_SAVE_TIMEOUT_MS = 45_000;
export const BILL_FIND_TIMEOUT_MS = 20_000;
export const BILL_PRINT_TIMEOUT_MS = 25_000;

/**
 * Progress text for save-based gate choices (never say "submitting" for draft save).
 * @param {"save"|"submit"|string} choice
 */
export function commitGateProgressLabel(choice) {
  if (choice === "submit") return "Saving & submitting…";
  if (choice === "save") return "Saving draft…";
  return "Working…";
}

/**
 * Success text after save completes.
 * @param {"save"|"submit"|string} choice
 */
export function commitGateSuccessLabel(choice) {
  if (choice === "submit") return "Submitted.";
  if (choice === "save") return "Saved draft.";
  return "Done.";
}

/**
 * Known Doc-skin blockers before asking ERP to save.
 * ERPNext remains the authoritative validator — this list is not exhaustive.
 *
 * @param {{
 *   amountDue?: string|number|null,
 *   doc?: object|null,
 *   supplier?: string|null,
 * }} [ctx]
 * @returns {string[]}
 */
export function listLocalSaveBlockers(ctx = {}) {
  const blockers = [];
  const compare = billCompareTotal(ctx.doc);
  if (!amountDueMatchesGrandTotal(ctx.amountDue, compare)) {
    blockers.push("Amount Due must match Grand total (checksum).");
  }
  const supplier =
    ctx.supplier != null
      ? String(ctx.supplier).trim()
      : ctx.doc && ctx.doc.supplier
        ? String(ctx.doc.supplier).trim()
        : "";
  if (!supplier) {
    blockers.push("Vendor (Supplier) is required.");
  }
  // DocType meta marks Items reqd — empty table always fails ERP save.
  const items = ctx.doc && Array.isArray(ctx.doc.items) ? ctx.doc.items : [];
  if (!items.length) {
    blockers.push("At least one Item line is required.");
  }
  return blockers;
}

/**
 * Non-blocking warning shown beside Save / Save&submit gate buttons.
 *
 * Local blockers are a *subset* of what ERPNext enforces. There is no complete
 * static field list we can ship — Vanilla also runs DocType meta (incl. Customize
 * Form), client scripts, Buying Settings, and server validate() (accounts, stock,
 * PO/PR rules, etc.). Green local checks mean "Doc skin preflight passed," not
 * "ERP will accept this save."
 *
 * @param {string[]} blockers
 */
export function commitGateSaveWarning(blockers = []) {
  const known = Array.isArray(blockers) ? blockers.filter(Boolean) : [];
  if (!known.length) {
    return (
      "Doc Bill + live ERP meta preflight passed. Server-side rules can still reject " +
      "(accounts, stock, PO/PR settings). If Vanilla rejects the save, the reason appears here."
    );
  }
  return (
    "Cannot save yet:\n• " +
    known.join("\n• ") +
    "\n\nIncludes Doc Bill checks and live ERP mandatory fields. Server rules may still apply after these clear."
  );
}

/**
 * Gate panel state after ERPNext rejects a save (local preflight had already passed).
 * @param {string} [reason]
 * @returns {{ title: string, blockers: string[], hint: string, blocked: boolean }}
 */
export function commitGateErpFailureView(reason) {
  const text =
    reason && String(reason).trim()
      ? String(reason).trim()
      : "ERPNext rejected the save (no detail returned).";
  return {
    title: "ERPNext rejected the save:",
    blockers: [text],
    hint: "Cancel to return to the Bill and fix what Vanilla reported, or Discard / try again.",
    blocked: true,
  };
}

/**
 * Whether save-based gate buttons may be clicked.
 * @param {string[]} blockers
 */
export function commitGateSaveEnabled(blockers = []) {
  return !(Array.isArray(blockers) && blockers.length > 0);
}

/**
 * Reduce commit-gate busy phase.
 * @param {CommitGatePhase} phase
 * @param {{ type: string, choice?: string, reason?: string }} event
 * @returns {{ phase: CommitGatePhase, label: string, busy: boolean, ok?: boolean, reason?: string }}
 */
export function reduceCommitGatePhase(phase, event) {
  const type = event && event.type;
  if (type === "reset" || type === "cancel") {
    return { phase: "idle", label: "", busy: false };
  }
  if (type === "validate") {
    return { phase: "validating", label: "Checking save prerequisites…", busy: true };
  }
  if (type === "start-save") {
    const choice = event.choice === "submit" ? "submit" : "save";
    return {
      phase: choice === "submit" ? "submitting" : "saving",
      label: commitGateProgressLabel(choice),
      busy: true,
    };
  }
  if (type === "success") {
    return {
      phase: "success",
      label: commitGateSuccessLabel(event.choice === "submit" ? "submit" : "save"),
      busy: false,
      ok: true,
    };
  }
  if (type === "error") {
    return {
      phase: "error",
      label: event.reason || "Save failed.",
      busy: false,
      ok: false,
      reason: event.reason || "Save failed.",
    };
  }
  return { phase: phase || "idle", label: "", busy: phase === "saving" || phase === "submitting" || phase === "validating" };
}

/**
 * True when route is Purchase Invoice **list** (no record / not /new).
 * @param {string} routeOrUrl
 * @param {string} [erpBase]
 */
export function isPurchaseInvoiceListRoute(routeOrUrl, erpBase) {
  const n = normalizeAppRoute(routeOrUrl, erpBase);
  return n.doctype === "purchase-invoice" && !n.record;
}

/**
 * True when route is a Purchase Invoice form (new or named).
 * @param {string} routeOrUrl
 * @param {string} [erpBase]
 */
export function isPurchaseInvoiceFormRoute(routeOrUrl, erpBase) {
  const n = normalizeAppRoute(routeOrUrl, erpBase);
  return n.doctype === "purchase-invoice" && !!n.record;
}

/**
 * Classify Find navigation result after load.
 * @param {string} landedRoute
 * @param {string} [erpBase]
 * @returns {{ ok: boolean, reason?: string }}
 */
export function classifyFindBillResult(landedRoute, erpBase) {
  if (isPurchaseInvoiceListRoute(landedRoute, erpBase)) {
    return { ok: true };
  }
  if (isPurchaseInvoiceFormRoute(landedRoute, erpBase)) {
    return {
      ok: false,
      reason: "Expected Bill list (Find), but Vanilla opened a Bill form.",
    };
  }
  return {
    ok: false,
    reason: "Timed out or landed off the Purchase Invoice list.",
  };
}

/**
 * Vanilla print preview route: /app/print/<Doctype>/<name>
 * @param {string} routeOrUrl
 * @param {string} [erpBase]
 */
export function isPrintPreviewRoute(routeOrUrl, erpBase) {
  const info = routeInfo(routeOrUrl, erpBase);
  const path = (info.path || "").toLowerCase();
  return path.includes("/print/");
}

/**
 * After Print, clerk should land on Vanilla print preview (not stay on Doc Bill).
 * @param {string} landedRoute
 * @param {string} expectedName
 * @param {string} [erpBase]
 * @returns {{ ok: boolean, reason?: string }}
 */
export function classifyPrintNavResult(landedRoute, expectedName, erpBase) {
  if (!isPrintPreviewRoute(landedRoute, erpBase)) {
    return {
      ok: false,
      reason: "Expected Vanilla print preview, but did not navigate to the print page.",
    };
  }
  const want = expectedName == null ? "" : String(expectedName);
  if (!want) return { ok: true };
  const path = routeInfo(landedRoute, erpBase).path || "";
  const decoded = decodeURIComponent(path);
  if (!decoded.includes(want) && !path.includes(encodeURIComponent(want))) {
    return {
      ok: false,
      reason: `Print preview opened, but not for Bill ${want}.`,
    };
  }
  return { ok: true };
}

/**
 * Does hidden Vanilla cur_frm match the Bill we want to print?
 * @param {{ doctype?: string, name?: string }|null|undefined} frmDoc
 * @param {string} expectedName
 * @returns {{ ok: boolean, reason?: string }}
 */
export function printFormMatchesBill(frmDoc, expectedName) {
  const want = expectedName == null ? "" : String(expectedName);
  if (!want || isNewDocRecord(want)) {
    return { ok: false, reason: "Save the Bill draft first — print needs a document name." };
  }
  if (!frmDoc) {
    return { ok: false, reason: "No form loaded." };
  }
  if (frmDoc.doctype && frmDoc.doctype !== "Purchase Invoice") {
    return { ok: false, reason: `Wrong form type (${frmDoc.doctype}).` };
  }
  const got = frmDoc.name == null ? "" : String(frmDoc.name);
  if (!got || isNewDocRecord(got)) {
    return { ok: false, reason: "No form loaded." };
  }
  if (got !== want) {
    return {
      ok: false,
      reason: `Vanilla is on a different Bill (${got}), not ${want}.`,
    };
  }
  return { ok: true };
}

/**
 * Normalize Print IPC / eval payload — never invent success after failure.
 * @param {unknown} raw
 * @returns {{ ok: boolean, reason?: string }}
 */
export function normalizePrintIpcResult(raw) {
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "Could not open print." };
  }
  const r = /** @type {{ ok?: boolean, reason?: string }} */ (raw);
  if (r.ok === true) {
    return { ok: true, reason: r.reason };
  }
  return { ok: false, reason: r.reason || "Print failed." };
}

/**
 * Shape a timed-out bridge call.
 * @param {string} what
 */
export function timeoutFailure(what) {
  return {
    ok: false,
    timedOut: true,
    reason: `${what} timed out — check Vanilla validations or reload the Bill.`,
  };
}

/**
 * Expenses tab orientation toward Items + Taxes and Charges (OI-059).
 * @returns {{
 *   note: string,
 *   itemsJumpLabel: string,
 *   taxesJumpLabel: string,
 *   jumpTarget: string,
 * }}
 */
export function billExpensesTaxOrientation() {
  return {
    note: BILL_EXPENSE_NOTE,
    itemsJumpLabel: "click here",
    taxesJumpLabel: "Taxes and Charges section below",
    jumpTarget: "bill-taxes-block",
  };
}

/**
 * Dogfood / unit action matrix for T3 Find / New / Print gate + Print / Find confirm.
 * Each row is a scenario clerks should verify; units assert expected continue/error shape.
 *
 * @returns {readonly {
 *   id: string,
 *   dirty: boolean,
 *   choice?: CommitGateChoice,
 *   action: CommitGateAction,
 *   blockers?: string[],
 *   isNew?: boolean,
 *   expectOpenGate: boolean,
 *   expectContinue: boolean,
 *   expectReason?: RegExp|string,
 * }[]}
 */
export function billToolbarActionMatrix() {
  return Object.freeze([
    {
      id: "clean-find-immediate",
      dirty: false,
      action: "find",
      expectOpenGate: false,
      expectContinue: true,
    },
    {
      id: "clean-new-immediate",
      dirty: false,
      action: "new",
      expectOpenGate: false,
      expectContinue: true,
    },
    {
      id: "dirty-discard-new",
      dirty: true,
      choice: "discard",
      action: "new",
      expectOpenGate: true,
      expectContinue: true,
    },
    {
      id: "dirty-save-blocked-checksum",
      dirty: true,
      choice: "save",
      action: "new",
      blockers: ["Amount Due must match Grand total (checksum)."],
      expectOpenGate: true,
      expectContinue: false,
      expectReason: /Cannot save yet|checksum/i,
    },
    {
      id: "dirty-save-needs-erp-warning",
      dirty: true,
      choice: "save",
      action: "find",
      blockers: [],
      expectOpenGate: true,
      expectContinue: true, // continue only after confirmed save success (IPC)
      expectReason: /live ERP meta|Doc Bill \+ live ERP|server-side rules/i,
    },
    {
      id: "print-discard-new-blocked",
      dirty: true,
      choice: "discard",
      action: "print",
      isNew: true,
      expectOpenGate: true,
      expectContinue: false,
      expectReason: /Discarding a new Bill leaves nothing to print|Save draft/i,
    },
    {
      id: "find-must-be-list-not-form",
      dirty: false,
      action: "find",
      expectOpenGate: false,
      expectContinue: true,
      expectReason: /Bill list/i,
    },
    {
      id: "print-requires-matching-form",
      dirty: false,
      action: "print",
      expectOpenGate: false,
      expectContinue: true,
      expectReason: /No form loaded|different Bill/i,
    },
  ]);
}
