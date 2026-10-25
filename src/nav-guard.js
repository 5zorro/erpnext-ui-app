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

/**
 * May a page the shell loaded from its own files navigate to `targetUrl`? (Architecture review
 * 2026-10-19, R1-1.) Shell pages carry a preload that can save, pay and print, so they must never
 * end up showing anything else — a file dropped on them, a link in a preview. Only the same file
 * again (another query or hash) is allowed; a blank view (Find before its first page) goes nowhere
 * by itself. Pages on http(s) — the ERP view, print workers — are not shell pages; the ERP view
 * keeps its own guard (`isAllowedErpUrl`). Navigations main starts with `loadFile` / `loadURL`
 * never reach this check.
 * @param {string} currentUrl
 * @param {string} targetUrl
 * @returns {boolean}
 */
export function isShellNavAllowed(currentUrl, targetUrl) {
  const cur = typeof currentUrl === "string" ? currentUrl : "";
  if (/^https?:/i.test(cur)) return true;
  let from;
  let to;
  try {
    from = new URL(cur);
    to = new URL(String(targetUrl || ""));
  } catch {
    return false;
  }
  return from.protocol === "file:" && to.protocol === "file:" && from.pathname === to.pathname;
}


/**
 * Where an off-ERP address in the ERP view leads (architecture review 2026-10-19, R1-3; 5zorro:
 * warn, but let the clerk click through). `erp` — not off the base at all; `web` — another
 * website, which the clerk may open in their browser or continue to here; `refuse` — any other
 * kind of address (`file:`, `ms-…:`, `javascript:` …), which is never opened.
 * @param {string} erpBase
 * @param {string} url
 * @returns {{ kind: "erp" } | { kind: "web", host: string, url: string } | { kind: "refuse", scheme: string, url: string }}
 */
export function offBaseNavigation(erpBase, url) {
  if (isAllowedErpUrl(erpBase, url)) return { kind: "erp" };
  let u;
  try {
    u = new URL(String(url || ""));
  } catch {
    return { kind: "refuse", scheme: "", url: String(url || "") };
  }
  if (u.protocol === "http:" || u.protocol === "https:") return { kind: "web", host: u.host, url: u.href };
  return { kind: "refuse", scheme: u.protocol.replace(/:$/, ""), url: u.href };
}

/**
 * The warning shown before the ERP view leaves ERPNext. `actions[i]` is what button `i` does;
 * button 0 (go back) is the default and what Esc picks.
 * @param {ReturnType<typeof offBaseNavigation>} d
 * @returns {{ title: string, message: string, detail: string, buttons: string[], actions: Array<"back"|"browser"|"continue"> }}
 */
export function offBaseWarning(d) {
  if (d.kind === "web") {
    return {
      title: "Leaving ERPNext",
      message: `This goes to ${d.host}, which is not your ERPNext.`,
      detail:
        "The app switches its ERPNext tools off on other websites. For a site you do not know, " +
        "opening it in your browser is the safer choice.\n\n" + d.url.slice(0, 300),
      buttons: ["Go back", "Open in my browser", "Continue here"],
      actions: ["back", "browser", "continue"],
    };
  }
  return {
    title: "Not opened",
    message: d.scheme ? `ERPNext tried to open a "${d.scheme}:" address. The app does not open those.` : "ERPNext tried to open an address the app cannot read.",
    detail: String((d && d.url) || "").slice(0, 300),
    buttons: ["OK"],
    actions: ["back"],
  };
}
