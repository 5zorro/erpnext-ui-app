"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("erpPaymentDoc", {
  getPaymentEntry: (name) => ipcRenderer.invoke("get-payment-entry", name),
  openErp: (route) => ipcRenderer.send("open-erp", route || "/desk"),
});
