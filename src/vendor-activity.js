/**
 * Vendor picker activity rank (OI-131).
 * Active = submitted PO on/after fiscal-year start (or trailing 365 days).
 * Idle / never stay visible and searchable; they sort after active.
 */

export const VENDOR_ACTIVITY_ACTIVE = "active";
export const VENDOR_ACTIVITY_IDLE = "idle";
export const VENDOR_ACTIVITY_NEVER = "never";

/** Fallback when company Fiscal Year is missing. */
export const VENDOR_IDLE_FALLBACK_DAYS = 365;

/**
 * @param {string|null|undefined} lastPoYmd YYYY-MM-DD
 * @param {{ asOf?: string, fyStart?: string|null, idleDays?: number }} [opts]
 * @returns {"active"|"idle"|"never"}
 */
export function classifyVendorActivity(lastPoYmd, opts = {}) {
  const last = lastPoYmd != null ? String(lastPoYmd).slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(last)) return VENDOR_ACTIVITY_NEVER;
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(String(opts.asOf || ""))
    ? String(opts.asOf).slice(0, 10)
    : utcYmd();
  const fyStart = opts.fyStart != null ? String(opts.fyStart).slice(0, 10) : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(fyStart)) {
    return last >= fyStart ? VENDOR_ACTIVITY_ACTIVE : VENDOR_ACTIVITY_IDLE;
  }
  const idleDays = Number.isFinite(opts.idleDays) ? opts.idleDays : VENDOR_IDLE_FALLBACK_DAYS;
  const floor = addUtcDays(asOf, -idleDays);
  return last >= floor ? VENDOR_ACTIVITY_ACTIVE : VENDOR_ACTIVITY_IDLE;
}

/**
 * @param {"active"|"idle"|"never"|string|null|undefined} activity
 * @returns {string}
 */
export function vendorActivitySuffix(activity) {
  if (activity === VENDOR_ACTIVITY_IDLE) return "idle";
  if (activity === VENDOR_ACTIVITY_NEVER) return "no PO";
  return "";
}

/**
 * Sort: active (newest PO first) → idle (newest leftover) → never (name).
 * @param {Array<{ value?: string, description?: string, activity?: string }>} options
 * @param {Record<string, string|null|undefined>} lastPoByName
 * @param {{ asOf?: string, fyStart?: string|null, idleDays?: number }} [opts]
 * @returns {typeof options}
 */
export function rankSupplierLinkOptions(options, lastPoByName, opts = {}) {
  const list = Array.isArray(options) ? options : [];
  const dates = lastPoByName && typeof lastPoByName === "object" ? lastPoByName : {};
  const decorated = list.map((o) => {
    const name = o && o.value != null ? String(o.value) : "";
    const activity = classifyVendorActivity(dates[name], opts);
    return { ...o, activity };
  });
  const band = { [VENDOR_ACTIVITY_ACTIVE]: 0, [VENDOR_ACTIVITY_IDLE]: 1, [VENDOR_ACTIVITY_NEVER]: 2 };
  decorated.sort((a, b) => {
    const ba = band[a.activity] ?? 2;
    const bb = band[b.activity] ?? 2;
    if (ba !== bb) return ba - bb;
    const da = dates[a.value] || "";
    const db = dates[b.value] || "";
    if (ba < 2 && da !== db) return db.localeCompare(da);
    return String(a.value || "").localeCompare(String(b.value || ""));
  });
  return decorated;
}

/** @param {string} [iso] */
export function utcYmd(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/**
 * @param {string} ymd
 * @param {number} days
 */
function addUtcDays(ymd, days) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
