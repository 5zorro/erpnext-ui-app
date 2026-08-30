/**
 * Bill (Purchase Invoice) field map — pure projectors for M3 Doc skin.
 * Museum lesson: bind.js SPECS["Purchase Invoice"]; child writes later via set_value only.
 */

import { relabelTerm } from "./doc-terms.js";
import {
  ERP_PAYMENT_TERMS_FIELD,
  ERP_FREEFORM_TERMS_FIELD,
  PAYMENT_TERMS_HEADER_LABEL,
  FREEFORM_TERMS_LABEL,
  plainTermsText,
} from "./doc-terms-fields.js";
import { formatAddressDisplay } from "./address-format.js";
import {
  BILL_ALLOCATION_COLS,
  JOB_COST_CENTER_FIELD,
  JOB_COST_CENTER_LABEL,
} from "./bill-line-allocation.js";
import { BILL_LINE_META_COLS, readBillItemRowsWithAllocation } from "./bill-item-table.js";

export const BILL_DOCTYPE = "Purchase Invoice";
export const BILL_LAYOUT_KEY = "bill";
export const BILL_LIST_ROUTE = "/app/purchase-invoice";
export const BILL_NEW_ROUTE = "/app/purchase-invoice/new";

/**
 * Header: Doc label → ERPNext field meta.
 * Address roles (OI-077): Ship from = dispatch; Ship to = shipping; Billing = supplier address.
 * Layout (2026-08-26 dogfood): left = Vendor → Invoice date → Billing → Terms → Bill Due Date;
 * right = Ref → Amount Due → linked PO ERP names + logbook `title` (OI-121);
 * bottom addr-grid = Ship from · Ship to only.
 * `column`: "left" | "right" | "addresses" — when set, `splitHeaderColumns` uses it.
 */
export const BILL_HEADER_FIELDS = [
  {
    label: "Vendor Name",
    field: "supplier",
    type: "text",
    linkDoctype: "Supplier",
    display: "supplier_name|supplier",
    column: "left",
  },
  { label: "Invoice date", field: "posting_date", type: "date", column: "left" },
  {
    label: "Remittance & Billing Address",
    field: null,
    type: "textarea",
    readOnly: true,
    multiline: true,
    addressRole: "billing",
    display: "address_display",
    column: "left",
  },
  {
    label: PAYMENT_TERMS_HEADER_LABEL,
    field: ERP_PAYMENT_TERMS_FIELD,
    type: "text",
    linkDoctype: "Payment Terms Template",
    column: "left",
  },
  { label: "Bill Due Date", field: "due_date", type: "date", column: "left" },
  { label: "Ref No. (Supplier Invoice No.)", field: "bill_no", type: "text", column: "right" },
  {
    label: "Amount Due",
    field: "__amount_due",
    type: "text",
    scratch: true,
    column: "right",
    validationHint:
      "Enter the vendor invoice total when ready. Checksum stays idle until you type; then it must match Bill grand total.",
  },
  {
    label: "Ship from / supplier dispatch",
    field: null,
    type: "textarea",
    readOnly: true,
    multiline: true,
    addressRole: "ship_from",
    display: "dispatch_address_display",
    column: "addresses",
  },
  {
    label: "Ship to / receiving address",
    field: null,
    type: "textarea",
    readOnly: true,
    multiline: true,
    addressRole: "ship_to",
    display: "shipping_address_display",
    column: "addresses",
  },
];

/**
 * Distinct Purchase Order `name`s linked from Bill item lines (order of first appearance).
 * @param {object|null|undefined} doc
 * @returns {string[]}
 */
export function uniqueLinkedPurchaseOrderNames(doc) {
  const items = doc && Array.isArray(doc.items) ? doc.items : [];
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  for (const it of items) {
    const po = it && it.purchase_order != null ? String(it.purchase_order).trim() : "";
    if (!po || seen.has(po)) continue;
    seen.add(po);
    out.push(po);
  }
  return out;
}

