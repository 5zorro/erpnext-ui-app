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
  // P1 stage 2 / OI-171. Same two channels as the doc-form skins: the facts are read first so the
  // confirm can name what cancelling this payment puts back to outstanding, and the clerk can
  // still back out after reading them.
  voidAmendFacts: (doctype, name) =>
    ipcRenderer.invoke("doc-void-amend-facts", doctype || "", name || ""),
  voidAndAmend: (doctype, name) =>
    ipcRenderer.invoke("doc-void-and-amend", doctype || "", name || ""),
  openErp: (route) => ipcRenderer.send("open-erp", route || "/desk"),
});
