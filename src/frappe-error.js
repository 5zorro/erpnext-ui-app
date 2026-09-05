/**
 * Turn Frappe / Desk client errors into a readable one-line reason.
 * Avoids `[object Object]` when `e.message` is a nested payload.
 */

/**
 * @param {unknown} v
 * @returns {string}
 */
function stripHtmlish(v) {
  return String(v == null ? "" : v)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {unknown} msg
 * @returns {string}
 */
export function flattenFrappeMessage(msg) {
  if (msg == null) return "";
  if (typeof msg === "string") {
    const t = msg.trim();
    if (!t) return "";
    // `_server_messages` entries are often JSON strings: {"message":"...","title":"..."}
    if (t.startsWith("{") || t.startsWith("[")) {
      try {
        return flattenFrappeMessage(JSON.parse(t));
      } catch {
        return stripHtmlish(t);
      }
    }
    return stripHtmlish(t);
  }
  if (typeof msg === "number" || typeof msg === "boolean") return String(msg);
  if (Array.isArray(msg)) {
    return msg.map(flattenFrappeMessage).filter(Boolean).join(" · ");
  }
  if (typeof msg === "object") {
    const o = /** @type {Record<string, unknown>} */ (msg);
    if (o.message != null && o.message !== msg) {
      const inner = flattenFrappeMessage(o.message);
      if (inner) return inner;
    }
    if (o.exception != null) {
      const exn = flattenFrappeMessage(o.exception);
      if (exn) {
        return exn.replace(/^frappe\.exceptions\.\w+:\s*/i, "");
      }
    }
    if (o.responseText != null) {
      const fromBody = flattenFrappeMessage(o.responseText);
      if (fromBody) {
        return fromBody.replace(/^frappe\.exceptions\.\w+:\s*/i, "");
      }
    }
    if (o._server_messages != null) {
      const fromServer = flattenFrappeMessage(o._server_messages);
      if (fromServer) return fromServer;
    }
    if (o.exc != null) {
      const exc = flattenFrappeMessage(o.exc);
      if (exc) return exc;
    }
    try {
      const s = JSON.stringify(msg);
      if (s && s !== "{}" && s !== "[]") return stripHtmlish(s).slice(0, 500);
    } catch {
      /* ignore */
    }
  }
  const fallback = stripHtmlish(msg);
  return fallback === "[object Object]" ? "Unknown error (unreadable payload)." : fallback;
}

/**
 * @param {unknown} errOrResponse
 * @param {string} [fallback]
 * @returns {string}
 */
export function formatClientErrorReason(errOrResponse, fallback = "Request failed.") {
  const flat = flattenFrappeMessage(errOrResponse);
  if (flat) return flat;
  return fallback;
}