/**
 * Pair linked PO ERP ids with logbook titles (PO.`title`, OI-121).
 * @param {object|null|undefined} doc
 * @param {Array<{ name?: string, title?: string|null }>|Record<string, string>|null|undefined} titles
 * @returns {Array<{ name: string, title: string }>}
 */
export function linkedPurchaseOrdersForBill(doc, titles) {
  const names = uniqueLinkedPurchaseOrderNames(doc);
  /** @type {Record<string, string>} */
  const byName = {};
  if (titles && typeof titles === "object" && !Array.isArray(titles)) {
    for (const [k, v] of Object.entries(titles)) {
      if (k) byName[k] = v != null ? String(v) : "";
    }
  } else if (Array.isArray(titles)) {
    for (const row of titles) {
      if (!row || row.name == null) continue;
      const n = String(row.name).trim();
      if (!n) continue;
      byName[n] = row.title != null ? String(row.title) : "";
    }
  }
  return names.map((name) => ({
    name,
    title: byName[name] != null ? byName[name] : "",
  }));
}

export const BILL_MEMO_FIELD = "remarks";
export const BILL_TERMS_FIELD = ERP_FREEFORM_TERMS_FIELD;

/** Doc Bill hides editable ERP freeform terms; source terms stay read-only. */
export function billShowsEditableTermsField() {
  return false;
}

/** Doc + Bill memo block label (museum: Remarks & Freehand Memo). */
export const BILL_MEMO_LABEL = "Remarks & Freehand Memo";

export { JOB_COST_CENTER_FIELD, JOB_COST_CENTER_LABEL };

/** Items tab columns; null = display-only Amount from ERPNext. */
export const BILL_ITEM_BASE_COLS = [
  { label: "Item", field: "item_code", linkDoctype: "Item" },
  { label: "Description", field: "description" },
  { label: "Qty", field: "qty" },
  { label: "Cost", field: "rate" },
  { label: "Amount", field: null, displayOnly: true },
];

export const BILL_ITEM_COLS = [...BILL_LINE_META_COLS, ...BILL_ITEM_BASE_COLS, ...BILL_ALLOCATION_COLS];

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

/**
 * Vanilla Purchase Invoice Desk tabs vs what Doc Bill covers today.
 * Shown under Assumptions for payment / credit-card brainstorming — not museum SPECS topics.
 * @type {readonly { tab: string, note: string }[]}
 */
export const BILL_VANILLA_TAB_NOTES = Object.freeze([
  {
    tab: "Details",
    note: "Vendor, dates, Terms, bill #, items — Doc Bill covers most of this surface today.",
  },
  {
    tab: "Payments",
    note:
      "On-Bill Already paid memory (`is_paid` on draft). Doc Submit clears `is_paid` and creates a Payment Entry (JIT). Separate from Desk batch Pay.",
  },
  {
    tab: "Payment Schedule",
    note: "Installments / due dates from Payment Terms Template — Doc shows Terms on the header only; schedule rows stay in Vanilla for now.",
  },
  {
    tab: "Terms and Conditions",
    note: "Long-form T&C text — not mirrored on Doc Bill.",
  },
  {
    tab: "Accounting Dimensions",
    note: "Cost Center / Project (and site dimensions) at doc level — Doc has Project on lines; header dimensions mostly Vanilla.",
  },
  {
    tab: "More Info",
    note: "Status, remarks, is paid flags, and other meta — Doc shows a subset (memo / status chips).",
  },
  {
    tab: "Connections",
    note: "Linked PO / PR / Payment Entry / GL — Doc shows linked PO# wash; full Connections graph remains Vanilla.",
  },
]);

/**
 * Vanilla Bill → Payments tab — field/button inventory (dogfood 2026-08-25).
 * Path 1 for credit card: draft Bill → Payments → Mode of Payment + paid amount.
 * @type {readonly { control: string, note: string }[]}
 */
