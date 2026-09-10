"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("erpPaymentDoc", {
  getPaymentEntry: (name) => ipcRenderer.invoke("get-payment-entry", name),
  // Packet 4b step 7: a Draft is edited here, so this surface can hold unsaved input and needs
  // the same Link picker + dirty reporting the pay-outstanding drawer already has.
  searchLink: (doctype, txt, filters) =>
    ipcRenderer.invoke("pay-outstanding-search-link", doctype, txt || "", filters || null),
  savePaymentEntry: (name, patch) => ipcRenderer.invoke("save-payment-entry", name, patch),
  setDirty: (dirty) => ipcRenderer.send("set-payment-doc-dirty", !!dirty),
  openErp: (route) => ipcRenderer.send("open-erp", route || "/desk"),
});
