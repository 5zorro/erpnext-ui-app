"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("erpNavIncident", {
  ready: () => ipcRenderer.send("nav-incident-ready"),
  submit: (note) => ipcRenderer.invoke("nav-incident-submit", note != null ? String(note) : ""),
  close: () => ipcRenderer.send("nav-incident-close"),
  onData: (cb) => {
    const handler = (_e, snap) => cb(snap);
    ipcRenderer.on("nav-incident-data", handler);
    return () => ipcRenderer.removeListener("nav-incident-data", handler);
  },
});
