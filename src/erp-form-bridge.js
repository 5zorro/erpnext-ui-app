/**
 * Doc ↔ Vanilla form bridge — pure helpers (SSoT for settle rules).
 * Page script: electron/erp-form-bridge-page.js (injected into ERP WebContents).
 *
 * Template for Bill / PO / IR: event-driven waits (form hooks + frappe.after_ajax),
 * not fixed sleeps or main-process poll loops.
 */

export const DOC_FORM_BRIDGE_VERSION = 20;

/** Max wait for address_display on supplier setHeader before snapshot (bridge deadline). */
export const SUPPLIER_PARTY_SETTLE_MAX_MS = 12000;

/** Bill header paints billing from this HTML field (not supplier_address link). */
export const SUPPLIER_BILLING_DISPLAY_FIELD = "address_display";

/** Fields written by ERPNext party-details ajax (exclude supplier link itself). */
export const SUPPLIER_PARTY_DETAIL_FIELDS = Object.freeze([
  "supplier_name",
  "supplier_address",
  "address_display",
  "shipping_address_display",
  "dispatch_address_display",
  "shipping_address",
  "dispatch_address",
  "payment_terms_template",
]);

/** Address link + display fields Bill header paint needs (PI billing = address_display). */
export const SUPPLIER_ADDRESS_DISPLAY_FIELDS = Object.freeze([
  "supplier_address",
  "address_display",
  "shipping_address_display",
  "dispatch_address_display",
  "shipping_address",
  "dispatch_address",
]);

/** Meta-only party fields (may land before address_display HTML). */
export const SUPPLIER_PARTY_META_FIELDS = Object.freeze([
  "supplier_name",
  "payment_terms_template",
]);

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeSupplierKey(value) {
  return String(value ?? "").trim();
}

/**
 * Snapshot party-detail fields before supplier set_value (for settle diff).
 * @param {object|null|undefined} doc
 * @returns {Record<string, unknown>}
 */
export function supplierPartyBaseline(doc) {
  const d = doc && typeof doc === "object" ? doc : {};
  /** @type {Record<string, unknown>} */
  const out = { supplier: d.supplier };
  for (const field of SUPPLIER_PARTY_DETAIL_FIELDS) {
    out[field] = d[field];
  }
  return out;
}

/**
 * True when any party-detail field differs from baseline (supplier link excluded).
 * @param {object|null|undefined} doc
 * @param {object|null|undefined} baseline
 */
export function supplierPartyDetailChanged(doc, baseline) {
  const d = doc && typeof doc === "object" ? doc : {};
  const base = baseline && typeof baseline === "object" ? baseline : {};
  for (const field of SUPPLIER_PARTY_DETAIL_FIELDS) {
    if (stripHtmlPlain(d[field]) !== stripHtmlPlain(base[field])) return true;
  }
  return false;
}

/**
 * True when Bill billing textarea would paint (address_display HTML only).
 * @param {object|null|undefined} doc
 */
export function hasSupplierBillingDisplay(doc) {
  const d = doc && typeof doc === "object" ? doc : {};
  return stripHtmlPlain(d[SUPPLIER_BILLING_DISPLAY_FIELD]) !== "";
}

/**
 * @param {object|null|undefined} doc
 */
export function hasSupplierAddressDisplaySignals(doc) {
  const d = doc && typeof doc === "object" ? doc : {};
  for (const field of SUPPLIER_ADDRESS_DISPLAY_FIELDS) {
    if (stripHtmlPlain(d[field])) return true;
  }
  return false;
}

/**
 * Party meta (name, terms) changed but address displays not yet on doc.
 * @param {object|null|undefined} doc
 * @param {object|null|undefined} baseline
 */
export function isSupplierPartyMetaOnlyChange(doc, baseline) {
  const d = doc && typeof doc === "object" ? doc : {};
  const base = baseline && typeof baseline === "object" ? baseline : {};
  if (hasSupplierAddressDisplaySignals(d)) return false;
  for (const field of SUPPLIER_PARTY_META_FIELDS) {
    if (stripHtmlPlain(d[field]) !== stripHtmlPlain(base[field])) return true;
  }
  for (const field of SUPPLIER_ADDRESS_DISPLAY_FIELDS) {
    if (stripHtmlPlain(d[field]) !== stripHtmlPlain(base[field])) return false;
  }
  return false;
}

/**
 * Supplier set_value settle: link committed and party-details ajax reflected on doc.
 * Parallel IPC (e.g. listSources) must not gate on generic ajax quiet alone.
 * Prefer address display signals — supplier_name alone is not enough (Alpine flake 2026-08-30).
 *
 * @param {object|null|undefined} doc
 * @param {{ targetSupplier?: unknown, baseline?: object|null, allowMetaOnly?: boolean }} [ctx]
 */
