"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("erpCalcHist", {
  ready: () => ipcRenderer.send("calc-history-dropdown-ready"),
  close: () => ipcRenderer.send("calc-history-dropdown-close"),
  copy: (id, mode) => ipcRenderer.invoke("calc-history-copy", id, mode || "table"),
  onData: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("calc-history-data", handler);
    return () => ipcRenderer.removeListener("calc-history-data", handler);
  },
});
