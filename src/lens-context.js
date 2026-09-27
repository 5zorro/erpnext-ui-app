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
 *   quotation / sales-order / sales-invoice form → Estimate / Sales Order / Invoice entry
 *   a new payment-entry, direction Receive → Receive Payment entry (a doc-form layout)
 *   a list with a find-skin-registry.js row → its Find page (Find Bills, …)
 *   most other pages → none
 */

import { normalizeDoctypeKey } from "./lens-prefs.js";
import { SEED_PROFILES } from "./simplified-seed-profiles.js";
import { isNewDocRecord, routeInfo } from "./route-info.js";
import { FIND_SKIN_DOCTYPES, findSkinTitle } from "./find-skin-registry.js";

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
 * @typedef {{ kind: "find-doc", doctype: string, route: string }} DocSkinFindTarget
 * @typedef {DocSkinHomeTarget | DocSkinFormTarget | DocSkinPayOutstandingTarget | DocSkinPaymentDocTarget | DocSkinFindTarget} DocSkinTarget
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   match: { surfaces?: string[], doctypes?: string[], needsRecord?: boolean, listOnly?: boolean },
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
  // A/R entry forms (plan 2026-09-26, stage A1) — doc-form.html layouts like PO and IR.
  {
    id: "estimate",
    label: "Estimate entry",
    match: { doctypes: ["quotation"], needsRecord: true },
    layoutKey: "estimate",
    ready: true,
  },
  {
    id: "sales-order",
    label: "Sales Order entry",
    match: { doctypes: ["sales-order"], needsRecord: true },
    layoutKey: "sales-order",
    ready: true,
  },
  {
    id: "invoice",
    label: "Invoice entry",
    match: { doctypes: ["sales-invoice"], needsRecord: true },
    layoutKey: "invoice",
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
  // Find pages (OI-056) — the list half of each transaction-entry form, one row per
  // find-skin-registry.js entry. `listOnly` rows match a list address and never a record, so
  // they sit after the form rows without shadowing them.
  ...FIND_SKIN_DOCTYPES.map((dt) => ({
    id: `find:${dt}`,
    label: findSkinTitle(dt),
    match: { doctypes: [dt], listOnly: true },
    ready: true,
  })),
];

/**
 * Doctypes that will have a Doc *form* (ready or planned). Find rows are left out on purpose:
 * main.js reads this set to decide whether opening a Vanilla record is a lens choice worth
 * remembering, and a Find page existing for Sales Orders says nothing about their form.
 */
export const DOC_FORM_DOCTYPES = new Set(
  DOC_SKIN_INDEX.filter((e) => !e.match.listOnly).flatMap((e) => e.match.doctypes || []),
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
      if (m.listOnly && rec) continue;
      return entry;
    }
  }
  return null;
}

/** doc-skin-registry.js layout key of the A/R Receive Payment form. */
export const RECEIVE_PAYMENT_LAYOUT_KEY = "receive-payment";

/**
 * Payment Entry's `/new` route carries no `payment_type`, so which direction (AP "Pay" vs AR
 * "Receive") is ambiguous from the route alone -- resolved by payment-direction-prefs.js and
 * passed in as `ctx.paymentDirection`. "Pay" opens the Pay Bills dashboard; "Receive" opens the
 * Receive Payment form (plan 2026-09-26, stage A1 — it used to stay in Vanilla with no tab).
 * Existing records are unaffected: the real `payment_type` is truth there, not this pref
 * (payment-doc.html reads the document and forwards a Receive to the Receive Payment form).
 * @param {boolean} isNew
 * @param {Parameters<typeof classifySurface>[0] & { paymentDirection?: string }} ctx
 */
function isNewPaymentEntryReceive(isNew, ctx) {
  return isNew && ctx.paymentDirection === "Receive";
}

/**
 * Show the Doc toolbar tab only when indexed AND ready.
 * @param {Parameters<typeof classifySurface>[0] & { paymentDirection?: string }} ctx
 */