export function isSupplierPartySettled(doc, ctx = {}) {
  const d = doc && typeof doc === "object" ? doc : {};
  const target = normalizeSupplierKey(ctx.targetSupplier ?? d.supplier);
  if (!target || normalizeSupplierKey(d.supplier) !== target) return false;

  const base = ctx.baseline && typeof ctx.baseline === "object" ? ctx.baseline : null;

  if (hasSupplierAddressDisplaySignals(d)) return true;

  if (ctx.allowMetaOnly) {
    if (!base) return stripHtmlPlain(d.supplier_name) !== "";
    if (supplierPartyDetailChanged(d, base)) return true;
  }

  if (base && normalizeSupplierKey(base.supplier) === target && hasSupplierAddressDisplaySignals(base)) {
    return true;
  }

  return false;
}

/** Ms before deadline when meta-only settle is allowed (vendor with no address on file). */
export const SUPPLIER_PARTY_META_ONLY_GRACE_MS = 3000;

/**
 * One after_ajax slice while waiting for supplier party settle.
 * @param {number} deadlineMs
 * @param {number} [nowMs]
 */
export function supplierPartyQuietSliceMs(deadlineMs, nowMs = Date.now()) {
  const remaining = deadlineMs - nowMs;
  if (remaining <= 0) return 0;
  return Math.min(4000, Math.max(500, remaining));
}

/**
 * Poll slice for supplier address snapshot wait (address-first, not generic after_ajax alone).
 * @param {number} deadlineMs
 * @param {number} [nowMs]
 */
export function supplierSnapshotWaitSliceMs(deadlineMs, nowMs = Date.now()) {
  const remaining = deadlineMs - nowMs;
  if (remaining <= 0) return 0;
  return Math.min(500, Math.max(50, remaining));
}

/**
 * @param {number} deadlineMs
 * @param {number} [nowMs]
 */
export function supplierSnapshotAllowMetaOnly(deadlineMs, nowMs = Date.now()) {
  return deadlineMs - nowMs <= SUPPLIER_PARTY_META_ONLY_GRACE_MS;
}

/**
 * Snapshot gate for setHeader IPC — matches readBillHeader billing projection.
 *
 * @param {object|null|undefined} doc
 * @param {{ targetSupplier?: unknown, baseline?: object|null, allowMetaOnlyAtDeadline?: boolean }} [ctx]
 * @returns {{ ready: boolean, reason: string, field?: string }}
 */
export function supplierSnapshotReadyReason(doc, ctx = {}) {
  const d = doc && typeof doc === "object" ? doc : {};
  const target = normalizeSupplierKey(ctx.targetSupplier ?? d.supplier);
  if (!target || normalizeSupplierKey(d.supplier) !== target) {
    return { ready: false, reason: "supplier_mismatch" };
  }
  if (hasSupplierBillingDisplay(d)) {
    return { ready: true, reason: "address_display", field: SUPPLIER_BILLING_DISPLAY_FIELD };
  }
  if (ctx.allowMetaOnlyAtDeadline) {
    const metaOk = isSupplierPartySettled(doc, {
      targetSupplier: target,
      baseline: ctx.baseline,
      allowMetaOnly: true,
    });
    if (metaOk) return { ready: true, reason: "meta_only_deadline", field: "" };
  }
  return { ready: false, reason: "waiting" };
}

/**
 * Stricter than modal-open settle: snapshot only when address_display HTML exists,
 * or meta-only grace at deadline (vendor with no address on file).
 *
 * @param {object|null|undefined} doc
 * @param {{ targetSupplier?: unknown, baseline?: object|null, allowMetaOnlyAtDeadline?: boolean }} [ctx]
 */
export function supplierAddressSnapshotReady(doc, ctx = {}) {
  return supplierSnapshotReadyReason(doc, ctx).ready;
}

/**
 * YYYY-MM-DD from an ERP date field (string or Date-like).
 * @param {unknown} value
 * @returns {string}
 */
export function postingDateYmd(value) {
  if (value == null || value === "") return "";
  const s = String(value).trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : s.slice(0, 10);
}

/**
 * Mirror ERPNext `confirm_posting_date_change` yes-path:
 * when Edit Posting Date is unchecked and posting_date ≠ today, Vanilla will
 * reset to today (after a confirm the Doc skin cannot click).
 * @param {object|null|undefined} doc
 * @param {string} todayYmd
 */
