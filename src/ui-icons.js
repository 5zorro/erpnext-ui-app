/**
 * Inline SVG icons for Electron UI chrome (SSoT — no Unicode emoji / font dependency).
 * Works on Windows, WSL/Linux, and macOS without Noto Color Emoji or Segoe UI Emoji.
 */

/** @typedef {keyof typeof ICON_BODIES} UiIconName */

const ICON_BODIES = {
  idle: '<circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>',
  partial:
    '<path d="M12 2a10 10 0 0 1 0 20V2z" fill="currentColor" stroke="none" opacity="0.35"/><circle cx="12" cy="12" r="10"/>',
  "not-equal": '<path d="M5 9h14M5 15h14M9 5l6 14"/>',
  copy: '<rect x="8" y="8" width="12" height="14" rx="1.5"/><path d="M6 16H5a1.5 1.5 0 0 1-1.5-1.5v-11A1.5 1.5 0 0 1 5 2h9A1.5 1.5 0 0 1 15.5 3.5V5"/>',
  table:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  paperclip:
    '<path d="M16.5 6v11.5a4 4 0 0 1-8 0V5a2.5 2.5 0 0 1 5 0v10.5a1.5 1.5 0 0 1-3 0V6"/>',
  bank: '<path d="M3 10h18M5 10V20M9 10V20M15 10V20M19 10V20M4 20h16M12 3l9 5H3l9-5z"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  "chevron-up": '<path d="m18 15-6-6-6 6"/>',
  "chevron-picker": '<path d="m6 9 6 6 6-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  checkbox: '<rect x="4" y="4" width="16" height="16" rx="2"/>',
  "checkbox-checked":
    '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="m9 12 2 2 4-4"/>',
  receipt:
    '<path d="M14 2H6a2 2 0 0 0-2 2v16l3-2 3 2 3-2 3 2 3-2V8z"/><path d="M14 2v6h6"/>',
  "wallet-cash":
    '<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20M16 14h.01"/>',
  package: '<path d="M12 22 2 7l10-5 10 5-10 15z"/><path d="M2 7h20M12 2v20"/>',
  "inbox-down": '<path d="M22 12h-6l-2 3H10l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  building: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"/><path d="M6 12H4M10 12H8M14 12h-2M18 12h-2M6 16H4M10 16H8M14 16h-2M18 16h-2M6 20H4M10 20H8M14 20h-2M18 20h-2M10 6h4"/>',
  "file-edit":
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 18v-6M9 15h6"/>',
  "clipboard-list":
    '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h6"/>',
  coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4M7 10h4"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  "credit-card":
    '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  books: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  tag: '<path d="M12 2 2 12v10h10L22 12 12 2z"/><circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none"/>',
  notebook:
    '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M8 7h8M8 11h8"/>',
  "chart-line": '<path d="M3 3v18h18"/><path d="m7 14 4-4 4 4 5-6"/>',
  "chart-bar": '<path d="M3 3v18h18"/><path d="M7 16V8M12 16V5M17 16v-6"/>',
  refresh: '<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  home: '<path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"/>',
  key: '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3"/>',
};

/** Home tile id → icon name (SSoT with {@link HOME_GROUPS} ids). */
export const HOME_TILE_ICON = Object.freeze({
  "bill-new": "receipt",
  "pay-bills": "wallet-cash",
  "po-new": "package",
  "receipt-new": "inbox-down",
  vendors: "building",
  "estimate-new": "file-edit",
  "so-new": "clipboard-list",
  "invoice-new": "receipt",
  "receive-pay": "coins",
  customers: "user",
  employees: "users",
  "timesheet-new": "clock",
  payroll: "credit-card",
  coa: "books",
  items: "tag",
  "je-new": "notebook",
  pnl: "chart-line",
  reconcile: "refresh",
  checks: "pen",
  "bank-tx": "bank",
  bs: "chart-bar",
  desk: "monitor",
  "site-root": "home",
  login: "key",
});

/**
 * @param {string|null|undefined} name
 * @param {number} [size=14]
 * @returns {string}
 */
export function uiIconSvg(name, size = 14) {
  const key = name != null ? String(name) : "idle";
  const body = ICON_BODIES[/** @type {UiIconName} */ (key)] || ICON_BODIES.idle;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/**
 * @param {string|null|undefined} name
 * @param {{ size?: number, className?: string }} [opts]
 * @returns {string}
 */
export function uiIconHtml(name, opts = {}) {
  const size = opts.size ?? 14;
  const cls = opts.className ? ` ui-ico--${opts.className}` : "";
  return `<span class="ui-ico${cls}" aria-hidden="true">${uiIconSvg(name, size)}</span>`;
}

/** @param {string} tileId @param {number} [size=20] */
export function homeTileIconHtml(tileId, size = 20) {
  const icon = HOME_TILE_ICON[tileId] || "idle";
  return uiIconHtml(icon, { size });
}

/** Copy-table control: clipboard + spreadsheet. */
export function copyTableIconHtml() {
  return `<span class="ui-ico ui-ico--calc">${uiIconSvg("copy")}${uiIconSvg("table")}</span>`;
}

/** Copy-total / copy-ref control: clipboard only. */
export function copyTotalIconHtml() {
  return uiIconHtml("copy");
}

/**
 * @param {string[]} tileIds
 * @returns {string[]}
 */
export function missingHomeTileIcons(tileIds) {
  return tileIds.filter((id) => !HOME_TILE_ICON[id]);
}
