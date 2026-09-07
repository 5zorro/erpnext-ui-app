/**
 * Doc skin index — SSoT for which contexts have a Doc skin (5zorro 2026-07-18).
 *
 * Architecture (anti-rot):
 * - One table (`DOC_SKIN_INDEX`) owns match rules + readiness.
 * - Toolbar shows Doc tab only when `hasDocSkin(ctx)` (match AND `ready: true`).
 * - Unmapped or not-ready pages → no tab (never a misleading Home redirect).
 * - Units: route→visibility matrix in tests/lens-context.test.js.
 * - E2e (later): assert `__erpE2e.docSkinAvailable` after real Desk navigations.
 *
 * Examples when ready:
 *   desk / workflow home → Doc Workflow Home
 *   purchase-invoice form → Bill entry
 *   purchase-order form → Purchase Order entry
 *   purchase-receipt form → Item Receipt entry
 *   most other pages → none
 */

import { normalizeDoctypeKey } from "./lens-prefs.js";
import { SEED_PROFILES } from "./simplified-seed-profiles.js";
import { isNewDocRecord } from "./route-info.js";

/**
 * Doctypes the Simplified lens is actually ready for — derived from the shipped seed
 * profiles so the toolbar cannot advertise a lens that has nothing configured behind it.
 * Adding a doctype to SEED_PROFILES lights up its tab; there is no second list to forget.
 * @type {Set<string>}
 */
export const SIMPLIFIED_DOCTYPES = new Set(
  Object.keys(SEED_PROFILES).map((dt) => normalizeDoctypeKey(dt)),
);

/**
 * Simplified needs a concrete form: it applies field assumptions to an open document,
 * so a list, dashboard or Desk page has nothing for it to act on.
 * @param {string|null|undefined} doctype
 * @param {string|null|undefined} record
 * @returns {boolean}
 */
export function hasSimplifiedLens(doctype, record) {
  const key = normalizeDoctypeKey(doctype);
  if (!key || !record) return false;
  return SIMPLIFIED_DOCTYPES.has(key);
}

/**
 * @typedef {{ kind: "workflow-home" }} DocSkinHomeTarget
 * @typedef {{ kind: "doc-form", doctype: string, record: string, route: string, layoutKey: string }} DocSkinFormTarget
 * @typedef {{ kind: "pay-outstanding" }} DocSkinPayOutstandingTarget
 * @typedef {{ kind: "payment-doc", doctype: string, record: string, route: string }} DocSkinPaymentDocTarget
 * @typedef {DocSkinHomeTarget | DocSkinFormTarget | DocSkinPayOutstandingTarget | DocSkinPaymentDocTarget} DocSkinTarget
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   match: { surfaces?: string[], doctypes?: string[], needsRecord?: boolean },
 *   layoutKey?: string,
 *   ready: boolean
 * }} DocSkinIndexEntry
 */

/**
 * Add a row when a Doc skin ships; set `ready: true` only when the target UI exists.
 * Planned rows (`ready: false`) keep the map honest without showing a broken tab.
 *
 * @type {DocSkinIndexEntry[]}
 */
export const DOC_SKIN_INDEX = [
  {
    id: "workflow-home",
    label: "Doc Workflow Home",
    match: { surfaces: ["workflow-home", "erp-desk-home"] },
    ready: true,
  },
  {
    id: "bill",
    label: "Bill entry",
    match: { doctypes: ["purchase-invoice"], needsRecord: true },
    layoutKey: "bill",
    ready: true,
  },
  {
    id: "po",
    label: "Purchase Order entry",
    match: { doctypes: ["purchase-order"], needsRecord: true },
    layoutKey: "purchase-order",
    ready: true,
  },
  {
    id: "receipt",
    label: "Item Receipt entry",
    match: { doctypes: ["purchase-receipt"], needsRecord: true },
    layoutKey: "item-receipt",
    ready: true,
  },
  {
    id: "payment-entry",
    label: "Payment entry",
    // Not a doc-form.html layout -- resolveDocSkinTarget special-cases this id below, routing
    // to pay-outstanding.html (isNew: nothing chosen yet, the decision surface) or
    // payment-doc.html (an existing document: the check itself). See Packet 4b step 5.
    match: { doctypes: ["payment-entry"], needsRecord: true },
    ready: true,
  },
];

