/**
 * Inline SVG icons for calculator copy actions (no emoji / font dependency).
 * Clipboard = copy total; clipboard+grid = copy table.
 */

const ATTR =
  'xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

/** Two stacked papers (clipboard / copy). */
export const ICON_COPY =
  `<svg ${ATTR}><rect x="8" y="8" width="12" height="14" rx="1.5"/><path d="M6 16H5a1.5 1.5 0 0 1-1.5-1.5v-11A1.5 1.5 0 0 1 5 2h9A1.5 1.5 0 0 1 15.5 3.5V5"/></svg>`;

/** Spreadsheet / grid. */
export const ICON_TABLE =
  `<svg ${ATTR}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>`;

/**
 * Copy-table control: clipboard + spreadsheet side by side.
 * @returns {string} HTML
 */
export function copyTableIconHtml() {
  return `<span class="calc-ico">${ICON_COPY}${ICON_TABLE}</span>`;
}

/**
 * Copy-total control: clipboard only.
 * @returns {string} HTML
 */
export function copyTotalIconHtml() {
  return `<span class="calc-ico">${ICON_COPY}</span>`;
}
