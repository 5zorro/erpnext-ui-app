/**
 * The open link-picker dropdowns on one page, and the page-wide listeners they share.
 *
 * Review 10-19 R5-1: each picker used to add its own window `resize`, window `scroll` (capture)
 * and document `click` listener and never removed them. The line tables are rebuilt on every
 * paint, so a day of Bills piled up thousands of listeners, each holding a thrown-away row.
 * Now a page has one of each, installed with the first dropdown that opens, and they walk only
 * the dropdowns that are open — a closed or repainted-away one drops out on the next event.
 *
 * Pure apart from the `target` it is handed: no DOM globals are read here.
 */

/**
 * @typedef {{
 *   wrap: { isConnected: boolean, contains: (node: unknown) => boolean },
 *   dd: { hidden: boolean },
 *   place: () => void,
 * }} OpenPicker
 */

/**
 * @param {{ addEventListener: Function }|null} [win]
 * @param {{ addEventListener: Function }|null} [doc]
 */
export function createOpenPickerSet(win, doc) {
  /** @type {Set<OpenPicker>} */
  const open = new Set();
  let installed = false;

  /** The pickers still open and still on the page; drops the rest. */
  function live() {
    for (const p of open) {
      if (!p.wrap.isConnected || p.dd.hidden) open.delete(p);
    }
    return [...open];
  }

  function placeAll() {
    for (const p of live()) p.place();
  }

  /** @param {{ target?: unknown }} ev */
  function closeOutside(ev) {
    for (const p of live()) {
      if (!p.wrap.contains(ev && ev.target)) p.dd.hidden = true;
    }
  }

  function install() {
    if (installed) return;
    installed = true;
    if (win) {
      win.addEventListener("resize", placeAll);
      // Any scroller (the line table, the page) moves the box; the dropdown follows it.
      win.addEventListener("scroll", placeAll, true);
    }
    if (doc) doc.addEventListener("click", closeOutside);
  }

  return {
    /** @param {OpenPicker} p */
    opened(p) {
      install();
      open.add(p);
    },
    size: () => live().length,
    placeAll,
    closeOutside,
  };
}
