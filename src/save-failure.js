/**
 * One wording for a save that failed, on every Doc form (plan 2026-10-25 closeout, item 3; 5zorro:
 * "fail loud and clearly", shown the Bill's way — a toast and the red status line, no dialog).
 *
 * A failed save is one of four cases, and the clerk must be able to tell them apart:
 * - **not sent** — a check before ERPNext was asked (a blank mandatory field, the Bill's own
 *   checks): nothing changed in ERPNext. "Can't save yet — …"
 * - **rejected, with a reason** — ERPNext answered no: nothing was saved. "Save rejected — ERPNext
 *   says: …", its reason in plain words.
 * - **rejected, no reason** — ERPNext answered no and said nothing readable.
 * - **no answer** — ERPNext did not answer in time (or the connection broke). It may still save:
 *   the clerk is told to reload before trying again, never that it was rejected.
 * - (rare) **unread** — ERPNext answered yes, but no document came back to show.
 *
 * Which case it is comes from the save's reply, not from its words: the form bridge marks each
 * reply `outcome: "refused" | "no-answer" | "not-sent" | "unread"` (and `timedOut` for a wait that ran out —
 * the bridge's own or main's backstop, with `waitedMs`). A reply with no mark was stopped by the
 * shell before ERPNext was asked.
 */

/**
 * @typedef {{
 *   ok?: boolean,
 *   outcome?: "refused" | "no-answer" | "not-sent" | "unread",
 *   erpReason?: string,
 *   timedOut?: boolean,
 *   waitedMs?: number,
 *   interrupted?: string,
 *   reason?: string,
 *   blockers?: string[],
 * }} SaveReply
 *
 * @typedef {{
 *   kind: "not-sent" | "rejected" | "no-reason" | "no-answer" | "unread",
 *   status: string,
 *   toast: string,
 *   gate: { title: string, blockers: string[], hint: string, blocked: true },
 * }} SaveFailure
 */

const textList = (list) => (Array.isArray(list) ? list.map((t) => String(t || "").trim()).filter(Boolean) : []);

/**
 * ERPNext's words, plain: no markup, one line, "This document" named, ERPNext's doctype under the
 * form's own name (an Item Receipt is a Purchase Receipt to ERPNext).
 * @param {unknown} text
 * @param {{ title?: string, doctype?: string }} [names]
 */
export function plainErpText(text, names = {}) {
  let out = String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .replace(/ ([:;,.!?)])/g, "$1")
    .trim();
  const title = names.title && String(names.title).trim();
  if (title) {
    out = out.replace(/\bThis document\b/g, `This ${title}`).replace(/\bthis document\b/g, `this ${title}`);
    if (names.doctype && names.doctype !== title) out = out.split(names.doctype).join(title);
  }
  return out;
}

/**
 * Sort a failed save's reply into its case. `!reply` (nothing came back at all) is no answer.
 * @param {SaveReply|null|undefined} reply
 */
export function saveFailureKind(reply) {
  if (!reply || typeof reply !== "object") return "no-answer";
  if (reply.timedOut || reply.outcome === "no-answer") return "no-answer";
  if (reply.outcome === "unread") return "unread";
  if (reply.outcome === "refused") {
    const said = reply.erpReason != null ? reply.erpReason : reply.reason;
    return String(said || "").trim() ? "rejected" : "no-reason";
  }
  return "not-sent";
}

/**
 * The words for a failed save: the red status line, the toast, and the commit gate's panel (when
 * the save was chosen there). `humanize` turns ERPNext's text into the form's words.
 * @param {SaveReply|null|undefined} reply
 * @param {{ submit?: boolean, humanize?: (text: string) => string }} [opts]
 * @returns {SaveFailure}
 */
export function saveFailure(reply, opts = {}) {
  const what = opts.submit ? "Submit" : "Save";
  const verb = opts.submit ? "submit" : "save";
  const humanize = typeof opts.humanize === "function" ? opts.humanize : (t) => plainErpText(t);
  const kind = saveFailureKind(reply);
  const r = reply && typeof reply === "object" ? reply : {};

  if (kind === "rejected") {
    const said = humanize(String(r.erpReason != null ? r.erpReason : r.reason)) || String(r.erpReason || r.reason).trim();
    return {
      kind,
      status: `${what} rejected — ERPNext says: ${said}`,
      toast: `${what} rejected by ERPNext — click to see why.`,
      gate: { title: `${what} rejected — ERPNext says:`, blockers: [said], hint: "Nothing was saved. Cancel to go back and fix it, or Discard.", blocked: true },
    };
  }
  if (kind === "no-reason") {
    return {
      kind,
      status: `${what} rejected — ERPNext gave no reason; open Vanilla to read its message.`,
      toast: `${what} rejected by ERPNext — click to see more.`,
      gate: { title: `${what} rejected — ERPNext gave no reason`, blockers: [], hint: "Nothing was saved. Open Vanilla to read its message.", blocked: true },
    };
  }
  if (kind === "no-answer") {
    const secs = Number(r.waitedMs) > 0 ? Math.round(Number(r.waitedMs) / 1000) : 0;
    // Why no answer came: the wait ran out, or the ERPNext page reloaded / closed under it.
    const cause = r.interrupted
      ? `the ERPNext page ${String(r.interrupted)} before ERPNext answered`
      : `ERPNext did not answer${secs ? ` in ${secs} s` : ""}`;
    // Text scraped off ERPNext's page while waiting is left out: it can be an earlier refusal's
    // dialog still on screen, and would make an unanswered save read as a rejected one.
    return {
      kind,
      status: `${what} did not finish — ${cause} and may still ${verb} it; reload before trying again.`,
      toast: `${what} did not finish — ERPNext did not answer. Click for details.`,
      gate: {
        title: `${what} did not finish — ${cause}`,
        blockers: [],
        hint: `ERPNext may still ${verb} it. Reload before trying again.`,
        blocked: true,
      },
    };
  }
  if (kind === "unread") {
    return {
      kind,
      status: `${what} may have gone through — ERPNext answered but sent no document back; reload before trying again.`,
      toast: `${what} may have gone through — click for details.`,
      gate: { title: `${what} may have gone through`, blockers: [], hint: "ERPNext answered but sent no document back. Reload before trying again.", blocked: true },
    };
  }
  const reasons = textList(r.blockers).length ? textList(r.blockers) : textList([r.reason]);
  const listed = reasons.map((t) => humanize(t) || t);
  const first = listed[0] || "the form's checks did not pass";
  const more = listed.length > 1 ? ` (and ${listed.length - 1} more)` : "";
  return {
    kind: "not-sent",
    status: `Can't ${verb} yet — ${first}${more}`,
    toast: `Can't ${verb} yet — click to see what to fix.`,
    gate: { title: `Can't ${verb} yet:`, blockers: listed, hint: "Cancel to go back and fix these, then save again.", blocked: true },
  };
}
