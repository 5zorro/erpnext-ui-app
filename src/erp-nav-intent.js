/**
 * Guard against stale ERP did-navigate events overwriting an intentional shell nav.
 * Example: Home → Purchase Order while Vanilla still sits on a Bill — a late Bill
 * in-page event must not flip currentRoute / Doc-hijack back to the Bill.
 */

import { routeInfo, routesReferToSameDoc } from "./route-info.js";

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
  if (routesReferToSameDoc(intentPath, incomingUrl, erpBase)) return true;
  const intent = routeInfo(intentPath, erpBase);
  const incoming = routeInfo(incomingUrl, erpBase);
  if (intent.doctype && incoming.doctype && intent.doctype === incoming.doctype) return true;
  return false;
}

/**
 * Clear intent once the browser reports a URL for the intended doctype.
 * Optimistic shell trackNav (fromBrowser=false) must not clear — stale events can still arrive.
 *
 * @param {string|null|undefined} intentPath
 * @param {string} incomingUrl
 * @param {{ fromBrowser?: boolean }} [opts]
 * @param {string} [erpBase]
 * @returns {boolean} true if intent should clear
 */
export function shouldClearErpNavIntent(intentPath, incomingUrl, opts = {}, erpBase) {
  if (!intentPath || opts.fromBrowser === false) return false;
  return shouldAcceptErpTrackNav(intentPath, incomingUrl, erpBase);
}
