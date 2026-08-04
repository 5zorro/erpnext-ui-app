/**
 * Deterministic sample-data corpus plan (OI-055 / plan S−1).
 * Pure: no ERP I/O. The ops runner applies this JSON via sandbox-only bench seed.
 *
 * Link graph is designed so clerks can dogfood:
 *   - create from nothing (no source)
 *   - create from source (Q→SO→SI, PO→PR→PI, PO→PI)
 *   - leftover open sources in pickers
 */

export const SAMPLE_TAG = "ui-app-sample-v1";

export const DEFAULT_COUNTS = Object.freeze({
  quotation: 25,
  sales_order: 25,
  sales_invoice: 25,
  purchase_order: 25,
  purchase_receipt: 25,
  purchase_invoice: 25,
});

/** Extra unsaved (docstatus 0) docs per kind — Find/Drafts dogfood; not 25. */
export const DEFAULT_DRAFTS_PER_KIND = 5;

export const DEFAULT_PARTY_COUNTS = Object.freeze({
  suppliers: 8,
  customers: 8,
  items: 12,
});

/** @param {number} n */
export function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * @param {object} [opts]
 * @param {number} [opts.windowDays]
 * @param {typeof DEFAULT_COUNTS} [opts.counts]
 * @param {number} [opts.draftsPerKind] draft (unsubmitted) extras per kind
 * @param {typeof DEFAULT_PARTY_COUNTS} [opts.parties]
 * @param {string} [opts.tag]
 */
export function buildCorpusPlan(opts = {}) {
  const windowDays = Number.isFinite(opts.windowDays) ? opts.windowDays : 60;
  const counts = { ...DEFAULT_COUNTS, ...(opts.counts || {}) };
  const draftsPerKind = Number.isFinite(opts.draftsPerKind)
    ? Math.max(0, opts.draftsPerKind)
    : DEFAULT_DRAFTS_PER_KIND;
  const partyCounts = { ...DEFAULT_PARTY_COUNTS, ...(opts.parties || {}) };
  const tag = opts.tag || SAMPLE_TAG;

  const suppliers = Array.from({ length: partyCounts.suppliers }, (_, i) => ({
    key: `SUP-${pad2(i)}`,
    name: `SAMPLE Vendor ${pad2(i + 1)}`,
  }));
  const customers = Array.from({ length: partyCounts.customers }, (_, i) => ({
    key: `CUS-${pad2(i)}`,
    name: `SAMPLE Customer ${pad2(i + 1)}`,
  }));
  const items = Array.from({ length: partyCounts.items }, (_, i) => ({
    key: `ITM-${pad2(i)}`,
    code: `SAMPLE-SKU-${pad2(i + 1)}`,
    name: `SAMPLE Item ${pad2(i + 1)}`,
    rate: 10 + (i % 7) * 5.5,
  }));

  /** @type {object[]} */
  const docs = [];

  for (let i = 0; i < counts.quotation; i++) {
    docs.push(baseDoc("quotation", i, windowDays, 0, {
      partyKey: customers[i % customers.length].key,
      items: lineItems(items, i, 1 + (i % 3)),
      source: null,
    }));
  }

  for (let i = 0; i < counts.sales_order; i++) {
    // 0..14 from quotation; 15..24 from nothing (leaves Q 15..24 unconverted)
    const fromQuote = i < 15;
    docs.push(baseDoc("sales_order", i, windowDays, 1, {
      partyKey: customers[i % customers.length].key,
      items: lineItems(items, i, 1 + (i % 3)),
      source: fromQuote ? { kind: "quotation", index: i } : null,
    }));
  }

  for (let i = 0; i < counts.sales_invoice; i++) {
    // 0..11 from SO; 12..24 from nothing (leaves SO 12..24 uninvoiced)
    const fromSo = i < 12;
    docs.push(baseDoc("sales_invoice", i, windowDays, 2, {
      partyKey: customers[i % customers.length].key,
      items: lineItems(items, i, 1 + (i % 3)),
      source: fromSo ? { kind: "sales_order", index: i } : null,
      updateStock: false,
    }));
  }

  for (let i = 0; i < counts.purchase_order; i++) {
    const soLink = i % 4 === 0 ? { kind: "sales_order", index: i % 15 } : null;
    docs.push(baseDoc("purchase_order", i, windowDays, 0, {
      partyKey: suppliers[i % suppliers.length].key,
      items: lineItems(items, i, 1 + (i % 3), { salesOrderRef: soLink }),
      source: null,
      salesOrderLink: soLink,
    }));
  }

  for (let i = 0; i < counts.purchase_receipt; i++) {
    const fromPo = i < 12;
    docs.push(baseDoc("purchase_receipt", i, windowDays, 1, {
      partyKey: suppliers[i % suppliers.length].key,
      items: lineItems(items, i, 1 + (i % 3)),
      source: fromPo ? { kind: "purchase_order", index: i } : null,
    }));
  }

  for (let i = 0; i < counts.purchase_invoice; i++) {
    let source = null;
    let chainIndex = i;
    if (i < 8) {
      source = { kind: "purchase_receipt", index: i };
      chainIndex = i;
    } else if (i < 16) {
      const poIndex = 12 + (i - 8);
      source = { kind: "purchase_order", index: poIndex };
      chainIndex = poIndex;
    }
    docs.push(baseDoc("purchase_invoice", i, windowDays, 2, {
      partyKey: suppliers[i % suppliers.length].key,
      items: lineItems(items, i, 1 + (i % 3)),
      source,
      billNo: `SMP-BILL-${pad2(i + 1)}`,
      updateStock: false,
    }, chainIndex));
  }

  // Drafts: create-from-nothing only (no link-graph dependency); distinct parties.
  appendDraftDocs(docs, {
    draftsPerKind,
    windowDays,
    suppliers,
    customers,
    items,
  });

  return {
    tag,
    windowDays,
    counts,
    draftsPerKind,
    parties: { suppliers, customers, items },
    docs,
    summary: summarizePlan(docs),
  };
}

