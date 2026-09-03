/**
 * Builds the simplified-skin injection payload.
 * The returned string is a self-contained IIFE safe to run via webContents.executeJavaScript().
 * Contains: assume-core logic, assumption applier, assumptions bar UI, CSS injection,
 * Frappe form.refresh hook for re-render resilience, floating ⚙ Assumptions button.
 * Idempotent: no-ops if already installed at the same version.
 */

const VERSION = 1;

/** CSS for L1/L2/L3 field states + assumptions bar (assume.css production port). */
const SIMPLIFIED_CSS = `
/* == Simplified skin — injected by shell == */

/* L2 quiet & locked */
.ss-deemph .control-label,
.ss-deemph .control-value,
.ss-deemph .control-input-wrapper,
.ss-deemph input,
.ss-deemph .like-disabled-input { color: #aab1b8 !important; opacity: .6; }

/* L1 indicator: blue left-border on pre-filled skippable fields */
.ss-prefill { border-left: 3px solid #2490ef !important; }

/* Floating button to open assumptions bar */
#ss-aff {
  position: fixed; right: 18px; bottom: 18px; z-index: 100000;
  background: #2c3e50; color: #fff; border: none; border-radius: 20px;
  padding: 8px 16px; cursor: pointer; font: 12px system-ui,sans-serif;
  box-shadow: 0 3px 10px rgba(0,0,0,.3); opacity: .82;
  transition: opacity .15s, background .15s;
}
#ss-aff:hover { opacity: 1; background: #2ca01c; }

/* Assumptions bar modal */
#ss-back {
  position: fixed; inset: 0; z-index: 100100;
  background: rgba(0,0,0,.42); display: flex;
  align-items: center; justify-content: center;
}
#ss-box {
  background: #fff; width: 1000px; max-width: 96%;
  max-height: 86vh; display: flex; flex-direction: column;
  border-radius: 6px; box-shadow: 0 10px 44px rgba(0,0,0,.45);
  font: 13px system-ui,sans-serif; color: #393a3d;
}
.ss-title {
  padding: 10px 14px; font-weight: bold;
  background: #2c3e50; color: #fff; border-radius: 6px 6px 0 0;
  display: flex; align-items: center; justify-content: space-between;
}
.ss-title-close {
  background: none; border: none; color: #fff; font-size: 18px;
  cursor: pointer; padding: 0 4px; line-height: 1;
}
.ss-body { overflow-y: auto; overflow-x: hidden; padding: 6px 12px; flex: 1; min-width: 0; }
.ss-legend {
  font-size: 11px; color: #4b5563; background: #f3f6f9;
  border: 1px solid #e0e6ea; border-radius: 4px; padding: 8px 10px;
  margin: 4px 0 8px; line-height: 1.7;
}
.ss-legend span { margin-right: 8px; }
.ss-req { color: #c0392b; font-weight: bold; }
.ss-row {
  display: flex; align-items: center; flex-wrap: nowrap;
  gap: 8px; padding: 8px 0; border-bottom: 1px solid #eee; min-width: 0;
}
.ss-flabel {
  flex: 0 0 160px; cursor: pointer; font-weight: bold; color: #2c3e50;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ss-flabel:hover { color: #2ca01c; text-decoration: underline; }
.ss-veditor { flex: 1 1 0; min-width: 100px; display: flex; flex-direction: column; gap: 2px; overflow: hidden; }
.ss-val {
  width: 100%; border: 1px solid #c3c7cc; border-radius: 3px;
  padding: 3px 6px; font: 12px system-ui,sans-serif; box-sizing: border-box;
}
.ss-vsource { font-size: 10px; color: #7a8189; min-height: 12px; }
.ss-datewrap { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.ss-custom { display: inline-flex; gap: 4px; align-items: center; }
.ss-offset { width: 70px; border: 1px solid #c3c7cc; border-radius: 3px; padding: 2px 4px; }
/* Radios stay on one line; scroll horizontally inside the modal rather than wrapping */
.ss-radios {
  flex: 0 0 auto; display: flex; flex-wrap: nowrap; gap: 4px 12px;
  padding-left: 2px; overflow-x: auto; max-width: 380px;
}
.ss-radio {
  font-size: 11px; display: flex; align-items: center; gap: 3px;
  cursor: pointer; color: #2c3e50; white-space: nowrap; flex-shrink: 0;
}
.ss-radio.ss-off { color: #7a8189; }
.ss-foot {
  padding: 10px 14px; border-top: 1px solid #ddd;
  display: flex; gap: 8px; justify-content: flex-end;
}
.ss-btn {
  background: #2ca01c; color: #fff; border: none; border-radius: 4px;
  padding: 6px 14px; cursor: pointer; font: 13px system-ui,sans-serif;
}
.ss-btn:hover { filter: brightness(1.08); }
.ss-btn-sec { background: #4b5563; }
.ss-mini {
  font-size: 11px; padding: 2px 8px; border: 1px solid #2ca01c;
  background: #fff; color: #2ca01c; border-radius: 3px; cursor: pointer;
}
.ss-mini:hover { background: #2ca01c; color: #fff; }
.ss-problems {
  background: #fff3cd; border: 1px solid #f0d97a; border-radius: 4px;
  padding: 7px 10px; margin: 0 0 8px; font-size: 12px; color: #5a4b00;
}
.ss-empty { padding: 16px 4px; color: #777; font-style: italic; }
`;

