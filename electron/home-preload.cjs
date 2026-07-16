"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("erpHome", {
  getConfig: () => ipcRenderer.invoke("get-config"),
  openErp: (route) => ipcRenderer.send("open-erp", route || "/desk"),
});
