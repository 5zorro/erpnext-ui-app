/**
 * Injected into the ERP WebContents (Vanilla Desk). Idempotent.
 * Exposes window.__docFormBridge for Doc Bill / future PO / IR.
 *
 * Waits are event-driven: form hooks, router, frappe.after_ajax chains.
 * Timeout is a deadline only — not a poll loop.
 * // ponytail: if a Frappe version drops after_ajax, fall back to set_value Promise only.
 */
(function () {
  "use strict";
  var VERSION = 20;
  if (window.__docFormBridge && window.__docFormBridge.version >= VERSION) return;

  /** Must stay ≤ BILL_SAVE_TIMEOUT_MS in bill-action-flow.js (outer Electron race). */
  var SAVE_CALL_TIMEOUT_MS = 12000;

  function stripHtml(s) {
    return String(s || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function clearSaveLocks() {
    try {
      if (frappe.dom && typeof frappe.dom.unfreeze === "function") frappe.dom.unfreeze();
    } catch (e1) {}
    try {
      frappe.ui.form.is_saving = false;
    } catch (e2) {}
  }

  /**
   * Scrape whatever Vanilla already painted (msgprint / modal / toast) so Doc Bill
   * can show a real reason instead of waiting for a hung frappe.call.
   */
  function collectVisibleVanillaErrors() {
    var parts = [];
    function push(t) {
      t = stripHtml(t);
      if (!t) return;
      if (parts.indexOf(t) >= 0) return;
      parts.push(t);
    }
    try {
      var nodes = document.querySelectorAll(
        ".msgprint, .modal.show .modal-body, .modal.in .modal-body, " +
          ".frappe-message, .alert-danger, .alert-warning, .toast-message, " +
          ".indicator-pill.red, .indicator-pill.orange"
      );
      for (var i = 0; i < nodes.length; i++) {
        push(nodes[i].innerText || nodes[i].textContent);
      }
    } catch (eQ) {}
    try {
      if (frappe && frappe.msg_dialog && frappe.msg_dialog.$wrapper) {
        var $w = frappe.msg_dialog.$wrapper;
        if ($w.is(":visible")) push($w.text());
      }
    } catch (eM) {}
    try {
      if (frappe && frappe.throw_msg) push(frappe.throw_msg);
    } catch (eT) {}
    return parts;
  }

  /**
   * Same effect as clicking OK on ERPNext's posting-date confirm
   * (`confirm_posting_date_change` in transaction.js). Doc skin cannot click
   * that dialog on the hidden ERP pane — so apply the yes-path before validate.
   */
  function alignPostingDateLikeVanillaOk(f) {
    try {
      if (!f || !f.doc) return null;
      if (!frappe.meta.has_field(f.doc.doctype, "set_posting_time")) return null;
      if (f.doc.set_posting_time) return null;
      var today = frappe.datetime.get_today();
      if (!f.doc.posting_date || today == f.doc.posting_date) return null;
      var prev = f.doc.posting_date;
      f.doc.posting_date = today;
      try {
        f.refresh_field("posting_date");
      } catch (eRf) {}
      return { reset: true, from: prev, to: today };
    } catch (e) {
      return null;
    }
  }

  /**
   * Auto-accept only the posting-date confirm (hidden under Doc skin).
   * Other confirms fall through to original (or reject) so we do not
   * silently OK unrelated Vanilla prompts.
   */
  function isPostingDateConfirmMsg(msg) {
    var s = String(msg || "");
    return /posting date will change/i.test(s) || /edit posting date and time/i.test(s);
  }

  function withAutoAcceptConfirm(run) {
    var original = frappe.confirm;
    frappe.confirm = function (msg, yes, no) {
      if (isPostingDateConfirmMsg(msg)) {
        try {
          if (typeof yes === "function") yes();
        } catch (eY) {}
        return;
      }
      return original.apply(this, arguments);
    };
    return Promise.resolve()
      .then(function () {
        return run();
      })
      .finally(function () {
        frappe.confirm = original;
      });
  }

  /**
   * Plain shelf fields only — Frappe locals are circular; JSON.stringify(doc) throws
   * and used to wipe lastSavedDoc (Vanilla submit never drained into Drafts).
   * Shape mirrors src/shelved-drafts.js pickShelveDocFields.
   */
  function pickShelveDoc(doc) {
    if (!doc) return null;
    var name = doc.name != null ? String(doc.name).trim() : "";
    if (!name) return null;
    var itemsIn = doc.items || [];
    var items = [];
    for (var i = 0; i < itemsIn.length; i++) {
      var it = itemsIn[i];
      if (!it) continue;
      var po = it.purchase_order;
      items.push({
        purchase_order: po != null && String(po).trim() ? String(po).trim() : "",
      });
    }
    return {
      name: name,
      doctype: doc.doctype != null ? String(doc.doctype) : "",
      docstatus: doc.docstatus == null ? 0 : Number(doc.docstatus),
      posting_date: doc.posting_date != null ? String(doc.posting_date) : "",
      bill_no: doc.bill_no != null ? String(doc.bill_no) : "",
      transaction_date: doc.transaction_date != null ? String(doc.transaction_date) : "",
      lr_no: doc.lr_no != null ? String(doc.lr_no) : "",
      items: items,
    };
  }

  function installSaveWatch() {
    if (window.__docFormBridgeSaveWatch) return;
    window.__docFormBridgeSaveWatch = true;
    try {
      $(document).on("save.docFormBridgeShelve", function (_e, doc) {
        window.__docFormBridge.lastSavedDoc = pickShelveDoc(doc);
        window.__docFormBridge.lastSavedAt = Date.now();
      });
    } catch (eHook) {}
  }

  /** Peek open form for shelf prune (submitted still on Drafts after Vanilla submit). */
  function peekShelveDoc() {
    try {
      var f = window.cur_frm;
      if (!f || !f.doc) return { ok: false };
      var plain = pickShelveDoc(f.doc);
      if (!plain) return { ok: false };
      return { ok: true, doc: plain };
    } catch (e) {
      return { ok: false };
    }
  }

  function takeLastSavedDoc() {
    installSaveWatch();
    var d = window.__docFormBridge.lastSavedDoc || null;
    window.__docFormBridge.lastSavedDoc = null;
    if (!d) return { ok: false };
    return { ok: true, doc: d };
  }

  function isMandatoryValuePresent(value, fieldtype) {
    if (fieldtype === "Check") return true;
    if (value == null) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "number") return !isNaN(value);
    return stripHtml(value) !== "";
  }

  function evalMandatoryDependsOn(frm, doc, df) {
    if (!df) return false;
    if (!df.mandatory_depends_on) return !!df.reqd;
    var expression = df.mandatory_depends_on;
    var parent = frm && frm.doc;
    try {
      if (typeof expression === "boolean") return expression;
      if (typeof expression === "function") return !!expression(doc);
      if (typeof expression === "string" && expression.substr(0, 5) === "eval:") {
        return !!frappe.utils.eval(expression.substr(5), { doc: doc, parent: parent });
      }
      var value = doc[expression];
      if (Array.isArray(value)) return !!value.length;
      return !!value;
    } catch (e) {
      return !!df.reqd;
    }
  }

  /**
   * Silent live-meta mandatory check (same rules as frappe.ui.form.check_mandatory,
   * but no msgprint — so Doc Bill can show blockers without hanging f.save()).
   */
  function listMandatoryMissing(doctype) {
    try {
      var f = window.cur_frm;
      if (!f || !f.doc) {
        return { ok: false, reason: "No form open in Vanilla (cur_frm missing).", blockers: [] };
      }
      if (doctype && f.doctype !== doctype && f.doc.doctype !== doctype) {
        return { ok: false, reason: "Vanilla form is not a " + doctype + ".", blockers: [] };
      }
      if (f.doc.docstatus === 2) return { ok: true, blockers: [] };

      var parent = [];
      var tablesByField = {};
      var promptNameMissing = !!(f.is_new && f.is_new() && f.meta && f.meta.autoname === "Prompt" && !f.doc.__newname);

      var docs = frappe.model.get_all_docs(f.doc);
      for (var i = 0; i < docs.length; i++) {
        var doc = docs[i];
        var fieldsDict = frappe.meta.get_docfield_copy(doc.doctype, doc.name) || {};
        var fieldList = frappe.meta.docfield_list[doc.doctype] || [];
        var missingLabels = [];

        for (var j = 0; j < fieldList.length; j++) {
          var docfield = fieldList[j];
          if (!docfield || !docfield.fieldname) continue;
          var df = fieldsDict[docfield.fieldname];
          if (!df) continue;
          if (!df.reqd && !df.mandatory_depends_on) continue;
          if (df.fieldtype === "Fold") continue;
          if (!evalMandatoryDependsOn(f, doc, df)) continue;
          var present = false;
          try {
            present = !!frappe.model.has_value(doc.doctype, doc.name, df.fieldname);
          } catch (eHas) {
            present = isMandatoryValuePresent(doc[df.fieldname], df.fieldtype);
          }
          if (!present) missingLabels.push(df.label || df.fieldname);
        }

        var meta = frappe.get_meta(doc.doctype);
        if (meta && meta.istable) {
          var parentfield = doc.parentfield;
          if (!tablesByField[parentfield]) {
            var tableField =
              frappe.meta.docfield_map[doc.parenttype] &&
              frappe.meta.docfield_map[doc.parenttype][parentfield];
            tablesByField[parentfield] = {
              label: (tableField && (tableField.label || parentfield)) || parentfield,
              totalRows: (f.doc[parentfield] || []).length,
              byLabel: {},
            };
          }
          for (var m = 0; m < missingLabels.length; m++) {
            var lab = missingLabels[m];
            if (!tablesByField[parentfield].byLabel[lab]) {
              tablesByField[parentfield].byLabel[lab] = [];
            }
            tablesByField[parentfield].byLabel[lab].push(doc.idx || 0);
          }
        } else {
          for (var p = 0; p < missingLabels.length; p++) {
            parent.push({
              label: missingLabels[p],
              required: true,
              present: false,
            });
          }
        }
      }

      var tables = [];
      Object.keys(tablesByField).forEach(function (pf) {
        var te = tablesByField[pf];
        var missing = Object.keys(te.byLabel).map(function (lab) {
          return { label: lab, rows: te.byLabel[lab] };
        });
        tables.push({ label: te.label, totalRows: te.totalRows, missing: missing });
      });

      // Inline mirror of listMandatoryBlockersFromSnap (page script cannot import ESM).
      var blockers = [];
      if (promptNameMissing) blockers.push("Name is required.");
      for (var a = 0; a < parent.length; a++) {
        blockers.push(stripHtml(parent[a].label) + " is required.");
      }
      for (var t = 0; t < tables.length; t++) {
        var table = tables[t];
        var tableLabel = stripHtml(table.label) || "Table";
        for (var x = 0; x < (table.missing || []).length; x++) {
          var miss = table.missing[x];
          var fieldLabel = stripHtml(miss.label) || "Field";
          var rows = (miss.rows || []).filter(function (n) {
            return n > 0;
          });
          rows.sort(function (aa, bb) {
            return aa - bb;
          });
          if (!rows.length) continue;
          if (table.totalRows > 0 && rows.length === table.totalRows) {
            blockers.push("In " + tableLabel + ", " + fieldLabel + " is required in every row.");
          } else if (rows.length === 1) {
            blockers.push(
              "In " + tableLabel + ", " + fieldLabel + " is required in row " + rows[0] + ".",
            );
          } else {
            blockers.push(
              "In " + tableLabel + ", " + fieldLabel + " is required in rows " + rows.join(", ") + ".",
            );
          }
        }
      }

      return { ok: true, blockers: blockers };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e), blockers: [] };
    }
  }

  /**
   * Save that always settles. Vanilla f.save() hangs forever when check_mandatory
   * fails (msgprint shown, callback never called) — that caused Doc Bill's long timeout.
   * We preflight mandatories, clear stuck freeze locks, race savedocs against a short
   * deadline, and scrape visible Vanilla messages when the call never returns.
   */
  function saveDoc(action) {
    return (async function () {
      try {
        var f = window.cur_frm;
        if (!f || !f.doc) return { ok: false, reason: "No form open in Vanilla (cur_frm missing)." };
        if (f.doc.docstatus !== 0) {
          return {
            ok: false,
            reason:
              "Document is not a draft (docstatus=" +
              f.doc.docstatus +
              "). Reload the Bill or open a draft.",
          };
        }
        action = action || "Save";
        clearSaveLocks();
        installSaveWatch();

        // Avoid hanging on ERPNext posting-date confirm (hidden under Doc skin).
        alignPostingDateLikeVanillaOk(f);

        if (f.doc.doctype === "Purchase Invoice" || f.doc.doctype === "Sales Invoice") {
          ensurePaymentScheduleBeforeSave(f);
        }

        var pre = listMandatoryMissing();
        if (pre && pre.blockers && pre.blockers.length) {
          return {
            ok: false,
            preflight: true,
            blockers: pre.blockers,
            reason: pre.blockers.join(" · ") || "Missing mandatory fields.",
          };
        }

        try {
          f.refresh_field("items");
        } catch (eRefresh) {}

        return await withAutoAcceptConfirm(async function () {
          frappe.validated = true;
          try {
            await f.script_manager.trigger("validate");
            await f.script_manager.trigger("before_save");
          } catch (eTrig) {
            var trigMsg = String(eTrig && eTrig.message ? eTrig.message : eTrig);
            var visible = collectVisibleVanillaErrors();
            return {
              ok: false,
              reason: visible.length ? visible.join(" · ") : trigMsg || "Client validation failed.",
              blockers: visible.length ? visible : [trigMsg],
            };
          }
          if (!frappe.validated) {
            var visFail = collectVisibleVanillaErrors();
            return {
              ok: false,
              reason:
                (visFail.length ? visFail.join(" · ") : null) ||
                "Client validation failed (form script set frappe.validated = false).",
              blockers: visFail.length ? visFail : ["Client validation failed (form script)."],
            };
          }

          // Re-check after scripts — they can clear/toggle reqd fields.
          pre = listMandatoryMissing();
          if (pre && pre.blockers && pre.blockers.length) {
            return {
              ok: false,
              preflight: true,
              blockers: pre.blockers,
              reason: pre.blockers.join(" · ") || "Missing mandatory fields.",
            };
          }

          return await new Promise(function (resolve) {
            var settled = false;
            function finish(result) {
              if (settled) return;
              settled = true;
              clearSaveLocks();
              resolve(result);
            }
            var timer = setTimeout(function () {
              var scraped = collectVisibleVanillaErrors();
              finish({
                ok: false,
                timedOut: true,
                blockers: scraped.length ? scraped : undefined,
                reason: scraped.length
                  ? scraped.join(" · ")
                  : action +
                    " did not finish in Vanilla within " +
                    SAVE_CALL_TIMEOUT_MS / 1000 +
                    "s (no dialog text found). Open Vanilla to inspect the freeze, then reload this Bill.",
              });
            }, SAVE_CALL_TIMEOUT_MS);

            frappe.call({
              method: "frappe.desk.form.save.savedocs",
              args: { doc: f.doc, action: action },
              freeze: true,
              callback: function (r) {
                clearTimeout(timer);
                if (r && r.exc) {
                  var msg = "";
                  try {
                    if (r._server_messages) {
                      var parsed = JSON.parse(r._server_messages);
                      if (Array.isArray(parsed)) {
                        msg = parsed
                          .map(function (m) {
                            try {
                              var o = typeof m === "string" ? JSON.parse(m) : m;
                              return stripHtml((o && o.message) || m);
                            } catch (eMap) {
                              return stripHtml(m);
                            }
                          })
                          .filter(Boolean)
                          .join(" ");
                      }
                    }
                  } catch (eMsg) {}
                  if (!msg) {
                    var scrapedExc = collectVisibleVanillaErrors();
                    if (scrapedExc.length) msg = scrapedExc.join(" · ");
                  }
                  finish({
                    ok: false,
                    reason: msg || stripHtml(String(r.exc)) || "Save failed.",
                    blockers: msg ? [msg] : undefined,
                  });
                  return;
                }
                var docOut = null;
                try {
                  if (r && Array.isArray(r.docs) && r.docs[0]) {
                    docOut = r.docs[0];
                    if (typeof f.refresh_fields === "function") {
                      try {
                        f.refresh_fields();
                      } catch (eRf) {}
                    }
                  } else if (typeof f.refresh === "function") {
                    f.refresh();
                    docOut = f.doc;
                  } else {
                    docOut = f.doc;
                  }
                } catch (eRef) {
                  docOut = (r && r.docs && r.docs[0]) || (f && f.doc) || null;
                }
                var plain = null;
                try {
                  plain = docOut ? JSON.parse(JSON.stringify(docOut)) : null;
                } catch (eJson) {
                  finish({
                    ok: false,
                    reason: "Save succeeded but could not read document back — reload the Bill.",
                  });
                  return;
                }
                if (!plain) {
                  var scrapedOk = collectVisibleVanillaErrors();
                  finish({
                    ok: false,
                    reason:
                      (scrapedOk.length ? scrapedOk.join(" · ") : null) ||
                      "Vanilla returned no document after " + action + ".",
                    blockers: scrapedOk.length ? scrapedOk : undefined,
                  });
                  return;
                }
                try {
                  window.__docFormBridge.lastSavedDoc = plain;
                  window.__docFormBridge.lastSavedAt = Date.now();
                } catch (eLs) {}
                finish({
                  ok: true,
                  doc: plain,
                  submitted: action === "Submit",
                });
              },
              error: function (r) {
                clearTimeout(timer);
                var scrapedErr = collectVisibleVanillaErrors();
                var errMsg = stripHtml((r && (r.message || r.exc)) || "");
                finish({
                  ok: false,
                  reason:
                    (scrapedErr.length ? scrapedErr.join(" · ") : null) ||
                    errMsg ||
                    "Save request failed.",
                  blockers: scrapedErr.length ? scrapedErr : errMsg ? [errMsg] : undefined,
                });
              },
              always: function () {
                clearSaveLocks();
              },
            });
          });
        });
      } catch (e) {
        clearSaveLocks();
        return { ok: false, reason: String(e && e.message ? e.message : e) };
      }
    })();
  }

  function formMatches(doctype) {
    var f = window.cur_frm;
    if (!f || !f.doc) return false;
    if (!doctype) return true;
    return f.doctype === doctype || f.doc.doctype === doctype;
  }

  function snapshot(doctype) {
    try {
      var f = window.cur_frm;
      if (!f || !f.doc) {
        return { ok: false, reason: "No form open in Vanilla (cur_frm missing)." };
      }
      if (doctype && f.doctype !== doctype && f.doc.doctype !== doctype) {
        return { ok: false, reason: "Vanilla form is not a " + doctype + "." };
      }
      return {
        ok: true,
        doc: JSON.parse(JSON.stringify(f.doc)),
        isDirty: !!(f.is_dirty && f.is_dirty()),
        isNew: !!(f.is_new && f.is_new()),
      };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e) };
    }
  }

  function afterAjaxQuiet(maxWaitMs) {
    maxWaitMs = maxWaitMs || 12000;
    return new Promise(function (resolve) {
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        resolve();
      }
      try {
        if (window.frappe && typeof frappe.after_ajax === "function") {
          frappe.after_ajax(finish);
        } else {
          finish();
          return;
        }
      } catch (e) {
        finish();
        return;
      }
      setTimeout(finish, maxWaitMs);
    });
  }

  /** Run ERPNext taxes_and_totals so net_total / grand_total match items (+ taxes). */
  async function refreshTaxesAndTotals(f) {
    try {
      f.refresh_field("items");
    } catch (eItems) {}
    try {
      f.refresh_field("taxes");
    } catch (e0) {}
    try {
      var ret = null;
      if (f.cscript && typeof f.cscript.calculate_taxes_and_totals === "function") {
        ret = f.cscript.calculate_taxes_and_totals();
      } else if (typeof f.calculate_taxes_and_totals === "function") {
        ret = f.calculate_taxes_and_totals();
      } else if (f.trigger) {
        ret = f.trigger("calculate_taxes_and_totals");
      }
      if (ret && typeof ret.then === "function") await ret;
    } catch (e1) {}
    try {
      f.refresh_fields([
        "items",
        "taxes",
        "total",
        "net_total",
        "total_taxes_and_charges",
        "grand_total",
        "rounded_total",
        "base_grand_total",
        "outstanding_amount",
      ]);
    } catch (e2) {}
  }

  function setValueAsync(doctype, name, field, value) {
    return new Promise(function (resolve, reject) {
      try {
        var settled = false;
        function ok() {
          if (settled) return;
          settled = true;
          resolve();
        }
        var ret = frappe.model.set_value(doctype, name, field, value, ok);
        if (ret && typeof ret.then === "function") {
          ret.then(ok, function (err) {
            if (!settled) {
              settled = true;
              reject(err);
            }
          });
        }
        setTimeout(ok, 15000);
      } catch (e) {
        reject(e);
      }
    });
  }

  function rowNeedsEnrichment(row) {
    if (!row || !row.item_code) return false;
    var needDesc = !stripHtml(row.description);
    var needRate = row.rate == null || Number(row.rate) === 0;
    return needDesc || needRate;
  }

  var SUPPLIER_PARTY_DETAIL_FIELDS = [
    "supplier_name",
    "supplier_address",
    "address_display",
    "shipping_address_display",
    "dispatch_address_display",
    "shipping_address",
    "dispatch_address",
    "payment_terms_template",
  ];
  var SUPPLIER_PARTY_SETTLE_MAX_MS = 12000;
  var SUPPLIER_BILLING_DISPLAY_FIELD = "address_display";

  function supplierSnapshotWaitSliceMs(deadlineMs, nowMs) {
    nowMs = nowMs || Date.now();
    var remaining = deadlineMs - nowMs;
    if (remaining <= 0) return 0;
    return Math.min(500, Math.max(50, remaining));
  }

  function supplierSnapshotAllowMetaOnly(deadlineMs, nowMs) {
    nowMs = nowMs || Date.now();
    return deadlineMs - nowMs <= SUPPLIER_PARTY_META_ONLY_GRACE_MS;
  }

  function hasSupplierBillingDisplay(doc) {
    var d = doc && typeof doc === "object" ? doc : {};
    return !!stripHtml(d[SUPPLIER_BILLING_DISPLAY_FIELD]);
  }

  function supplierSnapshotReadyReason(doc, ctx) {
    ctx = ctx && typeof ctx === "object" ? ctx : {};
    var d = doc && typeof doc === "object" ? doc : {};
    var target = normalizeSupplierKey(ctx.targetSupplier != null ? ctx.targetSupplier : d.supplier);
    if (!target || normalizeSupplierKey(d.supplier) !== target) {
      return { ready: false, reason: "supplier_mismatch" };
    }
    if (hasSupplierBillingDisplay(d)) {
      return { ready: true, reason: "address_display", field: SUPPLIER_BILLING_DISPLAY_FIELD };
    }
    if (ctx.allowMetaOnlyAtDeadline) {
      if (
        isSupplierPartySettled(d, {
          targetSupplier: target,
          baseline: ctx.baseline,
          allowMetaOnly: true,
        })
      ) {
        return { ready: true, reason: "meta_only_deadline", field: "" };
      }
    }
    return { ready: false, reason: "waiting" };
  }

  function supplierAddressSnapshotReady(doc, ctx) {
    return supplierSnapshotReadyReason(doc, ctx).ready;
  }

  function normalizeSupplierKey(value) {
    return String(value == null ? "" : value).trim();
  }

  function supplierPartyBaseline(doc) {
    var d = doc && typeof doc === "object" ? doc : {};
    var out = { supplier: d.supplier };
    for (var i = 0; i < SUPPLIER_PARTY_DETAIL_FIELDS.length; i++) {
      var f = SUPPLIER_PARTY_DETAIL_FIELDS[i];
      out[f] = d[f];
    }
    return out;
  }

  function supplierPartyDetailChanged(doc, baseline) {
    var d = doc && typeof doc === "object" ? doc : {};
    var base = baseline && typeof baseline === "object" ? baseline : {};
    for (var i = 0; i < SUPPLIER_PARTY_DETAIL_FIELDS.length; i++) {
      var field = SUPPLIER_PARTY_DETAIL_FIELDS[i];
      if (stripHtml(d[field]) !== stripHtml(base[field])) return true;
    }
    return false;
  }

  var SUPPLIER_PARTY_META_FIELDS = ["supplier_name", "payment_terms_template"];
  var SUPPLIER_ADDRESS_DISPLAY_FIELDS = [
    "supplier_address",
    "address_display",
    "shipping_address_display",
    "dispatch_address_display",
    "shipping_address",
    "dispatch_address",
  ];
  var SUPPLIER_PARTY_META_ONLY_GRACE_MS = 3000;

  function hasSupplierAddressDisplaySignals(doc) {
    var d = doc && typeof doc === "object" ? doc : {};
    for (var i = 0; i < SUPPLIER_ADDRESS_DISPLAY_FIELDS.length; i++) {
      if (stripHtml(d[SUPPLIER_ADDRESS_DISPLAY_FIELDS[i]])) return true;
    }
    return false;
  }

  function isSupplierPartyMetaOnlyChange(doc, baseline) {
    var d = doc && typeof doc === "object" ? doc : {};
    var base = baseline && typeof baseline === "object" ? baseline : {};
    if (hasSupplierAddressDisplaySignals(d)) return false;
    for (var m = 0; m < SUPPLIER_PARTY_META_FIELDS.length; m++) {
      var mf = SUPPLIER_PARTY_META_FIELDS[m];
      if (stripHtml(d[mf]) !== stripHtml(base[mf])) return true;
    }
    return false;
  }

  function isSupplierPartySettled(doc, ctx) {
    ctx = ctx && typeof ctx === "object" ? ctx : {};
    var d = doc && typeof doc === "object" ? doc : {};
    var target = normalizeSupplierKey(ctx.targetSupplier != null ? ctx.targetSupplier : d.supplier);
    if (!target || normalizeSupplierKey(d.supplier) !== target) return false;
    var base = ctx.baseline && typeof ctx.baseline === "object" ? ctx.baseline : null;
    if (hasSupplierAddressDisplaySignals(d)) return true;
    if (ctx.allowMetaOnly) {
      if (!base) return !!stripHtml(d.supplier_name);
      if (supplierPartyDetailChanged(d, base)) return true;
    }
    if (base && normalizeSupplierKey(base.supplier) === target && hasSupplierAddressDisplaySignals(base)) {
      return true;
    }
    return false;
  }

  async function waitForSupplierBillingSnapshot(f, targetSupplier, baseline, maxWaitMs) {
    maxWaitMs = maxWaitMs || SUPPLIER_PARTY_SETTLE_MAX_MS;
    var deadline = Date.now() + maxWaitMs;
    /** @type {Array<{ event: string, remaining?: number, ms?: number, field?: string }>} */
    var timing = [];
    var done = false;

    function tryReady() {
      if (done || !f || !f.doc) return null;
      var now = Date.now();
      var remaining = deadline - now;
      if (remaining <= 0) return null;
      var hit = supplierSnapshotReadyReason(f.doc, {
        targetSupplier: targetSupplier,
        baseline: baseline,
        allowMetaOnlyAtDeadline: supplierSnapshotAllowMetaOnly(deadline, now),
      });
      if (hit.ready) {
        return {
          event: hit.reason,
          field: hit.field || "",
          remaining: remaining,
        };
      }
      return null;
    }

    function cleanup(listeners) {
      listeners = listeners || [];
      for (var i = 0; i < listeners.length; i++) {
        try {
          listeners[i]();
        } catch (eCl) {}
      }
    }

    return new Promise(function (resolve) {
      /** @type {Array<function(): void>} */
      var listeners = [];

      function finish(payload) {
        if (done) return;
        done = true;
        cleanup(listeners);
        if (payload) timing.push(payload);
        else if (!timing.some(function (t) { return t.event === "timeout"; })) {
          timing.push({ event: "timeout", remaining: 0 });
        }
        resolve({ ok: !!payload, timing: timing, last: payload || null });
      }

      function wake() {
        var hit = tryReady();
        if (hit) finish(hit);
      }

      try {
        if (window.frappe && frappe.model && typeof frappe.model.on === "function" && f.doc && f.doc.name) {
          var modelHandler = function (fieldname) {
            if (
              fieldname === SUPPLIER_BILLING_DISPLAY_FIELD ||
              fieldname === "supplier_address" ||
              fieldname === "supplier_name"
            ) {
              wake();
            }
          };
          frappe.model.on(f.doctype, f.doc.name, modelHandler);
          listeners.push(function () {
            try {
              if (frappe.model.off) frappe.model.off(f.doctype, f.doc.name, modelHandler);
            } catch (eOff) {}
          });
        }
      } catch (eModel) {}

      try {
        if (window.jQuery) {
          var onRefresh = function (_ev, frm) {
            if (frm === f) wake();
          };
          jQuery(document).on("form_refresh.supplierBillingSnap", onRefresh);
          listeners.push(function () {
            try {
              jQuery(document).off("form_refresh.supplierBillingSnap", onRefresh);
            } catch (eJr) {}
          });
        }
      } catch (eFr) {}

      (async function pollLoop() {
        while (!done && Date.now() < deadline) {
          var hit = tryReady();
          if (hit) {
            finish(hit);
            return;
          }
          var slice = supplierSnapshotWaitSliceMs(deadline, Date.now());
          timing.push({ event: "wait_slice", ms: slice, remaining: deadline - Date.now() });
          await afterAjaxQuiet(slice);
        }
        if (!done) finish(tryReady());
      })();
    });
  }

  /**
   * Wait until cur_frm matches doctype.
   * Events: form hooks, router, MutationObserver, one after_ajax pulse. Timeout = deadline only.
   */
  function waitForForm(doctype, timeoutMs) {
    timeoutMs = timeoutMs || 25000;
    return new Promise(function (resolve) {
      var finished = false;
      var timer = null;
      var obs = null;

      function cleanup() {
        if (timer) clearTimeout(timer);
        try {
          if (obs) obs.disconnect();
        } catch (e0) {}
        obs = null;
        try {
          if (window.jQuery) jQuery(document).off(".docFormBridge");
        } catch (e1) {}
      }

      function succeed() {
        if (finished) return;
        if (!formMatches(doctype)) return;
        finished = true;
        cleanup();
        resolve(snapshot(doctype));
      }

      function fail(reason) {
        if (finished) return;
        finished = true;
        cleanup();
        var url = "";
        try {
          url = String(location.href || "");
        } catch (e2) {}
        if (/\/login/i.test(url)) {
          resolve({
            ok: false,
            reason:
              "Please log in on Vanilla skin, then click Enter Bills again (or Retry on this page).",
          });
          return;
        }
        resolve({
          ok: false,
          reason:
            reason ||
            "Timed out waiting for " +
              (doctype || "form") +
              " — open Vanilla, confirm the form, then Retry.",
        });
      }

      if (formMatches(doctype)) {
        succeed();
        return;
      }

      try {
        if (window.jQuery) {
          jQuery(document).on(
            "form-load.docFormBridge form-refresh.docFormBridge page-change.docFormBridge",
            function () {
              succeed();
            },
          );
        }
      } catch (e3) {}

      try {
        if (doctype && frappe.ui && frappe.ui.form && frappe.ui.form.on) {
          frappe.ui.form.on(doctype, {
            onload: function () {
              succeed();
            },
            refresh: function () {
              succeed();
            },
          });
        }
      } catch (e4) {}

      try {
        if (frappe.router && typeof frappe.router.on === "function") {
          frappe.router.on("change", function () {
            succeed();
          });
        }
      } catch (e5) {}

      try {
        var root = document.documentElement || document.body;
        if (root && window.MutationObserver) {
          obs = new MutationObserver(function () {
            succeed();
          });
          obs.observe(root, { childList: true, subtree: true });
        }
      } catch (e6) {}

      // One ajax-quiet pulse (not a re-arm loop) in case the form is already mid-load.
      afterAjaxQuiet(4000).then(function () {
        succeed();
      });

      timer = setTimeout(function () {
        if (formMatches(doctype)) succeed();
        else fail();
      }, timeoutMs);
    });
  }

  async function waitForPaymentScheduleRows(f, timeoutMs) {
    var start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        var sched = f && f.doc && f.doc.payment_schedule;
        if (Array.isArray(sched) && sched.length) {
          return { ok: true, rows: sched.length };
        }
      } catch (eW) {}
      await afterAjaxQuiet(400);
    }
    return { ok: false, rows: 0, reason: "payment_schedule empty (timeout)" };
  }

  async function fetchPartyDueDate(f) {
    try {
      if (!f || !f.doc) return { due_date: null };
      var party_type = f.doc.doctype === "Sales Invoice" ? "Customer" : "Supplier";
      var party = f.doc.doctype === "Sales Invoice" ? f.doc.customer : f.doc.supplier;
      if (!party) return { due_date: null };
      var r = await frappe.call({
        method: "erpnext.accounts.party.get_due_date",
        args: {
          posting_date: f.doc.posting_date,
          party_type: party_type,
          bill_date: f.doc.bill_date,
          party: party,
          company: f.doc.company,
        },
      });
      return { due_date: r && r.message ? r.message : null };
    } catch (eP) {
      return { due_date: null, reason: String(eP && eP.message ? eP.message : eP) };
    }
  }

  function syncScheduleFromHeaderDueDate(f, isoDueDate) {
    try {
      if (!f || !f.doc) return { ok: false, reason: "no form" };
      var due = isoDueDate != null ? String(isoDueDate).trim() : "";
      if (!due) return { ok: false, reason: "empty due_date" };
      var sched = f.doc.payment_schedule;
      if (!Array.isArray(sched)) sched = [];
      var multiInstallment = sched.length > 1;
      if (!sched.length) {
        var child = frappe.model.add_child(f.doc, "Payment Schedule", "payment_schedule");
        if (child) {
          child.due_date = due;
          child.payment_amount =
            f.doc.grand_total != null && f.doc.grand_total !== ""
              ? f.doc.grand_total
              : f.doc.rounded_total || 0;
        }
      } else if (sched.length === 1) {
        sched[0].due_date = due;
      } else {
        sched[sched.length - 1].due_date = due;
      }
      try {
        f.refresh_field("payment_schedule");
      } catch (eRf) {}
      return {
        ok: true,
        rows: (f.doc.payment_schedule || []).length,
        multiInstallment: multiInstallment,
      };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e) };
    }
  }

  function ensurePaymentScheduleBeforeSave(f) {
    try {
      if (!f || !f.doc) return { ensured: false };
      var dt = f.doc.doctype;
      if (dt !== "Purchase Invoice" && dt !== "Sales Invoice") return { ensured: false };
      var sched = f.doc.payment_schedule;
      if (Array.isArray(sched) && sched.length > 0) return { ensured: false };
      var due = f.doc.due_date != null ? String(f.doc.due_date).trim() : "";
      if (!due) return { ensured: false };
      var synced = syncScheduleFromHeaderDueDate(f, due);
      return { ensured: !!(synced && synced.ok), sync: synced };
    } catch (eEns) {
      return { ensured: false, reason: String(eEns && eEns.message ? eEns.message : eEns) };
    }
  }

  function syncHeaderDueDateFromSchedule(f) {
    try {
      if (!f || !f.doc) return false;
      var sched = f.doc.payment_schedule;
      if (!Array.isArray(sched) || !sched.length) return false;
      var due = null;
      for (var i = sched.length - 1; i >= 0; i--) {
        if (sched[i] && sched[i].due_date) {
          due = sched[i].due_date;
          break;
        }
      }
      if (!due) return false;
      f.doc.due_date = due;
      try {
        f.refresh_field("due_date");
      } catch (eRf) {}
      return true;
    } catch (eSync) {
      return false;
    }
  }

  async function maybeSettlePaymentTermsIfNeeded(f, trigger, baseline) {
    if (!f || !f.doc) return null;
    var dt = f.doc.doctype;
    if (dt !== "Purchase Invoice" && dt !== "Sales Invoice") return null;
    if (!f.doc.payment_terms_template) return null;
    var base = baseline && typeof baseline === "object" ? baseline : {};
    var termsChanged =
      stripHtml(f.doc.payment_terms_template) !== stripHtml(base.payment_terms_template);
    var dueEmpty = !stripHtml(f.doc.due_date);
    var sched = f.doc.payment_schedule;
    var schedEmpty = !Array.isArray(sched) || !sched.length;
    if (!termsChanged && !dueEmpty && !schedEmpty) return null;
    return await settlePaymentTermsAfterHeaderChange(f, "payment_terms_template");
  }

  async function settlePaymentTermsAfterHeaderChange(f, field) {
    var meta = {
      field: field,
      terms: "",
      posting_date: "",
      schedule_rows: 0,
      due_date: "",
      source: "none",
      waited_ms: 0,
      ok: false,
      reason: "",
    };
    if (!f || !f.doc) {
      meta.reason = "no form";
      return meta;
    }
    var dt = f.doc.doctype;
    if (dt !== "Purchase Invoice" && dt !== "Sales Invoice") {
      meta.reason = "not invoice";
      return meta;
    }
    if (field !== "payment_terms_template" && field !== "bill_date") {
      meta.reason = "not terms field";
      return meta;
    }
    meta.terms = f.doc.payment_terms_template || "";
    meta.posting_date = f.doc.bill_date || f.doc.posting_date || "";
    try {
      var t0 = Date.now();
      if (field === "payment_terms_template" && f.doc.payment_terms_template) {
        var retTerms = f.trigger("payment_terms_template");
        if (retTerms && typeof retTerms.then === "function") await retTerms;
        var waitSched = await waitForPaymentScheduleRows(f, 12000);
        meta.waited_ms = Date.now() - t0;
        meta.schedule_rows = waitSched.rows || 0;
        if (!waitSched.ok) meta.reason = waitSched.reason || "schedule timeout";
        if (syncHeaderDueDateFromSchedule(f)) {
          meta.due_date = f.doc.due_date || "";
          meta.source = "schedule";
          meta.ok = !!meta.due_date;
        }
      } else if (field === "bill_date" && f.doc.bill_date) {
        var retDate = f.trigger("bill_date");
        if (retDate && typeof retDate.then === "function") await retDate;
        await afterAjaxQuiet(4000);
        if (f.doc.payment_terms_template) {
          var retRecalc = f.trigger("payment_terms_template");
          if (retRecalc && typeof retRecalc.then === "function") await retRecalc;
          var waitSched2 = await waitForPaymentScheduleRows(f, 12000);
          meta.waited_ms = Date.now() - t0;
          meta.schedule_rows = waitSched2.rows || 0;
          if (!waitSched2.ok) meta.reason = waitSched2.reason || "schedule timeout";
          if (syncHeaderDueDateFromSchedule(f)) {
            meta.due_date = f.doc.due_date || "";
            meta.source = "schedule";
            meta.ok = !!meta.due_date;
          }
        } else {
          meta.waited_ms = Date.now() - t0;
        }
      }
      if (!meta.ok && f.doc.payment_terms_template) {
        var partyDue = await fetchPartyDueDate(f);
        if (partyDue && partyDue.due_date) {
          f.doc.due_date = partyDue.due_date;
          try {
            f.refresh_field("due_date");
          } catch (eRf2) {}
          meta.due_date = partyDue.due_date;
          meta.source = "party";
          meta.ok = true;
          meta.reason = "";
        } else if (!meta.reason) {
          meta.reason = (partyDue && partyDue.reason) || "due_date still empty after settle";
        }
      }
    } catch (eSettle) {
      meta.reason = String(eSettle && eSettle.message ? eSettle.message : eSettle);
    }
    return meta;
  }

  function setHeader(field, value) {
    return (async function () {
      try {
        var f = window.cur_frm;
        if (!f) return { ok: false, reason: "No form." };
        var partyBaseline = field === "supplier" ? supplierPartyBaseline(f.doc) : null;
        var supplierSnapshot = null;
        var paymentTermsSettle = null;
        var dueDateScheduleSync = null;
        var ret = f.set_value(field, value);
        if (ret && typeof ret.then === "function") await ret;
        await afterAjaxQuiet();
        if (field === "payment_terms_template" || field === "bill_date") {
          paymentTermsSettle = await settlePaymentTermsAfterHeaderChange(f, field);
        } else if (field === "due_date") {
          dueDateScheduleSync = syncScheduleFromHeaderDueDate(f, value);
        }
        if (field === "supplier") {
          try {
            f.refresh_fields([
              "address_display",
              "shipping_address_display",
              "billing_address_display",
              "dispatch_address_display",
              "supplier_name",
              "customer_name",
              "supplier_address",
              "shipping_address",
              "billing_address",
              "dispatch_address",
              "customer",
              "payment_terms_template",
              "terms",
              "due_date",
              "is_paid",
              "mode_of_payment",
              "cash_bank_account",
              "paid_amount",
            ]);
          } catch (eRf) {
            try {
              f.refresh_field("address_display");
            } catch (eRf2) {}
          }
          supplierSnapshot = await waitForSupplierBillingSnapshot(
            f,
            value,
            partyBaseline,
            SUPPLIER_PARTY_SETTLE_MAX_MS,
          );
          paymentTermsSettle = await maybeSettlePaymentTermsIfNeeded(f, "supplier", partyBaseline);
        } else {
          try {
            f.refresh_fields([
              "address_display",
              "shipping_address_display",
              "billing_address_display",
              "dispatch_address_display",
              "supplier_name",
              "customer_name",
              "supplier_address",
              "shipping_address",
              "billing_address",
              "dispatch_address",
              "customer",
              "payment_terms_template",
              "terms",
              "due_date",
              "is_paid",
              "mode_of_payment",
              "cash_bank_account",
              "paid_amount",
            ]);
          } catch (e1) {
            try {
              f.refresh_field("address_display");
            } catch (e2) {}
          }
        }
        return {
          ok: true,
          doc: JSON.parse(JSON.stringify(f.doc)),
          supplierPicked: field === "supplier",
          supplierSnapshot: supplierSnapshot,
          paymentTermsSettle: paymentTermsSettle,
          dueDateScheduleSync: dueDateScheduleSync,
        };
      } catch (e) {
        return { ok: false, reason: String(e && e.message ? e.message : e) };
      }
    })();
  }

  function setRow(rowIndex, field, value) {
    return (async function () {
      try {
        var f = window.cur_frm;
        if (!f) return { ok: false, reason: "No form." };
        var row = (f.doc.items || [])[rowIndex];
        if (!row || !row.name || !row.doctype) {
          return { ok: false, reason: "Row missing — refresh and retry." };
        }
        await setValueAsync(row.doctype, row.name, field, value);

        // Lightweight fields: skip taxes/ajax-quiet chain (description edits were
        // blocking Save for many seconds via afterAjaxQuiet + calculate_taxes).
        var lightFields = {
          description: true,
          sales_order: true,
          project: true,
          delivered_by_supplier: true,
        };
        if (lightFields[field]) {
          try {
            f.refresh_field("items");
          } catch (eLight) {}
          return { ok: true, doc: JSON.parse(JSON.stringify(f.doc)) };
        }

        await afterAjaxQuiet();
        row = (f.doc.items || [])[rowIndex];

        if (field === "item_code" && row && value && rowNeedsEnrichment(row)) {
          // Second ajax wave (get_item_details) — wait for quiet, don't sleep.
          await afterAjaxQuiet();
          row = (f.doc.items || [])[rowIndex];
        }

        if (field === "item_code" && row && value && rowNeedsEnrichment(row)) {
          try {
            var iv = await frappe.db.get_value("Item", value, [
              "item_name",
              "description",
              "standard_rate",
              "last_purchase_rate",
            ]);
            var msg = iv && (iv.message || iv);
            if (msg) {
              if (!stripHtml(row.description)) {
                var desc = stripHtml(msg.description) || msg.item_name || value;
                await setValueAsync(row.doctype, row.name, "description", desc);
              }
              if (row.rate == null || Number(row.rate) === 0) {
                var rate = msg.last_purchase_rate || msg.standard_rate || 0;
                if (rate) await setValueAsync(row.doctype, row.name, "rate", rate);
              }
              await afterAjaxQuiet();
            }
          } catch (e3) {}
        }

        try {
          f.refresh_field("items");
        } catch (e4) {}
        await refreshTaxesAndTotals(f);
        await afterAjaxQuiet();
        return { ok: true, doc: JSON.parse(JSON.stringify(f.doc)) };
      } catch (e) {
        return { ok: false, reason: String(e && e.message ? e.message : e) };
      }
    })();
  }

  /**
   * Apply mapped PO/PR → Bill items. Preserves source descriptions after item scripts run
   * (custom PO text must win); fills Item master only when source description was empty.
   */
  function mergeFromMapped(src) {
    return (async function () {
      try {
        var f = window.cur_frm;
        if (!f) return { ok: false, reason: "No form." };
        if (!src || !src.items) return { ok: false, reason: "No items mapped from source." };
        var skip = [
          "name",
          "idx",
          "docstatus",
          "parent",
          "parentfield",
          "parenttype",
          "owner",
          "creation",
          "modified",
          "modified_by",
        ];
        var preserved = (src.items || []).map(function (it) {
          return {
            description: it && it.description != null ? String(it.description) : "",
            item_code: it && it.item_code ? String(it.item_code) : "",
          };
        });
        try {
          f.clear_table("items");
        } catch (e0) {}
        src.items.forEach(function (it) {
          var row = f.add_child("items");
          Object.keys(it).forEach(function (k) {
            if (skip.indexOf(k) < 0) row[k] = it[k];
          });
        });
        ["bill_no", "payment_terms_template"].forEach(function (fld) {
          if (src[fld]) f.doc[fld] = src[fld];
        });
        f.refresh_field("items");
        try {
          f.refresh_fields(["bill_no", "payment_terms_template", "due_date"]);
        } catch (e1) {}
        await afterAjaxQuiet();

        var paymentTermsSettle = null;
        if (f.doc.payment_terms_template) {
          paymentTermsSettle = await settlePaymentTermsAfterHeaderChange(
            f,
            "payment_terms_template",
          );
        } else if (src.due_date) {
          f.doc.due_date = src.due_date;
          try {
            f.refresh_field("due_date");
          } catch (eDue) {}
        }

        var items = f.doc.items || [];
        for (var i = 0; i < items.length; i++) {
          var row = items[i];
          if (!row || !row.name || !row.doctype) continue;
          var want = preserved[i] ? stripHtml(preserved[i].description) : "";
          var code = (preserved[i] && preserved[i].item_code) || row.item_code || "";
          if (want) {
            // Re-stamp PO/PR description after item_code client scripts may have wiped it.
            if (stripHtml(row.description) !== want) {
              await setValueAsync(row.doctype, row.name, "description", preserved[i].description);
            }
          } else if (code && !stripHtml(row.description)) {
            try {
              var iv = await frappe.db.get_value("Item", code, [
                "item_name",
                "description",
                "standard_rate",
                "last_purchase_rate",
              ]);
              var msg = iv && (iv.message || iv);
              if (msg) {
                var desc = stripHtml(msg.description) || msg.item_name || code;
                await setValueAsync(row.doctype, row.name, "description", desc);
                if (row.rate == null || Number(row.rate) === 0) {
                  var rate = msg.last_purchase_rate || msg.standard_rate || 0;
                  if (rate) await setValueAsync(row.doctype, row.name, "rate", rate);
                }
              }
            } catch (e2) {}
          }
        }
        await afterAjaxQuiet();
        try {
          f.refresh_field("items");
        } catch (e3) {}
        await refreshTaxesAndTotals(f);
        await afterAjaxQuiet();
        return {
          ok: true,
          doc: JSON.parse(JSON.stringify(f.doc)),
          paymentTermsSettle: paymentTermsSettle,
        };
      } catch (e) {
        return { ok: false, reason: String(e && e.message ? e.message : e) };
      }
    })();
  }

  /** OI-026 — zero every line qty (packing-slip hash workflow). */
  function zeroAllQty() {
    return (async function () {
      try {
        var f = window.cur_frm;
        if (!f) return { ok: false, reason: "No form." };
        var rows = f.doc.items || [];
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          if (!row || !row.name || !row.doctype) continue;
          if (Number(row.qty) === 0) continue;
          await setValueAsync(row.doctype, row.name, "qty", 0);
        }
        await afterAjaxQuiet();
        try {
          f.refresh_field("items");
        } catch (e1) {}
        await refreshTaxesAndTotals(f);
        await afterAjaxQuiet();
        return { ok: true, doc: JSON.parse(JSON.stringify(f.doc)) };
      } catch (e) {
        return { ok: false, reason: String(e && e.message ? e.message : e) };
      }
    })();
  }

  /**
   * Blank the sole remaining items row (× when n===1). Keeps the row for Vanilla mandatory items.
   * @param {number} rowIndex
   * @param {Array<{ field: string, value: string|number }>} fields
   */
  function clearRow(rowIndex, fields) {
    return (async function () {
      try {
        var f = window.cur_frm;
        if (!f) return { ok: false, reason: "No form." };
        var row = (f.doc.items || [])[rowIndex];
        if (!row || !row.name || !row.doctype) {
          return { ok: false, reason: "Row missing — refresh and retry." };
        }
        var list = Array.isArray(fields) ? fields : [];
        for (var i = 0; i < list.length; i++) {
          var spec = list[i];
          if (!spec || !spec.field) continue;
          try {
            await setValueAsync(row.doctype, row.name, spec.field, spec.value);
          } catch (eField) {
            /* field may not exist on this child doctype */
          }
        }
        await afterAjaxQuiet();
        try {
          f.refresh_field("items");
        } catch (e1) {}
        await refreshTaxesAndTotals(f);
        await afterAjaxQuiet();
        return { ok: true, clearedLastRow: true, doc: JSON.parse(JSON.stringify(f.doc)) };
      } catch (e) {
        return { ok: false, reason: String(e && e.message ? e.message : e) };
      }
    })();
  }

  var TAX_EDIT_FIELDS = {
    account_head: true,
    description: true,
    rate: true,
    tax_amount: true,
    add_deduct_tax: true,
  };

  function setTaxRow(rowIndex, field, value) {
    return (async function () {
      try {
        var f = window.cur_frm;
        if (!f) return { ok: false, reason: "No form." };
        if (!TAX_EDIT_FIELDS[field]) {
          return { ok: false, reason: "Tax field not editable: " + field };
        }
        var row = (f.doc.taxes || [])[rowIndex];
        if (!row || !row.name || !row.doctype) {
          return { ok: false, reason: "Tax row missing — refresh and retry." };
        }
        if (field === "tax_amount" && row.charge_type !== "Actual") {
          await setValueAsync(row.doctype, row.name, "charge_type", "Actual");
          row.charge_type = "Actual";
          await afterAjaxQuiet();
        }
        await setValueAsync(row.doctype, row.name, field, value);
        await afterAjaxQuiet();
        await refreshTaxesAndTotals(f);
        await afterAjaxQuiet();
        return { ok: true, doc: JSON.parse(JSON.stringify(f.doc)) };
      } catch (e) {
        return { ok: false, reason: String(e && e.message ? e.message : e) };
      }
    })();
  }

  /** Thin cut: add Actual tax/charge row (account + amount). Optional addDeduct: Add|Deduct. */
  function addTaxRow(accountHead, taxAmount, description, addDeduct) {
    return (async function () {
      try {
        var f = window.cur_frm;
        if (!f) return { ok: false, reason: "No form." };
        var acct = accountHead != null ? String(accountHead).trim() : "";
        if (!acct) return { ok: false, reason: "Account required." };
        var amt = Number(taxAmount);
        if (!Number.isFinite(amt)) return { ok: false, reason: "Tax amount required." };
        var addOrDeduct = addDeduct === "Deduct" ? "Deduct" : "Add";
        var row = f.add_child("taxes");
        row.charge_type = "Actual";
        row.account_head = acct;
        row.description = description != null && String(description).trim()
          ? String(description).trim()
          : acct;
        row.tax_amount = amt;
        row.add_deduct_tax = addOrDeduct;
        row.category = "Total";
        f.refresh_field("taxes");
        // Drive ERP scripts via set_value so base_tax_amount / totals update.
        if (row.name && row.doctype) {
          await setValueAsync(row.doctype, row.name, "add_deduct_tax", addOrDeduct);
          await setValueAsync(row.doctype, row.name, "tax_amount", amt);
        }
        await afterAjaxQuiet();
        await refreshTaxesAndTotals(f);
        await afterAjaxQuiet();
        return { ok: true, doc: JSON.parse(JSON.stringify(f.doc)) };
      } catch (e) {
        return { ok: false, reason: String(e && e.message ? e.message : e) };
      }
    })();
  }

  function deleteTaxRow(rowIndex) {
    return (async function () {
      try {
        var f = window.cur_frm;
        if (!f) return { ok: false, reason: "No form." };
        var row = (f.doc.taxes || [])[rowIndex];
        if (!row) return { ok: false, reason: "Tax row not found." };
        var grid = f.get_field("taxes") && f.get_field("taxes").grid;
        if (grid && row.name && grid.grid_rows_by_docname && grid.grid_rows_by_docname[row.name]) {
          grid.grid_rows_by_docname[row.name].remove();
        } else if (grid && grid.delete_row) {
          grid.delete_row(rowIndex);
        } else {
          (f.doc.taxes || []).splice(rowIndex, 1);
          f.refresh_field("taxes");
        }
        await afterAjaxQuiet();
        await refreshTaxesAndTotals(f);
        await afterAjaxQuiet();
        return { ok: true, doc: JSON.parse(JSON.stringify(f.doc)) };
      } catch (e) {
        return { ok: false, reason: String(e && e.message ? e.message : e) };
      }
    })();
  }

  installSaveWatch();

  async function fetchPoLineMeta(poDetails, prDetails, poNames) {
    try {
      if (!window.frappe || !frappe.db || !frappe.db.get_list) {
        return { ok: false, reason: "frappe not ready", poItems: [], poHeaders: [], prItems: [] };
      }
      var poItems = poDetails && poDetails.length
        ? await frappe.db.get_list("Purchase Order Item", {
            filters: [["name", "in", poDetails]],
            fields: ["name", "idx", "sales_order", "customer", "parent", "qty", "rate", "amount", "billed_amt"],
            limit: poDetails.length,
          })
        : [];
      var prItems = prDetails && prDetails.length
        ? await frappe.db.get_list("Purchase Receipt Item", {
            filters: [["name", "in", prDetails]],
            fields: ["name", "idx", "parent", "qty", "rate", "amount", "billed_amt"],
            limit: prDetails.length,
          })
        : [];
      var poHeaders = poNames && poNames.length
        ? await frappe.db.get_list("Purchase Order", {
            filters: [["name", "in", poNames]],
            fields: ["name", "customer", "customer_name"],
            limit: poNames.length,
          })
        : [];
      return { ok: true, poItems: poItems || [], poHeaders: poHeaders || [], prItems: prItems || [] };
    } catch (e) {
      return {
        ok: false,
        reason: String(e && e.message ? e.message : e),
        poItems: [],
        poHeaders: [],
        prItems: [],
      };
    }
  }

  window.__docFormBridge = {
    version: VERSION,
    waitForForm: waitForForm,
    snapshot: snapshot,
    setHeader: setHeader,
    setRow: setRow,
    mergeFromMapped: mergeFromMapped,
    zeroAllQty: zeroAllQty,
    clearRow: clearRow,
    setTaxRow: setTaxRow,
    addTaxRow: addTaxRow,
    deleteTaxRow: deleteTaxRow,
    afterAjaxQuiet: afterAjaxQuiet,
    fetchPoLineMeta: fetchPoLineMeta,
    listMandatoryMissing: listMandatoryMissing,
    saveDoc: saveDoc,
    takeLastSavedDoc: takeLastSavedDoc,
    peekShelveDoc: peekShelveDoc,
  };
})();
