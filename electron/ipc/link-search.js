/**
 * Link search and its warm copies: every pick list's search (the Bill's, the other Doc pages',
 * and Pay Outstanding's through main.js), answered from a copy of the list kept in the shell where
 * there is one (plan 2026-10-21, OI-185), else by ERPNext's own search; vendors re-ranked by PO
 * activity (OI-131), accounts marked when they belong to another company; "does this record still
 * exist?" and a list's Refresh. Moved out of main.js as it was (plan 2026-10-25 R2-5); main.js calls
 * initLinkSearch(deps) once. The pure rules are src/link-list-cache.js, src/vendor-activity.js and
 * src/account-company.js and src/link-search.js. The login check stays in main.js: it drops the copies when the user
 * changes (dropLinkLists, linkListsUser).
 */
import { ipcMain } from "electron";
import { ERP_LIST_JS, PE_REASON_FROM_JS } from "../../src/erp-refusal-reason.js";
import {
  LINK_LIST_MAX_ROWS,
  WARM_LINK_DOCTYPES,
  buildLinkListCopy,
  linkListCheckDue,
  linkListCopyable,
  mergeChangedSince,
  searchLinkListCopy,
} from "../../src/link-list-cache.js";
import { annotateAccountLinkOptions } from "../../src/account-company.js";
import { normalizeEditableText } from "../../src/dirty-gate.js";
import { normalizeSearchLinkResults } from "../../src/link-search.js";
import { rankSupplierLinkOptions, utcYmd } from "../../src/vendor-activity.js";

/* What main.js lends (initLinkSearch). */
/** @type {(js: string, chaosChannel?: string, bridgeMethod?: string) => Promise<any>} */
let erpEval = async () => null;
/** @type {(event: string, detail?: string) => void} */
let navDebug = () => {};
/** @type {<T>(promise: Promise<T>, ms: number, what: string) => Promise<T|{ ok: false, reason: string }>} */
let raceTimeout = async (p) => p;
/** Who ERPNext says is logged in, as main.js last checked. @type {() => { state: string, user: string|null }} */
let lastLogin = () => ({ state: "unknown", user: null });
/** The open Bill as main.js holds it (its company, for the Account search). @type {() => { doc?: any }} */
let dirtyState = () => ({});

/**
 * Once, at start-up: what link search borrows from main.js, then its IPC handlers.
 * @param {{ erpEval: typeof erpEval, navDebug: typeof navDebug, raceTimeout: typeof raceTimeout, lastLogin: typeof lastLogin, dirtyState: typeof dirtyState }} deps
 */
export function initLinkSearch(deps) {
  ({ erpEval, navDebug, raceTimeout, lastLogin, dirtyState } = deps);
  registerLinkSearchHandlers();
}

/** Whose permissions the copies were read with ("" when none are loaded). */
export function linkListsUser() {
  return linkListUser;
}

/** Which lists have a copy loaded (the test hook `linkListsLoaded`). */
export function linkListsLoaded() {
  return [...linkListCopies.keys()];
}

