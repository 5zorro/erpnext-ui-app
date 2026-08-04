"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("erpDiagnose", {
  ready: () => ipcRenderer.send("diagnose-dropdown-ready"),
  copy: () => ipcRenderer.invoke("copy-diagnose"),
  close: () => ipcRenderer.send("diagnose-dropdown-close"),
  refresh: () => ipcRenderer.invoke("get-diagnose"),
  setupRemediation: () => ipcRenderer.invoke("health-remediation-setup"),
  notifyIt: () => ipcRenderer.invoke("health-remediation-notify"),
  runAutofix: () => ipcRenderer.invoke("health-remediation-autofix"),
  onData: (cb) => {
    const handler = (_e, snap) => cb(snap);
    ipcRenderer.on("diagnose-data", handler);
    return () => ipcRenderer.removeListener("diagnose-data", handler);
  },
});
