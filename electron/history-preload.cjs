"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("erpHist", {
  openErp: (route) => ipcRenderer.send("open-erp", route || "/desk"),
  onHistory: (cb) => {
    const handler = (_e, items) => cb(items);
    ipcRenderer.on("history", handler);
    return () => ipcRenderer.removeListener("history", handler);
  },
});
