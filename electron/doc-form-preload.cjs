"use strict";
const { contextBridge, ipcRenderer } = require("electron");

/** @type {string|null} */
let skinProfileId = null;

function onProfileSnapshot(cb) {
  const handler = (_e, snap) => {
    if (snap && snap.profileId) skinProfileId = snap.profileId;
    cb(snap);
  };
  ipcRenderer.on("doc-snapshot", handler);
  return () => ipcRenderer.removeListener("doc-snapshot", handler);
}

async function ensureProfileId() {
  if (skinProfileId) return skinProfileId;
  const ui = await ipcRenderer.invoke("doc-get-ui");
  skinProfileId = (ui && ui.profileId) || null;
  return skinProfileId;
}

async function billActive() {
  return (await ensureProfileId()) === "bill";
}

async function invokeSkin(billChannel, docChannel, ...args) {
  return ipcRenderer.invoke((await billActive()) ? billChannel : docChannel, ...args);
}

contextBridge.exposeInMainWorld("erpDoc", {
  getUi: () => ipcRenderer.invoke("doc-get-ui"),
  getSnapshot: () => ipcRenderer.invoke("doc-get-snapshot"),
  setHeader: (field, value) => invokeSkin("bill-set-header", "doc-set-header", field, value),
  setDateExpected: (value) => ipcRenderer.invoke("doc-set-date-expected", value),
  setItem: (rowIndex, field, value) =>
    invokeSkin("bill-set-item", "doc-set-item", rowIndex, field, value),
  addItem: () => invokeSkin("bill-add-item", "doc-add-item"),
  deleteItem: (rowIndex) => invokeSkin("bill-delete-item", "doc-delete-item", rowIndex),
  clearAllQty: () => invokeSkin("bill-clear-all-qty", "doc-clear-all-qty"),
  setTax: (rowIndex, field, value) =>
    invokeSkin("bill-set-tax", "doc-set-tax", rowIndex, field, value),
  addTax: (accountHead, taxAmount, description) =>
    invokeSkin("bill-add-tax", "doc-add-tax", accountHead, taxAmount, description || ""),
  deleteTax: (rowIndex) => invokeSkin("bill-delete-tax", "doc-delete-tax", rowIndex),
  attachFile: () => invokeSkin("bill-attach-file", "doc-attach-file"),
  save: (opts) => invokeSkin("bill-save", "doc-save", opts || {}),
  listMandatory: () => invokeSkin("bill-list-mandatory", "doc-list-mandatory"),
  revertUnsaved: () => invokeSkin("bill-revert-unsaved", "doc-revert-unsaved"),
  findDocs: (prefill) => invokeSkin("bill-find", "doc-find", prefill || {}),
  refocusListFilter: (fieldname) =>
    ipcRenderer.invoke("erp-refocus-list-filter", fieldname || "name"),
  newDoc: () => invokeSkin("bill-new", "doc-new"),
  printDoc: () => invokeSkin("bill-print", "doc-print"),
  searchLink: (doctype, txt) => invokeSkin("bill-search-link", "doc-search-link", doctype, txt || ""),
  listAddresses: (role) => invokeSkin("bill-list-addresses", "doc-list-addresses", role || ""),
  listSources: (supplier) => invokeSkin("bill-list-sources", "doc-list-sources", supplier || ""),
  listSourceSlice: (supplier, sliceId) =>
    ipcRenderer.invoke("bill-list-source-slice", supplier || "", sliceId || ""),
  mergeSource: async (kindOrItems, name) => {
    if (Array.isArray(kindOrItems)) {
      return ipcRenderer.invoke("bill-merge-sources", kindOrItems);
    }
    return invokeSkin("bill-merge-source", "doc-merge-source", kindOrItems, name);
  },
  fetchSourceTerms: (refs) => ipcRenderer.invoke("fetch-source-terms", refs || []),
  retryLoad: () => invokeSkin("bill-retry-load", "doc-retry-load"),
  openVanilla: async () =>
    ipcRenderer.send((await billActive()) ? "bill-open-vanilla" : "doc-open-vanilla"),
  openVendorAdd: async () =>
    ipcRenderer.send((await billActive()) ? "bill-open-vendor-add" : "doc-open-vendor-add"),
  openPaymentTermsAdd: async () =>
    ipcRenderer.send(
      (await billActive()) ? "bill-open-payment-terms-add" : "doc-open-payment-terms-add",
    ),
  softPeekRoute: (route) => ipcRenderer.invoke("soft-peek-route", route || ""),
  logNav: (event, detail) => ipcRenderer.send("nav-debug", event || "renderer", detail != null ? String(detail) : ""),
  focusSurface: async () =>
    ipcRenderer.send((await billActive()) ? "bill-focus-surface" : "doc-focus-surface"),
  appendCalcHistory: (entry) => ipcRenderer.send("calc-history-append", entry || {}),
  getCalcHistory: () => ipcRenderer.invoke("calc-history-list"),
  copyCalcHistory: (id, mode) => ipcRenderer.invoke("calc-history-copy", id, mode || "table"),
  // Bill-only
  checkRef: (billNo, opts) => ipcRenderer.invoke("bill-check-ref", billNo, opts || {}),
  prefetchVendorRefs: (supplier) =>
    ipcRenderer.invoke("bill-prefetch-vendor-refs", supplier || ""),
  setAmountDue: (value, markEdited) =>
    ipcRenderer.invoke("bill-set-amount-due", value, !!markEdited),
  listPayments: () => ipcRenderer.invoke("bill-list-payments"),
  openAddPayment: () => ipcRenderer.invoke("bill-open-add-payment"),
  allocateCharge: (taxRowIndex, mode, custom) =>
    ipcRenderer.invoke("bill-allocate-charge", taxRowIndex, mode || "amount", custom || []),
  openLandedCost: () => ipcRenderer.invoke("bill-open-landed-cost"),
  checkAccountCompanies: () => ipcRenderer.invoke("bill-account-company-check"),
  listSalesOrdersForPicker: (payload) => ipcRenderer.invoke("bill-so-picker-list", payload || {}),
  listProjectsForPicker: (customer) => ipcRenderer.invoke("bill-list-projects", customer || ""),
  applyLineAllocation: (rowIndex, payload) =>
    ipcRenderer.invoke("bill-apply-line-allocation", rowIndex, payload || {}),
  bridgeSalesOrderToPo: (payload) => ipcRenderer.invoke("bill-so-bridge-po", payload || {}),
  openSupplierForm: (supplier) => ipcRenderer.invoke("bill-open-supplier-form", supplier || ""),
  openProjectAdd: () => ipcRenderer.send("bill-open-project-add"),
  onSnapshot: (cb) => onProfileSnapshot(cb),
  onOpenNavGate: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("doc-open-nav-gate", handler);
    return () => ipcRenderer.removeListener("doc-open-nav-gate", handler);
  },
  onCancelNavGate: (cb) => {
    const handler = (_e, token) => cb(token);
    ipcRenderer.on("doc-cancel-nav-gate", handler);
    return () => ipcRenderer.removeListener("doc-cancel-nav-gate", handler);
  },
  resolveNavGate: (token, proceed) =>
    ipcRenderer.send("doc-resolve-nav-gate", token, !!proceed),
});

contextBridge.exposeInMainWorld("erpFocusDebug", {
  log: (event, detail, active) =>
    ipcRenderer.send("focus-debug", {
      event: event || "focus",
      detail: detail != null ? String(detail) : "",
      active: active && typeof active === "object" ? active : null,
      surface: "doc-form",
    }),
});
