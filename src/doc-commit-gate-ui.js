/**
 * Shared commit-gate DOM helpers — Bill + doc-form shells.
 * Controllers keep pendingGate, save blockers, and resolve/save orchestration.
 */

import { commitGateChoiceEnabled } from "./bill-toolbar.js";
import { commitGateSaveEnabled } from "./bill-action-flow.js";

/**
 * @typedef {{
 *   commitGate?: HTMLElement|null,
 *   commitGateBackdrop?: HTMLElement|null,
 *   commitGateTitle?: HTMLElement|null,
 *   commitGateValidation?: HTMLElement|null,
 *   commitGateValidationTitle?: HTMLElement|null,
 *   commitGateBlockers?: HTMLOListElement|null,
 *   commitGateHint?: HTMLElement|null,
 * }} CommitGateElements
 */

/**
 * @param {CommitGateElements} els
 * @param {{
 *   blockers?: string[],
 *   blocked?: boolean,
 *   title?: string,
 *   hint?: string,
 *   readyTitle?: string,
 *   cancelHint?: string,
 *   saveWarning?: (blockers: string[]) => string,
 * }} opts
 */
export function paintCommitGateValidation(els, opts = {}) {
  if (!els.commitGateHint) return;
  const blockers = Array.isArray(opts.blockers) ? opts.blockers.filter(Boolean) : [];
  const blocked = opts.blocked != null ? !!opts.blocked : blockers.length > 0;
  if (els.commitGateValidation) {
    els.commitGateValidation.className = "commit-gate-validation " + (blocked ? "blocked" : "ready");
  }
  if (els.commitGateValidationTitle) {
    els.commitGateValidationTitle.textContent =
      opts.title ||
      (blocked ? "Save is blocked by:" : opts.readyTitle || "Doc + live ERP meta preflight passed");
  }
  if (els.commitGateBlockers) {
    els.commitGateBlockers.replaceChildren(
      ...blockers.map((blocker) => {
        const item = document.createElement("li");
        item.textContent = blocker;
        return item;
      }),
    );
    els.commitGateBlockers.hidden = blockers.length === 0;
  }
  const saveWarning =
    typeof opts.saveWarning === "function" ? opts.saveWarning(blockers) : "";
  els.commitGateHint.textContent =
    opts.hint ||
    (blocked
      ? opts.cancelHint || "Choose Cancel to return and fix these fields."
      : saveWarning);
  els.commitGateHint.className = "hint" + (blocked ? " warn" : "");
}

/**
 * @param {CommitGateElements} els
 * @param {{
 *   busy: boolean,
 *   toolbarAction?: string,
 *   isNewDoc?: boolean,
 *   docTitle?: string,
 *   getSaveBlockers?: () => string[],
 * }} ctx
 */
export function setCommitGateBusy(els, ctx) {
  if (!els.commitGate) return;
  const action = ctx.toolbarAction || "";
  const isNew = !!ctx.isNewDoc;
  const docTitle = ctx.docTitle || "document";
  const blockers = ctx.getSaveBlockers ? ctx.getSaveBlockers() : [];
  els.commitGate.querySelectorAll("[data-gate]").forEach((btn) => {
    const choice = btn.getAttribute("data-gate");
    if (ctx.busy) {
      btn.disabled = true;
      return;
    }
    if (!commitGateChoiceEnabled(action, choice, { isNew })) {
      btn.disabled = true;
      if (choice === "discard" && action === "print" && isNew) {
        btn.title = `Discarding a new ${docTitle} leaves nothing to print — Save draft or Cancel.`;
      }
      return;
    }
    btn.title = "";
    if (choice === "save" || choice === "submit") {
      btn.disabled = !commitGateSaveEnabled(blockers);
    } else {
      btn.disabled = false;
    }
  });
}

/**
 * @param {string} triggerLabel
 */
export function commitGateTitleText(triggerLabel) {
  return `Unsaved changes — before ${triggerLabel}`;
}

/**
 * @param {CommitGateElements} els
 * @param {{ focusSurface?: () => void }} [opts]
 */
export function showCommitGate(els, opts = {}) {
  if (els.commitGate) els.commitGate.hidden = false;
  if (opts.focusSurface) opts.focusSurface();
  requestAnimationFrame(() => {
    const cancel = els.commitGate && els.commitGate.querySelector("[data-gate='cancel']");
    if (cancel && typeof cancel.focus === "function") cancel.focus();
  });
}

/** @param {CommitGateElements} els */
export function hideCommitGateEl(els) {
  if (els.commitGate) els.commitGate.hidden = true;
}

const DIRECT_SAVE_GATE_LABELS = Object.freeze({
  save: "Save draft",
  submit: "Save & submit",
});

const NAV_GATE_LABELS = Object.freeze({
  save: "Save draft, then continue",
  submit: "Save & submit, then continue",
});

/**
 * Direct Save / Submit toolbar path — hide discard and drop "then continue" copy.
 * @param {CommitGateElements} els
 * @param {{ submit?: boolean, active?: boolean, copyEl?: HTMLElement|null }} opts
 */
export function configureDirectSaveGateChrome(els, opts = {}) {
  if (!els.commitGate) return;
  const active = opts.active !== false;
  els.commitGate.dataset.gateMode = active ? "direct-save" : "";
  const discard = els.commitGate.querySelector("[data-gate='discard']");
  const save = els.commitGate.querySelector("[data-gate='save']");
  const submit = els.commitGate.querySelector("[data-gate='submit']");
  const labels = active ? DIRECT_SAVE_GATE_LABELS : NAV_GATE_LABELS;
  if (discard) discard.hidden = active;
  if (save) save.textContent = labels.save;
  if (submit) submit.textContent = labels.submit;
  if (opts.copyEl) {
    opts.copyEl.textContent = active
      ? "Fix the issues below, then try Save draft or Save & submit again."
      : "This decision must be resolved before you can continue.";
  }
  if (active && opts.submit && save) save.hidden = true;
  else if (save) save.hidden = false;
  if (active && !opts.submit && submit) submit.hidden = true;
  else if (submit) submit.hidden = false;
}

/**
 * @param {CommitGateElements} els
 * @param {{ onResolveChoice: (choice: string|null) => void, onCancelOutside: () => void, trapTab?: boolean }} handlers
 */
export function wireCommitGateChrome(els, handlers) {
  if (!els.commitGate) return;
  els.commitGate.querySelectorAll("[data-gate]").forEach((btn) => {
    btn.addEventListener("click", () =>
      handlers.onResolveChoice(btn.getAttribute("data-gate")),
    );
  });
  const onBackdrop = (ev) => {
    ev.preventDefault();
    handlers.onCancelOutside();
  };
  if (els.commitGateBackdrop) {
    els.commitGateBackdrop.addEventListener("mousedown", onBackdrop);
    els.commitGateBackdrop.addEventListener("click", onBackdrop);
  } else {
    els.commitGate.addEventListener("mousedown", (ev) => {
      if (ev.target.closest(".commit-gate-dialog")) return;
      onBackdrop(ev);
    });
  }
  els.commitGate.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      handlers.onCancelOutside();
      return;
    }
    if (!handlers.trapTab || ev.key !== "Tab") return;
    const choices = [...els.commitGate.querySelectorAll("[data-gate]:not(:disabled)")];
    if (!choices.length) {
      ev.preventDefault();
      return;
    }
    const first = choices[0];
    const last = choices[choices.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first.focus();
    }
  });
}
