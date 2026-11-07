/**
 * Opening a Doc form's source picker (Select PO and its kin), written once for every Doc form page
 * (plan 2026-10-25 closeout, item 4): the checks before it opens, and the two things it remembers.
 *
 * - **The pick's session:** a vendor picked from the list opens the picker by itself; once the
 *   clerk closes it for that vendor, leaving the Vendor box does not open it again
 *   (`mayAutoOpenSourcePicker`). The toolbar always opens it. Another document forgets the
 *   session (the Bill's way; doc-form kept it from one document to the next).
 * - **The one in flight:** a second ask for the same vendor while one is opening gets that one.
 *
 * How the picker itself runs differs by form (`run`): the Bill's has credit memos and Bills; the
 * other forms list their own sources (src/source-picker-flow.js underneath both).
 */

import { mayAutoOpenSourcePicker } from "./source-picker-flow.js";
import { normalizeEditableText } from "./dirty-gate.js";

/**
 * @typedef {"link_pick" | "blur" | "toolbar" | "unknown"} SourceTrigger
 *
 * @typedef {{
 *   api: () => any,
 *   available: () => boolean,
 *   editable: () => boolean,
 *   lastDoc: () => any,
 *   partyBox: () => HTMLInputElement | null | undefined,
 *   title: () => string,
 *   sourceLabel: () => string,
 *   anotherDialogOpen: () => boolean,
 *   vendorIsMissing: (name: string, attempt: "vendor" | "sources") => Promise<boolean>,
 *   setStatus: (text: string, cls?: string) => void,
 *   logFocus: (event: string, detail?: string) => void,
 *   run: (supplier: string, trigger: SourceTrigger) => Promise<any>,
 * }} SourcePickerOpenDeps
 *
 * `available`: the form has a source picker and the shell offers it. `anotherDialogOpen`: the
 * picker's own dialog or any other on the page (the Bill's credit-memo link picker) is open.
 */

/** @param {SourcePickerOpenDeps} deps */
export function createSourcePickerOpener(deps) {
  /** @type {{ supplier: string, userClosed: boolean } | null} */
  let session = null;
  /** @type {Promise<any> | null} */
  let inflight = null;
  let inflightSupplier = "";

  /**
   * @param {string} [supplier]
   * @param {{ trigger?: SourceTrigger }} [opts]
   */
  async function open(supplier, opts = {}) {
    const trigger = opts.trigger || "unknown";
    const api = deps.api();
    if (!api || !api.listSourceSlice || !deps.available()) {
      deps.setStatus("Source picker API missing — restart the shell.", "err");
      return { ok: false, reason: "api_missing" };
    }
    // Every dialog on the page respects every other one: a toolbar Select PO could stack a
    // second dialog on top of an open link picker.
    if (deps.anotherDialogOpen()) return { ok: false, reason: "already_open" };
    if (!deps.editable()) {
      deps.setStatus(`${deps.title()} is not a draft — source picker locked.`, "warn");
      return { ok: false, reason: "not_editable" };
    }
    const doc = deps.lastDoc();
    const box = deps.partyBox();
    const sup =
      normalizeEditableText(supplier) ||
      normalizeEditableText(doc && doc.supplier) ||
      normalizeEditableText(box && box.value);
    if (!sup) {
      deps.setStatus(`Pick a vendor before ${deps.sourceLabel()}.`, "warn");
      return { ok: false, reason: "no_supplier" };
    }
    // The vendor pick checked already; the toolbar and a vendor typed then left were not (D2, R5b-5).
    if (trigger !== "link_pick" && (await deps.vendorIsMissing(sup, "sources"))) {
      return { ok: false, reason: "vendor_missing" };
    }
    // A pick starts its session where the pick is made (notePick); the toolbar ends it.
    if (trigger === "toolbar") session = null;

    const gate = mayAutoOpenSourcePicker(session, sup, trigger);
    if (!gate.ok) {
      deps.logFocus("source-modal-skip", `${trigger}:${gate.reason || "blocked"}`);
      return { ok: false, reason: gate.reason || "blocked" };
    }
    if (inflight && inflightSupplier === sup && trigger !== "toolbar") return inflight;

    inflightSupplier = sup;
    inflight = deps.run(sup, trigger).finally(() => {
      if (inflightSupplier === sup) {
        inflight = null;
        inflightSupplier = "";
      }
    });
    return inflight;
  }

  return {
    open,
    /** The clerk picked this vendor from the list: the picker may open by itself for it. */
    notePick: (supplier) => {
      session = { supplier: normalizeEditableText(supplier), userClosed: false };
    },
    /** The clerk closed the picker for this vendor: leaving the box does not open it again. */
    noteClosed: (supplier) => {
      if (session && session.supplier === supplier) session.userClosed = true;
    },
    /** May the picker open by itself now? (the flow asks again before it shows) */
    mayOpen: (vendor, trigger) => mayAutoOpenSourcePicker(session, vendor, trigger),
    /** The vendor just picked, before ERPNext has it. */
    pickedSupplier: () => (session ? session.supplier : ""),
    /** Another document: forget the session and the one in flight. */
    forget: () => {
      session = null;
      inflight = null;
      inflightSupplier = "";
    },
  };
}
