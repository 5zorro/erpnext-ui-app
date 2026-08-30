/**
 * OI-067 — every production electron/*.html must be reachable or consciously allowlisted.
 * Home tiles open ERP routes (not HTML files); Doc skins load via main.js + DOC_SKIN_INDEX.
 */

/** Shell / flyout HTML that is not a Home tile destination. */
export const PRODUCTION_HTML_ALLOWLIST = Object.freeze({
  "chrome.html": "Top chrome shell (always loaded with the window)",
  "history.html": "Recent / Drafts flyout (left rail)",
  "diagnose-dropdown.html": "Diagnose popover (chrome ERP health)",
  "calc-history-dropdown.html": "Calculator history popover (left-rail Calculator button)",
  "nav-incident-dialog.html": "Fail-loud nav issue note (toolbar Nav issue)",
  "focus-incident-dialog.html": "Fail-loud focus issue note (DB diagnose Focus issue)",
});

/**
 * Doc / Home surfaces wired from main createWindow + lens index (not Home tile labels).
 * @type {Readonly<Record<string, string>>}
 */
export const PRODUCTION_HTML_ENTRYPOINTS = Object.freeze({
  "home.html": "Doc Workflow Home (Home button / default Doc surface)",
  "doc-form.html": "DOC_SKIN_INDEX bill + po + receipt → shared Doc form shell",
});

/** Legacy shells retained for reference; not loaded at runtime (tranche 10). */
export const PRODUCTION_HTML_ALLOWLIST_EXTRA = Object.freeze({
  "bill.html": "Legacy Bill shell — superseded by doc-form.html#bill-shell",
  "bill-shell.fragment.html": "Bill DOM partial included by doc-form.html (tranche 10)",
});

/**
 * @param {string} basename e.g. bill.html
 * @returns {string|null} reason or null if unknown
 */
export function productionHtmlReachReason(basename) {
  const name = String(basename || "").replace(/^.*\//, "");
  return (
    PRODUCTION_HTML_ENTRYPOINTS[name] ||
    PRODUCTION_HTML_ALLOWLIST[name] ||
    PRODUCTION_HTML_ALLOWLIST_EXTRA[name] ||
    null
  );
}

/**
 * @param {string[]} basenames
 * @returns {{ ok: boolean, missing: string[], reasons: Record<string, string> }}
 */
export function auditProductionHtmlReachability(basenames) {
  /** @type {Record<string, string>} */
  const reasons = {};
  /** @type {string[]} */
  const missing = [];
  for (const raw of basenames || []) {
    const name = String(raw || "").replace(/^.*\//, "");
    if (!name.endsWith(".html")) continue;
    const reason = productionHtmlReachReason(name);
    if (reason) reasons[name] = reason;
    else missing.push(name);
  }
  return { ok: missing.length === 0, missing, reasons };
}
