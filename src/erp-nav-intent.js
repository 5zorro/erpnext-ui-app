/**
 * Guard against stale ERP did-navigate events overwriting an intentional shell nav.
 * Example: Home → Purchase Order while Vanilla still sits on a Bill — a late Bill
 * in-page event must not flip currentRoute / Doc-hijack back to the Bill.
 */

import { routeInfo, routesReferToSameDoc, normalizeAppRoute } from "./route-info.js";

/**
 * Arm-or-clear decision for an intentional shell navigation.
 *
 * Only `/app/…` destinations can be guarded: the guard matches on doctype, so a
 * doctype-less destination (`/desk`, `/`, `/login`) would never accept its own
 * arrival and would block every event for the whole timeout. Those destinations
 * must therefore **clear** — leaving a stale intent armed is worse than no guard:
 * it rejects the real arrival (currentRoute never updates, and the route poll
 * cannot repair it) while still accepting late in-page events from the page we
 * just left, which write the old route back.
 *
 * @param {string|null|undefined} destination route or URL we mean to open
 * @param {string} [erpBase]
 * @returns {{ action: "arm", path: string }|{ action: "clear" }}
 */
export function resolveErpNavIntent(destination, erpBase) {
  const raw = destination == null ? "" : String(destination);
  if (!raw) return { action: "clear" };
  const path = normalizeAppRoute(raw, erpBase).path || raw;
  if (!path.startsWith("/app/")) return { action: "clear" };
  return { action: "arm", path };
}

/**
 * When shell is navigating to a doctype list (Find), stale in-SPA form URLs for the
 * same doctype must not hijack back to Doc skin (OI-054 Find jump / OI-127).
 *
 * @param {string|null|undefined} intentPath /app/… path we meant to open
 * @param {string} incomingUrl ERP URL or /app path from did-navigate
 * @param {string} [erpBase]
 * @returns {boolean}
 */
export function shouldBlockDocHijackForListIntent(intentPath, incomingUrl, erpBase) {
  if (!intentPath || !incomingUrl) return false;
  const intent = routeInfo(intentPath, erpBase);
  const incoming = routeInfo(incomingUrl, erpBase);
  return !!(
    intent.doctype &&
    !intent.record &&
    incoming.doctype === intent.doctype &&
    incoming.record
  );
}

/**
 * Whether an ERP URL event may update shell route / hijack while an intent is active.
 * Same doctype (incl. /new → new-*-hash) or same doc is accepted; cross-doctype is stale.
 *
 * @param {string|null|undefined} intentPath /app/… path we meant to open
 * @param {string} incomingUrl ERP URL or /app path from did-navigate
 * @param {string} [erpBase]
 * @returns {boolean}
 */
export function shouldAcceptErpTrackNav(intentPath, incomingUrl, erpBase) {
  if (!intentPath) return true;
  if (typeof incomingUrl !== "string" || !incomingUrl) return false;
  // List intent must not treat a stale same-doctype form URL as "arrived" (OI-054 Find).
  if (shouldBlockDocHijackForListIntent(intentPath, incomingUrl, erpBase)) return false;
  if (routesReferToSameDoc(intentPath, incomingUrl, erpBase)) return true;
  const intent = routeInfo(intentPath, erpBase);
  const incoming = routeInfo(incomingUrl, erpBase);
  if (intent.doctype && incoming.doctype && intent.doctype === incoming.doctype) return true;
  return false;
}

/**
 * Clear intent once the browser reports a URL for the intended doctype.
 * Optimistic shell trackNav must not clear — stale events can still arrive.
 *
 * **`fromBrowser` must be opted into, not defaulted into.** This used to clear unless
 * `fromBrowser === false`, so any caller that simply omitted the flag disarmed the guard.
 * `erpForceReopenRoute` did exactly that: it armed an intent, called `loadURL`, then
 * optimistically `trackNav(target)` — clearing the intent ~3ms later, while the page we were
 * leaving still had navigations in flight. Nav incident 2026-09-08T03:39: a Payment Entry
 * the shell had already rejected as stale three times was accepted the fourth time (guard
 * gone), rewrote `currentRoute`, and was then misread as a deliberate soft-peek hop — the
 * clerk clicked Default-skin on a Bill and landed on New Payment Entry.
 *
 * A missing flag now means "the shell believes this, the browser has not confirmed it",
 * which is the safe reading: the intent stays armed until a real browser event (or the
 * 15s timeout, or the route poll reading the live URL) resolves it.
 *
 * @param {string|null|undefined} intentPath
 * @param {string} incomingUrl
 * @param {{ fromBrowser?: boolean }} [opts] `fromBrowser: true` = a real browser event
 * @param {string} [erpBase]
 * @returns {boolean} true if intent should clear
 */
export function shouldClearErpNavIntent(intentPath, incomingUrl, opts = {}, erpBase) {
  if (!intentPath || opts.fromBrowser !== true) return false;
  return shouldAcceptErpTrackNav(intentPath, incomingUrl, erpBase);
}