/**
 * @param {object[]} docs
 * @param {{
 *   draftsPerKind: number,
 *   windowDays: number,
 *   suppliers: { key: string }[],
 *   customers: { key: string }[],
 *   items: object[],
 * }} cfg
 */
function appendDraftDocs(docs, cfg) {
  const { draftsPerKind, windowDays, suppliers, customers, items } = cfg;
  if (draftsPerKind < 1) return;

  const selling = ["quotation", "sales_order", "sales_invoice"];
  const buying = ["purchase_order", "purchase_receipt", "purchase_invoice"];

  for (const kind of selling) {
    for (let i = 0; i < draftsPerKind; i++) {
      docs.push(
        draftDoc(kind, i, windowDays, {
          partyKey: customers[i % customers.length].key,
          items: lineItems(items, 50 + i, 1 + (i % 2)),
          updateStock: false,
        }),
      );
    }
  }
  for (const kind of buying) {
    for (let i = 0; i < draftsPerKind; i++) {
      const extra = {
        partyKey: suppliers[i % suppliers.length].key,
        items: lineItems(items, 60 + i, 1 + (i % 2)),
        updateStock: false,
      };
      if (kind === "purchase_invoice") {
        extra.billNo = `SMP-DRAFT-${pad2(i + 1)}`;
      }
      docs.push(draftDoc(kind, i, windowDays, extra));
    }
  }
}

/**
 * Unsubmitted sample row. Keys use `-D-` so they never collide with submitted `PI-00`… keys.
 * @param {string} kind
 * @param {number} draftIndex
 * @param {number} windowDays
 * @param {object} extra
 */
function draftDoc(kind, draftIndex, windowDays, extra) {
  const stage =
    kind === "sales_invoice" || kind === "purchase_invoice"
      ? 2
      : kind === "sales_order" || kind === "purchase_receipt"
        ? 1
        : 0;
  const dayOffset = chainDayOffset(80 + draftIndex, stage, windowDays);
  return {
    kind,
    index: 900 + draftIndex,
    key: `${kindAbbrev(kind)}-D-${pad2(draftIndex)}`,
    dayOffset,
    asDraft: true,
    source: null,
    ...extra,
  };
}

/**
 * @param {string} kind
 * @param {number} index
 * @param {number} windowDays
 * @param {number} stage 0=earliest in chain, higher=later (newer calendar date)
 * @param {object} extra
 * @param {number} [chainIndex] index used for date spacing (defaults to index; use source index when linking across ids)
 */
function baseDoc(kind, index, windowDays, stage, extra, chainIndex = index) {
  const dayOffset = chainDayOffset(chainIndex, stage, windowDays);
  return {
    kind,
    index,
    key: `${kindAbbrev(kind)}-${pad2(index)}`,
    dayOffset,
    ...extra,
  };
}

/**
 * Keep linked chains chronological: larger dayOffset = older date.
 * stage 0 (source) is oldest; stage 2 is newest. Avoids % wrap inversions
 * by reserving the last few days of the window as headroom.
 */
function chainDayOffset(index, stage, windowDays) {
  const headroom = 4;
  const span = Math.max(1, windowDays - headroom);
  const base = (index * 7) % span;
  return base + (2 - stage);
}

function kindAbbrev(kind) {
  switch (kind) {
    case "quotation":
      return "Q";
    case "sales_order":
      return "SO";
    case "sales_invoice":
      return "SI";
    case "purchase_order":
      return "PO";
    case "purchase_receipt":
      return "PR";
    case "purchase_invoice":
      return "PI";
    default:
      return "X";
  }
}

/**
 * @param {object[]} items
 * @param {number} docIndex
 * @param {number} lineCount
 * @param {{ salesOrderRef?: { kind: string, index: number } | null }} [opts]
 */
function lineItems(items, docIndex, lineCount, opts = {}) {
  const lines = [];
  for (let L = 0; L < lineCount; L++) {
    const item = items[(docIndex + L) % items.length];
    lines.push({
      itemKey: item.key,
      qty: 1 + ((docIndex + L) % 4),
      rate: item.rate,
      salesOrderRef: opts.salesOrderRef || null,
    });
  }
  return lines;
}

/** @param {object[]} docs */
export function summarizePlan(docs) {
  const byKind = {};
  const bySource = {};
  let drafts = 0;
  for (const d of docs) {
    byKind[d.kind] = (byKind[d.kind] || 0) + 1;
    const src = d.source ? d.source.kind : "none";
    const bucket = `${d.kind}←${src}`;
    bySource[bucket] = (bySource[bucket] || 0) + 1;
    if (d.asDraft) drafts += 1;
  }
  return { byKind, bySource, drafts };
}

/**
 * Calendar date string (YYYY-MM-DD) for a dayOffset counting back from asOf.
 * dayOffset 0 = asOf; dayOffset 59 = 59 days before asOf.
 * @param {string|Date} asOf
 * @param {number} dayOffset
 */
export function dateForOffset(asOf, dayOffset) {
  const base = asOf instanceof Date ? new Date(asOf) : parseYmd(asOf);
  if (Number.isNaN(base.getTime())) {
    throw new Error(`Invalid asOf date: ${asOf}`);
  }
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - dayOffset);
  return formatYmd(d);
}

/** @param {string} ymd */
function parseYmd(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd).trim());
  if (!m) return new Date(NaN);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** @param {Date} d */
function formatYmd(d) {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}
