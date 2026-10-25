/**
 * The ongoing-state check (plan 2026-10-24, the fourth axis): after a long session, do the rail's
 * lists still tell the truth? 5zorro (2026-10-24): *"to see if accumulated cruft happens such that
 * the flyout bar become unreliable and needs a pruning"*. Pure: given the lists the shell holds and
 * what ERPNext says about each record, name every row that is cruft and the rule it breaks. A rule
 * that a long session breaks is a pruning rule to write down (HANDOFF), not a one-off delete.
 */
import { navRecordOf, vanishedKey } from "./nav-prune.js";

/** `nav-state.json` above this is growth nothing bounds (the lists are capped: Drafts 100, Submitted 25). */
export const NAV_STATE_MAX_BYTES = 64 * 1024;

/**
 * @typedef {{ rule: string, list: string, row: string, why: string }} Cruft
 * @param {{
 *   shelved?: Array<{ doctypeKey?: string, name?: string, route?: string }>,
 *   recent?: Array<{ route?: string }>,
 *   submitted?: Array<{ doctypeKey?: string, name?: string, route?: string }>,
 *   docstatus?: Map<string, number|null>,  vanishedKey(doctypeKey, name) → docstatus; null = gone
 *   atHome?: boolean,
 *   peekStack?: object|null,
 *   parked?: object|null,
 *   navStateBytes?: number,
 *   erpBase?: string,
 * }} s
 * @returns {Cruft[]}
 */
export function cruftFindings(s) {
  const out = [];
  const status = s.docstatus || new Map();
  const statusOf = (e) => {
    const r = navRecordOf(e, s.erpBase);
    if (!r) return { r: null, st: undefined };
    const k = vanishedKey(r.doctypeKey, r.name);
    return { r, st: status.has(k) ? status.get(k) : undefined };
  };
  const label = (r, e) => (r ? `${r.doctypeKey}/${r.name}` : String((e && e.route) || "?"));

  const dups = (list, name, keyOf) => {
    const seen = new Set();
    for (const e of list || []) {
      const k = keyOf(e);
      if (!k) continue;
      if (seen.has(k)) out.push({ rule: `${name}-once`, list: name, row: k, why: "listed twice" });
      seen.add(k);
    }
  };

  for (const e of s.shelved || []) {
    const { r, st } = statusOf(e);
    if (!r || st === undefined) continue;
    if (st === null) out.push({ rule: "drafts-exist", list: "drafts", row: label(r, e), why: "deleted in ERPNext, still on the Drafts list" });
    else if (st !== 0) out.push({ rule: "drafts-are-drafts", list: "drafts", row: label(r, e), why: st === 1 ? "submitted, still on the Drafts list" : "cancelled, still on the Drafts list" });
  }
  dups(s.shelved, "drafts", (e) => (e && e.doctypeKey && e.name ? `${e.doctypeKey}/${e.name}` : ""));

  for (const e of s.recent || []) {
    const { r, st } = statusOf(e);
    if (r && st === null) out.push({ rule: "recent-exist", list: "recent", row: label(r, e), why: "deleted in ERPNext, still a Recent row" });
  }
  dups(s.recent, "recent", (e) => String((e && e.route) || "").replace(/[?#].*$/, ""));

  for (const e of s.submitted || []) {
    const { r, st } = statusOf(e);
    if (!r || st === undefined) continue;
    if (st === null) out.push({ rule: "submitted-exist", list: "submitted", row: label(r, e), why: "deleted in ERPNext, still on the Submitted list" });
  }
  dups(s.submitted, "submitted", (e) => (e && e.doctypeKey && e.name ? `${e.doctypeKey}/${e.name}` : ""));

  if (s.atHome && s.peekStack) out.push({ rule: "home-no-peek", list: "peek", row: "peek stack", why: "a peek is still open at Home" });
  if (s.atHome && s.parked) out.push({ rule: "home-no-park", list: "park", row: "parked document", why: "a document is still parked at Home" });
  if (Number(s.navStateBytes) > NAV_STATE_MAX_BYTES) {
    out.push({ rule: "nav-state-bounded", list: "nav-state.json", row: `${s.navStateBytes} bytes`, why: `over ${NAV_STATE_MAX_BYTES} bytes` });
  }
  return out;
}

/** One line per check the ongoing probe prints; `nav:check` reads them back. */
export const CRUFT_PREFIX = "NAVCRUFT ";

/**
 * @param {string} label when the check ran ("after the day", "after a restart")
 * @param {Cruft[]} found
 * @param {Record<string, number>} [sizes] how long each list was
 */
export function cruftLine(label, found, sizes = {}) {
  return CRUFT_PREFIX + JSON.stringify({ label, sizes, found });
}

/**
 * @param {string} log
 * @returns {Array<{ label: string, sizes: Record<string, number>, found: Cruft[] }>}
 */
export function parseCruftLines(log) {
  const out = [];
  for (const line of String(log || "").split(/\r?\n/)) {
    const at = line.indexOf(CRUFT_PREFIX);
    if (at < 0) continue;
    try {
      const r = JSON.parse(line.slice(at + CRUFT_PREFIX.length));
      if (r && r.label) out.push({ label: r.label, sizes: r.sizes || {}, found: Array.isArray(r.found) ? r.found : [] });
    } catch {
      /* torn line */
    }
  }
  return out;
}

/** @param {ReturnType<typeof parseCruftLines>} checks */
export function cruftMarkdown(checks) {
  if (!checks.length) return "";
  const lines = ["### Cruft after a long session", ""];
  for (const c of checks) {
    const sizes = Object.entries(c.sizes).map(([k, v]) => `${k} ${v}`).join(", ");
    lines.push(`- **${c.label}** (${sizes || "—"}): ${c.found.length ? `${c.found.length} finding(s)` : "clean"}`);
    for (const f of c.found) lines.push(`  - \`${f.rule}\` ${f.row} — ${f.why}`);
  }
  return lines.join("\n");
}
