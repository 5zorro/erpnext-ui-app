/**
 * Shared Doc chrome contracts — toolbar groups, lifecycle status, Refresh copy.
 * Bill + PO + IR HTML paint from these; keep Electron thin.
 */

/** Hover / title for Refresh (not Revert, not Recalculate). */
export const REFRESH_BUTTON_TITLE =
  "Re-read the open Vanilla form into this page (keeps your Doc edits and Amount Due). " +
  "Does not discard changes — use Revert for that. Does not force ERP tax recalc.";

/**
 * Toolbar grouping (5zorro 2026-07-27): chunk common actions so clerks learn where to look.
 * @typedef {"fileRetention"|"navigate"} ToolbarGroupId
 */

/** @type {readonly { id: ToolbarGroupId, label: string, title: string }[]} */
export const DOC_TOOLBAR_GROUPS = Object.freeze([
  {
    id: "fileRetention",
    label: "File",
    title: "Keep, print, discard, or finalize this document",
  },
  {
    id: "navigate",
    label: "Navigate",
    title: "Find, open, or jump elsewhere without changing this document’s commit state",
  },
]);

/**
 * Button id → group. Delete / Create Copy land in fileRetention / navigate when built.
 * @type {Readonly<Record<string, ToolbarGroupId>>}
 */
export const DOC_TOOLBAR_BUTTON_GROUP = Object.freeze({
  "btn-print": "fileRetention",
  "btn-revert": "fileRetention",
  "btn-save": "fileRetention",
  "btn-submit": "fileRetention",
  "btn-delete": "fileRetention",
  "btn-find": "navigate",
  "btn-new": "navigate",
  "btn-select-po": "navigate",
  "btn-select-source": "navigate",
  "btn-refresh": "navigate",
  "btn-vanilla": "navigate",
  "btn-copy": "navigate",
  "btn-attach-toolbar": "fileRetention",
});

/**
 * @param {string} buttonId
 * @returns {ToolbarGroupId|null}
 */
export function toolbarGroupForButton(buttonId) {
  return DOC_TOOLBAR_BUTTON_GROUP[buttonId] || null;
}

/**
 * Lifecycle pill in the File group (OI-061 lite — draft/submitted + dirty).
 * Paid/cleared colors stay deferred until ERP payment-status map is decided.
 *
 * @param {{ isDraft: boolean, userEdited: boolean, isNewBlank?: boolean }} state
 * @returns {{ text: string, tone: "draft"|"draft-dirty"|"posted"|"posted-dirty", title: string }}
 */
export function docLifecyclePill(state) {
  const isDraft = !!(state && state.isDraft);
  const userEdited = !!(state && state.userEdited);
  const isNewBlank = !!(state && state.isNewBlank);
  if (!isDraft) {
    if (userEdited) {
      return {
        text: "Submitted · unsaved edits",
        tone: "posted-dirty",
        title:
          "Document is submitted in ERP. Unsaved Doc edits will not post — void/amend in Vanilla or Revert.",
      };
    }
    return {
      text: "Submitted",
      tone: "posted",
      title: "Submitted in ERP — editing is locked in Doc; open Vanilla to void/amend.",
    };
  }
  if (userEdited) {
    return {
      text: "Draft · unsaved changes",
      tone: "draft-dirty",
      title: "Draft with local edits not yet saved to ERP.",
    };
  }
  if (isNewBlank) {
    return {
      text: "Blank draft · nothing to save yet",
      tone: "draft",
      title: "New document not yet saved to ERP — enter data, then Save draft.",
    };
  }
  return {
    text: "Draft · all saved",
    tone: "draft",
    title: "Saved draft — no local edits pending.",
  };
}

/**
 * Scroll/focus the primary finalize control (Save draft & submit).
 * Focus only — never activate (.click). Activation is Enter/Space on the
 * control that already has focus (Back to top must not submit).
 * @param {HTMLElement|null|undefined} submitEl
 * @returns {boolean} true if focused
 */
export function focusFinalizeControl(submitEl) {
  if (!submitEl || typeof submitEl.focus !== "function") return false;
  try {
    if (typeof submitEl.scrollIntoView === "function") {
      submitEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  } catch {
    /* ignore scroll failures in headless */
  }
  try {
    submitEl.focus({ preventScroll: true });
  } catch {
    try {
      submitEl.focus();
    } catch {
      return false;
    }
  }
  if (typeof document !== "undefined") {
    return document.activeElement === submitEl;
  }
  return true;
}

/**
 * True for unsaved ERP "new" doc names (nothing persisted yet).
 * @param {string|null|undefined} name
 * @returns {boolean}
 */
export function isNewBlankDocName(name) {
  const n = name == null ? "" : String(name).trim();
  return !n || n === "new" || n.startsWith("new-");
}

/**
 * Before Save: flush focused line/header input so native `change` runs, then
 * wait briefly for any in-flight setItem. Never block Save forever.
 * @param {{ getInFlight?: () => Promise<unknown>|null|undefined, waitMs?: number }} [opts]
 * @returns {Promise<{ flushed: boolean, timedOut: boolean }>}
 */
export async function flushPendingFieldEdits(opts = {}) {
  const waitMs = opts.waitMs ?? 8000;
  let flushed = false;
  const active = typeof document !== "undefined" ? document.activeElement : null;
  if (
    active &&
    typeof active.matches === "function" &&
    (active.matches("#items-body input[data-row]") ||
      active.matches("input[data-field], textarea[data-field]"))
  ) {
    active.dispatchEvent(new Event("change", { bubbles: true }));
    flushed = true;
    await new Promise((r) => setTimeout(r, 0));
  }
  const inFlight = opts.getInFlight && opts.getInFlight();
  let timedOut = false;
  if (inFlight) {
    timedOut = !(await racePromise(inFlight, waitMs));
  }
  return { flushed, timedOut };
}

/**
 * @param {Promise<unknown>} promise
 * @param {number} ms
 * @returns {Promise<boolean>} true if promise settled first
 */
export function racePromise(promise, ms) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      resolve(ok);
    };
    Promise.resolve(promise).then(
      () => finish(true),
      () => finish(true),
    );
    setTimeout(() => finish(false), ms);
  });
}

/**
 * Vanilla list standard-filter field to focus after Find (SSoT).
 * Bill → Supplier Invoice No. (`bill_no`); PO / Item Receipt → ID (`name`).
 * @param {string|null|undefined} doctypeKey
 * @returns {string|null}
 */
export function findListFocusField(doctypeKey) {
  const key = String(doctypeKey || "")
    .toLowerCase()
    .replace(/_/g, "-");
  if (key === "purchase-invoice") return "bill_no";
  if (key === "purchase-order") return "name";
  if (key === "purchase-receipt") return "name";
  return null;
}

/**
 * Clerk-facing label for {@link findListFocusField} (status / dogfood).
 * @param {string|null|undefined} doctypeKey
 * @returns {string|null}
 */
export function findListFocusLabel(doctypeKey) {
  const field = findListFocusField(doctypeKey);
  if (field === "bill_no") return "Supplier Invoice No.";
  if (field === "name") return "ID";
  return null;
}
