"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("erpDoc", {
  getUi: () => ipcRenderer.invoke("doc-get-ui"),
  getSnapshot: () => ipcRenderer.invoke("doc-get-snapshot"),
  setHeader: (field, value) => ipcRenderer.invoke("doc-set-header", field, value),
  setDateExpected: (value) => ipcRenderer.invoke("doc-set-date-expected", value),
  setItem: (rowIndex, field, value) =>
    ipcRenderer.invoke("doc-set-item", rowIndex, field, value),
  addItem: () => ipcRenderer.invoke("doc-add-item"),
  deleteItem: (rowIndex) => ipcRenderer.invoke("doc-delete-item", rowIndex),
  clearAllQty: () => ipcRenderer.invoke("doc-clear-all-qty"),
  setTax: (rowIndex, field, value) =>
    ipcRenderer.invoke("doc-set-tax", rowIndex, field, value),
  addTax: (accountHead, taxAmount, description) =>
    ipcRenderer.invoke("doc-add-tax", accountHead, taxAmount, description || ""),
  deleteTax: (rowIndex) => ipcRenderer.invoke("doc-delete-tax", rowIndex),
  attachFile: () => ipcRenderer.invoke("doc-attach-file"),
  save: (opts) => ipcRenderer.invoke("doc-save", opts || {}),
  listMandatory: () => ipcRenderer.invoke("doc-list-mandatory"),
  revertUnsaved: () => ipcRenderer.invoke("doc-revert-unsaved"),
  findDocs: () => ipcRenderer.invoke("doc-find"),
  newDoc: () => ipcRenderer.invoke("doc-new"),
  printDoc: () => ipcRenderer.invoke("doc-print"),
  searchLink: (doctype, txt) => ipcRenderer.invoke("doc-search-link", doctype, txt || ""),
  listSources: (supplier) => ipcRenderer.invoke("doc-list-sources", supplier || ""),
  mergeSource: (kind, name) => ipcRenderer.invoke("doc-merge-source", kind, name),
  retryLoad: () => ipcRenderer.invoke("doc-retry-load"),
  openVanilla: () => ipcRenderer.send("doc-open-vanilla"),
  openVendorAdd: () => ipcRenderer.send("doc-open-vendor-add"),
  focusSurface: () => ipcRenderer.send("doc-focus-surface"),
  onSnapshot: (cb) => {
    const handler = (_e, snap) => cb(snap);
    ipcRenderer.on("doc-snapshot", handler);
    return () => ipcRenderer.removeListener("doc-snapshot", handler);
  },
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
