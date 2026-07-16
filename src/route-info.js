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
