/**
 * Bill Doc-form load phase — pure refocus/retry policy (main-process SSoT).
 * Tracks whether a Vanilla waitForForm is in flight vs failed vs ready.
 */

export const BILL_LOAD_IDLE = "idle";
export const BILL_LOAD_LOADING = "loading";
export const BILL_LOAD_FAILED = "failed";
export const BILL_LOAD_READY = "ready";

/**
 * @param {{ hasDoc?: boolean, phase?: string }} ctx
 * @returns {"refocus"|"skip"|"reload"}
 */
export function billRefocusAction(ctx) {
  const c = ctx && typeof ctx === "object" ? ctx : {};
  if (c.hasDoc) return "refocus";
  if (c.phase === BILL_LOAD_LOADING) return "skip";
  return "reload";
}

/**
 * @param {boolean} snapOk
 * @returns {typeof BILL_LOAD_READY | typeof BILL_LOAD_FAILED}
 */
export function billLoadPhaseAfterSnap(snapOk) {
  return snapOk ? BILL_LOAD_READY : BILL_LOAD_FAILED;
}
