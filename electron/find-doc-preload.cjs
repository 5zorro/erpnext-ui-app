"use strict";
const { contextBridge, ipcRenderer } = require("electron");

/** Find page (find-doc.html) — every way out goes back through main's one destination answer. */
contextBridge.exposeInMainWorld("erpFindDoc", {
  // "Open this address in the lens the clerk prefers" (nav-destination.js resolveOpenTarget).
  openPreferred: (route) => ipcRenderer.send("open-preferred", route || ""),
  // The Vanilla list with the page's searches as `?field=value` filters; remembers the list lens.
  openVanillaList: (doctypeKey, route) =>
    ipcRenderer.send("find-doc-open-vanilla", doctypeKey || "", route || ""),
  // Pay Bills / Receive Payment: the same door as the Home tiles (it records the direction).
  openPaymentEntry: (direction) => ipcRenderer.send("open-payment-entry", direction || "Pay"),
});
