/**
 * Bill (Purchase Invoice) field map — pure projectors for M3 Doc skin.
 * Museum lesson: bind.js SPECS["Purchase Invoice"]; child writes later via set_value only.
 */

import { relabelTerm } from "./doc-terms.js";

export const BILL_DOCTYPE = "Purchase Invoice";
export const BILL_LAYOUT_KEY = "bill";
export const BILL_LIST_ROUTE = "/app/purchase-invoice";
export const BILL_NEW_ROUTE = "/app/purchase-invoice/new";

/** Header: Doc label → ERPNext field meta. */
export const BILL_HEADER_FIELDS = [
  { label: "Vendor Name", field: "supplier", type: "text", linkDoctype: "Supplier", display: "supplier_name|supplier" },
  { label: "Address", field: null, type: "text", readOnly: true, display: "address_display", stripHtml: true },
  { label: "Terms", field: "payment_terms_template", type: "text", linkDoctype: "Payment Terms Template" },
  { label: "Date", field: "posting_date", type: "date" },
  { label: "Ref No. (Supplier Invoice No.)", field: "bill_no", type: "text" },
  {
    label: "Amount Due",
    field: "__amount_due",
    type: "text",
    scratch: true,
    validationHint:
      "Enter the vendor invoice total when ready. Checksum stays idle until you type; then it must match Bill grand total.",
  },
  { label: "Bill Due Date", field: "due_date", type: "date" },
];

export const BILL_MEMO_FIELD = "remarks";

/** Items tab columns; null = display-only Amount from ERPNext. */
export const BILL_ITEM_COLS = [
  { label: "Item", field: "item_code", linkDoctype: "Item" },
  { label: "Description", field: "description" },
  { label: "Qty", field: "qty" },
  { label: "Cost", field: "rate" },
  { label: "Amount", field: null, displayOnly: true },
  { label: "Customer:Job", field: "project", linkDoctype: "Project" },
];

/** ERPNext child fields safe to write via frappe.model.set_value (M3d). */
export const BILL_ITEM_EDIT_FIELDS = BILL_ITEM_COLS.map((c) => c.field).filter(Boolean);

/**
 * @param {string} field
 * @returns {boolean}
 */
export function isEditableBillItemField(field) {
  return typeof field === "string" && BILL_ITEM_EDIT_FIELDS.includes(field);
}
export const BILL_ASSUMPTIONS = [
  "Save = saved as a Draft; you then Submit to post it (2 steps).",
  "Warehouse defaults to Finished Goods.",
  "A Bill made FROM a Purchase Order posts BOTH the Bill and the Item Receipt.",
  "A Bill made FROM an existing Item Receipt posts ONLY the Bill.",
  "Amount Due stays blank until you type the vendor invoice total; checksum is grey until then, then must match Bill grand total (item subtotal + taxes).",
  "This ERP is items-based — enter expenses as Chart-of-Accounts-mapped items, not direct GL lines here. Vendor tax/freight also use the Taxes and Charges table (not Item rows).",
];

/** Museum Expenses-tab disclaimer (SPECS tabNotes / EXPENSE_NOTE). */
export const BILL_EXPENSE_NOTE =
  "This ERP is an items-based ERP — enter expenses as Chart-of-Accounts-mapped items, not as direct GL lines here.";

/**
 * Museum SPECS assumptions (bind.js) — longer wording; alpha list is the short form shown in Doc Bill.
 * Tests assert alpha covers the same topics (not character-identical).
 */
export const MUSEUM_BILL_ASSUMPTION_TOPICS = Object.freeze([
  "draft_then_submit",
  "warehouse_finished_goods",
  "from_po_posts_bill_and_receipt",
  "from_pr_posts_bill_only",
  "amount_due_must_match",
  "items_based_not_direct_gl",
]);

export function getBillAnchor() {
  return {
    conceptId: "bill",
    doctype: BILL_DOCTYPE,
    layoutKey: BILL_LAYOUT_KEY,
    listPath: BILL_LIST_ROUTE,
    newPath: BILL_NEW_ROUTE,
    title: relabelTerm(BILL_DOCTYPE),
  };
}

