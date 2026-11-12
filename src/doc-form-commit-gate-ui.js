/**
 * The commit gate's flow, written once for every Doc form page (plan 2026-10-25, R6a-1 step 2):
 * the one gate a toolbar action (Find / New / Print) or a navigation opens over unsaved work, its
 * choices (Cancel, Discard, Save draft, Save & submit, then continue), and the live ERP meta
 * preflight while it is open. The DOM helpers it paints with are `doc-commit-gate-ui.js`.
 *
 * The Bill and doc-form pages both call this; what differs comes in through `deps`: the words
 * ("Doc Bill" or the form's title), the save blockers and how the preflight reads them, the save,
 * what a discard repaints, and the toolbar actions. A save that fails is worded by
 * `save-failure.js` on every form: the page's `save` returns those words (`failure`), and the gate
 * shows them while it is open. A toolbar Save or Submit that fails opens no gate: the page says so
 * in its status line and a toast (5zorro: no blocking dialog unless the gate is the point).
 */

import {
  commitGateTitleText,
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
 *   save: (submit: boolean) => Promise<{ ok?: boolean, reason?: string, blockers?: string[], failure?: import("./save-failure.js").SaveFailure }|null|undefined>,
 *   afterDiscard: (res: any, trigger: any) => void,
 *   runAction: (action: string, trigger: any) => Promise<void>,
 *   announceBlocker: (text: string, blockers?: string[]) => void,
 *   text: {
 *     title: () => string,
 *     triggerLabel: (trigger: any) => string,
 *     readyTitle: () => string,
 *     cancelHint: () => string,
 *     saveWarning: (blockers: string[]) => string,
 *   },
 * }} CommitGateDeps
 *
 * `preflight`: `can` says whether there is anything to ask; `read` asks ERPNext (mandatory fields,
 * and on the Bill account companies); `apply(result)` stores the blockers it found — `apply(null)`
 * when the read failed. Only the newest read is applied. `setMetaBlockers`: a refused save names its
 * blockers; the gate stores them. `announceBlocker`: Save chosen while blocked. The page's `save` has already said a failure in
 * its status line and toast; the gate shows the same words (`failure.gate`).
 */

/** @param {CommitGateDeps} deps */
export function createCommitGate(deps) {
  /** @type {any} GateTrigger | null — the one gate's reason to be open */
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
    const refused = saveRes && Array.isArray(saveRes.blockers) ? saveRes.blockers.filter(Boolean) : [];
    setBusy(false);
    const failure = saveRes && saveRes.failure;
    // No answer: its texts were scraped off ERPNext's page and may be stale — not blockers.
    if (refused.length && !(failure && failure.kind === "no-answer")) deps.setMetaBlockers(refused);
    if (failure && failure.gate) {
      paintCommitGateValidation(els(), failure.gate);
    } else {
      const reason = (saveRes && saveRes.reason) || "Save failed.";
      paintCommitGateValidation(els(), { blockers: refused.length ? deps.saveBlockers() : [reason], blocked: true, title: "Save is blocked by:", hint: deps.text.cancelHint() });
    }
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
    cancelFromOutside,
    resolve,
    requestToolbarAction,
    navRequested,
    navCancelled,
  };
}
