/**
 * Museum OI-200 (decided 2026-11-01, 5zorro's option A): changing from one existing vendor to
 * another clears the whole document first, then the new vendor's details load into a blank form.
 *
 * Why: a vendor's address, terms and sourced lines all came from that vendor, and ERPNext refuses
 * to save a Bill whose PO or receipt lines belong to another vendor, so sourced lines could not
 * survive the switch anyway. The rule behind it (his): when an input changes, clear what came
 * from the old value before waiting for the new one — a timeout can then leave a blank, never a
 * wrong value. (Today the vendor write waits for ERPNext's reply however slow — docs/gotchas.md,
 * "A field script's server calls hold set_value" — so this is the fence, not a fix for a leak.)
 *
 * His reasons for the whole document: "A user who makes this mistake should take a screenshot
 * then rebuild. it often comes from either a mis-typed vendor name, or a po being saved with a
 * mis-typed name that needs to be fixed." — so the switch warns first, says what will clear, and
 * Keep is the default (warn, don't block).
 *
 * The first pick on a document with no vendor clears nothing. A switch where the clerk has typed
 * nothing yet (only the vendor's own details would go) clears without asking.
 *
 * Pure: decisions and wording only. The clear is `clearForPartyChange` in
 * `electron/erp-form-bridge-page.js`; the dialog is shown by `electron/main.js`.
 */

const norm = (v) => String(v ?? "").trim();

/**
 * @param {string} prev the vendor on the document now
 * @param {string} next the vendor picked
 * @returns {boolean} true when this is a switch from one vendor to another (not a first pick)
 */
export function isVendorSwitch(prev, next) {
  const a = norm(prev);
  const b = norm(next);
  return !!a && !!b && a.toLowerCase() !== b.toLowerCase();
}

/** @param {number} n @param {string} one @param {string} [many] */
const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * What the clerk would lose: the lines, their sources, added charges and the header fields they
 * typed. The vendor's own details (address, terms, due date) are not listed — the new vendor
 * brings its own.
 * @param {Record<string, any> | null | undefined} doc the document as ERPNext holds it
 * @param {{ dateExpected?: string, amountDue?: string }} [scratch] what the app keeps beside
 *   ERPNext's document: the PO's Date Expected, the Bill's Amount due
 * @returns {string[]} short phrases, in the order the page shows them; empty = nothing typed
 */
export function vendorChangeLosses(doc, scratch = {}) {
  const d = doc && typeof doc === "object" ? doc : {};
  const out = [];
  const header = [
    ["bill_no", "the vendor's invoice number"],
    ["bill_date", "the invoice date"],
    ["supplier_delivery_note", "the vendor's delivery note number"],
  ];
  for (const [field, label] of header) {
    if (norm(d[field])) out.push(`${label} (${norm(d[field])})`);
  }
  if (norm(scratch.dateExpected)) out.push(`the date expected (${norm(scratch.dateExpected)})`);
  if (norm(scratch.amountDue)) out.push(`the amount due (${norm(scratch.amountDue)})`);

  const items = Array.isArray(d.items) ? d.items : [];
  const lines = items.filter(
    (r) => r && (norm(r.item_code) || norm(r.item_name) || Number(r.qty) || Number(r.amount)),
  );
  if (lines.length) out.push(count(lines.length, "line"));

  const sources = [];
  for (const r of lines) {
    for (const field of ["purchase_order", "purchase_receipt", "material_request"]) {
      const s = norm(r[field]);
      if (s && !sources.includes(s)) sources.push(s);
    }
  }
  if (sources.length) {
    const shown = sources.slice(0, 3).join(", ");
    out.push(`the link to ${sources.length > 3 ? `${shown} and ${sources.length - 3} more` : shown}`);
  }

  const charges = (Array.isArray(d.taxes) ? d.taxes : []).filter(
    (t) => t && (Number(t.tax_amount) || Number(t.rate)),
  );
  if (charges.length) out.push(count(charges.length, "charge or tax row", "charge and tax rows"));

  if (norm(d.remarks)) out.push("the memo");
  return out;
}

/**
 * The warning before a vendor switch clears the document. Keep is first and the default, so
 * Enter or Esc leaves everything as it was.
 * @param {{ from: string, to: string, docLabel?: string, losses: string[] }} o
 * @returns {{ title: string, message: string, detail: string, buttons: string[], actions: ("keep"|"clear")[] }}
 */
export function vendorChangeDialogSpec(o) {
  const doc = norm(o.docLabel) || "document";
  const losses = Array.isArray(o.losses) ? o.losses : [];
  return {
    title: "Change vendor",
    message: `Change the vendor from ${norm(o.from)} to ${norm(o.to)}?`,
    detail:
      `Changing the vendor clears this whole ${doc}: ${losses.join("; ")}. ` +
      `Take a screenshot first if you will rebuild it.\n\n` +
      `Keep leaves the ${doc} as it is.`,
    buttons: [`Keep ${norm(o.from)}`, "Change vendor and clear"],
    actions: ["keep", "clear"],
  };
}