/** Strip HTML to plain text (address_display, descriptions). */
export function stripHtml(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {object} doc ERPNext Purchase Invoice doc
 * @param {{ amountDue?: string|number|null }} [scratch]
 * @returns {Record<string, string|number>}
 */
export function readBillHeader(doc, scratch = {}) {
  const d = doc && typeof doc === "object" ? doc : {};
  const out = {};
  for (const meta of BILL_HEADER_FIELDS) {
    if (meta.field === "__amount_due") {
      // Scratch-only: never seed from grand_total (5zorro: blank until user types).
      const due = scratch.amountDue;
      out[meta.label] = due != null && due !== "" ? due : "";
      continue;
    }
    if (meta.display === "supplier_name|supplier") {
      out[meta.label] = d.supplier_name || d.supplier || "";
      continue;
    }
    if (meta.display === "address_display") {
      out[meta.label] = stripHtml(d.address_display);
      continue;
    }
    if (!meta.field) {
      out[meta.label] = "";
      continue;
    }
    out[meta.label] = d[meta.field] != null ? d[meta.field] : "";
  }
  out.Memo = d[BILL_MEMO_FIELD] != null ? d[BILL_MEMO_FIELD] : "";
  return out;
}

/**
 * @param {object} doc
 * @returns {Array<Array<string|number>>}
 */
export function readBillItemRows(doc) {
  const items = (doc && Array.isArray(doc.items) ? doc.items : []);
  return items.map((it) => {
    const row = it || {};
    return [
      row.item_code || "",
      stripHtml(row.description),
      row.qty != null ? row.qty : "",
      row.rate != null ? row.rate : "",
      row.amount != null ? row.amount : "",
      row.project || "",
    ];
  });
}

/**
 * Σ Qty — packing-slip / vendor hash check (OI-006 class).
 * @param {object|null|undefined} doc
 * @returns {number}
 */
export function sumBillLineQty(doc) {
  const items = doc && Array.isArray(doc.items) ? doc.items : [];
  return items.reduce((a, it) => a + (Number(it && it.qty) || 0), 0);
}

/**
 * Σ Amount — sum of line extended amounts (amount, else qty×rate) (OI-010 class).
 * @param {object|null|undefined} doc
 * @returns {number}
 */
export function sumBillLineAmount(doc) {
  const items = doc && Array.isArray(doc.items) ? doc.items : [];
  return items.reduce((a, it) => {
    if (!it) return a;
    const amt = Number(it.amount);
    if (Number.isFinite(amt) && amt !== 0) return a + amt;
    return a + (Number(it.qty) || 0) * (Number(it.rate) || 0);
  }, 0);
}

/**
 * Format a footer total for display (2 dp when non-integer).
 * @param {number} n
 * @returns {string}
 */
export function formatBillLineTotal(n) {
  const x = Number(n) || 0;
  if (Number.isInteger(x)) return String(x);
  return x.toFixed(2);
}

/**
 * Has the user typed an Amount Due? Empty/whitespace → idle checksum (no red/green).
 * @param {string|number|null|undefined} amountDue
 * @returns {boolean}
 */
export function isAmountDueEntered(amountDue) {
  if (amountDue == null) return false;
  return String(amountDue).trim() !== "";
}

/**
 * Amount Due checksum (OI-002 / museum amountDueOK).
 * Bills: typed Amount Due must match ERPNext `grand_total` (items + taxes).
 * Idle until the user types something (blank field = grey chip, save allowed).
 *
 * @param {string|number|null|undefined} amountDue user-typed Total Amount Due
 * @param {string|number|null|undefined} grandTotal ERPNext grand_total
 * @param {number} [eps=0.005]
 * @returns {"idle"|"match"|"mismatch"}
 */
export function amountDueChecksumStatus(amountDue, grandTotal, eps = 0.005) {
  if (!isAmountDueEntered(amountDue)) return "idle";
  return amountDueMatchesGrandTotal(amountDue, grandTotal, eps) ? "match" : "mismatch";
}

/**
 * Typed Amount Due minus compare total (null if idle / compare missing / not numeric).
 * Positive = typed higher than Bill total.
 * Note: never coerce null→0 (`Number(null) === 0` would fake "always vs zero").
 * @param {string|number|null|undefined} amountDue
 * @param {string|number|null|undefined} compareTotal
 * @returns {number|null}
 */
export function amountDueDelta(amountDue, compareTotal) {
  if (!isAmountDueEntered(amountDue)) return null;
  if (compareTotal == null || compareTotal === "") return null;
  const a = Number(String(amountDue).replace(/[^0-9.\-]/g, ""));
  const g = Number(compareTotal);
  if (!Number.isFinite(a) || !Number.isFinite(g)) return null;
  return a - g;
}

/**
 * Chip label + tooltip for Amount Due checksum.
 * UI lays out emoji and moneyText separately (input | emoji | money).
 * @param {string|number|null|undefined} amountDue
 * @param {string|number|null|undefined} compareTotal
 * @param {number} [eps=0.005]
 * @returns {{ status: "idle"|"match"|"mismatch", emoji: string, moneyText: string, text: string, title: string, delta: number|null }}
 */
export function amountDueChecksumChip(amountDue, compareTotal, eps = 0.005) {
  const status = amountDueChecksumStatus(amountDue, compareTotal, eps);
  const delta = amountDueDelta(amountDue, compareTotal);
  const usd = (n) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

  if (status === "idle") {
    return {
      status,
      emoji: "·",
      moneyText: "—",
      text: "· —",
      title: "Type the vendor invoice total to activate Amount Due checksum",
      delta: null,
    };
  }
  if (status === "match") {
    return {
      status,
      emoji: "✓",
      moneyText: usd(0),
      text: `✓ ${usd(0)}`,
      title: "Amount Due matches Bill grand total",
      delta: 0,
    };
  }
  if (delta == null) {
    return {
      status: "mismatch",
      emoji: "!",
      moneyText: "—",
      text: "! —",
      title: "Bill total not available yet — refresh after lines/taxes update",
      delta: null,
    };
  }
  const abs = Math.abs(delta);
  const money = usd(abs);
  const signedMoney = delta > 0 ? `+${money}` : `−${money}`;
  const title = `Off by ${money} (typed ${usd(Number(String(amountDue).replace(/[^0-9.\-]/g, "")))} vs bill total ${usd(Number(compareTotal))})`;
  return {
    status,
    emoji: "!",
    moneyText: signedMoney,
    text: `! ${signedMoney}`,
    title,
    delta,
  };
}

/** Editable fields on Purchase Taxes and Charges rows (thin Doc skin cut). */
export const BILL_TAX_EDIT_FIELDS = Object.freeze([
  "account_head",
  "description",
  "rate",
  "tax_amount",
  "add_deduct_tax",
]);

/**
 * @param {string} field
 * @returns {boolean}
 */
export function isEditableBillTaxField(field) {
  return typeof field === "string" && BILL_TAX_EDIT_FIELDS.includes(field);
}

/**
 * Project tax/charge rows for the Bill UI.
 * @param {object|null|undefined} doc
 * @returns {{ account_head: string, description: string, charge_type: string, rate: number|string, tax_amount: number|string, add_deduct_tax: string, idx: number }[]}
 */
export function readBillTaxRows(doc) {
  const taxes = doc && Array.isArray(doc.taxes) ? doc.taxes : [];
  return taxes.map((t, i) => ({
    idx: i,
    account_head: (t && t.account_head) || "",
    description: (t && t.description) || "",
    charge_type: (t && t.charge_type) || "",
    rate: t && t.rate != null ? t.rate : "",
    tax_amount: t && t.tax_amount != null ? t.tax_amount : "",
    add_deduct_tax: (t && t.add_deduct_tax) || "Add",
  }));
}

/**
 * Money stack for UI: item subtotal, taxes, grand total.
 * Amount Due checksum uses grandTotal only (museum amountDueOK).
 * @param {object|null|undefined} doc
 * @returns {{ itemSubtotal: number, taxesTotal: number, grandTotal: number|null, taxRowCount: number, note: string|null }}
 */
export function billMoneyStack(doc) {
  const itemSubtotal = sumBillLineAmount(doc);
  const taxRows = doc && Array.isArray(doc.taxes) ? doc.taxes : [];
  let taxesTotal =
    doc && doc.total_taxes_and_charges != null && Number.isFinite(Number(doc.total_taxes_and_charges))
      ? Number(doc.total_taxes_and_charges)
      : NaN;
  if (!Number.isFinite(taxesTotal)) {
    taxesTotal = taxRows.reduce((s, t) => {
      const amt = Number(t && t.tax_amount);
      if (!Number.isFinite(amt)) return s;
      const deduct = t && String(t.add_deduct_tax || "").toLowerCase() === "deduct";
      return s + (deduct ? -amt : amt);
    }, 0);
  }
  const grand =
    doc && doc.grand_total != null && Number.isFinite(Number(doc.grand_total))
      ? Number(doc.grand_total)
      : null;
  const note =
    taxRows.length === 0
      ? "No tax/charge rows — grand total equals item subtotal (unless other ERP adjustments)."
      : null;
  return {
    itemSubtotal: Number.isFinite(itemSubtotal) ? itemSubtotal : 0,
    taxesTotal: Number.isFinite(taxesTotal) ? taxesTotal : 0,
    grandTotal: grand,
    taxRowCount: taxRows.length,
    note,
  };
}

/**
 * Amount Due checksum target = ERPNext grand_total (museum OI-002 / amountDueOK).
 *
 * Guard: when `grand_total` is 0/missing but item(+tax) subtotals are non-zero, ERP snapshot
 * is often stale — use composed item subtotal + taxes so the chip is not "always vs $0".
 *
 * @param {object|null|undefined} doc
 * @returns {number|null}
 */
export function billCompareTotal(doc) {
  if (!doc || typeof doc !== "object") return null;

  const lines = sumBillLineAmount(doc);
  let taxes = NaN;
  if (doc.total_taxes_and_charges != null && doc.total_taxes_and_charges !== "") {
    taxes = Number(doc.total_taxes_and_charges);
  }
  if (!Number.isFinite(taxes)) {
    const taxRows = Array.isArray(doc.taxes) ? doc.taxes : [];
    taxes = taxRows.reduce((s, t) => {
      const amt = Number(t && t.tax_amount);
      if (!Number.isFinite(amt)) return s;
      const deduct = t && String(t.add_deduct_tax || "").toLowerCase() === "deduct";
      return s + (deduct ? -amt : amt);
    }, 0);
  }
  const composed = (Number.isFinite(lines) ? lines : 0) + (Number.isFinite(taxes) ? taxes : 0);
  const hasMoney = Math.abs(composed) > 0.005;

  const grandRaw = doc.grand_total;
  const grand =
    grandRaw != null && grandRaw !== "" && Number.isFinite(Number(grandRaw))
      ? Number(grandRaw)
      : null;

  if (grand != null) {
    // Trust non-zero grand_total (museum).
    if (Math.abs(grand) > 0.005) return grand;
    // grand is ~0: trust only when bill also has no item/tax money (true empty bill).
    if (!hasMoney) return grand;
    return composed;
  }

  if (hasMoney || Number.isFinite(lines)) return composed;
  return null;
}

/**
 * Save / gate helper: empty due is allowed; typed due must match compare total.
 * Missing compare total → not matched (do not treat null as $0).
 * @param {string|number|null|undefined} amountDue
 * @param {string|number|null|undefined} grandTotal
 * @param {number} [eps=0.005]
 */
export function amountDueMatchesGrandTotal(amountDue, grandTotal, eps = 0.005) {
  if (!isAmountDueEntered(amountDue)) return true;
  if (grandTotal == null || grandTotal === "") return false;
  const a = Number(String(amountDue).replace(/[^0-9.\-]/g, ""));
  const g = Number(grandTotal);
  if (!Number.isFinite(a) || !Number.isFinite(g)) return false;
  return Math.abs(a - g) <= eps;
}

/** Writable header fields (for Doc form wiring later). */
export function writableBillHeaderFields() {
  return BILL_HEADER_FIELDS.filter((f) => f.field && !f.readOnly);
}

/**
 * Draft Bill? ERP may send docstatus as number or string.
 * @param {object|null|undefined} doc
 */
export function isDraftBillDoc(doc) {
  if (!doc || typeof doc !== "object") return false;
  return Number(doc.docstatus) === 0;
}

/**
 * Project items with every qty zeroed (OI-026 Clear all qty) — pure, no ERP write.
 * @param {object|null|undefined} doc
 * @returns {object[]}
 */
export function projectClearedQtyItems(doc) {
  const items = doc && Array.isArray(doc.items) ? doc.items : [];
  return items.map((it) => {
    const row = { ...(it || {}) };
    row.qty = 0;
    const rate = Number(row.rate) || 0;
    row.amount = 0 * rate;
    return row;
  });
}

/**
 * Packing-slip hash after clear: Σ qty must be 0.
 * @param {object|null|undefined} doc
 */
export function packingSlipHashAfterClear(doc) {
  const projected = { items: projectClearedQtyItems(doc) };
  return { sumQty: sumBillLineQty(projected), ok: sumBillLineQty(projected) === 0 };
}

/**
 * Reconciliation report (OI-002): typed Due vs grand_total; Σ lines is diagnostic.
 *
 * @param {object|null|undefined} doc
 * @param {string|number|null|undefined} amountDue
 * @param {number} [eps=0.005]
 */
export function reconciliationReport(doc, amountDue, eps = 0.005) {
  const grand = doc && doc.grand_total != null ? Number(doc.grand_total) : NaN;
  const linesSum = sumBillLineAmount(doc);
  const compare = billCompareTotal(doc);
  const stack = billMoneyStack(doc);
  const chip = amountDueChecksumStatus(amountDue, compare, eps);
  const dueEmpty = !isAmountDueEntered(amountDue);
  const dueNum = dueEmpty
    ? null
    : Number(String(amountDue).replace(/[^0-9.\-]/g, ""));
  const linesVsGrand =
    Number.isFinite(grand) && Number.isFinite(linesSum)
      ? Math.abs(linesSum - grand) <= eps
      : false;
  return {
    chip,
    linesSum,
    compareTotal: compare,
    grandTotal: Number.isFinite(grand) ? grand : null,
    itemSubtotal: stack.itemSubtotal,
    taxesTotal: stack.taxesTotal,
    amountDue: dueNum,
    linesMatchGrandTotal: linesVsGrand,
    saveAllowed: amountDueMatchesGrandTotal(amountDue, compare, eps),
  };
}

/**
 * UI: disable Save / Submit when checksum is mismatch (idle/match OK).
 * @param {"idle"|"match"|"mismatch"} status
 */
export function saveActionsBlockedByChecksum(status) {
  return status === "mismatch";
}

/**
 * Museum fmtUsd — prefer src/money.js; kept as thin re-export for bill-map callers.
 * @param {string|number|null|undefined} n
 * @returns {string}
 */
export { formatUsdAmount } from "./money.js";

/**
 * Topic tags covered by BILL_ASSUMPTIONS (for museum parity tests).
 * @returns {string[]}
 */
export function billAssumptionTopicsCovered() {
  const text = BILL_ASSUMPTIONS.join("\n").toLowerCase();
  /** @type {string[]} */
  const hit = [];
  if (/draft/.test(text) && /submit/.test(text)) hit.push("draft_then_submit");
  if (/finished goods/.test(text)) hit.push("warehouse_finished_goods");
  if (/purchase order/.test(text) && /item receipt/.test(text)) {
    hit.push("from_po_posts_bill_and_receipt");
  }
  if (/item receipt/.test(text) && /only the bill/.test(text)) {
    hit.push("from_pr_posts_bill_only");
  }
  if (/amount due/.test(text)) hit.push("amount_due_must_match");
  if (/items-based|chart-of-accounts/.test(text)) hit.push("items_based_not_direct_gl");
  return hit;
}
