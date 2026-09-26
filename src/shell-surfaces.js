/**
 * The shell's pages — one row per `surfaceMode` (implementation-plan-2026-09-26, stage F2).
 *
 * Before this table each new page meant hand-edits in several places: its line in `place()`,
 * a clause in `isShellDocSurface()`, its own copy of the route-claim guard. The toolbar got the
 * lens wrong three times because one of those lists was missed (G9, G10). Now a page is a row.
 *
 * - `view`     which WebContentsView paints it (main.js variable name)
 * - `docLens`  the toolbar should show the Document-skin lens as selected
 * - `ownsRoute` the page is a local file that claims its own ERP address; the ERP view hidden
 *              behind it is not what the clerk sees, so that view's address changes must not
 *              move `currentRoute` or Recent. (The Doc form is *not* such a page: the hidden ERP
 *              form is its document, and a save renaming `new-…` to its real name must reach
 *              the shell.)
 */

/** @typedef {{ view: string, docLens: boolean, ownsRoute: boolean }} ShellSurface */

/** @type {Readonly<Record<string, ShellSurface>>} */
export const SHELL_SURFACES = Object.freeze({
  home: { view: "home", docLens: false, ownsRoute: false },
  doc: { view: "docForm", docLens: true, ownsRoute: false },
  erp: { view: "erp", docLens: false, ownsRoute: false },
  "pay-outstanding": { view: "payOutstanding", docLens: true, ownsRoute: true },
  "payment-doc": { view: "paymentDoc", docLens: true, ownsRoute: true },
  "find-doc": { view: "findDoc", docLens: true, ownsRoute: true },
});

/** @param {string} mode */
export function shellSurface(mode) {
  return Object.prototype.hasOwnProperty.call(SHELL_SURFACES, mode) ? SHELL_SURFACES[mode] : null;
}

/** Is this page the Doc lens, as far as the toolbar is concerned? @param {string} mode */
export function surfaceIsDocLens(mode) {
  return !!shellSurface(mode)?.docLens;
}

/** Does this page claim its own address (so the hidden ERP view must not)? @param {string} mode */
export function surfaceOwnsRoute(mode) {
  return !!shellSurface(mode)?.ownsRoute;
}

/**
 * Where each view goes for the current page: the page's own view gets the main area, every
 * other view is parked off-screen.
 * @param {string} mode current surfaceMode
 * @returns {Array<{ view: string, shown: boolean }>}
 */
export function surfacePlacement(mode) {
  return Object.entries(SHELL_SURFACES).map(([m, s]) => ({ view: s.view, shown: m === mode }));
}
