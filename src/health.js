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
 * @returns {Promise<{ status: "ok"|"bad"|"unknown", code: number|null, url: string }>}
 */
export async function pingHealth({
  erpBase,
  pingPath = "/api/method/ping",
  fetchImpl = globalThis.fetch,
  timeoutMs = 3000,
} = {}) {
  const url = buildPingUrl(erpBase, pingPath);
  if (typeof fetchImpl !== "function") {
    return { status: "unknown", code: null, url };
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { method: "GET", signal: ctrl.signal });
    return {
      status: classifyHealthStatus(res.status),
      code: res.status,
      url,
    };
  } catch {
    return { status: classifyHealthStatus(null, { networkError: true }), code: null, url };
  } finally {
    clearTimeout(t);
  }
}