export async function searchLink(doctype, txt, filters) {
  if (typeof doctype !== "string" || !doctype.trim()) {
    return { ok: false, reason: "doctype required", results: [] };
  }
  const q = txt == null ? "" : String(txt);
  // Warm pick lists (plan 2026-10-21): an unfiltered search of a copied list is answered here.
  const dt = doctype.trim();
  if (linkListCopyable(dt, filters)) {
    const copy = linkListCopies.get(dt);
    if (copy) {
      if (linkListCheckDue(copy, Date.now())) void checkLinkListChanged(dt, "search");
      const hit = searchLinkListCopy(copy, q, { asOf: utcYmd() });
      if (!hit.miss) {
        linkListMissing.delete(dt);
        return { ok: true, results: hit.results, source: "copy", asOf: copy.checkedAt };
      }
      // One line per run of misses (a name typed letter by letter), not one per keystroke.
      if (!linkListMissing.has(dt)) navDebug("link-list", `miss dt=${dt} len=${q.trim().length} -> live`);
      linkListMissing.add(dt);
    } else if (lastLogin().state === "in") {
      void loadLinkList(dt, "search");
    }
  }
  const filterPairs =
    filters && typeof filters === "object" && !Array.isArray(filters)
      ? Object.entries(filters).filter(([, v]) => v != null && v !== "")
      : [];
  const raw = await erpEval(`(async () => {
    ${ERP_LIST_JS}
    ${PE_REASON_FROM_JS}
    try {
      if (!window.frappe) return { ok: false, reason: "ERP Desk not ready (no frappe)." };
      var doctype = ${JSON.stringify(doctype)};
      var txt = ${JSON.stringify(q)};
      var filterPairs = ${JSON.stringify(filterPairs)};
      var rows = [];
      if (frappe.call) {
        var args = {
          txt: txt,
          doctype: doctype,
          reference_doctype: "Purchase Invoice",
          page_length: 25
        };
        if (filterPairs.length) {
          var filterObj = {};
          filterPairs.forEach(function (p) { filterObj[p[0]] = p[1]; });
          args.filters = filterObj;
        }
        var r = await frappe.call({
          method: "frappe.desk.search.search_link",
          args: args
        });
        rows = (r && r.message) ? r.message : [];
      } else if (frappe.xcall) {
        var fields = ["name"];
        if (doctype === "Supplier") fields.push("supplier_name");
        if (doctype === "Item") fields.push("item_name");
        var listFilters = txt ? [["name", "like", "%" + txt + "%"]] : [];
        filterPairs.forEach(function (p) {
          // A Frappe filter dict value can be ["in", [...]] as well as a bare value -- the
          // search_link path above passes it straight through, so this fallback must too.
          if (Array.isArray(p[1]) && p[1].length === 2 && typeof p[1][0] === "string") {
            listFilters.push([p[0], p[1][0], p[1][1]]);
          } else {
            listFilters.push([p[0], "=", p[1]]);
          }
        });
        var list = await xList(doctype, {
          fields: fields,
          filters: listFilters,
          limit: 25,
          order_by: "modified desc"
        });
        rows = (list || []).map(function (row) {
          return {
            value: row.name,
            description: row.supplier_name || row.item_name || row.name
          };
        });
      } else {
        return { ok: false, reason: "No search API on this Desk session." };
      }
      return { ok: true, results: rows };
    } catch (e) {
      return { ok: false, reason: reasonFrom(e), results: [] };
    }
  })()`);
  if (!raw || !raw.ok) {
    return {
      ok: false,
      reason: (raw && raw.reason) || "Link search failed",
      results: [],
    };
  }
  let results = normalizeSearchLinkResults(raw.results);
  if (doctype.trim() === "Account") {
    results = await enrichAccountLinkResults(results);
  }
  if (doctype.trim() !== "Supplier" || !results.length) {
    return { ok: true, results, source: "live" };
  }
  const ranked = await rankSupplierSearchResults(results);
  return { ok: true, results: ranked, source: "live" };
}

/*
 * ── Warm pick lists (plan 2026-10-21, OI-185) ──────────────────────────────────────────────────
 * One copy per list, for the user logged in; searched by `searchLinkListCopy` in ERPNext's order.
 * 🔴 Only `frappe.xcall` in here: `frappe.db.get_list` never settles when the server raises
 * (proven 2026-10-21), and a load that never settled would hold an erpEval for good (review 10-19
 * R5b-4). A failed or oversized load leaves the list live, as before.
 */
/** @type {Map<string, import("../../src/link-list-cache.js").LinkListCopy>} */
const linkListCopies = new Map();

/** One load or check per list at a time. @type {Map<string, Promise<unknown>>} */
const linkListBusy = new Map();

/** Bumped when the copies are dropped, so a load started for the last user is thrown away. */
let linkListGeneration = 0;

/** Whose permissions the copies were read with. */
let linkListUser = "";

