/**
 * ERPNext health ping helpers — pure + injectable fetch for offline unit tests.
 */

/**
 * @param {string} erpBase e.g. "http://localhost:8080"
 * @param {string} [pingPath="/api/method/ping"]
 * @returns {string}
 */
export function buildPingUrl(erpBase, pingPath = "/api/method/ping") {
  if (typeof erpBase !== "string" || !erpBase.trim()) {
    throw new TypeError("buildPingUrl: erpBase must be a non-empty string");
  }
  const base = erpBase.replace(/\/+$/, "");
  const path = pingPath.startsWith("/") ? pingPath : `/${pingPath}`;
  return `${base}${path}`;
}

/**
 * @param {number|null} statusCode
 * @param {{ networkError?: boolean }} [opts]
 * @returns {"ok"|"bad"|"unknown"}
 */
export function classifyHealthStatus(statusCode, opts = {}) {
  if (opts.networkError) return "bad";
  if (statusCode == null) return "unknown";
  if (statusCode >= 200 && statusCode < 300) return "ok";
  return "bad";
}

/**
 * @param {object} opts
 * @param {string} opts.erpBase
 * @param {string} [opts.pingPath]
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<{ status: "ok"|"bad"|"unknown", code: number|null, url: string, latencyMs: number|null }>}
 */
export async function pingHealth({
  erpBase,
  pingPath = "/api/method/ping",
  fetchImpl = globalThis.fetch,
  timeoutMs = 3000,
} = {}) {
  const url = buildPingUrl(erpBase, pingPath);
  if (typeof fetchImpl !== "function") {
    return { status: "unknown", code: null, url, latencyMs: null };
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetchImpl(url, { method: "GET", signal: ctrl.signal });
    return {
      status: classifyHealthStatus(res.status),
      code: res.status,
      url,
      latencyMs: Date.now() - started,
    };
  } catch {
    return {
      status: classifyHealthStatus(null, { networkError: true }),
      code: null,
      url,
      latencyMs: Date.now() - started,
    };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Whether the ERP view's session is logged in. `/api/method/ping` answers Guest and a signed-in
 * clerk alike, so the health dot stays green on a session the server no longer honours — seen
 * 2026-09-28 after the sandbox was reinstalled: the shell kept its old `sid` cookie, every Doc
 * page failed with "Please log in on Vanilla skin", and nothing in the toolbar said so.
 * `get_logged_user` is not open to Guest, so it answers 403 for a missing *and* a stale session
 * (the stale one adds `session_expired: 1`) and 200 + the user for a live one.
 */
export const LOGIN_PROBE_PATH = "/api/method/frappe.auth.get_logged_user";

/**
 * @param {number|null} statusCode
 * @param {unknown} body parsed JSON, or null
 * @returns {"in"|"out"|"unknown"}
 */
export function classifyLoginProbe(statusCode, body) {
  if (statusCode === 401 || statusCode === 403) return "out";
  if (statusCode === 200) {
    const user = body && typeof body === "object" ? /** @type {any} */ (body).message : null;
    if (typeof user === "string" && user && user !== "Guest") return "in";
    if (user === "Guest") return "out";
  }
  return "unknown";
}

/**
 * @param {object} opts
 * @param {string} opts.erpBase
 * @param {(url: string, init?: object) => Promise<any>} [opts.fetchImpl] must carry the ERP
 *   view's cookies (Electron `session.fetch`) — a bare fetch is always Guest
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<{ state: "in"|"out"|"unknown", user: string|null, code: number|null, expired: boolean }>}
 */
export async function probeLogin({ erpBase, fetchImpl, timeoutMs = 3000 } = /** @type {any} */ ({})) {
  if (typeof fetchImpl !== "function") return { state: "unknown", user: null, code: null, expired: false };
  const url = buildPingUrl(erpBase, LOGIN_PROBE_PATH);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { method: "GET", signal: ctrl.signal });
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    const state = classifyLoginProbe(res.status, body);
    return {
      state,
      user: state === "in" ? String(/** @type {any} */ (body).message) : null,
      code: res.status,
      expired: !!(body && /** @type {any} */ (body).session_expired),
    };
  } catch {
    return { state: "unknown", user: null, code: null, expired: false };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Where the toolbar's Log in button should land the clerk afterwards: back on the Vanilla page
 * they were on, when it is a real ERP page; Desk otherwise (a shell page has no ERP twin to
 * return to, and `/login` itself would loop).
 * Split as `showErp` takes it: the path, and the query that rides only on a real load.
 * @param {string} pathname the ERP view's current pathname (may be "")
 * @returns {{ path: "/login", search: string }}
 */
export function loginRouteFor(pathname) {
  const p = typeof pathname === "string" ? pathname : "";
  const back = /^\/(app|desk)(\/|$)/.test(p) ? p : "/desk";
  return { path: "/login", search: `redirect-to=${encodeURIComponent(back)}` };
}
