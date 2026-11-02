"use strict";
const { contextBridge, ipcRenderer } = require("electron");

/**
 * Calls to the main process still waiting for their answer. Tests read it (`erpDoc.inFlight()`) to
 * wait until the page is quiet instead of sleeping (probe-helpers `docQuiet`, plan 10-25 3b
 * finding 7). Every `invoke` below goes through here.
 */
let inFlight = 0;
const rawInvoke = ipcRenderer.invoke.bind(ipcRenderer);
const invoke = (...args) => {
  inFlight += 1;
  return rawInvoke(...args).finally(() => {
    inFlight -= 1;
  });
};

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
  const ui = await invoke("doc-get-ui");
  skinProfileId = (ui && ui.profileId) || null;
  return skinProfileId;
}

async function billActive() {
  return (await ensureProfileId()) === "bill";
}

async function invokeSkin(billChannel, docChannel, ...args) {
  return invoke((await billActive()) ? billChannel : docChannel, ...args);
}

contextBridge.exposeInMainWorld("erpDoc", {
  inFlight: () => inFlight,
  getUi: () => invoke("doc-get-ui"),
  getSnapshot: () => invoke("doc-get-snapshot"),
  setHeader: (field, value) => invokeSkin("bill-set-header", "doc-set-header", field, value),
  // Museum OI-200: before a vendor switch — warn (Keep is the default), then clear the document.
  clearForVendorChange: (value) => invoke("doc-clear-for-vendor-change", value),
  setDateExpected: (value) => invoke("doc-set-date-expected", value),
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
    invoke("erp-refocus-list-filter", fieldname || "name"),
  newDoc: () => invokeSkin("bill-new", "doc-new"),
  // Printing (plan 2026-09-26 "Printing"): in place, never a popup — see src/print-dialog-ui.js.
  // Compare pane (plan 2026-09-26): the document's papers, over the ERP session.
  papersList: (sources) => invoke("papers-list", sources || []),
  papersBytes: (fileUrl) => invoke("papers-bytes", fileUrl || ""),
  papersUpload: (req) => invoke("papers-upload", req || {}),
  papersOpen: (req) => invoke("papers-open", req || {}),
  papersDownload: (req) => invoke("papers-download", req || {}),
  soCreatePoContext: (soName) => invoke("so-create-po-context", soName || ""),
  soCreatePos: (req) => invoke("so-create-pos", req || {}),
  soLineSources: (soName, itemCodes) => invoke("so-line-sources", soName || "", itemCodes || []),
  soCreateCounts: (soName) => invoke("so-create-counts", soName || ""),
  soVanillaCreate: (id) => invoke("so-vanilla-create", { id: id || "" }),
  papersZip: (req) => invoke("papers-zip", req || {}),
  papersPrintedPdf: (doc) => invoke("papers-printed-pdf", doc || {}),
  papersPdf: (req) => invoke("papers-pdf", req || {}),
  printOptions: (doctype) => invoke("print-options", doctype || ""),
  printBlockReason: (doc, settings) => invoke("print-block-reason", doc || {}, settings || {}),
  printRun: (req) => invoke("print-run", req || {}),
  printQueueGet: () => invoke("print-queue-get"),
  printJobStatus: (jobs) => invoke("print-job-status", jobs || []),
  printQueueAdd: (items) => invoke("print-queue-add", items || []),
  printQueueRemove: (items) => invoke("print-queue-remove", items || []),
  printQueueClear: () => invoke("print-queue-clear"),
  printQueueRun: (req) => invoke("print-queue-run", req || {}),
  searchLink: (doctype, txt, filters) =>
    invokeSkin("bill-search-link", "doc-search-link", doctype, txt || "", filters || null),
  refreshLinkList: (doctype) => invoke("link-list-refresh", doctype || ""),
  linkExists: (doctype, name) => invoke("doc-link-exists", doctype || "", name || ""),
  onSurfaceLeft: (cb) => {
    const handler = (_e, next) => cb(next);
    ipcRenderer.on("doc-surface-left", handler);
    return () => ipcRenderer.removeListener("doc-surface-left", handler);
  },
  listAddresses: (role) => invokeSkin("bill-list-addresses", "doc-list-addresses", role || ""),
  listSourceSlice: (supplier, sliceId) =>
    invoke("bill-list-source-slice", supplier || "", sliceId || ""),
  mergeSource: async (kindOrItems, name) => {
    if (Array.isArray(kindOrItems)) {
      return invoke("bill-merge-sources", kindOrItems);
    }
    return invokeSkin("bill-merge-source", "doc-merge-source", kindOrItems, name);
  },
  fetchSourceTerms: (refs) => invoke("fetch-source-terms", refs || []),
  createCreditMemo: (sourceBillName) =>
    invoke("bill-create-credit-memo", sourceBillName || ""),
  // P1 / OI-171. Two channels on purpose: the facts are read first so the confirm can name what it
  // is about to do, and the clerk can still back out after reading them.
  // The doctype travels with the call: this preload serves the Bill, PO and Item Receipt skins,
  // and each one means a different set of consequences to read before the confirm.
  voidAmendFacts: (doctype, name) =>
    invoke("doc-void-amend-facts", doctype || "", name || ""),
  voidAndAmend: (doctype, name) =>
    invoke("doc-void-and-amend", doctype || "", name || ""),
  retryLoad: () => invokeSkin("bill-retry-load", "doc-retry-load"),
  openVanilla: async () =>
    ipcRenderer.send((await billActive()) ? "bill-open-vanilla" : "doc-open-vanilla"),
  openVendorAdd: async () =>
    ipcRenderer.send((await billActive()) ? "bill-open-vendor-add" : "doc-open-vendor-add"),
  openPaymentTermsAdd: async () =>
    ipcRenderer.send(
      (await billActive()) ? "bill-open-payment-terms-add" : "doc-open-payment-terms-add",
    ),
  softPeekRoute: (route) => invoke("soft-peek-route", route || ""),
  billReceiveFacts: (codes, company) => invoke("bill-receive-facts", codes || [], company || ""),
  makeJitReceipts: (groups) => invoke("bill-jit-receipts", groups || []),
  taxDefaultFacts: (supplier) => invoke("tax-default-facts", supplier || ""),
  setBillReceiveAsk: (on) => invoke("set-bill-receive-ask", on !== false),
  detourBack: () => ipcRenderer.send("shell-detour-back"),
  getNumberLead: () => invoke("get-doc-number-lead"),
  setNumberLead: (lead) => invoke("set-doc-number-lead", lead || ""),
  logNav: (event, detail) => ipcRenderer.send("nav-debug", event || "renderer", detail != null ? String(detail) : ""),
  focusSurface: async () =>
    ipcRenderer.send((await billActive()) ? "bill-focus-surface" : "doc-focus-surface"),
  appendCalcHistory: (entry) => ipcRenderer.send("calc-history-append", entry || {}),
  getCalcHistory: () => invoke("calc-history-list"),
  copyCalcHistory: (id, mode) => invoke("calc-history-copy", id, mode || "table"),
  getSiteRounding: () => invoke("calc-site-rounding"),
  // Bill-only
  checkRef: (billNo, opts) => invoke("bill-check-ref", billNo, opts || {}),
  prefetchVendorRefs: (supplier) =>
    invoke("bill-prefetch-vendor-refs", supplier || ""),
  setAmountDue: (value, markEdited) =>
    invoke("bill-set-amount-due", value, !!markEdited),
  listPayments: () => invoke("bill-list-payments"),
  openAddPayment: () => invoke("bill-open-add-payment"),
  allocateCharge: (taxRowIndex, mode, custom) =>
    invoke("bill-allocate-charge", taxRowIndex, mode || "amount", custom || []),
  openLandedCost: () => invoke("bill-open-landed-cost"),
  checkAccountCompanies: () => invoke("bill-account-company-check"),
  listSalesOrdersForPicker: (payload) => invoke("bill-so-picker-list", payload || {}),
  listProjectsForPicker: (customer) => invoke("bill-list-projects", customer || ""),
  applyLineAllocation: (rowIndex, payload) =>
    invoke("bill-apply-line-allocation", rowIndex, payload || {}),
  planLineAllocation: (rowIndex, payload) =>
    invoke("bill-plan-line-allocation", rowIndex, payload || {}),
  openSupplierForm: (supplier) => invoke("bill-open-supplier-form", supplier || ""),
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
