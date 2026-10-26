/**
 * The commit gate's flow, written once for every Doc form page (plan 2026-10-25, R6a-1 step 2):
 * the one gate a toolbar action (Find / New / Print) or a navigation opens over unsaved work, its
 * choices (Cancel, Discard, Save draft, Save & submit, then continue), the live ERP meta preflight
 * while it is open, and — on pages that ask for it — the direct-save gate that shows why a Save or
 * Submit was refused. The DOM helpers it paints with are `doc-commit-gate-ui.js`.
 *
 * The Bill and doc-form pages both call this; what differs comes in through `deps`: the words
 * (the Bill keeps its own — "Doc Bill", "Save did not finish" on a timeout), the save blockers and
 * how the preflight reads them, the save, what a discard repaints, and the toolbar actions.
 */

import {
  commitGateTitleText,
  configureDirectSaveGateChrome,
  hideCommitGateEl,
  paintCommitGateValidation,
  setCommitGateBusy,
  showCommitGate,
} from "./doc-commit-gate-ui.js";
import { commitGateAllowsAction, normalizeCommitGateChoice, shouldOpenCommitGate } from "./bill-toolbar.js";
import { commitGateSaveEnabled, nextAfterGate } from "./bill-action-flow.js";

/**
 * @typedef {{
 *   els: () => import("./doc-commit-gate-ui.js").CommitGateElements,
 *   api: () => any,
 *   lastDoc: () => any,
 *   userEdited: () => boolean,
 *   setStatus: (text: string, cls?: string) => void,
 *   focusSurface: () => void,
 *   saveBlockers: () => string[],
 *   setMetaBlockers: (blockers: string[]) => void,
 *   preflight: { can: () => boolean, read: () => Promise<any>, apply: (result: any) => void },
 *   save: (submit: boolean) => Promise<{ ok?: boolean, reason?: string, blockers?: string[] }|null|undefined>,
 *   afterDiscard: (res: any, trigger: any) => void,
 *   runAction: (action: string, trigger: any) => Promise<void>,
 *   announceBlocker: (text: string, blockers?: string[]) => void,
 *   afterSaveRefused?: (reason: string, blockers?: string[]) => void,
 *   text: {
 *     title: () => string,
 *     triggerLabel: (trigger: any) => string,
 *     readyTitle: () => string,
 *     cancelHint: () => string,
 *     saveWarning: (blockers: string[]) => string,
 *     erpFailureView: (reason: string) => object,
 *   },
 *   directSave?: { copyEl: () => HTMLElement|null|undefined },
 * }} CommitGateDeps
 *
 * `preflight`: `can` says whether there is anything to ask; `read` asks ERPNext (mandatory fields,
 * and on the Bill account companies); `apply(result)` stores the blockers it found — `apply(null)`
 * when the read failed. Only the newest read is applied. `setMetaBlockers`: a refused save names its
 * blockers; the gate stores them and shows `saveBlockers()` again. `announceBlocker`: Save chosen
 * while blocked. `afterSaveRefused`: after the gate shows a refused save (the Bill also says it in
 * the status line). `directSave`: the page has the direct-save gate (`copyEl`: its explanation line).
 */

