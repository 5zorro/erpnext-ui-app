/**
 * Doc-skin source modal trigger policy — shared by Bill and Item Receipt.
 * When to open the source picker on vendor pick / toolbar / blur (approach A).
 * Merge methods and Bill-specific focus live in bill-source-flow.js; IR merge in main.js IPC.
 *
 * @see bug-bounty-source-modal-vendor-pick
 */

/**
 * Product contract (approach A): open source modal on an explicit vendor *pick* event,
 * without waiting for ERP set_value / ajax quiet. Do not open on free-type blur no-ops.
 *
 * @param {{
 *   trigger: "link_pick" | "toolbar" | "blur" | "unknown",
 *   hasSupplier: boolean,
 *   editable?: boolean,
 *   modalAlreadyOpen?: boolean,
 *   setHeaderOk?: boolean | null,
 *   setHeaderSkipped?: boolean,
 * }} ctx
 * @returns {{ open: boolean, reason: string }}
 */
export function shouldOpenSourceModalAfterVendorPick(ctx) {
  const c = ctx && typeof ctx === "object" ? ctx : {};
  if (c.modalAlreadyOpen) return { open: false, reason: "modal_already_open" };
  if (c.editable === false) return { open: false, reason: "not_editable" };
  if (!c.hasSupplier) return { open: false, reason: "no_supplier" };

  if (c.trigger === "toolbar") {
    return { open: true, reason: "toolbar_select_po" };
  }
  if (c.trigger === "link_pick") {
    // UI-event first — setHeader outcome must not gate the open.
    return { open: true, reason: "vendor_link_pick" };
  }
  if (c.trigger === "blur") {
    // Free-type blur: only if a write actually happened (or skipped-but-flagged pick path).
    if (c.setHeaderOk === false) return { open: false, reason: "set_header_failed" };
    if (c.setHeaderSkipped && c.setHeaderOk !== true) {
      return { open: false, reason: "blur_noop" };
    }
    return { open: true, reason: "vendor_blur_commit" };
  }
  return { open: false, reason: "unknown_trigger" };
}

/**
 * Parallel vendor pick orchestration (approach A): listSources ∥ setHeader(supplier).
 * Modal open intent is known upfront (link_pick / toolbar); paint when header IPC returns.
 * Party-detail settle is bridge SSoT (isSupplierPartySettled).
 *
 * @param {{
 *   supplier: string,
 *   decision: { open: boolean, reason?: string },
 *   setHeader: (field: string, value: string) => Promise<{ ok?: boolean, doc?: object, reason?: string, [key: string]: unknown }>,
 *   openSourcePicker: (supplier: string) => Promise<void>,
 *   onHeaderSuccess: (res: { ok?: boolean, doc?: object, [key: string]: unknown }) => void,
 *   onHeaderFailure: (res: { ok?: boolean, reason?: string, [key: string]: unknown } | null | undefined) => void,
 *   onModalSkipped?: (reason: string) => void,
 *   onAfterFlow?: (res: { ok?: boolean, doc?: object, [key: string]: unknown }) => void | Promise<void>,
 * }} ctx
 */
export async function runVendorPickWithSourceModal(ctx) {
  const c = ctx && typeof ctx === "object" ? ctx : {};
  const supplier = c.supplier;
  const decision = c.decision && typeof c.decision === "object" ? c.decision : { open: false };

  const modalP = decision.open
    ? c.openSourcePicker(supplier)
    : Promise.resolve().then(() => {
        if (c.onModalSkipped) c.onModalSkipped(decision.reason || "skipped");
      });

  const res = await c.setHeader("supplier", supplier);
  if (res && res.ok) c.onHeaderSuccess(res);
  else c.onHeaderFailure(res);

  await modalP;

  if (res && res.ok && c.onAfterFlow) {
    await c.onAfterFlow(res);
  }
}