export function shouldResetPostingDateToToday(doc, todayYmd) {
  if (!doc || typeof doc !== "object") return false;
  if (doc.set_posting_time) return false;
  const posting = postingDateYmd(doc.posting_date);
  if (!posting) return false;
  return posting !== postingDateYmd(todayYmd);
}

/**
 * @param {string|null|undefined} doctype ERP title or slug
 * @returns {string} e.g. purchase-invoice
 */
export function doctypeKeyFromErpDoctype(doctype) {
  return String(doctype || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-");
}

/**
 * @param {object|null|undefined} frm cur_frm-like
 * @param {string|null|undefined} doctype
 */
export function formMatchesDoctype(frm, doctype) {
  if (!frm || !frm.doc) return false;
  if (!doctype) return true;
  return frm.doctype === doctype || frm.doc.doctype === doctype;
}

/**
 * @param {unknown} s
 * @returns {string}
 */
export function stripHtmlPlain(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Does a field have a value for mandatory checks? Mirrors Frappe has_value / Check quirks.
 * @param {unknown} value
 * @param {string} [fieldtype]
 */
export function isMandatoryValuePresent(value, fieldtype) {
  if (fieldtype === "Check") return true;
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return !Number.isNaN(value);
  return stripHtmlPlain(value) !== "";
}

/**
 * Build human blockers from a live-meta snapshot (no Frappe runtime).
 * Used by unit tests and by the injected bridge after it evaluates depends_on.
 *
 * @param {{
 *   parent?: Array<{ label: string, required: boolean, present: boolean }>,
 *   tables?: Array<{
 *     label: string,
 *     totalRows: number,
 *     missing?: Array<{ label: string, rows: number[] }>,
 *   }>,
 *   promptNameMissing?: boolean,
 * }} snap
 * @returns {string[]}
 */
export function listMandatoryBlockersFromSnap(snap = {}) {
  const lines = [];
  if (snap.promptNameMissing) {
    lines.push("Name is required.");
  }
  for (const f of snap.parent || []) {
    if (f && f.required && !f.present) {
      lines.push(`${stripHtmlPlain(f.label) || "Field"} is required.`);
    }
  }
  for (const te of snap.tables || []) {
    if (!te) continue;
    const tableLabel = stripHtmlPlain(te.label) || "Table";
    const total = Number(te.totalRows) || 0;
    for (const miss of te.missing || []) {
      if (!miss) continue;
      const fieldLabel = stripHtmlPlain(miss.label) || "Field";
      const rows = Array.isArray(miss.rows)
        ? [...new Set(miss.rows.map((n) => Number(n)).filter((n) => n > 0))].sort((a, b) => a - b)
        : [];
      if (!rows.length) continue;
      if (total > 0 && rows.length === total) {
        lines.push(`In ${tableLabel}, ${fieldLabel} is required in every row.`);
      } else if (rows.length === 1) {
        lines.push(`In ${tableLabel}, ${fieldLabel} is required in row ${rows[0]}.`);
      } else {
        lines.push(`In ${tableLabel}, ${fieldLabel} is required in rows ${rows.join(", ")}.`);
      }
    }
  }
  return lines;
}

/**
 * Merge Doc-skin + live-meta blockers (order-preserving unique).
 * @param {...(string[]|null|undefined)} lists
 * @returns {string[]}
 */
export function mergeSaveBlockers(...lists) {
  const out = [];
  const seen = new Set();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const line = stripHtmlPlain(raw);
      if (!line) continue;
      const key = line.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(line);
    }
  }
  return out;
}

/**
 * After item_code set: still need master description / rate?
 * @param {object|null|undefined} row
 */
export function rowNeedsItemEnrichment(row) {
  if (!row || !row.item_code) return false;
  const needDesc = !stripHtmlPlain(row.description);
  const needRate = row.rate == null || Number(row.rate) === 0;
  return needDesc || needRate;
}

/**
 * Map Item get_value / master fields → child row patches.
 * @param {object|null|undefined} itemMsg
 * @param {object|null|undefined} row
 * @returns {{ description?: string, rate?: number }}
 */
export function pickItemAutofillFields(itemMsg, row) {
  const out = {};
  if (!itemMsg || typeof itemMsg !== "object") return out;
  const needDesc = !row || !stripHtmlPlain(row.description);
  const needRate = !row || row.rate == null || Number(row.rate) === 0;
  if (needDesc) {
    const desc = stripHtmlPlain(itemMsg.description) || itemMsg.item_name || itemMsg.name;
    if (desc) out.description = desc;
  }
  if (needRate) {
    const rate = Number(itemMsg.last_purchase_rate || itemMsg.standard_rate || 0);
    if (rate) out.rate = rate;
  }
  return out;
}
