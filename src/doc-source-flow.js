/**
 * Doc-skin source modal trigger policy — shared by Bill and Item Receipt.
 * When to open the source picker on vendor pick / toolbar / blur (approach A).
 *
 * Orchestration SSoT: source-picker-flow.js (modal lifecycle ∥ setHeader ∥ streamed slices).
 *
 * @see bug-bounty-source-modal-vendor-pick
 */

export { runVendorPickWithSourceModal } from "./source-picker-flow.js";

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
    return { open: true, reason: "vendor_link_pick" };
  }
  if (c.trigger === "blur") {
    if (c.setHeaderOk === false) return { open: false, reason: "set_header_failed" };
    if (c.setHeaderSkipped && c.setHeaderOk !== true) {
      return { open: false, reason: "blur_noop" };
    }
    return { open: true, reason: "vendor_blur_commit" };
  }
  return { open: false, reason: "unknown_trigger" };
}
