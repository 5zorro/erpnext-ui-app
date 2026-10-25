"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("erpSubmitted", {
  close: () => ipcRenderer.send("submitted-dropdown-close"),
  open: (route) => ipcRenderer.send("submitted-open-doc", route || ""),
  // "submitted" | "viewed" — main keeps the choice (nav-state.json) and sends the list re-sorted.
  setSort: (sort) => ipcRenderer.send("submitted-sort", sort === "viewed" ? "viewed" : "submitted"),
  onData: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("submitted-data", handler);
    return () => ipcRenderer.removeListener("submitted-data", handler);
  },
});
