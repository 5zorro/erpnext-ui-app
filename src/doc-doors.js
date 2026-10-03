/**
 * Every door a Doc skin or a payment page offers, and how it moves the clerk (plan 2026-09-26
 * "Doors: peek or navigate", agreed 5zorro 2026-10-02). One question decides each row:
 *
 *   Will the clerk come back to this page when done?
 *   - yes → `peek`: an errand for this document. The page is parked as the parent, Esc returns,
 *     nothing is discarded. A peek is NOT read-only — creating a Vendor is a peek.
 *   - no  → `navigate`: other work. The page is left; the unsaved-changes gate asks first.
 *   - same document, other view → `lens`. Only a lens click changes the remembered lens.
 *   - `detour`: a peek whose return point is a shell page (the payment board, the payment page)
 *     and whose errand opens in the clerk's usual lens. "← Back to …" in the toolbar, or Esc.
 *
 * Keyed by the IPC channel main handles. tests/peek-doors.test.js holds main.js to this table:
 * every door-shaped handler must be listed, and must use the call its kind says.
 * `pending` marks a door that does not follow its kind yet, with the reason — visible, not hidden.
 */

/** @typedef {"peek"|"navigate"|"lens"|"detour"} DoorKind */

/** @type {Readonly<Record<string, { kind: DoorKind, why: string, pending?: string }>>} */
export const DOC_DOORS = Object.freeze({
  // Create a missing master from a picker — an errand for this document.
  "bill-open-vendor-add": { kind: "peek", why: "create the vendor this bill needs" },
  "doc-open-vendor-add": { kind: "peek", why: "create the vendor this document needs" },
  "bill-open-project-add": { kind: "peek", why: "create the project a line needs" },
  "bill-open-payment-terms-add": { kind: "peek", why: "create the terms this bill needs" },
  "doc-open-payment-terms-add": { kind: "peek", why: "create the terms this document needs" },
  // Fix or add something for this document.
  "bill-open-supplier-form": { kind: "peek", why: "edit this vendor's addresses for this bill" },
  "bill-open-landed-cost": { kind: "peek", why: "add landed cost to what this bill bought" },
  "bill-attach-file": { kind: "peek", why: "attach a file with Frappe's uploader on this bill" },
  "doc-attach-file": { kind: "peek", why: "attach a file with Frappe's uploader on this document" },
  "bill-open-add-payment": { kind: "peek", why: "draft a payment against this bill" },
  // The page's own peeks: linked source ↗, applied payment 👁, create Item, company addresses,
  // Customize Form from the receive question.
  "soft-peek-route": { kind: "peek", why: "look at or fix a document this one links to" },
  "bill-print": {
    kind: "peek",
    why: "print this bill and carry on",
    pending: "still a full load into Vanilla to show the print preview; Esc does not come back yet",
  },
  "doc-print": {
    kind: "peek",
    why: "print this document and carry on",
    pending: "still a full load into Vanilla to show the print preview; Esc does not come back yet",
  },
  // Other work.
  "bill-find": { kind: "navigate", why: "find another bill" },
  "doc-find": { kind: "navigate", why: "find another document" },
  "bill-new": { kind: "navigate", why: "start a new bill" },
  "doc-new": { kind: "navigate", why: "start a new document" },
  "bill-create-credit-memo": { kind: "navigate", why: "the credit memo is its own document" },
  // Same document, other view.
  "bill-open-vanilla": { kind: "lens", why: "this bill in Default-skin" },
  "doc-open-vanilla": { kind: "lens", why: "this document in Default-skin" },
  // From a payment page to the bill it pays, and back.
  "shell-detour-open": { kind: "detour", why: "fix the bill a payment pays, then back to the payment work" },
});

/**
 * @param {string} channel
 * @returns {{ kind: DoorKind, why: string, pending?: string }|null}
 */
export function doorFor(channel) {
  return Object.prototype.hasOwnProperty.call(DOC_DOORS, channel) ? DOC_DOORS[channel] : null;
}

/**
 * Door-shaped IPC channels main must list here: anything a Doc skin calls to open, find, start,
 * print or attach, plus the shell-wide peek and detour doors.
 * @param {string} channel
 */
export function isDoorChannel(channel) {
  return (
    /^(bill|doc)-(open-[a-z-]+|attach-file|find|new|print|create-credit-memo)$/.test(channel) ||
    channel === "soft-peek-route" ||
    channel === "shell-detour-open"
  );
}
