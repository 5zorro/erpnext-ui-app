/**
 * Minimal preload for the ERP WebContents — soft-peek Esc only (OI-112).
 * Do not expand without review: this runs in the Desk origin context bridge.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("erpUiShell", {
  softPeekEsc: () => ipcRenderer.send("soft-peek-esc"),
});
