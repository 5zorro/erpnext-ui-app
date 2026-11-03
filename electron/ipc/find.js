/**
 * Find pages, live (plan 2026-09-26 F3): the list and the peek read over HTTP with the ERP
 * session's cookies, and each page's last search is kept in userData. Moved out of main.js as it
 * was (plan 2026-10-25 R2-5); main.js calls initFind(deps) once. Opening the page and its
 * "Open in Vanilla" door stay in main.js with the other navigation.
 */
import { app, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs";
import { frappeResourceGetList, frappeResourceGetDoc } from "../../src/erp-http-list.js";
import { findListQuery, findRowsFromList, findSavedSearch } from "../../src/find-skin-query.js";
import { findSkinFor } from "../../src/find-skin-registry.js";

/* What main.js lends (initFind). */
let ERP_BASE = "";
/** @type {(event: string, detail?: string) => void} */
let navDebug = () => {};
/** The ERP view's session fetch, or null while it is not ready. @type {() => ((url: string, init?: object) => Promise<Response>) | null} */
let erpSessionFetchImpl = () => null;

/**
 * Once, at start-up: what Find borrows from main.js, then its IPC handlers.
 * @param {{ erpBase: string, navDebug: typeof navDebug, erpSessionFetchImpl: typeof erpSessionFetchImpl }} deps
 */
export function initFind(deps) {
  ({ erpBase: ERP_BASE, navDebug, erpSessionFetchImpl } = deps);
  registerFindHandlers();
}

/**
 * Each Find page's last search (5zorro 2026-09-26), keyed by doctype, in userData like the other
 * prefs. Not the page's own localStorage: that was not reliably on disk when the app closed, so
 * the search could be lost across a restart. Always re-checked against the registry.
 */
function findSearchesPath() {
  return path.join(app.getPath("userData"), "find-doc-searches.json");
}
/** @type {Record<string, unknown>|null} */
let findSearches = null;
function readFindSearches() {
  if (findSearches) return findSearches;
  try {
    const raw = JSON.parse(fs.readFileSync(findSearchesPath(), "utf8"));
    findSearches = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch {
    findSearches = {};
  }
  return findSearches;
}

function registerFindHandlers() {
  // Find pages, live (plan 2026-09-26 F3): the list and the peek are read over HTTP with the ERP
  // session's cookies — the same data the Vanilla list shows, without touching the ERP page.
  ipcMain.handle("find-doc-list", async (_e, doctypeKey, opts) => {
    const q = findListQuery(String(doctypeKey || ""), opts && typeof opts === "object" ? opts : {});
    if (!q) return { ok: false, reason: "No Find page for this document type.", rows: [], more: false };
    const fetchImpl = erpSessionFetchImpl();
    if (!fetchImpl) return { ok: false, reason: "ERP session not ready.", rows: [], more: false };
    const res = await frappeResourceGetList({
      erpBase: ERP_BASE,
      doctype: q.doctype,
      fields: q.fields,
      filters: q.filters,
      orFilters: q.orFilters,
      orderBy: q.orderBy,
      limit: q.limit,
      start: q.start,
      fetchImpl,
    });
    if (!res.ok) {
      navDebug("find-doc-list-failed", `${q.doctype}: ${res.status || ""} ${res.reason || ""}`);
      return { ok: false, reason: res.reason || "Could not read the list.", status: res.status, rows: [], more: false };
    }
    return { ok: true, ...findRowsFromList(String(doctypeKey), res.rows) };
  });

  ipcMain.handle("find-doc-load-search", (_e, doctypeKey) => {
    const skin = findSkinFor(String(doctypeKey || ""));
    if (!skin) return null;
    return findSavedSearch(skin.doctypeKey, readFindSearches()[skin.doctypeKey]);
  });
  ipcMain.on("find-doc-save-search", (_e, doctypeKey, search) => {
    const skin = findSkinFor(String(doctypeKey || ""));
    if (!skin) return;
    const all = readFindSearches();
    all[skin.doctypeKey] = findSavedSearch(skin.doctypeKey, search);
    try {
      fs.writeFileSync(findSearchesPath(), JSON.stringify(all));
    } catch {
      /* ignore — the search is simply not remembered */
    }
  });

  ipcMain.handle("find-doc-peek", async (_e, doctypeKey, name) => {
    const skin = findSkinFor(String(doctypeKey || ""));
    const rec = typeof name === "string" ? name.trim() : "";
    if (!skin || !rec) return { ok: false, reason: "Nothing to peek at.", doc: null };
    const fetchImpl = erpSessionFetchImpl();
    if (!fetchImpl) return { ok: false, reason: "ERP session not ready.", doc: null };
    return frappeResourceGetDoc({ erpBase: ERP_BASE, doctype: skin.doctype, name: rec, fetchImpl });
  });
}
