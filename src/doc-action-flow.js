/**
 * Doc-form shell action flow (PO / Item Receipt) — no Amount Due checksum.
 * Reuses bill-toolbar gate mechanics; local save blockers are profile-agnostic.
 */

import {
  commitGateProgressLabel,
  commitGateSuccessLabel,
  commitGateSaveEnabled,
  reduceCommitGatePhase,
} from "./bill-action-flow.js";

export {
  commitGateProgressLabel,
  commitGateSuccessLabel,
  commitGateSaveEnabled,
  reduceCommitGatePhase,
};

/**
 * Known Doc-skin blockers before asking ERP to save (no Amount Due).
 *
 * @param {{
 *   doc?: object|null,
 *   supplier?: string|null,
 * }} [ctx]
 * @returns {string[]}
 */
export function listDocFormSaveBlockers(ctx = {}) {
  const blockers = [];
  const supplier =
    ctx.supplier != null
      ? String(ctx.supplier).trim()
      : ctx.doc && ctx.doc.supplier
        ? String(ctx.doc.supplier).trim()
        : "";
  if (!supplier) {
    blockers.push("Vendor (Supplier) is required.");
  }
  const items = ctx.doc && Array.isArray(ctx.doc.items) ? ctx.doc.items : [];
  if (!items.length) {
    blockers.push("At least one Item line is required.");
  }
  return blockers;
}

/**
 * @param {import("./bill-action-flow.js").GateTrigger|null|undefined} trigger
 * @param {{ leaving?: string, find?: string, new?: string, print?: string }} labels
 */
export function docGateTriggerLabel(trigger, labels = {}) {
  if (!trigger) return "continue";
  if (trigger.kind === "nav") return trigger.label || labels.leaving || "leaving this document";
  switch (trigger.action) {
    case "find":
      return labels.find || "Find…";
    case "new":
      return labels.new || "New";
    case "print":
      return labels.print || "Print";
    default:
      return trigger.action || "continue";
  }
}

/**
 * @param {string[]} blockers
 * @param {string} [docTitle]
 */
export function docCommitGateSaveWarning(blockers = [], docTitle = "Doc form") {
  const known = Array.isArray(blockers) ? blockers.filter(Boolean) : [];
  if (!known.length) {
    return (
      `${docTitle} + live ERP meta preflight passed. Server-side rules can still reject ` +
      "(accounts, stock, PO/PR settings). If Vanilla rejects the save, the reason appears here."
    );
  }
  return (
    "Cannot save yet:\n• " +
    known.join("\n• ") +
    `\n\nIncludes ${docTitle} checks and live ERP mandatory fields. Server rules may still apply after these clear.`
  );
}

/**
 * @param {string} [reason]
 * @param {string} [docTitle]
 */
export function docCommitGateErpFailureView(reason, docTitle = "Doc form") {
  const text =
    reason && String(reason).trim()
      ? String(reason).trim()
      : "ERPNext rejected the save (no detail returned).";
  return {
    title: "ERPNext rejected the save:",
    blockers: [text],
    hint: `Cancel to return to the ${docTitle} and fix what Vanilla reported, or Discard / try again.`,
    blocked: true,
  };
}

/**
 * Resolve ERP Link doctype from header/item column meta.
 *
 * @param {string} field
 * @param {Array<{ field?: string|null, linkDoctype?: string }>} headerFields
 * @param {Array<{ field?: string|null, linkDoctype?: string }>} itemCols
 * @returns {string|null}
 */
export function linkDoctypeForDocField(field, headerFields = [], itemCols = []) {
  if (typeof field !== "string" || !field) return null;
  for (const h of headerFields) {
    if (h.field === field && h.linkDoctype) return h.linkDoctype;
  }
  for (const c of itemCols) {
    if (c.field === field && c.linkDoctype) return c.linkDoctype;
  }
  if (field === "supplier") return "Supplier";
  if (field === "account_head") return "Account";
  return null;
}

/**
 * After source choose on Item Receipt, focus Packing List / BOL ref (invoice # is on the Bill).
 *
 * @param {"po"|"receipt"|string|null|undefined} profileId
 * @param {"choose"|"cancel"|"escape"} closeKind
 * @returns {string|null} header ERP fieldname to focus, or null
 */
export function focusTargetAfterDocSourceModal(profileId, closeKind) {
  if (closeKind !== "choose") return null;
  if (profileId === "receipt") return "lr_no";
  return null;
}

/**
 * Split header fields into two columns (museum-style card layout).
 *
 * @template T
 * @param {T[]} fields
 * @returns {{ left: T[], right: T[] }}
 */
export function splitHeaderColumns(fields) {
  const list = Array.isArray(fields) ? fields : [];
  const mid = Math.ceil(list.length / 2);
  return { left: list.slice(0, mid), right: list.slice(mid) };
}