/** @param {CommitGateDeps} deps */
export function createCommitGate(deps) {
  /** @type {any} GateTrigger | { kind: "direct-save", submit } | null — the one gate's reason to be open */
  let pending = null;
  let preflightSeq = 0;

  const els = () => deps.els();
  const resolveNav = (token, proceed) => {
    const api = deps.api();
    if (token && api && api.resolveNavGate) api.resolveNavGate(token, proceed);
  };
  const isOpen = () => {
    const gate = els().commitGate;
    return !!(pending && gate && !gate.hidden);
  };

  function isNewDoc() {
    const doc = deps.lastDoc();
    return !!(doc && (doc.__islocal || !doc.name || String(doc.name).startsWith("new") || doc.name === "new"));
  }

  function toolbarAction() {
    if (!pending) return "";
    if (pending.kind === "toolbar") return pending.action;
    if (pending.kind === "direct-save") return "direct-save";
    return "";
  }

  function setBusy(busy) {
    setCommitGateBusy(els(), {
      busy,
      toolbarAction: toolbarAction(),
      isNewDoc: isNewDoc(),
      docTitle: deps.text.title(),
      getSaveBlockers: deps.saveBlockers,
    });
  }

  function hide() {
    pending = null;
    if (deps.directSave) configureDirectSaveGateChrome(els(), { active: false, copyEl: deps.directSave.copyEl() });
    hideCommitGateEl(els());
    setBusy(false);
  }

  function refreshHint() {
    const blockers = deps.saveBlockers();
    paintCommitGateValidation(els(), {
      blockers,
      blocked: blockers.length > 0,
      title: blockers.length ? "Save is blocked by:" : deps.text.readyTitle(),
      cancelHint: deps.text.cancelHint(),
      saveWarning: () => deps.text.saveWarning(blockers),
    });
    setBusy(false);
  }

  async function refreshPreflight() {
    if (!deps.preflight.can()) return;
    const seq = ++preflightSeq;
    let result = null;
    try {
      result = await deps.preflight.read();
    } catch {
      result = null;
    }
    if (seq !== preflightSeq) return; // superseded
    deps.preflight.apply(result);
    if (isOpen()) refreshHint();
  }

  function show() {
    showCommitGate(els(), { focusSurface: deps.focusSurface });
    void refreshPreflight();
  }

  /** One gate, opened by either a toolbar action or a navigation. */
  function open(trigger) {
    // Last click wins: release a superseded navigation's waiter so main can't leak it.
    if (pending && pending.kind === "nav" && pending.navToken && !(trigger && trigger.kind === "nav" && trigger.navToken === pending.navToken)) {
      resolveNav(pending.navToken, false);
    }
    pending = trigger;
    const e = els();
    if (e.commitGateTitle) e.commitGateTitle.textContent = commitGateTitleText(deps.text.triggerLabel(trigger));
    refreshHint();
    show();
  }

  /** Save or Submit was refused before it reached ERPNext (or ERPNext refused it): say why, offer it again. */
  function openDirectSaveBlocked(blockers, opts = {}) {
    if (!deps.directSave) return;
    pending = { kind: "direct-save", submit: !!opts.submit };
    const e = els();
    if (e.commitGateTitle) e.commitGateTitle.textContent = opts.submit ? "Cannot submit yet" : "Cannot save yet";
    configureDirectSaveGateChrome(e, { submit: !!opts.submit, active: true, copyEl: deps.directSave.copyEl() });
    if (opts.erpFailure) {
      paintCommitGateValidation(e, deps.text.erpFailureView(opts.reason));
    } else {
      paintCommitGateValidation(e, { blockers, blocked: true, title: "Save is blocked by:", cancelHint: deps.text.cancelHint() });
    }
    setBusy(false);
    show();
  }

  function cancelFromOutside() {
    const gate = els().commitGate;
    if (!gate || gate.hidden) return;
    const cancel = gate.querySelector("[data-gate='cancel']");
    if (cancel && !cancel.disabled) void resolve("cancel");
  }

  /** Save from the gate. False (gate kept open, the reason shown) when it was blocked or refused. */
  async function saveFromGate(choice) {
    const blockers = deps.saveBlockers();
    if (!commitGateSaveEnabled(blockers)) {
      refreshHint();
      deps.announceBlocker(blockers[0] || "Fix save prerequisites first.", blockers);
      return false;
    }
    setBusy(true);
    const saveRes = await deps.save(choice === "submit");
    if (saveRes && saveRes.ok) return true;
    const reason = (saveRes && saveRes.reason) || "Save failed.";
    const refused = saveRes && Array.isArray(saveRes.blockers) ? saveRes.blockers : undefined;
    setBusy(false);
    if (refused && refused.length) {
      deps.setMetaBlockers(refused);
      paintCommitGateValidation(els(), { blockers: deps.saveBlockers(), blocked: true, title: "Save is blocked by:", hint: deps.text.cancelHint() });
    } else {
      paintCommitGateValidation(els(), deps.text.erpFailureView(reason));
    }
    if (deps.afterSaveRefused) deps.afterSaveRefused(reason, refused);
    return false;
  }

  async function resolve(choiceRaw) {
    const choice = normalizeCommitGateChoice(choiceRaw);
    const trigger = pending;
    const navToken = trigger && trigger.kind === "nav" ? trigger.navToken : null;

    // Cancel / unknown / nothing pending → stay; release any nav waiter in main.
    if (!trigger || !choice || choice === "cancel") {
      hide();
      resolveNav(navToken, false);
      return;
    }

    if (trigger.kind === "direct-save") {
      if ((choice === "save" || choice === "submit") && (await saveFromGate(choice))) hide();
      return;
    }

    // Toolbar-only guard: e.g. Print on a brand-new (unsaved) document after discard.
    if (trigger.kind === "toolbar") {
      const allow = commitGateAllowsAction(trigger.action, choice, { isNew: isNewDoc() });
      if (!allow.ok) {
        deps.setStatus(allow.reason || "Cannot continue.", "warn");
        return;
      }
    }

    const plan = nextAfterGate(trigger, choice);
    if (plan.then === "close") {
      hide();
      resolveNav(navToken, false);
      return;
    }

    // Perform the chosen side effect. On failure, KEEP the gate open (no hang, no orphan).
    if (choice === "discard") {
      setBusy(true);
      deps.setStatus("Discarding unsaved changes…");
      const res = await deps.api().revertUnsaved();
      if (!(res && res.ok)) {
        deps.setStatus((res && res.reason) || "Discard failed.", "err");
        setBusy(false);
        return;
      }
      deps.afterDiscard(res, trigger);
    } else if (choice === "save" || choice === "submit") {
      if (!(await saveFromGate(choice))) return;
    }

    hide();
    if (plan.then === "proceed-nav") resolveNav(navToken, true);
    else await deps.runAction(trigger.action, trigger);
  }

  /** Find / New / Print: straight through on a clean page, through the gate on unsaved work. */
  async function requestToolbarAction(action, extra = null) {
    if (!deps.api()) return;
    const trigger = extra && typeof extra === "object" ? { kind: "toolbar", action, ...extra } : { kind: "toolbar", action };
    if (!shouldOpenCommitGate(deps.userEdited())) {
      hide();
      await deps.runAction(action, trigger);
      return;
    }
    open(trigger);
  }

  /** Main asks before leaving (Home / Vanilla / Recent): proceed on a clean page, else the gate. */
  function navRequested(token, label) {
    if (!token) return;
    if (!shouldOpenCommitGate(deps.userEdited())) {
      resolveNav(token, true);
      return;
    }
    open({ kind: "nav", navToken: token, label });
  }

  /** Main withdrew that navigation: close the gate if it was asking about it. */
  function navCancelled(token) {
    if (pending && pending.kind === "nav" && pending.navToken === token) hide();
  }

  return {
    hide,
    refreshHint,
    refreshPreflight,
    openDirectSaveBlocked,
    cancelFromOutside,
    resolve,
    requestToolbarAction,
    navRequested,
    navCancelled,
  };
}