/**
 * Core logic as an inline string (UMD-compatible, same as assume-core.js but in browser form).
 * Exposed as window.SecondSkinCore inside the injected IIFE scope.
 */
const CORE_INLINE = `
(function(root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.SecondSkinCore = factory();
})(typeof self !== "undefined" ? self : this, function() {
  "use strict";
  var PLACEMENTS = ["vanilla","L1","L2","L3"];
  var DEFAULT_PLACEMENT = "L2";
  var VALUE_SOURCES = ["literal","link","expr"];
  var DATE_BASES = ["today","som","eom"];
  function lsKey(dt) { return "secondskin:" + (dt||""); }
  function normExpr(e) { return (e && DATE_BASES.indexOf(e.base)>=0) ? { base:e.base, offset:parseInt(e.offset,10)||0 } : null; }
  function normalizeProfile(raw, doctype) {
    var p=(raw&&typeof raw==="object")?raw:{};
    var src=(p.fields&&typeof p.fields==="object")?p.fields:{};
    var fields={};
    Object.keys(src).forEach(function(fn){
      var e=src[fn]||{};
      var pl=PLACEMENTS.indexOf(e.placement)>=0?e.placement:DEFAULT_PLACEMENT;
      var vs=VALUE_SOURCES.indexOf(e.valueSource)>=0?e.valueSource:"literal";
      fields[fn]={value:e.value===undefined?null:e.value,placement:pl,valueSource:vs,expr:normExpr(e.expr)};
    });
    var presets=(Array.isArray(p.presets)?p.presets:[]).map(function(x){
      var n=normExpr(x); if(!n) return null;
      return {id:x.id||(x.base+"_"+(parseInt(x.offset,10)||0)),label:x.label||presetLabel(n),base:n.base,offset:n.offset};
    }).filter(Boolean);
    return {doctype:doctype||p.doctype||null,fields:fields,presets:presets};
  }
  function isAssumed(p,fn){ return !!(p&&p.fields&&p.fields[fn]&&p.fields[fn].placement!=="vanilla"); }
  function placementFor(p,fn){ return isAssumed(p,fn)?p.fields[fn].placement:"vanilla"; }
  function valueFor(p,fn){ if(!p||!p.fields||!p.fields[fn]) return null; var v=p.fields[fn].value; return v===undefined?null:v; }
  function assumedFields(p){ if(!p||!p.fields) return []; return Object.keys(p.fields).filter(function(fn){return placementFor(p,fn)!=="vanilla";}); }
  function tabSkips(p){ return assumedFields(p); }
  var BUILTIN_PRESETS=[
    {id:"today",label:"Today",base:"today",offset:0},
    {id:"yesterday",label:"Yesterday",base:"today",offset:-1},
    {id:"tomorrow",label:"Tomorrow",base:"today",offset:1},
    {id:"plus7",label:"Today + 7 days",base:"today",offset:7},
    {id:"som",label:"Start of month",base:"som",offset:0},
    {id:"eom",label:"End of month",base:"eom",offset:0}
  ];
  function pad2(n){return (n<10?"0":"")+n;}
  function fmtDate(d){return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate());}
  function asDate(t){
    if(t instanceof Date) return new Date(t.getFullYear(),t.getMonth(),t.getDate());
    if(typeof t==="string"&&t){var s=t.split("-");return new Date(+s[0],(+s[1]||1)-1,+s[2]||1);}
    var n=new Date();return new Date(n.getFullYear(),n.getMonth(),n.getDate());
  }
  function resolveExpr(e,today){
    var n=normExpr(e); if(!n) return "";
    var d=asDate(today);
    if(n.base==="som") d=new Date(d.getFullYear(),d.getMonth(),1);
    else if(n.base==="eom") d=new Date(d.getFullYear(),d.getMonth()+1,0);
    d.setDate(d.getDate()+n.offset);
    return fmtDate(d);
  }
  function presetLabel(e){
    var n=normExpr(e); if(!n) return "";
    var base=n.base==="som"?"Start of month":n.base==="eom"?"End of month":"Today";
    if(n.offset===0) return base;
    return base+(n.offset>0?" + ":" − ")+Math.abs(n.offset)+" day"+(Math.abs(n.offset)===1?"":"s");
  }
  function addPreset(p,base,offset){
    var r=normalizeProfile(p,p&&p.doctype);
    var e=normExpr({base:base,offset:offset}); if(!e) return r;
    var id=e.base+"_"+e.offset;
    if(!r.presets.some(function(x){return x.id===id;})) r.presets.push({id:id,label:presetLabel(e),base:e.base,offset:e.offset});
    return r;
  }
  function isEffectivelyEmpty(f){
    if(!f) return true;
    if(f.valueSource==="expr") return !normExpr(f.expr);
    var v=f.value; return (v===null||v===""||typeof v==="undefined");
  }
  function resolveFieldValue(f,opts){
    opts=opts||{};
    if(f&&f.valueSource==="expr"){if(!opts.isNew) return {apply:false,value:null}; return {apply:true,value:resolveExpr(f.expr,opts.today)};}
    return {apply:true,value:(f&&f.value!==undefined)?f.value:null};
  }
  function checkProfile(p,meta){
    var byName={},problems=[];
    (meta||[]).forEach(function(f){if(f&&f.fieldname) byName[f.fieldname]=f;});
    assumedFields(p).forEach(function(fn){
      var m=byName[fn],reqd=m&&(m.reqd===1||m.reqd===true);
      if(reqd&&isEffectivelyEmpty(p.fields[fn])) problems.push({field:fn,reason:"mandatory field assumed with no value — would block save"});
    });
    return {ok:problems.length===0,problems:problems};
  }
  function setAssumption(p,fn,patch){
    var r=normalizeProfile(p,p&&p.doctype);
    var cur=r.fields[fn]||{value:null,placement:DEFAULT_PLACEMENT,valueSource:"literal",expr:null};
    if(patch&&"placement" in patch&&PLACEMENTS.indexOf(patch.placement)>=0) cur.placement=patch.placement;
    if(patch&&"value" in patch) cur.value=patch.value;
    if(patch&&"valueSource" in patch&&VALUE_SOURCES.indexOf(patch.valueSource)>=0) cur.valueSource=patch.valueSource;
    if(patch&&"expr" in patch) cur.expr=normExpr(patch.expr);
    r.fields[fn]=cur;
    return r;
  }
  return {PLACEMENTS:PLACEMENTS,DEFAULT_PLACEMENT:DEFAULT_PLACEMENT,DATE_BASES:DATE_BASES,
    BUILTIN_PRESETS:BUILTIN_PRESETS,lsKey:lsKey,normalizeProfile:normalizeProfile,
    isAssumed:isAssumed,placementFor:placementFor,valueFor:valueFor,assumedFields:assumedFields,
    tabSkips:tabSkips,checkProfile:checkProfile,setAssumption:setAssumption,
    resolveExpr:resolveExpr,presetLabel:presetLabel,resolveFieldValue:resolveFieldValue,
    addPreset:addPreset,isEffectivelyEmpty:isEffectivelyEmpty};
});
`;

