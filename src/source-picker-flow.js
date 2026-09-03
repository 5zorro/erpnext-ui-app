/**
 * Source picker orchestration — SSoT for modal lifecycle vs ERP fetch.
 *
 * Why this exists (re-open / lag bugs):
 * - Modal promise must resolve on **user close**, not when listSources finishes.
 * - Category fetch runs detached; late slices never call showSourceModal again.
 * - Vendor setHeader (runVendorPickWithSourceModal) must not share one promise with fetch.
 */

import {
  buildBillSourceLoadingGroups,
  SOURCE_LIST_SLICE_ORDER,
  buildSourceGroupFromSliceRows,
  applySourceSliceToGroups,
} from "./source-list-slices.js";

/**
 * @typedef {"link_pick" | "blur" | "toolbar" | "unknown"} SourcePickerTrigger
 *
 * @typedef {{
 *   supplier: string,
 *   trigger: SourcePickerTrigger,
 *   mode?: "single" | "multi",
 *   listSourceSlice: (supplier: string, sliceId: string) => Promise<{ ok?: boolean, rows?: object[], reason?: string }>,
 *   showModal: (opts: object) => Promise<{ ok?: boolean, kind?: string }>,
 *   buildInitialGroups?: () => import("./source-modal.js").SourceGroup[],
 *   mayOpen?: (supplier: string, trigger: SourcePickerTrigger) => { ok: boolean, reason?: string },
 *   onUserClose?: (kind: string) => void,
 *   onStreamComplete?: (summary: { errors: string[] }) => void,
 *   log?: (event: string, detail?: string) => void,
 * }} RunSourcePickerFlowOptions
 */

/**
 * @param {unknown} value
 */
export function normalizeSourcePickerSupplier(value) {
  if (value == null) return "";
  return String(value).trim();
}

/**
 * Auto-open policy without "reset dismissed on re-entry" foot-gun.
 * @param {{ supplier: string, userClosed: boolean } | null} session
 * @param {unknown} supplier
 * @param {SourcePickerTrigger} trigger
 */
export function mayAutoOpenSourcePicker(session, supplier, trigger) {
  if (trigger === "toolbar") return { ok: true };
  const sup = normalizeSourcePickerSupplier(supplier);
  if (!sup) return { ok: false, reason: "no_supplier" };
  if (session && session.supplier === sup && session.userClosed) {
    return { ok: false, reason: "pick_closed" };
  }
  return { ok: true };
}

/**
 * Open modal immediately; stream slices in parallel; resolve when user closes (not when fetch ends).
 * @param {RunSourcePickerFlowOptions} opts
 * @returns {Promise<{ ok: boolean, kind?: string, reason?: string }>}
 */
export async function runSourcePickerFlow(opts) {
  const o = opts && typeof opts === "object" ? opts : /** @type {RunSourcePickerFlowOptions} */ ({});
  const supplier = normalizeSourcePickerSupplier(o.supplier);
  const trigger = o.trigger || "unknown";
  const log = o.log || (() => {});

  if (!supplier) return { ok: false, reason: "no_supplier" };
  if (!o.listSourceSlice || !o.showModal) {
    return { ok: false, reason: "source_picker_api_missing" };
  }

  /** @type {{ supplier: string, userClosed: boolean, alive: boolean }} */
  const session = { supplier, userClosed: false, alive: true };

  if (o.mayOpen) {
    const gate = o.mayOpen(supplier, trigger);
    if (!gate.ok) {
      log("source-modal-skip", `${trigger}:${gate.reason || "blocked"}`);
      return { ok: false, reason: gate.reason || "blocked" };
    }
  }
  log("source-picker-open", trigger);

  /** @type {import("./source-modal-ui.js").SourceModalController | null} */
  let ctl = null;
  let groups = o.buildInitialGroups ? o.buildInitialGroups() : buildBillSourceLoadingGroups();

  const modalDone = o.showModal({
    groups,
    mode: o.mode === "single" ? "single" : "multi",
    onController: (c) => {
      ctl = c;
    },
    onClose: (kind) => {
      session.userClosed = true;
      session.alive = false;
      if (o.onUserClose) o.onUserClose(kind);
    },
  });

  void streamSourceSlices({
    supplier,
    session,
    listSourceSlice: o.listSourceSlice,
    getController: () => ctl,
    getGroups: () => groups,
    setGroups: (next) => {
      groups = next;
    },
    log,
    onComplete: o.onStreamComplete,
  });

  const closed = await modalDone;
  session.alive = false;
  return closed && typeof closed === "object"
    ? closed
    : { ok: true, kind: "cancel" };
}

