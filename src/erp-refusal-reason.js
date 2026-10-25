/**
 * `reasonFrom(err)` — ERPNext's reason for a refused call, for the scripts the shell runs inside the
 * ERPNext page (`erpEval`). Sent as source (`${PE_REASON_FROM_JS}` inside a script), so it is plain
 * ES5 with no imports; `tests/erp-refusal-reason.test.js` runs it against fake replies.
 *
 * 🔴 `frappe.xcall` rejects with `r.message`, and a refused call has none — ERPNext puts the reason
 * in the reply's `_server_messages` (what it raised) and `exc` (the traceback). So a caught xcall
 * error is usually `undefined`, and until 2026-10-23 every such refusal read "Payment Entry request
 * failed." — a bill refused because its Purchase Order is On Hold said that too (dogfood probe R9).
 * When the error itself says nothing, the reason is read from `frappe.last_response`, the reply
 * that just failed — only if it did refuse (a raised message or a traceback; a call that died with
 * no reply leaves an earlier, successful reply there): the messages ERPNext raised, else the
 * traceback's last `XError: message` line — the rule the Bill page uses (`electron/erp-form-bridge-page.js`
 * `refusalText`, review 10-19 R6b-2).
 */
export const PE_REASON_FROM_JS = String.raw`function reasonFrom(err) {
  function strip(t) { return String(t).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim(); }
  function flat(msg) {
    if (msg == null) return "";
    if (typeof msg === "string") {
      var t = msg.trim();
      if (!t) return "";
      if (t.charAt(0) === "{" || t.charAt(0) === "[") {
        try { return flat(JSON.parse(t)); } catch (e1) { return strip(t); }
      }
      return strip(t);
    }
    if (typeof msg === "number" || typeof msg === "boolean") return String(msg);
    if (Array.isArray(msg)) return msg.map(flat).filter(Boolean).join(" · ");
    if (typeof msg === "object") {
      if (msg.message != null && msg.message !== msg) {
        var inner = flat(msg.message);
        if (inner) return inner;
      }
      if (msg.exception != null) {
        var exn = flat(msg.exception);
        if (exn) return exn.replace(/^frappe\.exceptions\.\w+:\s*/i, "");
      }
      if (msg.responseText != null) {
        var body = flat(msg.responseText);
        if (body) return body.replace(/^frappe\.exceptions\.\w+:\s*/i, "");
      }
      if (msg._server_messages != null) {
        var sm = flat(msg._server_messages);
        if (sm) return sm;
      }
      if (msg.exc != null) {
        var ex = flat(msg.exc);
        if (ex) return ex;
      }
      try {
        var s = JSON.stringify(msg);
        if (s && s !== "{}" && s !== "[]") return s.slice(0, 500);
      } catch (e2) {}
    }
    var fb = String(msg);
    return fb === "[object Object]" ? "" : fb;
  }
  function lastRefusal() {
    var r = null;
    try { r = window.frappe && frappe.last_response; } catch (e0) {}
    if (!r) return "";
    var said = "";
    try {
      var parsed = r._server_messages ? JSON.parse(r._server_messages) : null;
      if (Array.isArray(parsed)) {
        var all = parsed.map(function (m) { try { return typeof m === "string" ? JSON.parse(m) : m; } catch (e3) { return { message: m }; } });
        var raised = all.filter(function (o) { return o && (o.raise_exception || o.indicator === "red"); });
        // Only a reply that refused: a call that died with no reply leaves an earlier, successful
        // one here, whose notes are not this call's reason.
        if (raised.length || r.exc) said = (raised.length ? raised : all).map(function (o) { return strip((o && o.message) || ""); }).filter(Boolean).join(" · ");
      }
    } catch (e4) {}
    if (said) return said;
    var text = String(r.exc == null ? "" : r.exc);
    try {
      var p = JSON.parse(text);
      if (Array.isArray(p)) text = p.join("\n");
      else if (typeof p === "string") text = p;
    } catch (e5) {}
    var lines = text.split(/\r?\n/);
    for (var i = lines.length - 1; i >= 0; i--) {
      var m = /^\s*(?:[A-Za-z_][\w.]*\.)?([A-Za-z_]\w*(?:Error|Exception))\s*:\s*(.+?)\s*$/.exec(lines[i]);
      if (m) return strip(m[2]);
    }
    return "";
  }
  return flat(err) || lastRefusal() || "ERPNext refused without saying why.";
}`;

/**
 * `xList` / `xValue` for the scripts the shell runs in the ERPNext page (review 10-19 R7-5, G19).
 * `frappe.db.get_list` wraps its call in a promise that only ever resolves (`frappe/public/js/
 * frappe/db.js`), so a refused list — a clerk without the role — never settles and the page waits
 * for good. These ask the same server methods with the same defaults (`fields` `["name"]`, `limit`
 * 20 when no `limit` is given) through `frappe.xcall`, which rejects: catch it and read the reason
 * with `reasonFrom` (send `${PE_REASON_FROM_JS}` too). A child table's rows need
 * `parent_doctype` (`{ parent_doctype: "Purchase Order" }` for Purchase Order Item), or ERPNext
 * refuses anyone but Administrator. Sent as source: `${ERP_LIST_JS}` inside the script.
 */
export const ERP_LIST_JS = String.raw`function xList(doctype, args) {
  var a = {};
  var src = args || {};
  for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) a[k] = src[k];
  a.doctype = doctype;
  if (!a.fields) a.fields = ["name"];
  if (!("limit" in a)) a.limit = 20;
  return frappe.xcall("frappe.desk.reportview.get_list", a);
}
function xValue(doctype, filters, fieldname) {
  return frappe.xcall("frappe.client.get_value", { doctype: doctype, filters: filters, fieldname: fieldname });
}`;

/**
 * ERPNext's sentence, ended — its messages often have no full stop, and the shell's advice follows
 * them ("… disabled accounts: X - USE. Open …"; dogfood probes R9-1, R10c-1).
 * @param {unknown} reason
 */
export function endSentence(reason) {
  const t = String(reason == null ? "" : reason).trim();
  return !t || /[.!?…]$/.test(t) ? t : `${t}.`;
}