/** Lists whose last search missed the copy, so the trail logs a miss once per run. */
const linkListMissing = new Set();

/** The ERP-page side of a load or check: meta, the active-row filters, vendors' last POs. */
const LINK_LIST_ERP_HELPERS = `
  var withTimeout = function (p, ms) {
    return Promise.race([p, new Promise(function (_, no) { setTimeout(function () { no(new Error("timed out")); }, ms); })]);
  };
  var metaOf = async function (dt) {
    try { await withTimeout(frappe.model.with_doctype(dt), 5000); } catch (e) {}
    var m = (frappe.get_meta && frappe.get_meta(dt)) || {};
    var check = function (f) {
      return (m.fields || []).some(function (d) { return d.fieldname === f && d.fieldtype === "Check"; });
    };
    var active = [];
    if (check("enabled")) active.push([dt, "enabled", "=", 1]);
    if (check("disabled")) active.push([dt, "disabled", "!=", 1]);
    return { order: "idx desc, " + (m.sort_field || "modified") + " " + (m.sort_order || "DESC"), active: active };
  };
  var vendorsLastPo = async function () {
    var rows = await frappe.xcall("frappe.client.get_list", {
      doctype: "Purchase Order",
      fields: ["supplier", { MAX: "transaction_date", as: "last_po" }],
      filters: [["docstatus", "=", 1]],
      group_by: "supplier",
      limit_page_length: 0
    });
    var out = {};
    (rows || []).forEach(function (r) { if (r && r.supplier) out[r.supplier] = String(r.last_po || ""); });
    var fyStart = "";
    try {
      var fy = frappe.defaults && frappe.defaults.get_user_default ? frappe.defaults.get_user_default("fiscal_year") : "";
      if (fy) {
        var v = await frappe.xcall("frappe.client.get_value", { doctype: "Fiscal Year", filters: fy, fieldname: "year_start_date" });
        fyStart = (v && v.year_start_date) || "";
      }
    } catch (e) {}
    return { lastPo: out, fyStart: fyStart };
  };
`;

/**
 * The whole list, as `search_link` returns it, plus each row's rank. Answers live meanwhile.
 * @param {string} doctype
 * @param {string} why for the trail
 */
function loadLinkList(doctype, why) {
  if (linkListBusy.has(doctype)) return linkListBusy.get(doctype);
  const gen = linkListGeneration;
  const started = Date.now();
  let retryLater = false;
  const run = (async () => {
    const evalLoad = erpEval(`(async () => {
      try {
        if (!window.frappe || !frappe.xcall) return { ok: false, reason: "ERP Desk not ready" };
        ${LINK_LIST_ERP_HELPERS}
        var dt = ${JSON.stringify(doctype)};
        var meta = await metaOf(dt);
        var rows = await frappe.xcall("frappe.desk.search.search_link", {
          txt: "", doctype: dt, reference_doctype: "Purchase Invoice", page_length: ${LINK_LIST_MAX_ROWS + 1}
        });
        if ((rows || []).length > ${LINK_LIST_MAX_ROWS}) return { ok: true, tooMany: rows.length };
        var ranked = await frappe.xcall("frappe.client.get_list", {
          doctype: dt, fields: ["name", "modified"], order_by: meta.order, limit_page_length: 0
        });
        var newest = "";
        (ranked || []).forEach(function (r) { if (r.modified > newest) newest = r.modified; });
        var po = dt === "Supplier" ? await vendorsLastPo() : { lastPo: null, fyStart: "" };
        return {
          ok: true,
          rows: rows || [],
          rank: (ranked || []).map(function (r) { return r.name; }),
          newest: newest,
          lastPo: po.lastPo,
          fyStart: po.fyStart
        };
      } catch (e) {
        return { ok: false, reason: String((e && e.message) || e) };
      }
    })()`);
    // A deadline: a stalled ERPNext page must not hold this list's load (and its Refresh) for good.
    const raw = await raceTimeout(evalLoad, 30_000, `${doctype} list load`);
    if (gen !== linkListGeneration) return;
    if (!raw || !raw.ok) {
      navDebug("link-list", `load-failed dt=${doctype} via=${why} reason=${(raw && raw.reason) || "no answer"}`);
      // Opening a Doc page moves the ERPNext page too, which can cut a load off: try once more.
      if (!/-retry$/.test(why)) retryLater = true;
      return;
    }
    if (raw.tooMany) {
      navDebug("link-list", `too-many dt=${doctype} rows=${raw.tooMany} -> stays live`);
      return;
    }
    // Raw rows, not normalized: a title shown as the label (Project, tax templates) is searched too.
    const copy = buildLinkListCopy(doctype, raw.rows, raw.rank, {
      now: Date.now(),
      newestModified: raw.newest,
      lastPo: raw.lastPo,
      fyStart: raw.fyStart,
    });
    linkListCopies.set(doctype, copy);
    linkListUser = lastLogin().user || "";
    navDebug("link-list", `loaded dt=${doctype} rows=${copy.rows.length} ms=${Date.now() - started} via=${why}`);
  })()
    .catch((e) => navDebug("link-list", `load-failed dt=${doctype} via=${why} reason=${(e && e.message) || String(e)}`))
    .finally(() => {
      linkListBusy.delete(doctype);
      if (retryLater) {
        setTimeout(() => {
          if (gen === linkListGeneration && !linkListCopies.has(doctype)) void loadLinkList(doctype, `${why}-retry`);
        }, 3000);
      }
    });
  linkListBusy.set(doctype, run);
  return run;
}

