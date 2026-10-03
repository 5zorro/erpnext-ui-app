/**
 * What a Frappe route change means for peeks, described by the page itself (plan 2026-09-26 N1).
 *
 * Frappe's router fires `change` after it has pushed the new route onto `frappe.route_history`
 * (`router.js` `route()`), while the form the clerk just left is still in `locals`. So the page
 * can say exactly where it came from, whether that form had unsaved changes, and whether Frappe
 * itself named a calling form (`frappe._from_link`, set by a Link field's *Create a new …*).
 *
 * `describeRouteHop` is serialized into the ERP page (like `shouldEscDismissSoftPeek`), so it
 * must stay self-contained: no imports, no closures, plain ES2015.
 */

/**
 * @typedef {{
 *   to: string,
 *   prev: string,
 *   prevUnsaved: boolean,
 *   fromLinkParent: string,
 *   fromLinkTarget: string,
 *   renamed: Record<string, string>,
 * }} RouteHop
 *   `renamed`: Frappe's own map of a draft's placeholder name to the name it got on save
 *   (`frappe.model.new_names`, filled by model/sync.js). A saved parent or child keeps its place
 *   in a peek session under its real name (nav incident 2026-10-03: a Supplier created from a Bill
 *   was saved, and Esc went back to its stale `new-supplier-…` placeholder).
 */

/**
 * @param {{
 *   pathname: string,
 *   routeHistory: unknown[],
 *   locals: Record<string, Record<string, { __unsaved?: unknown }>>,
 *   fromLink: any,
 *   newNames?: Record<string, unknown>,
 *   slug: (doctype: string) => string,
 * }} env
 * @returns {RouteHop}
 */
export function describeRouteHop(env) {
  var e = env || {};
  var slug = typeof e.slug === "function" ? e.slug : function (d) { return String(d || ""); };
  var history = Array.isArray(e.routeHistory) ? e.routeHistory : [];
  var isForm = function (r) {
    return Array.isArray(r) && r[0] === "Form" && !!r[1] && !!r[2];
  };
  var formPath = function (doctype, name) {
    return "/app/" + slug(doctype) + "/" + encodeURIComponent(String(name));
  };
  var same = function (a, b) {
    return Array.isArray(a) && Array.isArray(b) && a.join("/") === b.join("/");
  };

  // The route just landed is last; the one left is the nearest earlier entry that differs
  // (Frappe can record one route twice, e.g. `/app/x/new` re-routed to `new-x-…`).
  var cur = history.length ? history[history.length - 1] : null;
  var prevRoute = null;
  for (var i = history.length - 2; i >= 0; i--) {
    if (!same(history[i], cur)) {
      prevRoute = history[i];
      break;
    }
  }

  var prev = "";
  var prevUnsaved = false;
  if (isForm(prevRoute)) {
    prev = formPath(prevRoute[1], prevRoute[2]);
    var byType = e.locals && e.locals[prevRoute[1]];
    var doc = byType && byType[prevRoute[2]];
    prevUnsaved = !!(doc && doc.__unsaved);
  }

  var fromLinkParent = "";
  var fromLinkTarget = "";
  var fl = e.fromLink;
  if (fl && Array.isArray(fl.set_route_args) && fl.set_route_args[0] === "Form" && fl.set_route_args[2]) {
    fromLinkParent = formPath(fl.set_route_args[1], fl.set_route_args[2]);
    var field = fl.field_obj || {};
    var df = field.df || {};
    var target = "";
    if (df.fieldtype === "Dynamic Link") {
      target = fl.doc && df.options ? fl.doc[df.options] : "";
    } else if (typeof field.get_options === "function") {
      target = field.get_options();
    } else {
      target = df.options;
    }
    fromLinkTarget = target ? slug(target) : "";
  }

  var renamed = {};
  var nn = e.newNames && typeof e.newNames === "object" ? e.newNames : {};
  var nnKeys = Object.keys(nn).slice(-50);
  for (var k = 0; k < nnKeys.length; k++) {
    if (typeof nn[nnKeys[k]] === "string" && nn[nnKeys[k]]) renamed[nnKeys[k]] = nn[nnKeys[k]];
  }

  return {
    to: String(e.pathname || ""),
    prev: prev,
    prevUnsaved: prevUnsaved,
    fromLinkParent: fromLinkParent,
    fromLinkTarget: fromLinkTarget,
    renamed: renamed,
  };
}

/**
 * Shell-side check of what the page sent (it crosses a process boundary).
 * @param {unknown} raw
 * @returns {RouteHop|null}
 */
export function sanitizeRouteHop(raw) {
  if (!raw || typeof raw !== "object") return null;
  const r = /** @type {Record<string, unknown>} */ (raw);
  const str = (v) => (typeof v === "string" ? v.slice(0, 500) : "");
  const to = str(r.to);
  if (!to) return null;
  return {
    to,
    prev: str(r.prev),
    prevUnsaved: r.prevUnsaved === true,
    fromLinkParent: str(r.fromLinkParent),
    fromLinkTarget: str(r.fromLinkTarget),
    renamed: sanitizeRenamed(r.renamed),
  };
}

/** @param {unknown} raw @returns {Record<string, string>} */
function sanitizeRenamed(raw) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw).slice(-50)) {
    if (typeof k === "string" && k && k.length <= 200 && typeof v === "string" && v && v.length <= 200) out[k] = v;
  }
  return out;
}

/**
 * Page script that reports every Frappe route change through the ERP preload.
 * Idempotent per page load.
 * @returns {string}
 */
export function buildRouteHopReporterJs() {
  return `(function(){
    if (window.__erpUiHopReporter) return true;
    if (typeof frappe === "undefined" || !frappe.router || typeof frappe.router.on !== "function") return false;
    window.__erpUiHopReporter = true;
    var describeRouteHop = ${describeRouteHop.toString()};
    frappe.router.on("change", function () {
      try {
        if (!window.erpUiShell || typeof window.erpUiShell.noteRouteHop !== "function") return;
        window.erpUiShell.noteRouteHop(describeRouteHop({
          pathname: location.pathname,
          routeHistory: frappe.route_history,
          locals: window.locals,
          fromLink: frappe._from_link,
          newNames: frappe.model && frappe.model.new_names,
          slug: function (d) { return frappe.router.slug(d); }
        }));
      } catch (e) {}
    });
    return true;
  })()`;
}
