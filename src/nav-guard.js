/**
 * Navigation guard — only allow the ERP origin (plus blank/blob/data for print dialogs).
 */

/**
 * @param {string} erpBase
 * @param {string} url
 * @returns {boolean}
 */
export function isAllowedErpUrl(erpBase, url) {
  if (typeof url !== "string" || !url) return false;
  if (url === "about:blank") return true;
  if (url.startsWith("blob:") || url.startsWith("data:")) return true;
  if (typeof erpBase !== "string" || !erpBase) return false;
  const base = erpBase.replace(/\/+$/, "");
  return url === base || url.startsWith(base + "/") || url.startsWith(base + "?");
}

/**
 * @param {string} pathOrRoute
 * @returns {string}
 */
export function encodeErpPath(pathOrRoute) {
  const raw = typeof pathOrRoute === "string" ? pathOrRoute : "";
  if (!raw) return "/";
  const qIdx = raw.search(/[?#]/);
  const pathPart = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
  const suffix = qIdx >= 0 ? raw.slice(qIdx) : "";
  const withSlash = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
  const encoded = withSlash
    .split("/")
    .map((seg) => {
      if (!seg) return "";
      try {
        return encodeURIComponent(decodeURIComponent(seg));
      } catch {
        return encodeURIComponent(seg);
      }
    })
    .join("/");
  return encoded + suffix;
}

/**
 * @param {string} erpBase
 * @param {string} [route="/desk"]
 */
export function erpUrl(erpBase, route = "/desk") {
  const base = String(erpBase).replace(/\/+$/, "");
  const r = encodeErpPath(route.startsWith("/") ? route : `/${route}`);
  return base + r;
}