export const BILL_VANILLA_PAYMENTS_TAB_CONTROLS = Object.freeze([
  {
    control: "Is Paid (checkbox)",
    note: "Marks the Bill paid at Submit; Vanilla may auto-create a Payment Entry when cash/bank account is set.",
  },
  {
    control: "Mode of Payment",
    note: "e.g. Credit Card / Check / Wire — link; create/edit opens Mode of Payment master (soft-peek).",
  },
  {
    control: "Cash / Bank Account",
    note: "GL account for the outflow; required for auto Payment Entry on Submit when Is Paid.",
  },
  {
    control: "Paid Amount",
    note: "Amount applied on this Bill; set to the Bill total for a full CC pay-at-entry.",
  },
  {
    control: "Clearance Date / Reference No.",
    note: "Bank/CC reference metadata when the payment clears.",
  },
  {
    control: "Write Off Amount / Account",
    note: "Small differences written off instead of left outstanding.",
  },
  {
    control: "Allocate Advances / Payment Schedule",
    note: "Advances against this supplier; schedule rows also live under Payment Schedule tab.",
  },
]);

/**
 * Desk → Payment Entry path (pay submitted / outstanding Bills) — dogfood notes.
 * @type {readonly { step: string, note: string }[]}
 */
export const BILL_PAYMENT_ENTRY_FLOW_NOTES = Object.freeze([
  {
    step: "Open Payment Entry (Pay)",
    note: "Accounts → Payment Entry → New (or Home Pay Bills / Create Payment Entry from a submitted Bill).",
  },
  {
    step: "Party = Supplier (Vendor)",
    note: "Payment Type usually Pay; pick the vendor who owns the unpaid Bills.",
  },
  {
    step: "Mode of Payment = Credit Card",
    note: "Same MoP master as on the Bill Payments tab; must resolve a cash/bank account.",
  },
  {
    step: "Paid Amount > 0 first",
    note: "Weird vs other ERPs: References / Get Outstanding Invoices often stays empty until Paid Amount is non-zero.",
  },
  {
    step: "Get Outstanding Invoices",
    note: "Pulls unpaid Purchase Invoices for that vendor into the References table.",
  },
  {
    step: "Allocate / adjust amounts",
    note: "Then change the allocated amount per Bill to match outstanding (or partial pay).",
  },
  {
    step: "Save → Submit Payment Entry",
    note: "Reduces Bill outstanding_amount; Bill status moves toward Paid.",
  },
]);

/** Museum Expenses-tab disclaimer — dogfood wording 2026-07-21 (OI-059). */
export const BILL_EXPENSE_NOTE =
  "This ERP is items-based — expense lines on Bills are added in two ways:\n" +
  "1) via an Item (Chart-of-Accounts-mapped items) added as a row to the items table that this is attached to.\n" +
  "2) via Vendor tax/freight in the Taxes and Charges section below (related accounting).";

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
    if (meta.addressRole && meta.display) {
      out[meta.label] = formatAddressDisplay(d[meta.display]);
      continue;
    }
    if (!meta.field) {
      out[meta.label] = "";
      continue;
    }
    out[meta.label] = d[meta.field] != null ? d[meta.field] : "";
  }
  out.Memo = d[BILL_MEMO_FIELD] != null ? d[BILL_MEMO_FIELD] : "";
  out[FREEFORM_TERMS_LABEL] = plainTermsText(d[BILL_TERMS_FIELD]);
  return out;
}

/**
 * @param {object} doc
 * @param {Record<string|number, import("./bill-line-allocation.js").LineAllocation>} [lineAllocations]
 * @param {Record<string|number, import("./bill-item-table.js").PoLineMeta>} [poMetaByRow]
 * @returns {Array<Array<string|number>>}
 */
