/**
 * Doc-form feature catalog — light museum↔alpha rows for PO + Item Receipt.
 * Bill’s full catalog stays in bill-feature-catalog.js; this covers shared shell gaps.
 *
 * @typedef {"tested"|"built_untested"|"electron_only"|"missing"|"buggy"|"partial"} Coverage
 * @typedef {"po"|"receipt"|"both"} DocFormProfileScope
 * @typedef {{
 *   id: string,
 *   name: string,
 *   profiles: DocFormProfileScope,
 *   museum: boolean,
 *   alpha: boolean,
 *   coverage: Coverage,
 *   pureModule: string|null,
 *   notes?: string,
 * }} DocFormFeatureRow
 */

/** @type {readonly DocFormFeatureRow[]} */
export const DOC_FORM_FEATURE_CATALOG = Object.freeze([
  {
    id: "doc-toolbar-commit-gate",
    name: "Shared commit gate (save blockers + discard/save/submit)",
    profiles: "both",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "doc-commit-gate-ui.js + doc-form-flow.js",
  },
  {
    id: "doc-caps-toggle",
    name: "ALL-CAPS data entry toggle",
    profiles: "both",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "doc-caps-ui.js",
  },
  {
    id: "doc-link-picker",
    name: "Link picker on vendor, item, account fields",
    profiles: "both",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "link-picker-ui.js + link-picker-policy.js",
  },
  {
    id: "po-date-expected",
    name: "Date Expected stamps line schedule_date",
    profiles: "po",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "po-map.js + doc-form-page.js",
  },
  {
    id: "po-line-sort",
    name: "Sortable PO item columns (display-only)",
    profiles: "po",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "doc-item-sort.js",
  },
  {
    id: "po-line-totals",
    name: "Σ Qty / amount line totals footer",
    profiles: "po",
    museum: true,
    alpha: true,
    coverage: "electron_only",
    pureModule: "po-map.js",
    notes: "Paint in doc-form-page.js",
  },
  {
    id: "ir-source-modal",
    name: "Select PO source modal (single-select)",
    profiles: "receipt",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "source-modal-ui.js + source-modal.js",
  },
  {
    id: "ir-taxes-block",
    name: "Taxes and charges table + money stack",
    profiles: "receipt",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "bill-map.js + bill-tax-sort.js",
  },
  {
    id: "ir-tax-header-sort",
    name: "Sortable tax column headers (no allocate)",
    profiles: "receipt",
    museum: false,
    alpha: true,
    coverage: "tested",
    pureModule: "bill-tax-sort.js",
    notes: "Display order only; idx preserved for ERP writes",
  },
  {
    id: "ir-memo-attach",
    name: "Memo + attach on Item Receipt",
    profiles: "receipt",
    museum: true,
    alpha: true,
    coverage: "electron_only",
    pureModule: "receipt-map.js",
  },
  {
    id: "ir-expenses-tab",
    name: "Expenses tab (informational)",
    profiles: "receipt",
    museum: true,
    alpha: true,
    coverage: "electron_only",
    pureModule: "receipt-map.js",
  },
  {
    id: "doc-form-inventory",
    name: "Profile-parameterized interactable inventory",
    profiles: "both",
    museum: false,
    alpha: true,
    coverage: "tested",
    pureModule: "inventories/doc-form-inventory.js",
  },
  {
    id: "address-picker-profile",
    name: "Address picker behind features.addressPicker + doc-address roles",
    profiles: "both",
    museum: true,
    alpha: true,
    coverage: "tested",
    pureModule: "doc-address.js + address-picker-ui.js",
    notes: "Bill pickable; PO display-only until linkField research",
  },
]);

/**
 * @param {DocFormProfileScope} scope
 * @returns {DocFormFeatureRow[]}
 */
export function docFormFeaturesForScope(scope) {
  return DOC_FORM_FEATURE_CATALOG.filter(
    (r) => r.profiles === scope || r.profiles === "both",
  );
}

/**
 * @param {"po"|"receipt"} profileId
 * @returns {DocFormFeatureRow[]}
 */
export function docFormFeaturesForProfile(profileId) {
  return DOC_FORM_FEATURE_CATALOG.filter(
    (r) => r.profiles === profileId || r.profiles === "both",
  );
}
