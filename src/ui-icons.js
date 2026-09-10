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
  // "Peek" — look at a document without leaving where you are (OI-112's soft-peek idea, and
  // the Pay Outstanding flow's per-invoice peek button, 2026-09-08).
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
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
  "mr-new": "clipboard-list",
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
 * Home group header glyphs — same associations vanilla Desk uses for its module
 * icons (erpnext/public/icons/desktop_icons, frappe/.../desktop_icons), so a Home
 * group visually agrees with the underlying ERP module it groups (dogfood request,
 * 2026-09-06). Solid glyphs in their native 54x54 viewBox, fill=currentColor (no
 * stroke) — a different shape language from ICON_BODIES above, so kept separate
 * rather than force-fit into the 24x24 stroke system.
 */
const GROUP_ICON_BODIES = {
  buying: '<path d="M24.7712 13.8613C26.0005 13.8615 27.1706 14.3903 27.9825 15.3132L40.0005 28.9803C41.5791 30.7757 41.3797 33.5158 39.5578 35.0637L32.5688 41C30.8651 42.4472 28.3344 42.3391 26.7612 40.7511L14.3037 28.175C13.5108 27.3742 13.0658 26.2929 13.0657 25.1659V18.1386C13.0657 15.7763 14.9807 13.8613 17.3429 13.8613H24.7712ZM22.2133 19.3599V22.7817H18.4941V19.3599H22.2133ZM16.4875 25.1659C16.4876 25.3911 16.5763 25.6073 16.7347 25.7674L30.1746 38.6692L37.8736 31.8257C37.8736 31.8257 37.3339 31.3292 37.0182 30.9702L25.4128 17.5738C25.2505 17.3893 25.017 17.2833 24.7712 17.2831H17.3429C16.8705 17.2831 16.4875 17.6661 16.4875 18.1386V25.1659Z"/>',
  selling: '<path d="M16.4999 37C17.3749 37 16.8916 37 17.3749 37H36.6249C37.1081 37 36.6249 37 37.4999 37V25.625H40.9999V36.125C40.9999 38.5412 39.0411 40.5 36.6249 40.5H17.3749C14.9586 40.5 12.9999 38.5412 12.9999 36.125V25.625H16.4999V37ZM30.4999 35.25H23.4999V31.75H30.4999V35.25ZM36.6249 12.5C39.0411 12.5 40.9999 14.4588 40.9999 16.875V22.2258L39.754 23.0872C38.1777 24.1851 35.514 24.1662 33.9572 23.0291C32.4198 21.9116 30.3569 21.8729 28.7806 22.9316L28.391 23.2051C26.8537 24.2441 24.8697 24.2441 23.3324 23.2051L22.9427 22.9316C21.3667 21.873 20.3406 21.97 18.8036 23.0872C17.2468 24.2243 15.822 24.1851 14.2457 23.0872L12.9999 22.2258V16.875C12.9999 14.4588 14.9586 12.5 17.3749 12.5H36.6249ZM16.4999 16C16.4999 16 16.4999 16.3918 16.4999 16.875V19.5H37.4999V16.875C37.4999 16.3918 37.4999 16 37.4999 16H16.4999Z"/>',
  banking: '<path d="M26.1417 11.7727C26.7723 11.4588 27.5346 11.512 28.1211 11.9309L41.6211 21.5737C42.3033 22.0611 42.5926 22.9337 42.3368 23.7321C42.0806 24.5299 41.3385 25.0712 40.5005 25.0712H38.5719V36.6426L41.4645 36.6427C42.5297 36.6427 42.429 37.506 42.429 38.5712C42.429 39.6362 42.5296 40.4999 41.4645 40.4999L12.536 40.4997C11.4709 40.4997 11.572 39.6362 11.5719 38.5712C11.5719 37.506 11.4709 36.6426 12.536 36.6426H15.429V25.0712H13.5005C12.6625 25.0712 11.9204 24.5299 11.6642 23.7321C11.4083 22.9337 11.6977 22.0611 12.3799 21.5737L25.8799 11.9309L26.1417 11.7727ZM19.2862 36.6426H25.0719V25.0712H19.2862V36.6426ZM28.929 36.6426H34.7148V25.0712H28.929V36.6426ZM19.5178 21.214H34.4831L27.0005 15.869L19.5178 21.214Z"/>',
  accounting: '<path d="M36.8127 12C39.4016 12 41.5002 14.0987 41.5002 16.6875V37.3125C41.5002 39.9013 39.4016 42 36.8127 42H16.1877C13.5989 42 11.5002 39.9013 11.5002 37.3125V16.6875C11.5002 14.0987 13.5989 12 16.1877 12H36.8127ZM15.2502 38.25H37.7502V25.125H15.2502V38.25ZM22.7502 36.375H19.0002V32.625H22.7502V36.375ZM28.3752 36.375H24.6252V32.625H28.3752V36.375ZM34.0002 36.375H30.2502V32.625H34.0002V36.375ZM22.7502 30.75H19.0002V27H22.7502V30.75ZM28.3752 30.75H24.6252V27H28.3752V30.75ZM34.0002 30.75H30.2502V27H34.0002V30.75ZM15.2502 21.375H37.7502V15.75H15.2502V21.375ZM35.8752 20.4375H30.2502V16.6875H35.8752V20.4375Z"/>',
  users: '<path d="M25.6174 26.9385C29.6812 26.7246 34.1134 27.7323 38.8809 30.4692C40.2387 31.2487 40.9997 32.6949 41 34.1812V36.5361C40.9996 38.9519 39.0408 40.9109 36.625 40.9111H17.375C14.9589 40.9111 13.0001 38.9522 13 36.5361V34.1008C13 32.6953 13.6788 31.3042 14.95 30.5017C18.0036 28.5744 21.5652 27.1519 25.6174 26.9385ZM25.802 30.4333C22.4795 30.6083 19.4903 31.7749 16.8179 33.4617C16.6439 33.5717 16.5 33.7973 16.5 34.1008V37.4111C17.375 37.4111 16.8918 37.4111 17.375 37.4111H36.625C37.108 37.4111 37.5 37.4111 37.5 37.4111V34.1812C37.4997 33.8682 37.3404 33.6226 37.1377 33.5061C32.8817 31.0628 29.1133 30.259 25.802 30.4333ZM27 11.1611C30.8659 11.1611 33.9999 14.2952 34 18.1611C34 22.0271 30.866 25.1611 27 25.1611C23.134 25.1611 20 22.0271 20 18.1611C20.0001 14.2952 23.1341 11.1611 27 11.1611ZM27 14.6611C25.0671 14.6611 23.5001 16.2282 23.5 18.1611C23.5 20.0941 25.067 21.6611 27 21.6611C28.933 21.6611 30.5 20.0941 30.5 18.1611C30.4999 16.2282 28.9329 14.6611 27 14.6611Z"/>',
  system: '<path d="M37 17.375C37 16.8918 37 16.5 37 16.5H16C16 16.5 16 16.8918 16 17.375V29.625C16 30.1082 16 29.625 16 30.5H37C37 30.5 37 30.1082 37 29.625V17.375ZM40.5 29.625C40.5 32.0412 38.5412 34 36.125 34H28.25V37.5H37V41H16V37.5H24.75V34H16.875C14.4588 34 12.5 32.0412 12.5 29.625V17.375C12.5 14.9588 14.4588 13 16.875 13H36.125C38.5412 13 40.5 14.9588 40.5 17.375V29.625Z"/>',
};