export function hasDocSkin(ctx = {}) {
  const entry = lookupDocSkin(ctx);
  return !!(entry && entry.ready);
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
  if (entry.match.listOnly) {
    // Always the bare list address: Report / Kanban views of the same list share one Find
    // page and one Recent slot.
    return { kind: "find-doc", doctype: dt, route: `/app/${dt}` };
  }
  const rec = ctx.record != null && ctx.record !== "" ? String(ctx.record) : recordFromRoute(ctx.route);

  if (entry.id === "payment-entry") {
    const isNew = isNewDocRecord(rec);
    if (isNewPaymentEntryReceive(isNew, ctx)) {
      return {
        kind: "doc-form",
        doctype: dt,
        record: rec,
        route: PAYMENT_ENTRY_NEW_ROUTE,
        layoutKey: RECEIVE_PAYMENT_LAYOUT_KEY,
      };
    }
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
  return routeInfo(route).doctype;
}

/**
 * @param {string|null|undefined} route
 */
export function recordFromRoute(route) {
  if (typeof route !== "string") return "";
  // One parser (route-info.js): a second copy here kept reading `/view/report` as a record.
  return routeInfo(route).record;
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
      name: "Bill list → Find page",
      ctx: { showingHome: false, route: "/app/purchase-invoice" },
      expectTab: true,
      expectKind: "find-doc",
    },
    {
      name: "PO form (ready)",
      ctx: { showingHome: false, route: "/app/purchase-order/new" },
      expectTab: true,
      expectKind: "doc-form",
    },
    {
      name: "PO list → Find page",
      ctx: { showingHome: false, route: "/app/purchase-order" },
      expectTab: true,
      expectKind: "find-doc",
    },
    {
      name: "Item Receipt form (ready)",
      ctx: { showingHome: false, route: "/app/purchase-receipt/new" },
      expectTab: true,
      expectKind: "doc-form",
    },
    {
      name: "Item Receipt list → Find page",
      ctx: { showingHome: false, route: "/app/purchase-receipt" },
      expectTab: true,
      expectKind: "find-doc",
    },
    {
      name: "Bill Report view → Find page, not a Bill named 'view'",
      ctx: { showingHome: false, route: "/app/purchase-invoice/view/report" },
      expectTab: true,
      expectKind: "find-doc",
    },
    {
      name: "Sales Order list → Find page",
      ctx: { showingHome: false, route: "/app/sales-order" },
      expectTab: true,
      expectKind: "find-doc",
    },
    {
      name: "Sales Order form (A/R, stage A1)",
      ctx: { showingHome: false, route: "/app/sales-order/SAL-ORD-2026-00001" },
      expectTab: true,
      expectKind: "doc-form",
    },
    {
      name: "Estimate (Quotation) form",
      ctx: { showingHome: false, route: "/app/quotation/new" },
      expectTab: true,
      expectKind: "doc-form",
    },
    {
      name: "Invoice (Sales Invoice) form",
      ctx: { showingHome: false, route: "/app/sales-invoice/ACC-SINV-2026-00001" },
      expectTab: true,
      expectKind: "doc-form",
    },
    {
      name: "New payment, direction Receive → Receive Payment form",
      ctx: { showingHome: false, route: "/app/payment-entry/new", paymentDirection: "Receive" },
      expectTab: true,
      expectKind: "doc-form",
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

/** @type {string} */
export const PAYMENT_ENTRY_NEW_ROUTE = "/app/payment-entry/new";

/**
 * The `/app/…` route a Payment Entry Doc surface stands on.
 * @param {string|null|undefined} record "" / "new" → the blank decision surface
 * @returns {string}
 */
export function paymentEntryRoute(record) {
  const rec = record == null ? "" : String(record).trim();
  if (!rec || isNewDocRecord(rec)) return PAYMENT_ENTRY_NEW_ROUTE;
  return `/app/payment-entry/${rec}`;
}

/**
 * Where a resolved Doc-skin target *is*, as an ERP route ("" for Workflow Home, which is not
 * an ERP page at all).
 *
 * doc-form.html skins get this for free: they are opened by a shell navigation that sets
 * `currentRoute` and pushes a Recent row. The two shell-local Payment Entry surfaces
 * (pay-outstanding.html / payment-doc.html) load a local file instead, so nothing told the
 * shell where the clerk went — `currentRoute` stayed on the page *before* them, Recent never
 * saw them, and an incident filed from Pay Outstanding reported `/desk`. That is nav incident
 * 2026-09-10: a whole session of Home → Pay Outstanding → Home left Recent empty.
 *
 * @param {DocSkinTarget|null|undefined} target
 * @returns {string}
 */
export function docSkinTargetRoute(target) {
  if (!target || typeof target !== "object") return "";
  if (target.kind === "pay-outstanding") return PAYMENT_ENTRY_NEW_ROUTE;
  if (target.kind === "payment-doc") return paymentEntryRoute(target.record);
  if (target.kind === "doc-form" || target.kind === "find-doc") {
    return typeof target.route === "string" ? target.route : "";
  }
  return "";
}
