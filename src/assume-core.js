/**
 * Second Skin — pure assumption logic (no DOM, no Frappe, no side effects).
 * This is the ESM port of the museum's assume-core.js (UMD, same contract).
 * Profile shape: { doctype, fields: { <fieldname>: { value, placement, valueSource, expr } }, presets: [] }
 *
 * Placements: "vanilla" = not an assumption. "L1" = pre-fill+detab. "L2" = quiet+locked. "L3" = hidden.
 * Value sources: "literal" typed text, "link" validated pick, "expr" date preset.
 */

/** @typedef {"vanilla"|"L1"|"L2"|"L3"} Placement */
/** @typedef {"literal"|"link"|"expr"} ValueSource */
/** @typedef {{ base: "today"|"som"|"eom", offset: number }} DateExpr */
/** @typedef {{ value: any, placement: Placement, valueSource: ValueSource, expr: DateExpr|null }} FieldAssumption */
/** @typedef {{ doctype: string|null, fields: Record<string, FieldAssumption>, presets: DateExpr[] }} Profile */

export const PLACEMENTS = /** @type {Placement[]} */ (["vanilla", "L1", "L2", "L3"]);
export const DEFAULT_PLACEMENT = /** @type {Placement} */ ("L2");
export const VALUE_SOURCES = /** @type {ValueSource[]} */ (["literal", "link", "expr"]);
export const DATE_BASES = /** @type {const} */ (["today", "som", "eom"]);

/** @param {string} doctype */
export function lsKey(doctype) {
  return "secondskin:" + (doctype || "");
}

/** @param {any} e @returns {DateExpr|null} */
export function normExpr(e) {
  return e && DATE_BASES.includes(e.base)
    ? { base: e.base, offset: parseInt(e.offset, 10) || 0 }
    : null;
}

/**
 * @param {any} raw
 * @param {string} [doctype]
 * @returns {Profile}
 */
export function normalizeProfile(raw, doctype) {
  const p = raw && typeof raw === "object" ? raw : {};
  const src = p.fields && typeof p.fields === "object" ? p.fields : {};
  /** @type {Record<string, FieldAssumption>} */
  const fields = {};
  for (const fn of Object.keys(src)) {
    const e = src[fn] || {};
    const placement = PLACEMENTS.includes(e.placement) ? e.placement : DEFAULT_PLACEMENT;
    const valueSource = VALUE_SOURCES.includes(e.valueSource) ? e.valueSource : "literal";
    fields[fn] = {
      value: e.value === undefined ? null : e.value,
      placement,
      valueSource,
      expr: normExpr(e.expr),
    };
  }
  const presets = (Array.isArray(p.presets) ? p.presets : [])
    .map((x) => {
      const n = normExpr(x);
      if (!n) return null;
      return {
        id: x.id || `${x.base}_${parseInt(x.offset, 10) || 0}`,
        label: x.label || presetLabel(n),
        base: n.base,
        offset: n.offset,
      };
    })
    .filter(Boolean);
  return { doctype: doctype || p.doctype || null, fields, presets };
}

/** @param {Profile} profile @param {string} fieldname */
export function isAssumed(profile, fieldname) {
  return !!(
    profile &&
    profile.fields &&
    profile.fields[fieldname] &&
    profile.fields[fieldname].placement !== "vanilla"
  );
}

/** @param {Profile} profile @param {string} fieldname @returns {Placement} */
export function placementFor(profile, fieldname) {
  return isAssumed(profile, fieldname) ? profile.fields[fieldname].placement : "vanilla";
}

/** @param {Profile} profile @param {string} fieldname */
export function valueFor(profile, fieldname) {
  if (!profile || !profile.fields || !profile.fields[fieldname]) return null;
  const v = profile.fields[fieldname].value;
  return v === undefined ? null : v;
}

/** @param {Profile} profile @returns {string[]} */
export function assumedFields(profile) {
  if (!profile || !profile.fields) return [];
  return Object.keys(profile.fields).filter((fn) => placementFor(profile, fn) !== "vanilla");
}

/** Every assumed field is detabbed (pre-fill+skip is the minimum L1 behaviour). */
export function tabSkips(profile) {
  return assumedFields(profile);
}

// ---- date presets ----

export const BUILTIN_PRESETS = [
  { id: "today", label: "Today", base: "today", offset: 0 },
  { id: "yesterday", label: "Yesterday", base: "today", offset: -1 },
  { id: "tomorrow", label: "Tomorrow", base: "today", offset: 1 },
  { id: "plus7", label: "Today + 7 days", base: "today", offset: 7 },
  { id: "som", label: "Start of month", base: "som", offset: 0 },
  { id: "eom", label: "End of month", base: "eom", offset: 0 },
];