/**
 * "Anything changed since?" — re-read the rows modified since the copy's newest, then compare
 * counts: a delete or a rename leaves a different count, and the whole list is reloaded.
 * @param {string} doctype
 * @param {string} why
 */
function checkLinkListChanged(doctype, why) {
  const copy = linkListCopies.get(doctype);
  if (!copy) return loadLinkList(doctype, why);
  if (linkListBusy.has(doctype)) return linkListBusy.get(doctype);
  const gen = linkListGeneration;
  // Marked checked now, so a burst of searches asks once.
  linkListCopies.set(doctype, { ...copy, checkedAt: Date.now() });
  let reload = false;
  const run = (async () => {
    const evalCheck = erpEval(`(async () => {
      try {
        if (!window.frappe || !frappe.xcall) return { ok: false, reason: "ERP Desk not ready" };
        ${LINK_LIST_ERP_HELPERS}
        var dt = ${JSON.stringify(doctype)};
        var meta = await metaOf(dt);
        var changed = await frappe.xcall("frappe.client.get_list", {
          doctype: dt, fields: ["name", "modified"],
          filters: [["modified", ">", ${JSON.stringify(copy.newestModified || "1900-01-01")}]],
          limit_page_length: 501
        });
        if ((changed || []).length > 500) return { ok: true, tooMany: true };
        var names = (changed || []).map(function (r) { return r.name; });
        var newest = "";
        (changed || []).forEach(function (r) { if (r.modified > newest) newest = r.modified; });
        var fresh = names.length
          ? await frappe.xcall("frappe.desk.search.search_link", {
              txt: "", doctype: dt, reference_doctype: "Purchase Invoice", page_length: names.length + 1,
              filters: { name: ["in", names] }
            })
          : [];
        var count = await frappe.xcall("frappe.client.get_count", { doctype: dt, filters: meta.active });
        var po = dt === "Supplier" ? await vendorsLastPo() : { lastPo: null };
        return { ok: true, names: names, fresh: fresh || [], newest: newest, count: count, lastPo: po.lastPo };
      } catch (e) {
        return { ok: false, reason: String((e && e.message) || e) };
      }
    })()`);
    const raw = await raceTimeout(evalCheck, 20_000, `${doctype} list check`);
    if (gen !== linkListGeneration) return;
    if (!raw || !raw.ok) {
      navDebug("link-list", `check-failed dt=${doctype} via=${why} reason=${(raw && raw.reason) || "no answer"}`);
      return;
    }
    if (raw.tooMany) {
      reload = true;
      navDebug("link-list", `check dt=${doctype} via=${why} changed=500+ -> reload`);
      return;
    }
    const now = linkListCopies.get(doctype) || copy;
    const merged = mergeChangedSince(now, raw.names, raw.fresh, {
      now: Date.now(),
      newestModified: raw.newest,
      ...(doctype === "Supplier" ? { lastPo: raw.lastPo } : {}),
    });
    linkListCopies.set(doctype, merged.copy);
    if (Number(raw.count) !== merged.copy.rows.length) {
      reload = true;
      navDebug("link-list", `check dt=${doctype} via=${why} count=${raw.count} copy=${merged.copy.rows.length} -> reload`);
    } else if (merged.changed) {
      navDebug("link-list", `check dt=${doctype} via=${why} changed=${merged.changed} removed=${merged.removed}`);
    }
  })()
    .catch((e) => navDebug("link-list", `check-failed dt=${doctype} via=${why} reason=${e && e.message}`))
    .finally(() => {
      linkListBusy.delete(doctype);
      if (reload) void loadLinkList(doctype, `${why}-reload`);
    });
  linkListBusy.set(doctype, run);
  return run;
}

