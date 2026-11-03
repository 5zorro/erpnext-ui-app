/**
 * A repaint never changes a cell the clerk is typing in, or one they left whose write is still out
 * (5zorro 2026-11-01: "repaints should not affect the inputbox that has been directly or is
 * currently directly edited by the user"; museum OI-202). The line tables rebuild every row from
 * the document a repaint carries; before this, a late reply wiped what was being typed (focus came
 * back, the text and its pick list did not) and put an older value back in a cell whose write had
 * not landed. Used by the item rows (`doc-form-item-rows-ui.js`) and the taxes table
 * (`doc-form-tax-table-ui.js`) on every form.
 *
 * A row carries `data-line` (its name in ERPNext, the same across repaints and re-sorts); a cell
 * carries its row index and field in two attributes the table names.
 */

/** For an attribute value in a selector. */
export function cssEscape(v) {
  const s = String(v ?? "");
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, "\\$&");
}

/**
 * A line's key: its name in ERPNext, or its index when it has none.
 * @param {any} line @param {number} ri
 */
export function lineKeyFor(line, ri) {
  return line && line.name ? String(line.name) : `#${ri}`;
}

/**
 * The writes still out, by line and field. `start` marks one and returns its `landed`, which the
 * write calls when ERPNext has answered (before it repaints), so its answer, or its refusal,
 * shows. A newer write to the same cell owns the mark.
 */
export function createPendingWrites() {
  /** @type {Map<string, { value: any, token: number }>} */
  const marks = new Map();
  let token = 0;
  const keyOf = (lineKey, field) => `${lineKey}\u0000${field}`;
  return {
    /** @param {string} lineKey @param {string} field @param {any} value @returns {() => void} */
    start(lineKey, field, value) {
      const key = keyOf(lineKey, field);
      const mine = ++token;
      marks.set(key, { value, token: mine });
      return () => {
        const w = marks.get(key);
        if (w && w.token === mine) marks.delete(key);
      };
    },
    /** The clerk's value for this cell while its write is out. @returns {{ value: any }|undefined} */
    get(lineKey, field) {
      return marks.get(keyOf(lineKey, field));
    },
  };
}

/**
 * Mark a cell as typed in by the clerk (a value set by code fires no trusted input event), and
 * clear the mark with `committed()` when its write starts.
 * @param {HTMLInputElement} inp
 */
export function trackTyping(inp) {
  if (!inp || !inp.dataset) return { committed: () => {} };
  inp.addEventListener("input", (ev) => {
    if (ev && ev.isTrusted === false) return;
    inp.dataset.typed = "1";
  });
  return {
    committed: () => {
      delete inp.dataset.typed;
    },
  };
}

/**
 * The cell the clerk is typing in, before `container` is rebuilt: its line, row, field, text,
 * caret, and whether its pick list was open or searching. Null when focus is not in one of its
 * cells, nothing was typed there since it was painted or since its write started, or the text is
 * what was painted.
 * @param {any} container
 * @param {{ rowAttr: string, fieldAttr: string }} attrs
 */
export function captureLiveEdit(container, attrs) {
  if (typeof document === "undefined" || !container || typeof container.contains !== "function") return null;
  const a = /** @type {any} */ (document.activeElement);
  if (!a || a.tagName !== "INPUT" || !container.contains(a) || !a.dataset || a.dataset.typed !== "1") return null;
  if (a.type === "checkbox" ? a.checked === a.defaultChecked : a.value === a.defaultValue) return null;
  const tr = a.closest && a.closest("tr[data-line]");
  const wrap = a.closest && a.closest(".link-wrap");
  const dd = wrap && wrap.querySelector(".link-dd");
  return {
    line: tr ? tr.getAttribute("data-line") : null,
    row: a.getAttribute(attrs.rowAttr),
    field: a.getAttribute(attrs.fieldAttr) || "",
    check: a.type === "checkbox",
    value: a.value,
    checked: !!a.checked,
    start: a.selectionStart,
    end: a.selectionEnd,
    listed: a.dataset.searchPending === "1" || !!(dd && !dd.hidden),
  };
}

/**
 * Put the clerk's typing back into the same line's rebuilt cell, with focus and the caret, and
 * restart its pick list search when the list was open or searching. A line the repaint removed
 * takes the typing with it. Returns what happened, for the trail.
 * @param {any} container
 * @param {ReturnType<typeof captureLiveEdit>} live
 * @param {{ rowAttr: string, fieldAttr: string }} attrs
 * @returns {"kept"|"dropped"|null}
 */
export function restoreLiveEdit(container, live, attrs) {
  if (!live || !live.field || !container) return null;
  const sel =
    live.line != null
      ? `tr[data-line="${cssEscape(live.line)}"] input[${attrs.fieldAttr}="${cssEscape(live.field)}"]`
      : `input[${attrs.rowAttr}="${cssEscape(live.row || "")}"][${attrs.fieldAttr}="${cssEscape(live.field)}"]`;
  const inp = /** @type {any} */ (container.querySelector(sel));
  if (!inp) return "dropped";
  if (live.check) inp.checked = live.checked;
  else inp.value = live.value;
  inp.dataset.typed = "1";
  try {
    inp.focus({ preventScroll: true });
    if (!live.check && live.start != null) inp.setSelectionRange(live.start, live.end ?? live.start);
  } catch {
    /* ignore */
  }
  if (live.listed) inp.dispatchEvent(new Event("input", { bubbles: true }));
  else if (!live.check) {
    const cellText = inp.closest && inp.closest("td.cell-wrap")?.querySelector(".cell-text");
    if (cellText) cellText.textContent = inp.value;
  }
  return "kept";
}
