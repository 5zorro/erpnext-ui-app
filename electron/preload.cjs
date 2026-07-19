"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("erpUi", {
  getConfig: () => ipcRenderer.invoke("get-config"),
  goHome: () => ipcRenderer.send("go-home"),
  openDocSkin: () => ipcRenderer.send("open-doc-skin"),
  openVanillaSkin: () => ipcRenderer.send("open-vanilla-skin"),
  openErp: (route) => ipcRenderer.send("open-erp", route || "/desk"),
  openExternal: (url) => ipcRenderer.send("open-external", url),
  openDevtools: (target) => ipcRenderer.send("open-devtools", target || "erp"),
  onHealth: (cb) => {
    const handler = (_e, status) => cb(status);
    ipcRenderer.on("health", handler);
    return () => ipcRenderer.removeListener("health", handler);
  },
  onState: (cb) => {
    const handler = (_e, state) => cb(state);
    ipcRenderer.on("ui-state", handler);
    return () => ipcRenderer.removeListener("ui-state", handler);
  },
});
