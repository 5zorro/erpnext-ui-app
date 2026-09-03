/**
 * Read-only Frappe REST list via /api/resource — bypasses ERP webContents executeJavaScript
 * when the form thread is busy (bill enrich under chaos).
 * Use Electron session.fetch in main so session cookies attach automatically.
 */

/**
 * @param {string} erpBase
 * @param {string} doctype
 * @param {object} [query]
 * @param {string[]} [query.fields]
 * @param {unknown} [query.filters]
 * @param {number} [query.limit]
 */
export function buildFrappeResourceListUrl(erpBase, doctype, query = {}) {
  const base = String(erpBase || "").replace(/\/+$/, "");
  if (!base) throw new TypeError("buildFrappeResourceListUrl: erpBase required");
  const dt = encodeURIComponent(String(doctype || ""));
  const params = new URLSearchParams();
  if (Array.isArray(query.fields) && query.fields.length) {
    params.set("fields", JSON.stringify(query.fields));
  }
  if (query.filters != null) {
    params.set("filters", JSON.stringify(query.filters));
  }
  if (query.limit != null && Number(query.limit) > 0) {
    params.set("limit_page_length", String(query.limit));
  }
  const qs = params.toString();
  return `${base}/api/resource/${dt}${qs ? `?${qs}` : ""}`;
}

/**
 * @param {string} erpBase
 * @param {string} doctype
 * @param {string} name
 * @param {string[]} [fields]
 */
export function buildFrappeResourceDocUrl(erpBase, doctype, name, fields) {
  const base = String(erpBase || "").replace(/\/+$/, "");
  if (!base) throw new TypeError("buildFrappeResourceDocUrl: erpBase required");
  const dt = encodeURIComponent(String(doctype || ""));
  const nm = encodeURIComponent(String(name || ""));
  const params = new URLSearchParams();
  if (Array.isArray(fields) && fields.length) {
    params.set("fields", JSON.stringify(fields));
  }
  const qs = params.toString();
  return `${base}/api/resource/${dt}/${nm}${qs ? `?${qs}` : ""}`;
}

/**
 * @param {unknown} json
 * @returns {object|null}
 */
export function parseFrappeResourceDocResponse(json) {
  if (!json || typeof json !== "object") return null;
  const data = /** @type {{ data?: object }} */ (json).data;
  return data && typeof data === "object" ? data : null;
}

/**
 * @param {object} opts
 * @param {string} opts.erpBase
 * @param {string} opts.doctype
 * @param {string} opts.name
 * @param {string[]} [opts.fields]
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {number} [opts.timeoutMs]
 */
export async function frappeResourceGetDoc({
  erpBase,
  doctype,
  name,
  fields,
  fetchImpl = globalThis.fetch,
  timeoutMs = 12000,
}) {
  if (typeof fetchImpl !== "function") {
    return { ok: false, reason: "fetch unavailable", doc: null };
  }
  const url = buildFrappeResourceDocUrl(erpBase, doctype, name, fields);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      let detail = "";
      try {
        const errJson = await res.json();
        const msg = errJson && errJson._error_message;
        if (msg) detail = String(msg).slice(0, 120);
      } catch {
        /* ignore */
      }
      return { ok: false, status: res.status, reason: detail || res.statusText, doc: null };
    }
    const json = await res.json();
    const doc = parseFrappeResourceDocResponse(json);
    if (!doc) return { ok: false, reason: "empty doc", doc: null };
    return { ok: true, doc };
  } catch (e) {
    return {
      ok: false,
      reason: String(e && e.message ? e.message : e),
      doc: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch parent ERP docs in parallel (session.fetch from main).
 * @param {object} opts
 * @param {string} opts.erpBase
 * @param {string} opts.doctype
 * @param {string[]} opts.names
 * @param {string[]} opts.fields
 * @param {typeof fetch} opts.fetchImpl
 */
export async function frappeResourceGetDocs({ erpBase, doctype, names, fields, fetchImpl }) {
  const list = Array.isArray(names) ? names : [];
  if (!list.length) return { ok: true, docs: [] };
  const results = await Promise.all(
    list.map((name) =>
      frappeResourceGetDoc({ erpBase, doctype, name, fields, fetchImpl }),
    ),
  );
  const failed = results.find((r) => !r.ok);
  if (failed) {
    return {
      ok: false,
      status: failed.status,
      reason: failed.reason,
      docs: [],
    };
  }
  return { ok: true, docs: results.map((r) => r.doc).filter(Boolean) };
}

/**
 * @param {unknown} json
 * @returns {object[]}
 */
export function parseFrappeResourceListResponse(json) {
  if (!json || typeof json !== "object") return [];
  const data = /** @type {{ data?: unknown, message?: unknown }} */ (json);
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.message)) return data.message;
  return [];
}

/**
 * @param {object} opts
 * @param {string} opts.erpBase
 * @param {string} opts.doctype
 * @param {string[]} opts.fields
 * @param {unknown} [opts.filters]
 * @param {number} [opts.limit]
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {number} [opts.timeoutMs]
 */
export async function frappeResourceGetList({
  erpBase,
  doctype,
  fields,
  filters,
  limit = 100,
  fetchImpl = globalThis.fetch,
  timeoutMs = 12000,
}) {
  if (typeof fetchImpl !== "function") {
    return { ok: false, reason: "fetch unavailable", rows: [] };
  }
  const url = buildFrappeResourceListUrl(erpBase, doctype, { fields, filters, limit });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      let detail = "";
      try {
        const errJson = await res.json();
        const msg = errJson && errJson._error_message;
        if (msg) detail = String(msg).slice(0, 120);
      } catch {
        /* ignore */
      }
      return { ok: false, status: res.status, reason: detail || res.statusText, rows: [] };
    }
    const json = await res.json();
    return { ok: true, rows: parseFrappeResourceListResponse(json) };
  } catch (e) {
    return {
      ok: false,
      reason: String(e && e.message ? e.message : e),
      rows: [],
    };
  } finally {
    clearTimeout(timer);
  }
}