/** Load what is missing; check what is older than `minAgeMs`. In the background. */
export function warmLinkLists(why, minAgeMs = 10_000) {
  if (lastLogin().state !== "in") return;
  const now = Date.now();
  for (const dt of WARM_LINK_DOCTYPES) {
    const copy = linkListCopies.get(dt);
    if (!copy) void loadLinkList(dt, why);
    else if (now - copy.checkedAt >= minAgeMs) void checkLinkListChanged(dt, why);
  }
}

/** Another user's permissions are not this one's: drop every copy. */
export function dropLinkLists(why) {
  linkListGeneration += 1;
  linkListUser = "";
  linkListMissing.clear();
  if (!linkListCopies.size) return;
  navDebug("link-list", `dropped ${linkListCopies.size} via=${why}`);
  linkListCopies.clear();
}

/**
 * Attach Account.company and de-emphasize other-company rows vs open Bill company.
 * @param {Array<{ value: string, description: string }>} results
 */
async function enrichAccountLinkResults(results) {
  if (!results.length) return results;
  const names = results.map((r) => r.value).filter(Boolean);
  const billCompany = normalizeEditableText(dirtyState().doc && dirtyState().doc.company);
  const namesLit = JSON.stringify(names);
  const raw = await erpEval(`(async () => {
    ${ERP_LIST_JS}
    ${PE_REASON_FROM_JS}
    try {
      var names = ${namesLit};
      if (!names.length) return { ok: true, byName: {} };
      var list = await xList("Account", {
        fields: ["name", "company"],
        filters: [["name", "in", names]],
        limit: names.length,
      });
      var byName = {};
      (list || []).forEach(function (row) {
        if (row && row.name) byName[row.name] = row.company || "";
      });
      return { ok: true, byName: byName };
    } catch (e) {
      return { ok: false, reason: reasonFrom(e), byName: {} };
    }
  })()`);
  const byName = (raw && raw.byName) || {};
  const withCompany = results.map((r) => ({
    ...r,
    company: byName[r.value] || "",
  }));
  return annotateAccountLinkOptions(withCompany, billCompany);
}

/**
 * Last submitted PO date per supplier + company FY start (OI-131).
 * Search still works if this extra hop fails.
 * @param {Array<{ value: string, description: string }>} results
 */
