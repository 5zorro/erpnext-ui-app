/**
 * Workstation connection diagnose copy (OI-046) — pure; no secrets.
 */

/**
 * @param {string} erpBase
 * @returns {"this-pc"|"lan"|"cloud"|"unknown"}
 */
export function classifyHostClass(erpBase) {
  if (typeof erpBase !== "string" || !erpBase.trim()) return "unknown";
  let host = "";
  try {
    host = new URL(erpBase).hostname.toLowerCase();
  } catch {
    return "unknown";
  }
  if (!host) return "unknown";
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return "this-pc";
  if (
    /^192\.168\./.test(host) ||
    /^10\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    host.endsWith(".local")
  ) {
    return "lan";
  }
  return "cloud";
}

/**
 * @param {"this-pc"|"lan"|"cloud"|"unknown"} hostClass
 */
export function hostClassLabel(hostClass) {
  switch (hostClass) {
    case "this-pc":
      return "This PC (localhost)";
    case "lan":
      return "LAN / private network";
    case "cloud":
      return "Cloud / public host";
    default:
      return "Unknown";
  }
}

/**
 * @param {object} opts
 * @param {string} opts.erpBase
 * @param {"ok"|"bad"|"unknown"} opts.status
 * @param {number|null} [opts.code]
 * @param {number|null} [opts.latencyMs]
 * @param {string|null} [opts.lastOkAt]
 * @param {boolean|null} [opts.internetOk]
 * @returns {string[]}
 */
export function formatDiagnoseLines(opts = {}) {
  const erpBase = opts.erpBase || "";
  const status = opts.status || "unknown";
  const hostClass = classifyHostClass(erpBase);
  const lines = [
    `Server: ${erpBase || "(not configured)"}`,
    `Host class: ${hostClassLabel(hostClass)}`,
  ];
  if (status === "ok") {
    const ms = opts.latencyMs != null ? ` (${opts.latencyMs} ms)` : "";
    lines.push(`ERP reply: OK${ms}`);
  } else if (status === "bad") {
    const detail =
      opts.code != null ? `HTTP ${opts.code}` : "timeout or unreachable";
    lines.push(`ERP reply: ${detail}`);
  } else {
    lines.push("ERP reply: checking…");
  }
  if (opts.lastOkAt) lines.push(`Last good: ${opts.lastOkAt}`);
  else lines.push("Last good: (none yet)");
  if (opts.internetOk === true) lines.push("Internet check: OK");
  else if (opts.internetOk === false) lines.push("Internet check: failed");
  else lines.push("Internet check: skipped");

  if (status === "bad") {
    if (hostClass === "this-pc") {
      lines.push("Try: Is ERPNext running on this PC? Check the site port.");
    } else if (hostClass === "lan") {
      lines.push("Try: Same Wi‑Fi/LAN as the ERP box? Ping the server from this PC.");
    } else if (hostClass === "cloud") {
      lines.push("Try: VPN / firewall / cloud status. Confirm the URL in config.");
    } else {
      lines.push("Try: Confirm ERP_URL and network, then ask IT.");
    }
  }
  return lines;
}

/**
 * @param {string[]} lines
 * @returns {string}
 */
export function diagnoseCopyText(lines) {
  return (Array.isArray(lines) ? lines : []).join("\n");
}

/**
 * Rolling ping log (no PII). Injectable for unit tests.
 * @param {object[]} entries
 * @param {{ at: string, status: string, code?: number|null, latencyMs?: number|null }} entry
 * @param {{ maxAgeMs?: number, maxEntries?: number, nowMs?: number }} [opts]
 * @returns {object[]}
 */
export function appendPingLog(entries, entry, opts = {}) {
  const prev = Array.isArray(entries) ? entries : [];
  if (!entry || !entry.at) return prev.slice();
  const maxAgeMs = opts.maxAgeMs ?? 24 * 60 * 60 * 1000;
  const maxEntries = opts.maxEntries ?? 500;
  const nowMs = opts.nowMs ?? Date.now();
  const next = [...prev, entry].filter((e) => {
    const t = Date.parse(e.at);
    if (Number.isNaN(t)) return false;
    return nowMs - t <= maxAgeMs;
  });
  if (next.length > maxEntries) return next.slice(next.length - maxEntries);
  return next;
}
