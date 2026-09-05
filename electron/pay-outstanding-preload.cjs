"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("erpPayOutstanding", {
  getOutstandingBills: () => ipcRenderer.invoke("get-outstanding-bills"),
  getPrefs: () => ipcRenderer.invoke("get-payment-batch-prefs"),
  setPrefs: (prefs) => ipcRenderer.invoke("set-payment-batch-prefs", prefs),
  openErp: (route) => ipcRenderer.send("open-erp", route || "/desk"),
});
