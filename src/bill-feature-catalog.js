/**
 * Bill Doc feature catalog — museum vs alpha (gap audit SSoT for unit tests).
 * Each row must stay honest: update status when features ship or break.
 *
 * @typedef {"tested"|"built_untested"|"electron_only"|"missing"|"buggy"} Coverage
 * @typedef {{
 *   id: string,
 *   name: string,
 *   museum: boolean,
 *   alpha: boolean,
 *   coverage: Coverage,
 *   pureModule: string|null,
 *   notes?: string,
 * }} BillFeatureRow
 */

/** @type {readonly BillFeatureRow[]} */
export const BILL_FEATURE_CATALOG = Object.freeze([
  // —— Header / identity ——
  {
    id: "title-bill",
    name: "Title “Bill” (Purchase Invoice anchor)",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "bill-map.js / doc-terms.js",
  },
  {
    id: "vendor-display",
    name: "Vendor Name projector (supplier_name|supplier)",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "bill-map.js",
  },
  {
    id: "vendor-link-picker",
    name: "Vendor Link picker (search / Tab / Enter / click)",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "link-search.js + link-picker-policy.js",
    notes: "DOM in bill.html; policy + search pure-tested",
  },
  {
    id: "vendor-add-empty",
    name: "Empty Supplier search → Go to Vendor add…",
    museum: false,
    alpha: true,
    coverage: "tested",
    pureModule: "link-search.js",
  },
  {
    id: "address-readonly",
    name: "Address read-only (strip HTML)",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "bill-map.js",
  },
  {
    id: "terms-link",
    name: "Terms Link picker",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "link-search.js + link-picker-policy.js",
  },
  {
    id: "date-fields",
    name: "Date / Bill Due Date text entry (MM/DD/YYYY)",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "doc-date.js",
  },
  {
    id: "ref-no",
    name: "Ref No. (bill_no)",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "bill-map.js",
  },
  {
    id: "memo",
    name: "Memo (remarks)",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "bill-map.js",
  },
  {
    id: "amount-due-checksum",
    name: "Amount Due checksum vs grand_total",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "bill-map.js",
  },
  {
    id: "amount-due-usd-blur",
    name: "Amount Due USD $ blur format",
    museum: true,
    alpha: false,
    coverage: "missing",
    pureModule: "bill-map.js (formatUsdAmount stub)",
  },
  {
    id: "reconciliation-report",
    name: "Reconciliation: Σ lines vs Due vs grand_total",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "bill-map.js",
  },
  {
    id: "save-blocked-mismatch",
    name: "Save/Submit blocked when checksum mismatch",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "bill-map.js",
  },

  // —— Lines ——
  {
    id: "item-rows",
    name: "Item rows Item/Desc/Qty/Cost/Amount/Project",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "bill-map.js",
  },
  {
    id: "item-link",
    name: "Item + Project Link pickers on lines",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "link-search.js + link-picker-policy.js",
  },
  {
    id: "line-edit-allowlist",
    name: "Editable line fields allowlist (no Amount write)",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "bill-map.js",
  },
  {
    id: "add-delete-line",
    name: "Add line / Delete line",
    museum: true,
    alpha: true,
    coverage: "electron_only",
    pureModule: null,
    notes: "IPC only; no pure projector yet",
  },
  {
    id: "line-totals",
    name: "Σ Qty / Σ Amt footer",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "bill-map.js",
  },
  {
    id: "clear-all-qty",
    name: "Clear all qty (OI-026 packing-slip hash)",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "bill-map.js",
  },
  {
    id: "expenses-tab",
    name: "Expenses tab + items-based disclaimer",
    museum: true,
    alpha: false,
    coverage: "missing",
    pureModule: "bill-map.js (BILL_EXPENSE_NOTE)",
  },

  // —— Source modal ——
  {
    id: "source-groups",
    name: "Source groups NIC / PO / PR / drafts grey",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "source-modal.js",
  },
  {
    id: "source-pr-po-label",
    name: "PR rows show linked PO#",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "source-modal.js",
  },
  {
    id: "source-open-after-vendor",
    name: "Open source modal after vendor pick",
    museum: true,
    alpha: true,
    coverage: "buggy",
    pureModule: "bill-source-flow.js",
    notes: "Policy unit-tested; Electron dogfood still failing (bounty)",
  },
  {
    id: "source-toolbar",
    name: "Toolbar Select PO / source",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "bill-source-flow.js + bill-toolbar.js",
  },
  {
    id: "source-focus-terms",
    name: "Focus Terms after source choose",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "bill-source-flow.js",
  },
  {
    id: "source-merge-rules",
    name: "Merge PO/PR → Bill skip/copy fields + method",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "bill-source-flow.js",
  },

  // —— Assumptions / dirty / lens ——
  {
    id: "assumptions",
    name: "Assumptions panel (museum SPECS parity)",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "bill-map.js",
  },
  {
    id: "dirty-gate",
    name: "Leave-Bill dirty gate (userEdited only)",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "dirty-gate.js",
  },
  {
    id: "lens-bill-ready",
    name: "Doc skin tab ready for Bill form",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "lens-context.js",
  },

  // —— Toolbar / chrome museum extras ——
  {
    id: "toolbar-find",
    name: "Find Bills",
    museum: true,
    alpha: false,
    coverage: "missing",
    pureModule: "bill-toolbar.js",
  },
  {
    id: "toolbar-new",
    name: "New Bill",
    museum: true,
    alpha: false,
    coverage: "missing",
    pureModule: "bill-toolbar.js",
  },
  {
    id: "toolbar-delete",
    name: "Delete",
    museum: true,
    alpha: false,
    coverage: "missing",
    pureModule: "bill-toolbar.js",
  },
  {
    id: "toolbar-copy",
    name: "Create Copy",
    museum: true,
    alpha: false,
    coverage: "missing",
    pureModule: "bill-toolbar.js",
  },
  {
    id: "toolbar-print",
    name: "Print",
    museum: true,
    alpha: false,
    coverage: "missing",
    pureModule: "bill-toolbar.js",
  },
  {
    id: "toolbar-attach",
    name: "Attach File (OI-005)",
    museum: true,
    alpha: false,
    coverage: "missing",
    pureModule: "bill-toolbar.js",
  },
  {
    id: "toolbar-recalc",
    name: "Recalculate",
    museum: true,
    alpha: false,
    coverage: "missing",
    pureModule: "bill-toolbar.js",
  },
  {
    id: "toolbar-pay",
    name: "Pay Bill",
    museum: true,
    alpha: false,
    coverage: "missing",
    pureModule: "bill-toolbar.js",
  },
  {
    id: "footer-revert",
    name: "Revert unsaved / Save&Close / Save&New",
    museum: true,
    alpha: false,
    coverage: "missing",
    pureModule: "bill-toolbar.js",
  },
  {
    id: "nav-tabs",
    name: "Nav tabs Bill / Credit / Item Receipt",
    museum: true,
    alpha: false,
    coverage: "missing",
    pureModule: "bill-toolbar.js",
  },
  {
    id: "all-caps",
    name: "ALL-CAPS entry toggle",
    museum: true,
    alpha: false,
    coverage: "missing",
    pureModule: null,
  },
  {
    id: "form-bridge",
    name: "ERP form bridge helpers (enrich / match)",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "erp-form-bridge.js",
  },
]);

/**
 * @param {Coverage} [coverage]
 * @returns {BillFeatureRow[]}
 */
export function billFeaturesByCoverage(coverage) {
  if (!coverage) return [...BILL_FEATURE_CATALOG];
  return BILL_FEATURE_CATALOG.filter((r) => r.coverage === coverage);
}

/**
 * Museum features that alpha claims to have built (alpha:true, museum:true).
 * @returns {BillFeatureRow[]}
 */
export function billFeaturesBuiltFromMuseum() {
  return BILL_FEATURE_CATALOG.filter((r) => r.museum && r.alpha);
}

/**
 * Gaps still missing in alpha.
 * @returns {BillFeatureRow[]}
 */
export function billFeaturesMissingInAlpha() {
  return BILL_FEATURE_CATALOG.filter((r) => r.museum && !r.alpha);
}
