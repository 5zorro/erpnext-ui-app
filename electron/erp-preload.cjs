/**
 * Minimal preload for the ERP WebContents (OI-112). Do not expand without review: this runs in
 * the Desk origin context bridge.
 * - softPeekEsc: Esc while a peek is armed.
 * - noteRouteHop (reviewed 2026-09-30, plan 2026-09-26 N1): one plain object per Frappe route
 *   change; main checks it is from this view and keeps only its string/boolean fields.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("erpUiShell", {
  softPeekEsc: () => ipcRenderer.send("soft-peek-esc"),
  noteRouteHop: (hop) => ipcRenderer.send("erp-route-hop", hop),
});