async function rankSupplierSearchResults(results) {
  const names = results.map((r) => r.value).filter(Boolean);
  if (!names.length) return results;
  const extra = await erpEval(`(async () => {
    ${ERP_LIST_JS}
    ${PE_REASON_FROM_JS}
    try {
      var names = ${JSON.stringify(names)};
      var lastPo = {};
      if (frappe.xcall) {
        var pos = await xList("Purchase Order", {
          fields: ["supplier", "transaction_date"],
          filters: [["supplier", "in", names], ["docstatus", "=", 1]],
          order_by: "transaction_date desc",
          limit: 200
        });
        (pos || []).forEach(function (row) {
          if (row.supplier && !lastPo[row.supplier]) lastPo[row.supplier] = row.transaction_date;
        });
      }
      var fyStart = "";
      try {
        var fy = frappe.defaults && frappe.defaults.get_user_default
          ? frappe.defaults.get_user_default("fiscal_year")
          : "";
        if (fy) {
          var v = await xValue("Fiscal Year", fy, "year_start_date");
          if (v && v.message && v.message.year_start_date) fyStart = v.message.year_start_date;
          else if (v && v.year_start_date) fyStart = v.year_start_date;
          else if (typeof v === "string") fyStart = v;
        }
      } catch (e) {}
      return { ok: true, lastPo: lastPo, fyStart: fyStart || "" };
    } catch (e) {
      return { ok: false, lastPo: {}, fyStart: "" };
    }
  })()`);
  if (!extra || typeof extra !== "object") return results;
  return rankSupplierLinkOptions(results, extra.lastPo || {}, {
    fyStart: extra.fyStart || "",
    asOf: utcYmd(),
  });
}

function registerLinkSearchHandlers() {
  ipcMain.handle("bill-search-link", async (_e, doctype, txt, filters) => searchLink(doctype, txt, filters));

  ipcMain.handle("doc-search-link", async (_e, doctype, txt) => searchLink(doctype, txt));

  // Plan 2026-10-21 D2: does this record still exist? Asked live, never from the warm copy — the
  // copy is exactly what can be stale. `exists: null` = could not tell; the caller does not block.
  ipcMain.handle("doc-link-exists", async (_e, doctype, name) => {
    const dt = String(doctype || "").trim();
    const n = normalizeEditableText(name);
    if (!dt || !n) return { ok: true, exists: null };
    const evalExists = erpEval(`(async () => {
      try {
        var dt = ${JSON.stringify(dt)};
        var n = ${JSON.stringify(n)};
        var or = [[dt, "name", "=", n]];
        if (dt === "Supplier") or.push([dt, "supplier_name", "=", n]);
        if (dt === "Customer") or.push([dt, "customer_name", "=", n]);
        var rows = await frappe.xcall("frappe.client.get_list", {
          doctype: dt, fields: ["name"], or_filters: or, limit_page_length: 1
        });
        return { ok: true, exists: (rows || []).length > 0 };
      } catch (e) {
        return { ok: false, reason: String((e && e.message) || e) };
      }
    })()`);
    // 5 s at most: a vendor pick waits on this before anything opens, and "could not tell" never blocks.
    const raw = await raceTimeout(evalExists, 5_000, "vendor check");
    if (!raw || !raw.ok) return { ok: true, exists: null };
    if (!raw.exists) {
      navDebug("link-missing", `dt=${dt} name=${n.slice(0, 60)}`);
      // The copy offered it, so the copy is stale: catch it up.
      if (linkListCopies.has(dt)) void checkLinkListChanged(dt, "missing");
    }
    return { ok: true, exists: !!raw.exists };
  });

  ipcMain.handle("link-list-refresh", async (_e, doctype) => {
    const dt = String(doctype || "").trim();
    if (!WARM_LINK_DOCTYPES.includes(dt)) return { ok: false, reason: "Not a copied list." };
    navDebug("link-list", `refresh dt=${dt}`);
    if (linkListBusy.has(dt)) await linkListBusy.get(dt);
    linkListCopies.delete(dt);
    await loadLinkList(dt, "refresh");
    const copy = linkListCopies.get(dt);
    return copy ? { ok: true, asOf: copy.checkedAt } : { ok: false, reason: "Could not reload the list — searching ERPNext directly." };
  });
}
