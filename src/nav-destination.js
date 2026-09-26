/**
 * Where does this address open? — one answer for every door (implementation-plan-2026-09-26).
 *
 * The navigation audit found at least eight doors (Home tiles, Recent, Drafts, Submitted, the
 * Doc and Vanilla tabs, Find/New/Print, the Vanilla→Doc hijack) each deciding for itself, from
 * two different registries. Each new kind of Doc page had to be taught to every door, and the
 * doors that were missed silently opened Vanilla (G9, G10). This module is the one place the
 * question is answered; main.js only carries out the answer.
 *
 * Inputs are the address and the clerk's lens memory. The answer is a surface:
 *   - "doc-form"         Bill / PO / Item Receipt (doc-form.html)
 *   - "pay-outstanding"  a new payment (the Pay Bills dashboard)
 *   - "payment-doc"      an existing payment
 *   - "find-doc"         a document list's Find page
 *   - "erp"              Vanilla — the ERP page itself
 */

import { normalizeAppRoute } from "./route-info.js";
import { preferredLens } from "./lens-prefs.js";
import { resolveDocSkinTarget, docSkinTargetRoute } from "./lens-context.js";

/**
 * Lens memory key. A list remembers its lens apart from its form, so choosing Vanilla on
 * Find Bills never changes how Bills open (lens-prefs.js: a list must not flip the form).
 * @param {string|null|undefined} doctype slug, e.g. purchase-invoice
 * @param {string|null|undefined} record "" for a list
 * @returns {string} "purchase-invoice" or "purchase-invoice:list"
 */
export function lensPrefKey(doctype, record) {
  const dt = String(doctype || "").trim();
  if (!dt) return "";
  return record ? dt : `${dt}:list`;
}

/**
 * @typedef {"doc-form"|"pay-outstanding"|"payment-doc"|"find-doc"|"erp"} OpenSurface
 * @typedef {{
 *   surface: OpenSurface,
 *   route: string,
 *   doctype: string,
 *   record: string,
 *   lens: "doc"|"vanilla"|"simplified",
 *   target: import("./lens-context.js").DocSkinTarget|null,
 * }} OpenTarget
 */

/**
 * @param {{
 *   route?: string,
 *   lensPrefs?: Record<string, string>,
 *   paymentDirection?: string,
 *   erpBase?: string,
 * }} [opts]
 * @returns {OpenTarget}
 */
export function resolveOpenTarget(opts = {}) {
  const n = normalizeAppRoute(typeof opts.route === "string" ? opts.route : "", opts.erpBase);
  const path = n.path || "/desk";
  const base = { route: path, doctype: n.doctype || "", record: n.record || "", target: null };
  if (!n.doctype) return { ...base, surface: "erp", lens: "vanilla" };

  const lens = preferredLens(lensPrefKey(n.doctype, n.record), opts.lensPrefs || {});
  if (lens !== "doc") return { ...base, surface: "erp", lens };

  const target = resolveDocSkinTarget({
    route: path,
    doctype: n.doctype,
    record: n.record,
    lens: "doc",
    paymentDirection: opts.paymentDirection,
  });
  // No skin for this page (or only Desk's Workflow Home): Vanilla is the answer, whatever
  // the remembered lens says — a preference cannot conjure a skin.
  if (!target || target.kind === "workflow-home") {
    return { ...base, surface: "erp", lens: "vanilla" };
  }
  return {
    ...base,
    surface: target.kind,
    route: docSkinTargetRoute(target) || path,
    lens: "doc",
    target,
  };
}

/**
 * Does this page have a Doc skin of its own (not merely Desk → Workflow Home)?
 * The toolbar's Doc tab asks this; it is independent of the remembered lens.
 * @param {{ route?: string, doctype?: string, record?: string, paymentDirection?: string }} ctx
 * @returns {boolean}
 */
export function pageHasOwnDocSkin(ctx = {}) {
  if (!ctx.doctype) return false;
  const target = resolveDocSkinTarget({ ...ctx, lens: "doc" });
  return !!(target && target.kind !== "workflow-home");
}
