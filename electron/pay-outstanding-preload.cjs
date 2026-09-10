"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("erpPayOutstanding", {
  getOutstandingBills: () => ipcRenderer.invoke("get-outstanding-bills"),
  getPrefs: () => ipcRenderer.invoke("get-payment-batch-prefs"),
  setPrefs: (prefs) => ipcRenderer.invoke("set-payment-batch-prefs", prefs),
  openErp: (route) => ipcRenderer.send("open-erp", route || "/desk"),
  setDirty: (dirty) => ipcRenderer.send("set-pay-outstanding-dirty", !!dirty),
  searchLink: (doctype, txt, filters) =>
    ipcRenderer.invoke("pay-outstanding-search-link", doctype, txt || "", filters || null),
  createBatchPaymentEntry: (bills, intent) =>
    ipcRenderer.invoke("create-batch-payment-entry", bills, intent),
  createBlankPaymentEntry: (intent) => ipcRenderer.invoke("create-blank-payment-entry", intent),
  openPaymentDoc: (name) => ipcRenderer.send("open-payment-doc", name),
});
