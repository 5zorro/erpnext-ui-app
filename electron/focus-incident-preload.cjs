"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("erpFocusIncident", {
  ready: () => ipcRenderer.send("focus-incident-ready"),
  submit: (note) => ipcRenderer.invoke("focus-incident-submit", note != null ? String(note) : ""),
  close: () => ipcRenderer.send("focus-incident-close"),
  onData: (cb) => {
    const handler = (_e, snap) => cb(snap);
    ipcRenderer.on("focus-incident-data", handler);
    return () => ipcRenderer.removeListener("focus-incident-data", handler);
  },
});
