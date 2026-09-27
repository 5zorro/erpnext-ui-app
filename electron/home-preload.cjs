"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("erpHome", {
  getConfig: () => ipcRenderer.invoke("get-config"),
  openErp: (route) => ipcRenderer.send("open-erp", route || "/desk"),
  openEntry: (doctypeKey) => ipcRenderer.send("open-entry", doctypeKey || "purchase-invoice"),
  openMockup: (name) => ipcRenderer.send("open-mockup", name),
  openPaymentEntry: (direction) => ipcRenderer.send("open-payment-entry", direction || "Pay"),
  // Desk hatch (OI-125): one app-wide setting; main stores it and repaints every shell page.
  setWashPattern: (pattern) => ipcRenderer.send("set-wash-pattern", pattern || ""),
});
