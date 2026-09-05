/**
 * Recent / Doc-lens navigation policy (OI-112 / OI-113 / OI-118).
 * Pure helpers — Electron main decides surfaces; this decides *intent*.
 */
import { routeInfo, normalizeAppRoute, routesReferToSameDoc } from "./route-info.js";
import { profileByDoctypeKey } from "./doc-skin-registry.js";
import { normalizeDoctypeKey } from "./lens-prefs.js";

/** Default escape hatch when on a Vanilla master with no Doc skin. */
export const FALLBACK_DOC_ROUTE = "/app/purchase-invoice/new";

/**
 * @param {string} doctype slug from routeInfo
 * @returns {boolean}
 */
export function doctypeHasDocSkin(doctype) {
  return !!profileByDoctypeKey(doctype);
}

/**
 * Decode a path segment safely (Tax Category names with spaces).
 * @param {string} seg
 * @returns {string}
 */
export function decodeRouteSegment(seg) {
  const s = seg == null ? "" : String(seg);
  if (!s) return "";
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * frappe.set_route parts for an `/app/…` path (OI-112 soft-peek).
 * @param {string} routeOrUrl
 * @param {string} [erpBase]
 * @returns {string[]}
 */
export function appRouteParts(routeOrUrl, erpBase) {
  const n = normalizeAppRoute(routeOrUrl, erpBase);
  let path = n.path || "/";
  if (path === "/desk") return [];
  if (path.startsWith("/desk/")) path = `/app/${path.slice("/desk/".length)}`;
  if (!path.startsWith("/app/")) return [];
  return path
    .slice("/app/".length)
    .split("/")
    .filter(Boolean)
    .map(decodeRouteSegment);
}

/**
 * Soft-peekable setup / master (not Doc-skinned forms, not query reports).
 * Query reports always hard-load from Recent (OI-120 harden) — soft set_route after a
 * Bill loadURL is flaky and must not land on a random Desk workspace.
 * @param {string} routeOrUrl
 * @param {string} [erpBase]
 * @returns {boolean}
 */
export function isSoftPeekRoute(routeOrUrl, erpBase) {
  const classified = classifyHistoryOpen(routeOrUrl, erpBase);
  if (classified.mode !== "vanilla-always") return false;
  if (!classified.doctype) return false;
  if (isQueryReportRoute(routeOrUrl, erpBase)) return false;
  const path = classified.path || "";
  if (path === "/" || path === "/desk" || path === "/login" || path === "/app") return false;
  return path.startsWith("/app/") || path.startsWith("/desk/");
}

/**
 * Query Report routes (`/app/query-report/…`) — resume via forceLoad, not soft-peek.
 * @param {string} routeOrUrl
 * @param {string} [erpBase]
 * @returns {boolean}
 */
export function isQueryReportRoute(routeOrUrl, erpBase) {
  const n = normalizeAppRoute(routeOrUrl, erpBase);
  return n.doctype === "query-report";
}

/**
 * Account / template names often end with ` - HI` (company abbr).
 * @param {string|null|undefined} record
 * @param {string|null|undefined} activeAbbr
 * @returns {boolean} true when record suffix abbr ≠ active company abbr
 */
export function recordHasForeignAbbr(record, activeAbbr) {
  const abbr = activeAbbr != null ? String(activeAbbr).trim().toUpperCase() : "";
  if (!abbr) return false;
  const decoded = decodeRouteSegment(record);
  if (!decoded) return false;
  const m = decoded.match(/\s-\s([A-Za-z0-9]{2,8})$/);
  if (!m) return false;
  return m[1].toUpperCase() !== abbr;
}

/**
 * Omit cross-company noise from Recent (OI-118 HID vs HI).
 * @param {string} routeOrUrl
 * @param {{ erpBase?: string, companyAbbr?: string|null }} [opts]
 * @returns {boolean}
 */
export function shouldOmitHistoryRoute(routeOrUrl, opts = {}) {
  const n = normalizeAppRoute(routeOrUrl, opts.erpBase);
  const abbr = opts.companyAbbr != null ? String(opts.companyAbbr).trim() : "";
  if (!abbr || !n.record) return false;
  if (recordHasForeignAbbr(n.record, abbr)) return true;
  // Company form opened by abbr/name that is clearly another sandbox company
  if (n.doctype === "company") {
    const rec = decodeRouteSegment(n.record).trim().toUpperCase();
    if (rec && rec === "HID" && abbr.toUpperCase() === "HI") return true;
  }
  return false;
}

/**
 * @param {Array<{ route?: string }|null|undefined>} list
 * @param {string|null|undefined} companyAbbr
 * @param {string} [erpBase]
 * @returns {typeof list}
 */
export function filterHistoryForCompany(list, companyAbbr, erpBase) {
  const prev = Array.isArray(list) ? list : [];
  const abbr = companyAbbr != null ? String(companyAbbr).trim() : "";
  if (!abbr) return prev.slice();
  return prev.filter((h) => h && h.route && !shouldOmitHistoryRoute(h.route, { erpBase, companyAbbr: abbr }));
}

/**
 * How Recent (or equivalent) should open this route.
 * - doc-preferred: Bill / PO / IR → openRoutePreferred (Doc when prefs say so)
 * - vanilla-always: masters / setup (Tax Category, Purchase Taxes template, Company, …)
 *
 * Paths are normalized to `/app/…` when they were `/desk/…` (OI-118).
 *
 * @param {string} routeOrUrl
 * @param {string} [erpBase]
 * @returns {{ mode: "doc-preferred"|"vanilla-always", doctype: string, path: string, record: string, kind: "doc"|"setup" }}
 */
export function classifyHistoryOpen(routeOrUrl, erpBase) {
  const n = normalizeAppRoute(routeOrUrl, erpBase);
  const doctype = n.doctype || "";
  const mode = doctypeHasDocSkin(doctype) ? "doc-preferred" : "vanilla-always";
  return {
    mode,
    doctype,
    path: n.path || "/",
    record: n.record || "",
    kind: mode === "doc-preferred" ? "doc" : "setup",
  };
}

/**
 * Flyout decoration for setup vs Doc-resumable rows (OI-113).
 * @param {{ route?: string, dt?: string, label?: string, detail?: string, detailMuted?: boolean, kind?: string }} entry
 * @param {string} [erpBase]
 * @returns {typeof entry & { kind: "doc"|"setup", detailMuted: boolean }}
 */
export function decorateHistoryEntry(entry, erpBase) {
  if (!entry || typeof entry !== "object") {
    return { route: "/", dt: "", label: "", kind: "setup", detailMuted: true };
  }
  const classified = classifyHistoryOpen(entry.route || "", erpBase);
  const kind = classified.kind;
  let detail = entry.detail != null ? String(entry.detail) : "";
  let detailMuted = !!entry.detailMuted;
  if (kind === "setup") {
    if (!detail.trim()) detail = "setup";
    detailMuted = true;
  }
  return {
    ...entry,
    route: classified.path || entry.route,
    kind,
    detail,
    detailMuted,
  };
}

/**
 * Last Doc-skin form/list in Recent, else optional dirty Bill name, else new Bill.
 * Used when Doc tab is clicked on a Vanilla master (Tax Category, tax template, …).
 *
 * @param {Array<{ route?: string, dt?: string }|null|undefined>} history
 * @param {{
 *   erpBase?: string,
 *   dirtyDoctypeKey?: string|null,
 *   dirtyDocName?: string|null,
 *   fallbackRoute?: string,
 * }} [opts]
 * @returns {string}
 */
export function pickFallbackDocRoute(history, opts = {}) {
  const list = Array.isArray(history) ? history : [];
  for (const h of list) {
    if (!h || !h.route) continue;
    const n = normalizeAppRoute(h.route, opts.erpBase);
    const dt = normalizeDoctypeKey(h.dt || n.doctype);
    if (dt && profileByDoctypeKey(dt)) {
      return n.path;
    }
  }

  const dirtyKey = normalizeDoctypeKey(opts.dirtyDoctypeKey || "");
  const dirtyName =
    opts.dirtyDocName != null && String(opts.dirtyDocName).trim()
      ? String(opts.dirtyDocName).trim()
      : "";
  // Name may include spaces; encodeErpPath (nav-guard) runs at load time.
  if (dirtyKey && profileByDoctypeKey(dirtyKey) && dirtyName && !/^new/i.test(dirtyName)) {
    return `/app/${dirtyKey}/${dirtyName}`;
  }

  return opts.fallbackRoute || FALLBACK_DOC_ROUTE;
}

/**
 * Toolbar / a11y hint while a Doc form is parked under a Vanilla soft-peek,
 * or while a Vanilla-to-Vanilla peek has a parent (Payment Entry → Mode of Payment).
 * When on a peek *child*, prefer the peek parent label even if a Doc is also parked
 * (stale Bill park must not say "back to Bill" while Esc returns to Payment Entry).
 * @param {{ mode?: string, skinId?: string|null, route?: string }|null|undefined} parked
 * @param {{ dt?: string, route?: string, label?: string }|null|undefined} [peekParent]
 * @param {{ currentRoute?: string, erpBase?: string }} [opts]
 * @returns {string} empty when not peeking
 */
export function softPeekReturnLabel(parked, peekParent, opts = {}) {
  const current = opts.currentRoute != null ? String(opts.currentRoute) : "";
  const erpBase = opts.erpBase;
  if (
    peekParent &&
    peekParent.route &&
    current &&
    !routesReferToSameDoc(peekParent.route, current, erpBase)
  ) {
    return softPeekLabelForPeekParent(peekParent);
  }
  if (parked && parked.mode) {
    if (parked.skinId === "bill" || parked.mode === "bill") return "Esc · back to Bill";
    if (parked.mode === "doc" && parked.skinId === "po") return "Esc · back to Purchase Order";
    if (parked.mode === "doc" && parked.skinId === "receipt") return "Esc · back to Item Receipt";
    if (parked.mode === "doc") return "Esc · back to Doc";
    return "Esc · back";
  }
  if (peekParent && peekParent.route) return softPeekLabelForPeekParent(peekParent);
  return "";
}

/**
 * @param {{ dt?: string, label?: string }|null|undefined} peekParent
 */
export function softPeekLabelForPeekParent(peekParent) {
  const dt = peekParent && peekParent.dt ? String(peekParent.dt) : "";
  if (dt === "purchase-invoice") return "Esc · back to Bill";
  if (dt === "purchase-order") return "Esc · back to Purchase Order";
  if (dt === "purchase-receipt") return "Esc · back to Item Receipt";
  if (dt === "payment-entry") return "Esc · back to Payment Entry";
  if (dt === "mode-of-payment") return "Esc · back to Mode of Payment";
  if (peekParent && peekParent.label) return `Esc · back to ${peekParent.label}`;
  return "Esc · back";
}

/**
 * True when the ERP WebContents URL and the shell's currentRoute disagree
 * (after /desk → /app normalize). Used to repair a lied-about destination.
 * @param {string} shellRoute
 * @param {string} liveUrlOrPath
 * @param {string} [erpBase]
 * @returns {boolean}
 */
export function erpLivePathDiffers(shellRoute, liveUrlOrPath, erpBase) {
  const live = normalizeAppRoute(liveUrlOrPath, erpBase).path || "";
  const shell = normalizeAppRoute(shellRoute, erpBase).path || "";
  if (!live) return false;
  return live !== shell;
}

/**
 * True when Esc should dismiss a soft-peek (no Frappe modal stealing Esc).
 * Pure: pass DOM/dialog signals from the page.
 * @param {{
 *   softPeekArmed?: boolean,
 *   frappeDialogOpen?: boolean,
 * }} [state]
 * @returns {boolean}
 */
export function shouldEscDismissSoftPeek(state = {}) {
  if (!state.softPeekArmed) return false;
  if (state.frappeDialogOpen) return false;
  return true;
}

/**
 * Flyout re-click while Vanilla is already on that route: Chromium loadURL no-ops.
 * @param {{
 *   forceLoad?: boolean,
 *   sameRoute?: boolean,
 *   alreadyOnErp?: boolean,
 *   softPeek?: boolean,
 * }} [opts]
 * @returns {boolean}
 */
export function shouldForceVanillaReopen(opts = {}) {
  if (opts.softPeek) return false;
  if (!opts.forceLoad || !opts.sameRoute || !opts.alreadyOnErp) return false;
  return true;
}
