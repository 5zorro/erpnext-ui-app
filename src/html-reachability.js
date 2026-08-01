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
});

/**
 * Doc / Home surfaces wired from main createWindow + lens index (not Home tile labels).
 * @type {Readonly<Record<string, string>>}
 */
export const PRODUCTION_HTML_ENTRYPOINTS = Object.freeze({
  "home.html": "Doc Workflow Home (Home button / default Doc surface)",
  "bill.html": "DOC_SKIN_INDEX bill → Purchase Invoice Doc skin",
  "doc-form.html": "DOC_SKIN_INDEX po + receipt → shared Doc form shell",
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
