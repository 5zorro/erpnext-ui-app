"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("erpDiagnose", {
  ready: () => ipcRenderer.send("diagnose-dropdown-ready"),
  copy: () => ipcRenderer.invoke("copy-diagnose"),
  close: () => ipcRenderer.send("diagnose-dropdown-close"),
  onData: (cb) => {
    const handler = (_e, snap) => cb(snap);
    ipcRenderer.on("diagnose-data", handler);
    return () => ipcRenderer.removeListener("diagnose-data", handler);
  },
});
