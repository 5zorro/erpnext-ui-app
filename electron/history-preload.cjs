"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("erpHist", {
  openErp: (route) => ipcRenderer.send("open-erp", route || "/desk"),
  openCalcHistory: (anchor) => ipcRenderer.send("open-calc-history", anchor || {}),
  copyCalcHistory: (id, mode) => ipcRenderer.invoke("calc-history-copy", id, mode || "table"),
  onHistory: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("history", handler);
    return () => ipcRenderer.removeListener("history", handler);
  },
});