/** Home group id -> header glyph name (SSoT with {@link HOME_GROUPS} ids). */
export const HOME_GROUP_ICON = Object.freeze({
  vendors: "buying",
  customers: "selling",
  employees: "users",
  company: "accounting",
  banking: "banking",
  shell: "system",
});

/**
 * @param {string|null|undefined} name
 * @param {number} [size=16]
 * @returns {string}
 */
export function groupIconSvg(name, size = 16) {
  const body = name != null ? GROUP_ICON_BODIES[String(name)] : null;
  if (!body) return "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 54 54" fill="currentColor" aria-hidden="true">${body}</svg>`;
}

/**
 * @param {string|null|undefined} groupId
 * @param {number} [size=16]
 * @returns {string}
 */
export function homeGroupIconHtml(groupId, size = 16) {
  const name = groupId != null ? HOME_GROUP_ICON[String(groupId)] : null;
  const svg = name ? groupIconSvg(name, size) : "";
  return svg ? `<span class="ui-ico ui-ico--group" aria-hidden="true">${svg}</span>` : "";
}

/**
 * @param {string[]} groupIds
 * @returns {string[]}
 */
export function missingHomeGroupIcons(groupIds) {
  return groupIds.filter((id) => !HOME_GROUP_ICON[id]);
}

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
