"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("erpHist", {
  openErp: (route) => ipcRenderer.send("open-erp", route || "/desk"),
  navDebug: (event, detail) => ipcRenderer.send("nav-debug", event || "hist", detail || ""),
  openCalcHistory: (anchor) => ipcRenderer.send("open-calc-history", anchor || {}),
  copyCalcHistory: (id, mode) => ipcRenderer.invoke("calc-history-copy", id, mode || "table"),
  copyHistoryRef: (text) => ipcRenderer.invoke("history-copy-ref", text || ""),
  setCollapsed: (collapsed) => ipcRenderer.send("hist-collapse", !!collapsed),
  onHistory: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("history", handler);
    return () => ipcRenderer.removeListener("history", handler);
  },
});
