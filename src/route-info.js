/**
 * Parse ERPNext desk/app routes — SSoT for history + later Doc binding.
 */

/**
 * @param {string} routeOrUrl path like "/desk/purchase-invoice/new" or full URL
 * @param {string} [erpBase] if provided, strip origin first
 * @returns {{ path: string, doctype: string, record: string }}
 */
export function routeInfo(routeOrUrl, erpBase) {
  let path = typeof routeOrUrl === "string" ? routeOrUrl : "";
  if (erpBase) {
    const base = String(erpBase).replace(/\/+$/, "");
    if (path.startsWith(base)) path = path.slice(base.length) || "/";
  }
  // Accept absolute http(s) without erpBase by taking pathname
  try {
    if (/^https?:\/\//i.test(path)) {
      path = new URL(path).pathname || "/";
    }
  } catch {
    /* keep path */
  }
  if (!path.startsWith("/")) path = `/${path}`;
  const segments = path.split(/[?#]/)[0].split("/").filter(Boolean);
  let i = segments.indexOf("desk");
  if (i < 0) i = segments.indexOf("app");
  const doctype = i >= 0 && segments[i + 1] ? segments[i + 1] : "";
  const record = i >= 0 && segments[i + 2] ? segments[i + 2] : "";
  return { path: path.split(/[?#]/)[0], doctype, record };
}

/**
 * @param {string} slug e.g. "purchase-invoice"
 */
export function titleizeDoctype(slug) {
  if (!slug) return "";
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

/**
 * True when ERP record segment is a "new" form (unsaved name).
 * @param {string} record
 */
export function isNewDocRecord(record) {
  const r = record == null ? "" : String(record);
  if (!r || r === "new") return true;
  return r.startsWith("new-");
}

/**
 * Generic ERP "new document" route (`…/new`) — clerk expects a blank draft, not an existing `new-*` tab.
 * @param {string} routeOrUrl
 * @param {string} [erpBase]
 */
export function isGenericNewDocRoute(routeOrUrl, erpBase) {
  const n = normalizeAppRoute(routeOrUrl, erpBase);
  return n.isNew && (!n.record || n.record === "new");
}

/**
 * Normalize Bill-ish paths so /desk/… and /app/… compare equal.
 * @param {string} routeOrUrl
 * @param {string} [erpBase]
 * @returns {{ path: string, doctype: string, record: string, isNew: boolean }}
 */
export function normalizeAppRoute(routeOrUrl, erpBase) {
  const info = routeInfo(routeOrUrl, erpBase);
  let path = info.path || "/";
  if (path.startsWith("/desk/")) {
    path = `/app/${path.slice("/desk/".length)}`;
  }
  const again = routeInfo(path, erpBase);
  return {
    path: again.path,
    doctype: again.doctype,
    record: again.record,
    isNew: isNewDocRecord(again.record),
  };
}

/**
 * True when URL is a doctype **list** (no record / not /new).
 * @param {string|null|undefined} doctypeKey e.g. purchase-order
 * @param {string} routeOrUrl
 * @param {string} [erpBase]
 */
export function isDocListRoute(doctypeKey, routeOrUrl, erpBase) {
  const key = String(doctypeKey || "")
    .toLowerCase()
    .replace(/_/g, "-");
  if (!key) return false;
  const n = normalizeAppRoute(routeOrUrl, erpBase);
  return n.doctype === key && !n.record;
}

/**
 * Same document target? Used to skip reload when Recent / lens re-opens the page you're on.
 * New drafts (`new`, `new-purchase-invoice-…`) count as the same "new Bill" surface.
 *
 * @param {string} currentRoute
 * @param {string} nextRoute
 * @param {string} [erpBase]
 */
export function routesReferToSameDoc(currentRoute, nextRoute, erpBase) {
  const a = normalizeAppRoute(currentRoute, erpBase);
  const b = normalizeAppRoute(nextRoute, erpBase);
  if (!a.doctype || a.doctype !== b.doctype) return false;
  if (a.isNew && b.isNew) {
    const recA = a.record || "new";
    const recB = b.record || "new";
    if (recA === recB) return true;
    // In-flight: Frappe promotes `/new` → `new-doctype-…` (same draft).
    if (recA === "new" && recB.startsWith("new-")) return true;
    return false;
  }
  return !!(a.record && a.record === b.record);
}
