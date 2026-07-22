"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("erpBill", {
  getSnapshot: () => ipcRenderer.invoke("bill-get-snapshot"),
  setHeader: (field, value) => ipcRenderer.invoke("bill-set-header", field, value),
  setAmountDue: (value, markEdited) =>
    ipcRenderer.invoke("bill-set-amount-due", value, !!markEdited),
  setItem: (rowIndex, field, value) =>
    ipcRenderer.invoke("bill-set-item", rowIndex, field, value),
  addItem: () => ipcRenderer.invoke("bill-add-item"),
  deleteItem: (rowIndex) => ipcRenderer.invoke("bill-delete-item", rowIndex),
  clearAllQty: () => ipcRenderer.invoke("bill-clear-all-qty"),
  setTax: (rowIndex, field, value) =>
    ipcRenderer.invoke("bill-set-tax", rowIndex, field, value),
  addTax: (accountHead, taxAmount, description) =>
    ipcRenderer.invoke("bill-add-tax", accountHead, taxAmount, description || ""),
  deleteTax: (rowIndex) => ipcRenderer.invoke("bill-delete-tax", rowIndex),
  attachFile: () => ipcRenderer.invoke("bill-attach-file"),
  save: (opts) => ipcRenderer.invoke("bill-save", opts || {}),
  listMandatory: () => ipcRenderer.invoke("bill-list-mandatory"),
  revertUnsaved: () => ipcRenderer.invoke("bill-revert-unsaved"),
  findBills: () => ipcRenderer.invoke("bill-find"),
  newBill: () => ipcRenderer.invoke("bill-new"),
  printBill: () => ipcRenderer.invoke("bill-print"),
  searchLink: (doctype, txt) => ipcRenderer.invoke("bill-search-link", doctype, txt || ""),
  listSources: (supplier) => ipcRenderer.invoke("bill-list-sources", supplier || ""),
  mergeSource: (kind, name) => ipcRenderer.invoke("bill-merge-source", kind, name),
  retryLoad: () => ipcRenderer.invoke("bill-retry-load"),
  openVanilla: () => ipcRenderer.send("bill-open-vanilla"),
  openVendorAdd: () => ipcRenderer.send("bill-open-vendor-add"),
  focusBillSurface: () => ipcRenderer.send("bill-focus-surface"),
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
});
