"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("erpBill", {
  getSnapshot: () => ipcRenderer.invoke("bill-get-snapshot"),
  setHeader: (field, value) => ipcRenderer.invoke("bill-set-header", field, value),
  checkRef: (billNo, opts) => ipcRenderer.invoke("bill-check-ref", billNo, opts || {}),
  prefetchVendorRefs: (supplier) =>
    ipcRenderer.invoke("bill-prefetch-vendor-refs", supplier || ""),
  setAmountDue: (value, markEdited) =>
    ipcRenderer.invoke("bill-set-amount-due", value, !!markEdited),
  setItem: (rowIndex, field, value) =>
    ipcRenderer.invoke("bill-set-item", rowIndex, field, value),
  fetchPoLineCap: (rowIndex) => ipcRenderer.invoke("bill-fetch-po-line-cap", rowIndex),
  addItem: () => ipcRenderer.invoke("bill-add-item"),
  deleteItem: (rowIndex) => ipcRenderer.invoke("bill-delete-item", rowIndex),
  clearAllQty: () => ipcRenderer.invoke("bill-clear-all-qty"),
  setTax: (rowIndex, field, value) =>
    ipcRenderer.invoke("bill-set-tax", rowIndex, field, value),
  addTax: (accountHead, taxAmount, description) =>
    ipcRenderer.invoke("bill-add-tax", accountHead, taxAmount, description || ""),
  deleteTax: (rowIndex) => ipcRenderer.invoke("bill-delete-tax", rowIndex),
  listPayments: () => ipcRenderer.invoke("bill-list-payments"),
  openAddPayment: () => ipcRenderer.invoke("bill-open-add-payment"),
  listAddresses: (role) => ipcRenderer.invoke("bill-list-addresses", role || ""),
  allocateCharge: (taxRowIndex, mode, custom) =>
    ipcRenderer.invoke("bill-allocate-charge", taxRowIndex, mode || "amount", custom || []),
  openLandedCost: () => ipcRenderer.invoke("bill-open-landed-cost"),
  attachFile: () => ipcRenderer.invoke("bill-attach-file"),
  save: (opts) => ipcRenderer.invoke("bill-save", opts || {}),
  listMandatory: () => ipcRenderer.invoke("bill-list-mandatory"),
  revertUnsaved: () => ipcRenderer.invoke("bill-revert-unsaved"),
  findBills: (prefill) => ipcRenderer.invoke("bill-find", prefill || {}),
  /** Re-assert ERP list filter focus after Find IPC returns (Bill chrome may steal OS focus). */
  refocusListFilter: (fieldname) =>
    ipcRenderer.invoke("erp-refocus-list-filter", fieldname || "bill_no"),
  newBill: () => ipcRenderer.invoke("bill-new"),
  printBill: () => ipcRenderer.invoke("bill-print"),
  searchLink: (doctype, txt) => ipcRenderer.invoke("bill-search-link", doctype, txt || ""),
  checkAccountCompanies: () => ipcRenderer.invoke("bill-account-company-check"),
  listSources: (supplier) => ipcRenderer.invoke("bill-list-sources", supplier || ""),
  listSourceSlice: (supplier, sliceId) =>
    ipcRenderer.invoke("bill-list-source-slice", supplier || "", sliceId || ""),
  fetchSourceTerms: (refs) => ipcRenderer.invoke("fetch-source-terms", refs || []),
  /** Single (kind, name) or multi ([{ kind, name }, ...]). */
  mergeSource: (kindOrItems, name) =>
    Array.isArray(kindOrItems)
      ? ipcRenderer.invoke("bill-merge-sources", kindOrItems)
      : ipcRenderer.invoke("bill-merge-source", kindOrItems, name),
  listSalesOrdersForPicker: (payload) => ipcRenderer.invoke("bill-so-picker-list", payload || {}),
  listProjectsForPicker: (customer) =>
    ipcRenderer.invoke("bill-list-projects", customer || ""),
  applyLineAllocation: (rowIndex, payload) =>
    ipcRenderer.invoke("bill-apply-line-allocation", rowIndex, payload || {}),
  bridgeSalesOrderToPo: (payload) => ipcRenderer.invoke("bill-so-bridge-po", payload || {}),
  retryLoad: () => ipcRenderer.invoke("bill-retry-load"),
  openVanilla: () => ipcRenderer.send("bill-open-vanilla"),
  openVendorAdd: () => ipcRenderer.send("bill-open-vendor-add"),
  openSupplierForm: (supplier) => ipcRenderer.invoke("bill-open-supplier-form", supplier || ""),
  openProjectAdd: () => ipcRenderer.send("bill-open-project-add"),
  openPaymentTermsAdd: () => ipcRenderer.send("bill-open-payment-terms-add"),
  focusBillSurface: () => ipcRenderer.send("bill-focus-surface"),
  appendCalcHistory: (entry) => ipcRenderer.send("calc-history-append", entry || {}),
  getCalcHistory: () => ipcRenderer.invoke("calc-history-list"),
  copyCalcHistory: (id, mode) => ipcRenderer.invoke("calc-history-copy", id, mode || "table"),
  onSnapshot: (cb) => {
    const handler = (_e, snap) => cb(snap);
    ipcRenderer.on("bill-snapshot", handler);
    return () => ipcRenderer.removeListener("bill-snapshot", handler);
  },
  // Unified dirty gate: main asks the in-page commit-gate to open for a navigation,
  // renderer replies proceed/cancel with the token. One gate UI, no native dialog.
  onOpenNavGate: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("bill-open-nav-gate", handler);
    return () => ipcRenderer.removeListener("bill-open-nav-gate", handler);
  },
  onCancelNavGate: (cb) => {
    const handler = (_e, token) => cb(token);
    ipcRenderer.on("bill-cancel-nav-gate", handler);
    return () => ipcRenderer.removeListener("bill-cancel-nav-gate", handler);
  },
  resolveNavGate: (token, proceed) =>
    ipcRenderer.send("bill-resolve-nav-gate", token, !!proceed),
  navDebug: (event, detail) => ipcRenderer.send("nav-debug", event || "bill", detail || ""),
});

contextBridge.exposeInMainWorld("erpFocusDebug", {
  log: (event, detail, active) =>
    ipcRenderer.send("focus-debug", {
      event: event || "focus",
      detail: detail != null ? String(detail) : "",
      active: active && typeof active === "object" ? active : null,
      surface: "bill",
    }),
});