export function readBillItemRows(doc, lineAllocations, poMetaByRow) {
  return readBillItemRowsWithAllocation(doc, lineAllocations, poMetaByRow);
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
 * UI lays out icon and moneyText separately (input | icon | money).
 * @param {string|number|null|undefined} amountDue
 * @param {string|number|null|undefined} compareTotal
 * @param {number} [eps=0.005]
 * @returns {{ status: "idle"|"match"|"mismatch", icon: string, moneyText: string, text: string, title: string, delta: number|null }}
 */
export function amountDueChecksumChip(amountDue, compareTotal, eps = 0.005) {
  const status = amountDueChecksumStatus(amountDue, compareTotal, eps);
  const delta = amountDueDelta(amountDue, compareTotal);
  const usd = (n) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

  if (status === "idle") {
    return {
      status,
      icon: "idle",
      moneyText: "—",
      text: "—",
      title: "Type the vendor invoice total to activate Amount Due checksum",
      delta: null,
    };
  }
  if (status === "match") {
    return {
      status,
      icon: "check",
      moneyText: usd(0),
      text: usd(0),
      title: "Amount Due matches Bill grand total",
      delta: 0,
    };
  }
  if (delta == null) {
    return {
      status: "mismatch",
      icon: "alert",
      moneyText: "—",
      text: "—",
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
    icon: "alert",
    moneyText: signedMoney,
    text: signedMoney,
    title,
    delta,
  };
}

/**
 * OI-073 — pointer next to Amount Due chip (same compare target as checksum).
 * Money stack at page bottom remains the full breakdown SSoT for taxes.
 * @param {string|number|null|undefined} compareTotal
 * @returns {{ text: string, title: string, grandTotal: number|null }}
 */
export function amountDueGrandPointer(compareTotal) {
  const usd = (n) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
  if (compareTotal == null || compareTotal === "") {
    return {
      text: "Bill —",
      title: "Bill grand total not available yet — add lines/taxes or Refresh",
      grandTotal: null,
    };
  }
  const n = Number(compareTotal);
  if (!Number.isFinite(n)) {
    return {
      text: "Bill —",
      title: "Bill grand total not available yet — add lines/taxes or Refresh",
      grandTotal: null,
    };
  }
  return {
    text: `Bill ${usd(n)}`,
    title: "Bill grand total (checksum target) — full tax breakdown is in the money stack below",
    grandTotal: n,
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
  return BILL_HEADER_FIELDS.filter((f) => f.field && !f.readOnly && !String(f.field).startsWith("__"));
}

/**
 * Header fields Doc Bill may write via setHeader (main header + Already paid).
 * @param {string} field
 */
export function isWritableBillHeaderField(field) {
  if (typeof field !== "string" || !field || field.startsWith("__")) return false;
  if (writableBillHeaderFields().some((m) => m.field === field)) return true;
  if (
    field === "supplier_address" ||
    field === "dispatch_address" ||
    field === "shipping_address"
  ) {
    return true;
  }
  return (
    field === "is_paid" ||
    field === "mode_of_payment" ||
    field === "cash_bank_account" ||
    field === "paid_amount" ||
    field === BILL_MEMO_FIELD
  );
}

/**
 * Draft Bill? ERP may send docstatus as number or string.
 * @param {object|null|undefined} doc
 */
export function isDraftBillDoc(doc) {
  if (!doc || typeof doc !== "object") return false;
  // New unsaved forms often omit docstatus; treat missing as draft (match PO/IR).
  const ds = doc.docstatus;
  return ds == null || ds === "" || Number(ds) === 0;
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
 * OI-105: float the blocking Amount Due diff when the in-header chip scrolls away.
 * @param {"idle"|"match"|"mismatch"|string|null|undefined} chipStatus
 * @param {boolean} anchorInView
 */
export function shouldShowAmountDueSticky(chipStatus, anchorInView) {
  return chipStatus === "mismatch" && !anchorInView;
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
