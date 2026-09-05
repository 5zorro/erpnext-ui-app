/**
 * Node's EventEmitter default maxListeners is 10. ERP WebContents can briefly exceed
 * that during overlapping hard navigations (Find bounce, force-reopen, chaos lag) because
 * Electron attaches internal did-stop-loading handlers per loadURL — not an unbounded leak
 * if loads complete, but noisy during dogfood.
 *
 * Budget is high enough for normal overlap; still warns if listeners accrue without draining.
 */

export const WEB_CONTENTS_LISTENER_BUDGET = 20;

/**
 * @param {import("electron").WebContents|null|undefined} webContents
 * @param {number} [max]
 * @returns {number}
 */
export function applyWebContentsListenerBudget(webContents, max = WEB_CONTENTS_LISTENER_BUDGET) {
  const budget = Number.isFinite(max) && max > 0 ? max : WEB_CONTENTS_LISTENER_BUDGET;
  if (webContents && typeof webContents.setMaxListeners === "function") {
    webContents.setMaxListeners(budget);
  }
  return budget;
}