/** @param {number} n */
function pad2(n) {
  return (n < 10 ? "0" : "") + n;
}

/** @param {Date} d */
function fmtDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** @param {Date|string|null} [today] @returns {Date} */
function asDate(today) {
  if (today instanceof Date)
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (typeof today === "string" && today) {
    const s = today.split("-");
    return new Date(+s[0], (+s[1] || 1) - 1, +s[2] || 1);
  }
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

/**
 * @param {DateExpr|any} expr
 * @param {Date|string|null} [today]
 * @returns {string}
 */
export function resolveExpr(expr, today) {
  const e = normExpr(expr);
  if (!e) return "";
  let d = asDate(today);
  if (e.base === "som") d = new Date(d.getFullYear(), d.getMonth(), 1);
  else if (e.base === "eom") d = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  d.setDate(d.getDate() + e.offset);
  return fmtDate(d);
}

/** @param {DateExpr|any} expr @returns {string} */
export function presetLabel(expr) {
  const e = normExpr(expr);
  if (!e) return "";
  const base =
    e.base === "som" ? "Start of month" : e.base === "eom" ? "End of month" : "Today";
  if (e.offset === 0) return base;
  return `${base}${e.offset > 0 ? " + " : " − "}${Math.abs(e.offset)} day${Math.abs(e.offset) === 1 ? "" : "s"}`;
}

/**
 * @param {Profile} profile
 * @param {"today"|"som"|"eom"} base
 * @param {number} offset
 * @returns {Profile}
 */
export function addPreset(profile, base, offset) {
  const p = normalizeProfile(profile, profile && profile.doctype);
  const e = normExpr({ base, offset });
  if (!e) return p;
  const id = `${e.base}_${e.offset}`;
  if (!p.presets.some((x) => x.id === id))
    p.presets.push({ id, label: presetLabel(e), base: e.base, offset: e.offset });
  return p;
}

/** @param {FieldAssumption|null|undefined} field */
export function isEffectivelyEmpty(field) {
  if (!field) return true;
  if (field.valueSource === "expr") return !normExpr(field.expr);
  const v = field.value;
  return v === null || v === "" || v === undefined;
}

/**
 * Resolve what value to write onto the live form.
 * Sticky rule: date exprs resolve only on new docs so a saved draft never drifts.
 * @param {FieldAssumption|null|undefined} field
 * @param {{ isNew?: boolean, today?: Date|string|null }} [opts]
 * @returns {{ apply: boolean, value: any }}
 */
export function resolveFieldValue(field, opts = {}) {
  if (field && field.valueSource === "expr") {
    if (!opts.isNew) return { apply: false, value: null };
    return { apply: true, value: resolveExpr(field.expr, opts.today) };
  }
  return { apply: true, value: field && field.value !== undefined ? field.value : null };
}

/**
 * Reqd-safety: a mandatory field assumed with no value would block save if we lock/hide it.
 * @param {Profile} profile
 * @param {Array<{ fieldname: string, reqd?: boolean|number }>} metaFields
 * @returns {{ ok: boolean, problems: Array<{ field: string, reason: string }> }}
 */
export function checkProfile(profile, metaFields) {
  /** @type {Record<string, any>} */
  const byName = {};
  for (const f of metaFields || []) {
    if (f && f.fieldname) byName[f.fieldname] = f;
  }
  const problems = [];
  for (const fn of assumedFields(profile)) {
    const meta = byName[fn];
    const reqd = meta && (meta.reqd === 1 || meta.reqd === true);
    if (reqd && isEffectivelyEmpty(profile.fields[fn]))
      problems.push({ field: fn, reason: "mandatory field assumed with no value — would block save" });
  }
  return { ok: problems.length === 0, problems };
}

/**
 * Immutable update of one field's assumption.
 * @param {Profile} profile
 * @param {string} fieldname
 * @param {Partial<FieldAssumption>} patch
 * @returns {Profile}
 */
export function setAssumption(profile, fieldname, patch) {
  const p = normalizeProfile(profile, profile && profile.doctype);
  const cur = p.fields[fieldname] || {
    value: null,
    placement: DEFAULT_PLACEMENT,
    valueSource: "literal",
    expr: null,
  };
  if (patch && "placement" in patch && PLACEMENTS.includes(patch.placement)) cur.placement = patch.placement;
  if (patch && "value" in patch) cur.value = patch.value;
  if (patch && "valueSource" in patch && VALUE_SOURCES.includes(patch.valueSource)) cur.valueSource = patch.valueSource;
  if (patch && "expr" in patch) cur.expr = normExpr(patch.expr);
  p.fields[fieldname] = cur;
  return p;
}