/**
 * Build the full injection payload string.
 * @returns {string} IIFE script safe for executeJavaScript
 */
export function buildSimplifiedPayload() {
  const version = VERSION;
  const css = SIMPLIFIED_CSS;
  const coreInline = CORE_INLINE;

  return `(function() {
  "use strict";

  var VERSION = ${version};

  /* Idempotent: skip if already installed at this version */
  if (window.__simplifiedSkin && window.__simplifiedSkin.version >= VERSION) return;

  /* ---- CSS injection ---- */
  (function() {
    var STYLE_ID = "ss-injected-css";
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = ${JSON.stringify(css)};
    (document.head || document.documentElement).appendChild(s);
  })();

  /* ---- Core logic ---- */
  ${coreInline}
  var core = window.SecondSkinCore;
  if (!core) { console.warn("[simplified-skin] core failed to load"); return; }

  /* ---- Persistence ---- */
  function load(doctype) {
    var raw = null;
    try { raw = JSON.parse(window.localStorage.getItem(core.lsKey(doctype)) || "null"); } catch(e) {}
    return core.normalizeProfile(raw, doctype);
  }
  function save(profile) {
    try { window.localStorage.setItem(core.lsKey(profile.doctype), JSON.stringify(profile)); }
    catch(e) { console.warn("[simplified-skin] save failed", e); }
  }

  /* ---- Skip types for the bar field list ---- */
  var SKIP_TYPES = {
    "Section Break":1,"Column Break":1,"Tab Break":1,"HTML":1,
    "Heading":1,"Button":1,"Table":1,"Table MultiSelect":1,"Fold":1,"Image":1
  };
  function entryFields(frm) {
    var fields = (frm && frm.meta && frm.meta.fields) ? frm.meta.fields : [];
    return fields.filter(function(f) { return f && f.fieldname && !SKIP_TYPES[f.fieldtype] && !f.hidden; });
  }

  /* ---- Visual helpers ---- */
  function deemph(frm, fn, on) {
    try {
      var fd = frm.fields_dict && frm.fields_dict[fn];
      var w = fd && (fd.$wrapper || (fd.wrapper && { toggleClass: function(c, v) { fd.wrapper.classList[v?"add":"remove"](c); } }));
      if (!w) return;
      if (w.toggleClass) w.toggleClass("ss-deemph", !!on);
    } catch(e) {}
  }
  function prefillMark(frm, fn, on) {
    try {
      var fd = frm.fields_dict && frm.fields_dict[fn];
      var el = fd && (fd.$wrapper && fd.$wrapper[0] || fd.wrapper);
      if (el) el.classList[on ? "add" : "remove"]("ss-prefill");
    } catch(e) {}
  }
  function detab(frm, fn, on) {
    try {
      var fd = frm.fields_dict && frm.fields_dict[fn];
      var el = fd && fd.$input && fd.$input.get ? fd.$input.get(0) : null;
      if (el) { if (on) el.setAttribute("tabindex", "-1"); else el.removeAttribute("tabindex"); }
    } catch(e) {}
  }

  /* ---- Applier ---- */
  function apply(frm) {
    if (!frm || !frm.doctype) return;
    var profile = load(frm.doctype);
    var check = core.checkProfile(profile, frm.meta ? frm.meta.fields : []);
    if (!check.ok && window.frappe && frappe.show_alert) {
      frappe.show_alert({
        message: "[Simplified] " + check.problems.length + " required field(s) assumed with no value — left editable.",
        indicator: "orange"
      });
    }
    var unsafe = {};
    check.problems.forEach(function(p) { unsafe[p.field] = 1; });
    var isNew = !!(frm.is_new && frm.is_new());
    var today = (window.frappe && frappe.datetime && frappe.datetime.get_today)
      ? frappe.datetime.get_today() : null;
    var wasClean = !(frm.is_dirty && frm.is_dirty());

    core.assumedFields(profile).forEach(function(fn) {
      var pl = core.placementFor(profile, fn);
      var rv = core.resolveFieldValue(profile.fields[fn], { isNew: isNew, today: today });
      var existing = frm.doc ? frm.doc[fn] : null;
      var blank = (existing === null || existing === undefined || existing === "");
      if (rv.apply && rv.value !== null && rv.value !== "" && (isNew || blank) && frm.set_value) {
        try { frm.set_value(fn, rv.value); } catch(e) {}
      }
      if (unsafe[fn]) return;
      try {
        if (pl === "L3") {
          frm.set_df_property(fn, "hidden", 1);
          return;
        }
        frm.set_df_property(fn, "read_only", 1);
        frm.set_df_property(fn, "description", "Set as a general assumption — change it in ⚙ Assumptions.");
        if (pl === "L2") deemph(frm, fn, true);
        if (pl === "L1") prefillMark(frm, fn, true);
        detab(frm, fn, true);
      } catch(e) {}
    });

    if (frm.refresh_fields) { try { frm.refresh_fields(); } catch(e) {} }
    /* Keep assumed-default forms clean (don't mark dirty just from applying defaults). */
    if (wasClean && frm.doc) {
      try { frm.doc.__unsaved = 0; if (frm.toolbar && frm.toolbar.refresh) frm.toolbar.refresh(); } catch(e) {}
    }
  }

  /* ---- Assumptions bar ---- */
  var PLACEMENT_UI = {
    vanilla: { label: "Normal", hint: "Off — field behaves exactly like vanilla." },
    L1: { label: "Pre-fill · skip Tab", hint: "Pre-filled; Tab skips it. Still looks and edits normally." },
    L2: { label: "Quiet & locked", hint: "Pre-filled, greyed, locked, and Tab-skipped. (Default)" },
    L3: { label: "Hidden", hint: "Pre-filled and hidden from the form entirely." }
  };

  function openBar(frm) {
    if (!frm) return;
    /* Remove previous bar if open */
    var prev = document.getElementById("ss-back");
    if (prev) prev.parentNode.removeChild(prev);

    var profile = load(frm.doctype);
    var back = document.createElement("div"); back.id = "ss-back";
    var box = document.createElement("div"); box.id = "ss-box";

    var ttl = document.createElement("div"); ttl.className = "ss-title";
    var ttlTxt = document.createElement("span");
    ttlTxt.textContent = "⚙ Assumptions — " + frm.doctype;
    var cls = document.createElement("button"); cls.className = "ss-title-close"; cls.textContent = "✕"; cls.title = "Close";
    cls.onclick = close;
    ttl.appendChild(ttlTxt); ttl.appendChild(cls);
    box.appendChild(ttl);

    var body = document.createElement("div"); body.className = "ss-body"; box.appendChild(body);

    var legend = document.createElement("div"); legend.className = "ss-legend";
    legend.innerHTML =
      "<b>Field settings:</b> " +
      "<span><b>Normal</b> = off (vanilla).</span>" +
      "<span><b>Pre-fill · skip Tab</b> = filled; Tab skips it; still editable.</span>" +
      "<span><b>Quiet &amp; locked</b> = filled, greyed, locked, Tab-skipped (default).</span>" +
      "<span><b>Hidden</b> = filled and removed from the form.</span>" +
      "<span><span class='ss-req'>*</span> = required by ERPNext — your assumption value must be valid.</span>";
    body.appendChild(legend);

    /* Problem banner */
    var check = core.checkProfile(profile, frm.meta ? frm.meta.fields : []);
    if (!check.ok) {
      var pb = document.createElement("div"); pb.className = "ss-problems";
      pb.innerHTML = "⚠ " + check.problems.length + " required field(s) assumed with no value — they're left editable until you supply a value.";
      body.appendChild(pb);
    }

    var fields = entryFields(frm);
    if (!fields.length) {
      var em = document.createElement("div"); em.className = "ss-empty";
      em.textContent = "No entry fields found for " + frm.doctype + ".";
      body.appendChild(em);
    }

    fields.forEach(function(f) {
      var fn = f.fieldname;
      var row = document.createElement("div"); row.className = "ss-row";

      var lbl = document.createElement("div"); lbl.className = "ss-flabel";
      lbl.textContent = f.label || fn;
      lbl.title = "Click to make this a 'Quiet & locked' assumption";
      if (f.reqd) {
        var rq = document.createElement("span"); rq.className = "ss-req"; rq.textContent = " *";
        rq.title = "Required by ERPNext — your value must be valid.";
        lbl.appendChild(rq);
      }
      lbl.onclick = function() { setPlacement("L2"); };
      row.appendChild(lbl);

      /* Value editor */
      var veditor = document.createElement("div"); veditor.className = "ss-veditor";
      var srcLbl = document.createElement("div"); srcLbl.className = "ss-vsource";
      var ft = f.fieldtype || "Data";
      var curField = profile.fields[fn] || {};
      function refreshSrcLbl() {
        var fld = profile.fields[fn] || {};
        if (fld.valueSource === "expr") srcLbl.textContent = "Date: " + (core.presetLabel(fld.expr) || "—");
        else if (fld.valueSource === "link") srcLbl.textContent = "From " + (f.options || "list");
        else srcLbl.textContent = (fld.value !== null && fld.value !== undefined && fld.value !== "") ? "Typed default" : "";
      }
      function textCtrl(srcType) {
        var ti = document.createElement("input"); ti.className = "ss-val"; ti.placeholder = "default value";
        ti.value = (curField.value === null || curField.value === undefined) ? "" : curField.value;
        ti.onchange = function() {
          profile = core.setAssumption(profile, fn, { value: ti.value, valueSource: srcType || "literal" });
          save(profile); refreshSrcLbl();
        };
        return ti;
      }
      function dateCtrl() {
        var d = document.createElement("div"); d.className = "ss-datewrap";
        var psel = document.createElement("select"); psel.className = "ss-val";
        var cwrap = document.createElement("span"); cwrap.className = "ss-custom"; cwrap.style.display = "none";
        var cbase = document.createElement("select");
        [["today","Today"],["som","Start of month"],["eom","End of month"]].forEach(function(b) {
          var o = document.createElement("option"); o.value = b[0]; o.textContent = b[1]; cbase.appendChild(o);
        });
        var coff = document.createElement("input"); coff.type = "number"; coff.className = "ss-offset"; coff.placeholder = "± days";
        var cadd = document.createElement("button"); cadd.type = "button"; cadd.className = "ss-mini"; cadd.textContent = "Save preset";
        cwrap.appendChild(cbase); cwrap.appendChild(coff); cwrap.appendChild(cadd);
        function rebuildSel() {
          psel.innerHTML = "";
          var none = document.createElement("option"); none.value = ""; none.textContent = "(no date preset)"; psel.appendChild(none);
          core.BUILTIN_PRESETS.concat(profile.presets || []).forEach(function(pre) {
            var o = document.createElement("option"); o.value = pre.base + ":" + pre.offset; o.textContent = pre.label; psel.appendChild(o);
          });
          var c = document.createElement("option"); c.value = "__custom"; c.textContent = "Custom date preset…"; psel.appendChild(c);
          var fld = profile.fields[fn] || {};
          if (fld.valueSource === "expr" && fld.expr) psel.value = fld.expr.base + ":" + fld.expr.offset;
        }
        rebuildSel();
        psel.onchange = function() {
          if (psel.value === "__custom") { cwrap.style.display = ""; return; }
          cwrap.style.display = "none";
          if (!psel.value) profile = core.setAssumption(profile, fn, { valueSource: "literal", value: null, expr: null });
          else {
            var pp = psel.value.split(":");
            profile = core.setAssumption(profile, fn, { valueSource: "expr", expr: { base: pp[0], offset: parseInt(pp[1], 10) || 0 } });
          }
          save(profile); refreshSrcLbl();
        };
        cadd.onclick = function() {
          var base = cbase.value, off = parseInt(coff.value, 10) || 0;
          profile = core.addPreset(profile, base, off);
          profile = core.setAssumption(profile, fn, { valueSource: "expr", expr: { base: base, offset: off } });
          save(profile); rebuildSel(); psel.value = base + ":" + off; cwrap.style.display = "none"; refreshSrcLbl();
        };
        d.appendChild(psel); d.appendChild(cwrap);
        return d;
      }
      var ctrl;
      if (ft === "Date" || ft === "Datetime") {
        ctrl = dateCtrl();
      } else if (ft === "Select") {
        var sel = document.createElement("select"); sel.className = "ss-val";
        var opts = ("" + (f.options || "")).split("\\n"); if (opts[0] !== "") opts.unshift("");
        opts.forEach(function(o) {
          var op = document.createElement("option"); op.value = o; op.textContent = o || "(none)";
          if (o === curField.value) op.selected = true; sel.appendChild(op);
        });
        sel.onchange = function() { profile = core.setAssumption(profile, fn, { value: sel.value, valueSource: "literal" }); save(profile); refreshSrcLbl(); };
        ctrl = sel;
      } else {
        ctrl = textCtrl("literal");
      }
      refreshSrcLbl();
      veditor.appendChild(ctrl); veditor.appendChild(srcLbl);
      row.appendChild(veditor);

      /* Placement radios */
      var radios = document.createElement("div"); radios.className = "ss-radios";
      core.PLACEMENTS.forEach(function(pl) {
        var ui = PLACEMENT_UI[pl] || { label: pl, hint: "" };
        var rl = document.createElement("label"); rl.className = "ss-radio" + (pl === "vanilla" ? " ss-off" : ""); rl.title = ui.hint;
        var ri = document.createElement("input"); ri.type = "radio"; ri.name = "ss_" + fn + "_" + Date.now(); ri.value = pl;
        if ((profile.fields[fn] && profile.fields[fn].placement === pl) || (!profile.fields[fn] && pl === "vanilla")) ri.checked = true;
        ri.onchange = function() { setPlacement(pl); };
        var rt = document.createElement("span"); rt.textContent = ui.label;
        rl.appendChild(ri); rl.appendChild(rt); radios.appendChild(rl);
      });
      row.appendChild(radios);
      body.appendChild(row);

      function setPlacement(pl) {
        profile = core.setAssumption(profile, fn, { placement: pl });
        save(profile);
        var sel = row.querySelector('input[value="' + pl + '"]'); if (sel) sel.checked = true;
      }
    });

    /* Footer */
    var foot = document.createElement("div"); foot.className = "ss-foot";
    var apBtn = document.createElement("button"); apBtn.className = "ss-btn"; apBtn.textContent = "Apply now";
    apBtn.onclick = function() { save(profile); apply(frm); close(); };
    var exBtn = document.createElement("button"); exBtn.className = "ss-btn ss-btn-sec"; exBtn.textContent = "Export";
    exBtn.onclick = function() {
      save(profile);
      try {
        var blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
        var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
        a.download = "simplified-" + String(frm.doctype).replace(/\\s+/g, "_") + ".json";
        a.click();
      } catch(e) { console.warn("[simplified-skin] export failed", e); }
    };
    var imBtn = document.createElement("button"); imBtn.className = "ss-btn ss-btn-sec"; imBtn.textContent = "Import";
    imBtn.onclick = function() {
      var inp = document.createElement("input"); inp.type = "file"; inp.accept = "application/json";
      inp.onchange = function() {
        var file = inp.files && inp.files[0]; if (!file) return;
        var r = new FileReader();
        r.onload = function() {
          try {
            var p = core.normalizeProfile(JSON.parse(r.result), frm.doctype);
            save(p); profile = p; close(); openBar(frm);
          } catch(e) { alert("Couldn't read that profile file."); }
        };
        r.readAsText(file);
      };
      inp.click();
    };
    var clBtn = document.createElement("button"); clBtn.className = "ss-btn ss-btn-sec"; clBtn.textContent = "Close";
    clBtn.onclick = close;
    foot.appendChild(apBtn); foot.appendChild(exBtn); foot.appendChild(imBtn); foot.appendChild(clBtn);
    box.appendChild(foot);
    back.appendChild(box); document.body.appendChild(back);
    back.addEventListener("mousedown", function(e) { if (e.target === back) close(); });

    function close() { var b = document.getElementById("ss-back"); if (b) b.parentNode.removeChild(b); }
  }

  /* ---- Floating button ---- */
  function installFloatingButton() {
    if (document.getElementById("ss-aff")) return;
    var btn = document.createElement("button");
    btn.id = "ss-aff"; btn.textContent = "⚙ Assumptions";
    btn.onclick = function() {
      var frm = window.cur_frm;
      if (!frm) { alert("[Simplified skin] No active form found."); return; }
      openBar(frm);
    };
    document.body.appendChild(btn);
  }

  /* ---- Frappe form lifecycle hook (re-render resilience) ---- */
  function hookFrappeRefresh() {
    try {
      if (
        typeof frappe === "undefined" ||
        !frappe.ui || !frappe.ui.form || !frappe.ui.form.Form ||
        !frappe.ui.form.Form.prototype
      ) return false;
      var proto = frappe.ui.form.Form.prototype;
      if (proto.__ssRefreshPatched) return true;
      var orig = proto.refresh;
      proto.refresh = function() {
        var result = orig.apply(this, arguments);
        /* Apply after Frappe finishes its own refresh. */
        try { apply(this); } catch(e) {}
        return result;
      };
      proto.__ssRefreshPatched = true;
      return true;
    } catch(e) { return false; }
  }

  /* Try to hook now; retry a few times if frappe isn't ready yet */
  function tryHook(attempts) {
    if (hookFrappeRefresh()) return;
    if (attempts > 0) setTimeout(function() { tryHook(attempts - 1); }, 500);
  }
  tryHook(6);

  /* Apply to current form immediately if one is open */
  setTimeout(function() {
    if (window.cur_frm) { try { apply(window.cur_frm); } catch(e) {} }
    installFloatingButton();
  }, 100);

  /* ---- Public API ---- */
  window.__simplifiedSkin = {
    version: VERSION,
    apply: apply,
    openBar: openBar,
    load: load,
    save: save,
  };

  console.log("[simplified-skin] installed v" + VERSION);
})();`;
}