/** Doctypes that will have a Doc form (ready or planned). */
export const DOC_FORM_DOCTYPES = new Set(
  DOC_SKIN_INDEX.flatMap((e) => e.match.doctypes || []),
);

/**
 * @typedef {"workflow-home"|"erp-desk-home"|"doc-form"|"erp-form"|"other"} ShellSurface
 */

/**
 * @param {{
 *   showingHome?: boolean,
 *   lens?: string,
 *   route?: string,
 *   doctype?: string,
 *   record?: string
 * }} ctx
 * @returns {ShellSurface}
 */
export function classifySurface(ctx = {}) {
  if (ctx.showingHome) return "workflow-home";
  const dt = normalizeDoctypeKey(ctx.doctype) || doctypeFromRoute(ctx.route);
  const rec = ctx.record != null ? String(ctx.record) : recordFromRoute(ctx.route);
  const onDeskHome =
    !dt ||
    ctx.route === "/desk" ||
    ctx.route === "/desk/" ||
    ctx.route === "/app" ||
    ctx.route === "/app/" ||
    (typeof ctx.route === "string" && /^\/(desk|app)\/?(\?|$)/.test(ctx.route));
  if (onDeskHome && !rec) return "erp-desk-home";
  if (dt && DOC_FORM_DOCTYPES.has(dt) && rec) {
    return ctx.lens === "doc" ? "doc-form" : "erp-form";
  }
  return "other";
}

/**
 * First matching index entry (ignores ready). Null if no Doc skin is planned for this page.
 * @param {Parameters<typeof classifySurface>[0]} ctx
 * @param {DocSkinIndexEntry[]} [index=DOC_SKIN_INDEX]
 * @returns {DocSkinIndexEntry|null}
 */
export function lookupDocSkin(ctx = {}, index = DOC_SKIN_INDEX) {
  const surface = classifySurface(ctx);
  const dt = normalizeDoctypeKey(ctx.doctype) || doctypeFromRoute(ctx.route);
  const rec = ctx.record != null && ctx.record !== "" ? String(ctx.record) : recordFromRoute(ctx.route);

  for (const entry of index) {
    const m = entry.match || {};
    if (m.surfaces && m.surfaces.includes(surface)) return entry;
    if (m.doctypes && m.doctypes.includes(dt)) {
      if (m.needsRecord && !rec) continue;
      return entry;
    }
  }
  return null;
}

/**
 * Payment Entry's `/new` route carries no `payment_type`, so which direction (AP "Pay" vs AR
 * "Receive") is ambiguous from the route alone -- resolved by payment-direction-prefs.js and
 * passed in as `ctx.paymentDirection`. AR has no Doc skin yet, so "Receive" stays in Vanilla
 * (no tab) rather than showing an AP check. Existing records are unaffected: the real
 * `payment_type` is truth there, not this pref (see payment-doc.html, which reads the actual
 * document after opening).
 * @param {DocSkinIndexEntry} entry
 * @param {boolean} isNew
 * @param {Parameters<typeof classifySurface>[0]} ctx
 */
function isSuppressedPaymentEntryReceive(entry, isNew, ctx) {
  return entry.id === "payment-entry" && isNew && ctx.paymentDirection === "Receive";
}

/**
 * Show the Doc toolbar tab only when indexed AND ready.
 * @param {Parameters<typeof classifySurface>[0] & { paymentDirection?: string }} ctx
 */
export function hasDocSkin(ctx = {}) {
  const entry = lookupDocSkin(ctx);
  if (!entry || !entry.ready) return false;
  if (entry.id === "payment-entry") {
    const rec = ctx.record != null && ctx.record !== "" ? String(ctx.record) : recordFromRoute(ctx.route);
    if (isSuppressedPaymentEntryReceive(entry, isNewDocRecord(rec), ctx)) return false;
  }
  return true;
}

/**
 * @param {string} dt
 * @param {string} rec
 * @param {Parameters<typeof classifySurface>[0]} ctx
 */
