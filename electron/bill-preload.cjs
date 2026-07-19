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
  attachFile: () => ipcRenderer.invoke("bill-attach-file"),
  save: (opts) => ipcRenderer.invoke("bill-save", opts || {}),
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
});
