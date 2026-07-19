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
  var VERSION = 5;
  if (window.__docFormBridge && window.__docFormBridge.version >= VERSION) return;

  function stripHtml(s) {
    return String(s || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
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
  function refreshTaxesAndTotals(f) {
    try {
      f.refresh_field("items");
    } catch (eItems) {}
    try {
      f.refresh_field("taxes");
    } catch (e0) {}
    try {
      if (f.cscript && typeof f.cscript.calculate_taxes_and_totals === "function") {
        f.cscript.calculate_taxes_and_totals();
      } else if (typeof f.calculate_taxes_and_totals === "function") {
        f.calculate_taxes_and_totals();
      }
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

  function setHeader(field, value) {
    return (async function () {
      try {
        var f = window.cur_frm;
        if (!f) return { ok: false, reason: "No form." };
        var ret = f.set_value(field, value);
        if (ret && typeof ret.then === "function") await ret;
        await afterAjaxQuiet();
        try {
          f.refresh_fields([
            "address_display",
            "supplier_name",
            "supplier_address",
            "payment_terms_template",
            "due_date",
          ]);
        } catch (e1) {
          try {
            f.refresh_field("address_display");
          } catch (e2) {}
        }
        return {
          ok: true,
          doc: JSON.parse(JSON.stringify(f.doc)),
          supplierPicked: field === "supplier",
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
        refreshTaxesAndTotals(f);
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
        ["bill_no", "payment_terms_template", "due_date"].forEach(function (fld) {
          if (src[fld]) f.doc[fld] = src[fld];
        });
        f.refresh_field("items");
        try {
          f.refresh_fields(["bill_no", "payment_terms_template", "due_date"]);
        } catch (e1) {}
        await afterAjaxQuiet();

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
        refreshTaxesAndTotals(f);
        await afterAjaxQuiet();
        return { ok: true, doc: JSON.parse(JSON.stringify(f.doc)) };
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
        refreshTaxesAndTotals(f);
        await afterAjaxQuiet();
        return { ok: true, doc: JSON.parse(JSON.stringify(f.doc)) };
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
        await setValueAsync(row.doctype, row.name, field, value);
        await afterAjaxQuiet();
        refreshTaxesAndTotals(f);
        await afterAjaxQuiet();
        return { ok: true, doc: JSON.parse(JSON.stringify(f.doc)) };
      } catch (e) {
        return { ok: false, reason: String(e && e.message ? e.message : e) };
      }
    })();
  }

  /** Thin cut: add Actual tax/charge row (account + amount). */
  function addTaxRow(accountHead, taxAmount, description) {
    return (async function () {
      try {
        var f = window.cur_frm;
        if (!f) return { ok: false, reason: "No form." };
        var acct = accountHead != null ? String(accountHead).trim() : "";
        if (!acct) return { ok: false, reason: "Account required." };
        var amt = Number(taxAmount);
        if (!Number.isFinite(amt)) return { ok: false, reason: "Tax amount required." };
        var row = f.add_child("taxes");
        row.charge_type = "Actual";
        row.account_head = acct;
        row.description = description != null && String(description).trim()
          ? String(description).trim()
          : acct;
        row.tax_amount = amt;
        row.add_deduct_tax = "Add";
        row.category = "Total";
        f.refresh_field("taxes");
        await afterAjaxQuiet();
        refreshTaxesAndTotals(f);
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
        refreshTaxesAndTotals(f);
        await afterAjaxQuiet();
        return { ok: true, doc: JSON.parse(JSON.stringify(f.doc)) };
      } catch (e) {
        return { ok: false, reason: String(e && e.message ? e.message : e) };
      }
    })();
  }

  window.__docFormBridge = {
    version: VERSION,
    waitForForm: waitForForm,
    snapshot: snapshot,
    setHeader: setHeader,
    setRow: setRow,
    mergeFromMapped: mergeFromMapped,
    zeroAllQty: zeroAllQty,
    setTaxRow: setTaxRow,
    addTaxRow: addTaxRow,
    deleteTaxRow: deleteTaxRow,
    afterAjaxQuiet: afterAjaxQuiet,
  };
})();