function deriveDocFormRoute(dt, rec, ctx) {
  return typeof ctx.route === "string" && (ctx.route.includes(dt) || ctx.route.includes("/app/") || ctx.route.includes("/desk/"))
    ? ctx.route.split(/[?#]/)[0]
    : `/app/${dt}/${rec}`;
}

/**
 * Resolve Doc-skin navigation target, or null if tab should be hidden.
 * @param {Parameters<typeof classifySurface>[0] & { paymentDirection?: string }} ctx
 * @returns {DocSkinTarget|null}
 */
export function resolveDocSkinTarget(ctx = {}) {
  const entry = lookupDocSkin(ctx);
  if (!entry || !entry.ready) return null;

  if (entry.match.surfaces) {
    return { kind: "workflow-home" };
  }

  const dt = normalizeDoctypeKey(ctx.doctype) || doctypeFromRoute(ctx.route);
  const rec = ctx.record != null && ctx.record !== "" ? String(ctx.record) : recordFromRoute(ctx.route);

  if (entry.id === "payment-entry") {
    const isNew = isNewDocRecord(rec);
    if (isSuppressedPaymentEntryReceive(entry, isNew, ctx)) return null;
    if (isNew) return { kind: "pay-outstanding" };
    return { kind: "payment-doc", doctype: dt, record: rec, route: deriveDocFormRoute(dt, rec, ctx) };
  }

  const route = deriveDocFormRoute(dt, rec, ctx);
  return {
    kind: "doc-form",
    doctype: dt,
    record: rec,
    route,
    layoutKey: entry.layoutKey || entry.id,
  };
}

/**
 * @param {string|null|undefined} route
 */
export function doctypeFromRoute(route) {
  if (typeof route !== "string") return "";
  const p = route.split(/[?#]/)[0].split("/").filter(Boolean);
  let i = p.indexOf("desk");
  if (i < 0) i = p.indexOf("app");
  return i >= 0 && p[i + 1] ? p[i + 1] : "";
}

/**
 * @param {string|null|undefined} route
 */
export function recordFromRoute(route) {
  if (typeof route !== "string") return "";
  const p = route.split(/[?#]/)[0].split("/").filter(Boolean);
  let i = p.indexOf("desk");
  if (i < 0) i = p.indexOf("app");
  return i >= 0 && p[i + 2] ? p[i + 2] : "";
}

/**
 * Fixture matrix for anti-rot tests / future e2e.
 * @returns {Array<{ name: string, ctx: object, expectTab: boolean, expectKind: string|null }>}
 */
export function docSkinRouteMatrix() {
  return [
    { name: "workflow home", ctx: { showingHome: true }, expectTab: true, expectKind: "workflow-home" },
    { name: "desk root", ctx: { showingHome: false, route: "/desk" }, expectTab: true, expectKind: "workflow-home" },
    { name: "app root", ctx: { showingHome: false, route: "/app" }, expectTab: true, expectKind: "workflow-home" },
    {
      name: "Bill form (ready)",
      ctx: { showingHome: false, route: "/app/purchase-invoice/new" },
      expectTab: true,
      expectKind: "doc-form",
    },
    {
      name: "Bill list",
      ctx: { showingHome: false, route: "/app/purchase-invoice" },
      expectTab: false,
      expectKind: null,
    },
    {
      name: "PO form (ready)",
      ctx: { showingHome: false, route: "/app/purchase-order/new" },
      expectTab: true,
      expectKind: "doc-form",
    },
    {
      name: "PO list",
      ctx: { showingHome: false, route: "/app/purchase-order" },
      expectTab: false,
      expectKind: null,
    },
    {
      name: "Item Receipt form (ready)",
      ctx: { showingHome: false, route: "/app/purchase-receipt/new" },
      expectTab: true,
      expectKind: "doc-form",
    },
    {
      name: "Item Receipt list",
      ctx: { showingHome: false, route: "/app/purchase-receipt" },
      expectTab: false,
      expectKind: null,
    },
    {
      name: "Item",
      ctx: { showingHome: false, route: "/app/item" },
      expectTab: false,
      expectKind: null,
    },
    {
      name: "Customer form",
      ctx: { showingHome: false, route: "/desk/customer/CUST-1" },
      expectTab: false,
      expectKind: null,
    },
  ];
}
