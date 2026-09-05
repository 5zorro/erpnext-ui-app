"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("erpHome", {
  getConfig: () => ipcRenderer.invoke("get-config"),
  openErp: (route) => ipcRenderer.send("open-erp", route || "/desk"),
  openEntry: (doctypeKey) => ipcRenderer.send("open-entry", doctypeKey || "purchase-invoice"),
  openMockup: (name) => ipcRenderer.send("open-mockup", name),
  openPayOutstanding: () => ipcRenderer.send("open-pay-outstanding"),
});
