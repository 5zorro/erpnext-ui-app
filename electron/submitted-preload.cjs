"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("erpSubmitted", {
  close: () => ipcRenderer.send("submitted-dropdown-close"),
  open: (route) => ipcRenderer.send("submitted-open-doc", route || ""),
  onData: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("submitted-data", handler);
    return () => ipcRenderer.removeListener("submitted-data", handler);
  },
});
