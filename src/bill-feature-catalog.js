/**
 * Bill Doc feature catalog — museum vs alpha (gap audit SSoT for unit tests).
 * Each row must stay honest: update status when features ship or break.
 *
 * @typedef {"tested"|"built_untested"|"electron_only"|"missing"|"buggy"|"partial"} Coverage
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
    id: "vendor-idle-rank",
    name: "Vendor picker: idle / never-PO sink below active (OI-131)",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "vendor-activity.js",
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
    name: "Ship from / Ship to / Billing (multiline, read-only)",
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
    name: "Ref No. soft checks (dupe + PO logbook + vendor account #)",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "bill-ref-check.js",
    notes:
      "OI-054/087 non-blocking. Vendor account # = Customer Number At Supplier (your # at the vendor), not SO customer.",
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
    name: "Amount Due checksum vs grand_total (+ $ delta chip)",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "bill-map.js",
    notes: "Idle (grey · —) until user types; then typed Due ↔ grand_total. Never auto-fill from grand_total.",
  },
  {
    id: "amount-due-grand-pointer",
    name: "OI-073 Amount Due row shows Bill grand total beside diff chip",
    museum: false,
    alpha: true,
    coverage: "tested",
    pureModule: "bill-map.js",
    notes: "Pointer only — money stack remains tax breakdown SSoT.",
  },
  {
    id: "amount-due-usd-blur",
    name: "Amount Due USD $ blur format",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "money.js",
    notes: "Same $#,###.## blur format in the always-visible input (no display overlay).",
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
    alpha: true,
    coverage: "tested",
    pureModule: "bill-map.js + bill-action-flow.js (Expenses→Taxes orientation)",
  },
  {
    id: "taxes-charges-table",
    name: "Taxes and Charges table (show + edit Actual rows)",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "bill-map.js (readBillTaxRows / billMoneyStack)",
    notes: "Bridge setTaxRow/addTaxRow/deleteTaxRow; Amount Due still vs grand_total.",
  },
  {
    id: "money-stack",
    name: "Item subtotal + Taxes + Grand Total stack",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "bill-map.js (billMoneyStack)",
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
    coverage: "tested",
    pureModule: "doc-source-flow.js",
    notes: "HAR: PR Item 403 killed listSources; enrich removed. Dogfood green 2026-07-18.",
  },
  {
    id: "source-toolbar",
    name: "Toolbar Select PO / source",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "doc-source-flow.js + bill-toolbar.js",
  },
  {
    id: "source-focus-invoice-date",
    name: "Focus Invoice date after source choose",
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
  {
    id: "bill-line-allocation",
    name: "Line Assign: customer → multi SO → Project (OI-134)",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "bill-line-allocation.js + so-picker.js",
    notes: "Per-line Assign…; project persists; customer+SO in shell scratch; JIT PO when item+vendor",
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
    alpha: true,
    coverage: "tested",
    pureModule: "bill-toolbar.js",
    notes: "Waits for PI list route (not form); dirty commit popover before leave",
  },
  {
    id: "toolbar-new",
    name: "New Bill",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "bill-toolbar.js",
    notes: "Doc-skin new PI; dirty commit popover before leave",
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
    id: "credit-memo-create",
    name: "Create Credit / Return (OI-082) — not museum's Create Copy, native make_debit_note",
    museum: false,
    alpha: true,
    coverage: "partial",
    pureModule: "credit-memo.js",
    notes:
      "is_return/return_against classification + orphan-warning fully unit-tested; toolbar " +
      "action + linked-Bill peek row are electron-only, no e2e yet.",
  },
  {
    id: "credit-memo-new-from-nothing",
    name: "Credit memo toggle on a new/draft Bill (no source Bill yet, OI-147)",
    museum: false,
    alpha: true,
    coverage: "electron_only",
    pureModule: "bill-map.js (isWritableBillHeaderField)",
    notes:
      "Draft-only Yes/No switch (mirrors Already paid?) sets is_return on the already-loaded " +
      "form — no New-Bill-then-set_value round trip, so no nav-intent race window. Deliberately " +
      "orphaned until informally linked. Reworked from a toolbar button after a real nav " +
      "incident (2026-09-07): the old New Credit Memo button chained New Bill + setHeader, and " +
      "under chaos-lag a stale prior ERP navigation could land in between and clobber cur_frm.",
  },
  {
    id: "credit-memo-informal-links",
    name: "Informal link to Bill / Sales Order (remarks token, OI-147/164/165)",
    museum: false,
    alpha: true,
    coverage: "partial",
    pureModule: "credit-memo.js (buildLinkToken/parseLinkToken/stripLinkToken/withLinkToken)",
    notes:
      "Token engine fully unit-tested. Bill picker (same-vendor default, search-any-vendor on " +
      "type) is electron-only. Sales Order picker reuses OI-134's fetch as a rough first pass — " +
      "not dogfooded yet (5zorro 2026-09-07).",
  },
  {
    id: "credit-memo-source-pick",
    name: "Pick the source Bill at the moment Credit memo? flips to Yes (OI-147)",
    museum: false,
    alpha: true,
    coverage: "partial",
    pureModule: "credit-memo.js (planCreditMemoSource/draftHasEnteredLines)",
    notes:
      "Answers 'which Bill is this against?' where the clerk did NOT arrive from a submitted " +
      "Bill, so nothing has set return_against. Routing is unit-tested: an untouched draft is " +
      "rebuilt via native make_debit_note (real return_against, right expense account); a draft " +
      "with typed lines keeps its work and settles for the informal token, and is told which " +
      "trade it just made. Never silently destroys entered lines. Picker chrome is electron-only.",
  },
  {
    id: "credit-memo-source-modal-switch",
    name: "Credit memo? switch in the source modal's button row (OI-166)",
    museum: false,
    alpha: true,
    coverage: "partial",
    pureModule: "source-modal-credit-mode.js",
    notes:
      "The source modal asks one question — where does this Bill come from? — and the foot " +
      "switch changes which corpus answers it: open PO/IR, or the submitted Bill this credit " +
      "is against. Matches how 5zorro actually works: vendor, then source, in one breath. " +
      "Click-only and out of the tab order like every .src-foot control, because the modal " +
      "captures Tab for group navigation. Arity flips with the mode (return_against is one " +
      "Link, so credit mode is single-pick) and the commit routes through the same " +
      "commitCreditSource/planCreditMemoSource path as the standalone picker — never a " +
      "freeform is_return flip. Arity, group shapes, labels and choice classification are " +
      "unit-tested; the DOM switch and the live fetch are electron-only. Vendor-scoped: " +
      "cross-vendor search stays on the header switch's picker until this modal grows a " +
      "search field.",
  },
  {
    id: "toolbar-print",
    name: "Print",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "bill-action-flow.js",
    notes: "Switches to Vanilla print preview route; Recent shows Print preview; waits for /print/",
  },
  {
    id: "toolbar-attach",
    name: "Attach File (OI-005)",
    museum: true,
    alpha: true,
    coverage: "partial",
    pureModule: "bill-toolbar.js",
    notes: "Memo-row button opens Vanilla FileUploader after save; in-Bill panel later",
  },
  {
    id: "memo-below-items",
    name: "Memo below items table (OI-005)",
    museum: true,
    alpha: true,
    coverage: "electron_only",
    pureModule: null,
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
    alpha: true,
    coverage: "partial",
    pureModule: "bill-toolbar.js",
    notes: "Revert wired (museum bind.js). Save&Close / Save&New still missing (T3a).",
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
    alpha: true,
    coverage: "partial",
    pureModule: "doc-caps.js",
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