/**
 * @param {{
 *   supplier: string,
 *   session: { alive: boolean },
 *   listSourceSlice: RunSourcePickerFlowOptions["listSourceSlice"],
 *   getController: () => import("./source-modal-ui.js").SourceModalController | null,
 *   getGroups: () => import("./source-modal.js").SourceGroup[],
 *   setGroups: (g: import("./source-modal.js").SourceGroup[]) => void,
 *   log: (event: string, detail?: string) => void,
 *   onComplete?: RunSourcePickerFlowOptions["onStreamComplete"],
 * }} ctx
 */
async function streamSourceSlices(ctx) {
  /** @type {string[]} */
  const errors = [];
  await Promise.all(
    SOURCE_LIST_SLICE_ORDER.map(async (sliceId) => {
      try {
        const raw = await ctx.listSourceSlice(ctx.supplier, sliceId);
        if (!ctx.session.alive) return;
        const ctl = ctx.getController();
        if (!ctl) return;
        if (!raw || raw.ok === false) {
          const msg = (raw && raw.reason) || `Could not load ${sliceId}`;
          errors.push(msg);
          ctl.setSliceError(sliceId, msg);
          return;
        }
        const sliceGroup = buildSourceGroupFromSliceRows(sliceId, raw.rows || []);
        if (!sliceGroup) return;
        const next = applySourceSliceToGroups(ctx.getGroups(), sliceGroup);
        ctx.setGroups(next);
        ctl.applySlice(sliceId, sliceGroup, next);
        ctx.log("source-slice-ready", sliceId);
      } catch (e) {
        if (!ctx.session.alive) return;
        const msg = String(e && e.message ? e.message : e);
        errors.push(msg);
        ctx.getController()?.setSliceError(sliceId, msg);
      }
    }),
  );
  if (ctx.onComplete) ctx.onComplete({ errors });
}

/**
 * Vendor link pick: modal UX ∥ setHeader — modal promise is only user interaction.
 *
 * @param {{
 *   supplier: string,
 *   decision: { open: boolean, reason?: string },
 *   setHeader: (field: string, value: string) => Promise<{ ok?: boolean, doc?: object, [key: string]: unknown }>,
 *   openSourcePicker: (supplier: string) => Promise<{ ok?: boolean, kind?: string, reason?: string } | void>,
 *   onHeaderSuccess: (res: { ok?: boolean, doc?: object }) => void,
 *   onHeaderFailure: (res: { ok?: boolean, reason?: string } | null | undefined) => void,
 *   onModalSkipped?: (reason: string) => void,
 *   onAfterFlow?: (res: { ok?: boolean, doc?: object }) => void | Promise<void>,
 * }} ctx
 */
export async function runVendorPickWithSourceModal(ctx) {
  const c = ctx && typeof ctx === "object" ? ctx : {};
  const supplier = c.supplier;
  const decision = c.decision && typeof c.decision === "object" ? c.decision : { open: false };

  const headerP = c.setHeader("supplier", supplier);
  const modalP = decision.open
    ? c.openSourcePicker(supplier)
    : Promise.resolve({ ok: false, reason: "skipped" }).then((r) => {
        if (c.onModalSkipped) c.onModalSkipped(decision.reason || "skipped");
        return r;
      });

  const [res] = await Promise.all([
    headerP.then((raw) => {
      if (raw && raw.ok) c.onHeaderSuccess(raw);
      else c.onHeaderFailure(raw);
      return raw;
    }),
    modalP,
  ]);

  if (res && res.ok && c.onAfterFlow) {
    await c.onAfterFlow(res);
  }
}
