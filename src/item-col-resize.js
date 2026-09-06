/**
 * Item-grid column sizing + drag-resize (Packet T step C) — DOM side.
 *
 * All arithmetic lives in `item-table-layout.js`; this module only reads the
 * table, measures text, and writes `<col>` widths. It is deliberately thin so
 * the interesting behaviour stays inside the Layer-1 unit gate.
 *
 * Why a generated colgroup: Bill's markup ships a static one, but PO/IR's items
 * table has none at all — and with `table-layout: fixed` that means every
 * column gets an identical share regardless of what is in it.
 */

import {
  colRuleFor,
  defaultTableStorage,
  distributeColWidths,
  draggedColWidthPx,
  readColWidthPrefs,
  writeColWidthPref,
} from "./item-table-layout.js";

/** Reused across calls; creating a canvas per repaint is pure waste. */
let measureCanvasCtx = null;

/**
 * @param {Element|null} sampleEl element whose font the measurements should use
 * @returns {(text: unknown) => number}
 */
function textMeasurer(sampleEl) {
  try {
    if (!measureCanvasCtx) {
      measureCanvasCtx = document.createElement("canvas").getContext("2d");
    }
    const ctx = measureCanvasCtx;
    if (!ctx || !sampleEl) return () => 0;
    const cs = getComputedStyle(sampleEl);
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    return (text) => {
      try {
        return ctx.measureText(String(text ?? "")).width;
      } catch {
        return 0;
      }
    };
  } catch {
    return () => 0;
  }
}

/**
 * Stable per-column key. Both row builders already emit `th[data-sort]`; the
 * trailing actions header has none, and a label slug is the fallback for the
 * unsorted PO/IR branch.
 *
 * @param {HTMLElement} th
 * @param {number} index
 * @param {number} count
 * @returns {string}
 */
function colKeyFor(th, index, count) {
  // data-col-key is authoritative: the PO/IR "no sortable headers" branch emits
  // no data-sort at all, and without a key there the column falls back to the
  // generic rule -- which silently costs Description its `flex` and leaves the
  // bleed full of dead space.
  const explicit = th.getAttribute("data-col-key");
  if (explicit) return explicit;
  const sort = th.getAttribute("data-sort");
  if (sort) return sort;
  if (index === count - 1) return "__action";
  const label = (th.textContent || "").trim().toLowerCase().replace(/\s+/g, "-");
  return label ? `col-${label}` : `__col${index}`;
}

/**
 * `colRuleFor` speaks minPx/maxPx (it describes a column); the clamp helpers
 * speak min/max (they describe a bound). Translating in one place stops a drag
 * from silently ignoring the column's own ceiling.
 *
 * @param {string} key
 * @returns {{ min: number, max: number|undefined }}
 */
function boundsFor(key) {
  const rule = colRuleFor(key);
  return { min: rule.minPx, max: rule.maxPx };
}

/**
 * @param {HTMLTableElement} table
 * @returns {{ th: HTMLElement, key: string }[]}
 */
function headerCells(table) {
  const row = table.querySelector("thead tr");
  if (!row) return [];
  const ths = /** @type {HTMLElement[]} */ ([...row.querySelectorAll("th")]);
  return ths.map((th, i) => ({ th, key: colKeyFor(th, i, ths.length) }));
}

/**
 * Create or reconcile the `<colgroup>`, preserving Bill's existing `<col>`
 * elements (and therefore their `c-*` classes) when the count already matches.
 *
 * @param {HTMLTableElement} table
 * @param {string[]} keys
 * @returns {HTMLElement[]} the `<col>` elements, in order
 */
function ensureColgroup(table, keys) {
  let cg = table.querySelector("colgroup");
  if (!cg) {
    cg = document.createElement("colgroup");
    table.insertBefore(cg, table.firstChild);
  }
  let cols = [...cg.querySelectorAll("col")];
  if (cols.length !== keys.length) {
    cg.innerHTML = keys.map(() => "<col />").join("");
    cols = [...cg.querySelectorAll("col")];
  }
  cols.forEach((c, i) => {
    if (keys[i]) c.setAttribute("data-col-key", keys[i]);
  });
  return /** @type {HTMLElement[]} */ (cols);
}

/**
 * Widest rendered text per column, header included.
 *
 * @param {HTMLTableElement} table
 * @param {{ th: HTMLElement, key: string }[]} heads
 * @returns {{ demands: Record<string, number>, headers: Record<string, number> }}
 */
function measureDemands(table, heads) {
  /** @type {Record<string, number>} */
  const demands = {};
  /** @type {Record<string, number>} */
  const headers = {};
  const body = table.querySelector("tbody");
  const sample = body?.querySelector("td") || heads[0]?.th || null;
  const measureCell = textMeasurer(sample);
  const measureHead = textMeasurer(heads[0]?.th || sample);

  heads.forEach(({ th, key }) => {
    const label = (th.textContent || "").trim();
    // An empty header (the actions column) has nothing to stay wide for --
    // giving it the padding allowance anyway just steals width from Description.
    // Sortable labels carry an arrow; pad rather than measure the glyph.
    headers[key] = label ? measureHead(label) + 14 : 0;
    demands[key] = headers[key];
  });

  for (const row of body ? [...body.querySelectorAll("tr")] : []) {
    const cells = [...row.children];
    heads.forEach(({ key }, i) => {
      const cell = cells[i];
      if (!cell) return;
      const text = cell.querySelector(".cell-text");
      const input = cell.querySelector("input");
      const value = text
        ? text.textContent || ""
        : input
          ? /** @type {HTMLInputElement} */ (input).value || ""
          : cell.textContent || "";
      const px = measureCell(value.trim());
      if (px > (demands[key] || 0)) demands[key] = px;
    });
  }
  return { demands, headers };
}

/**
 * Measure, distribute and apply column widths. Honours user overrides, which
 * are never recomputed away.
 *
 * @param {HTMLTableElement|null} table
 * @param {{ tableKey: string, storage?: object|null, availablePx?: number|null }} opts
 * @returns {Record<string, number>} applied widths
 */
export function autoSizeItemColumns(table, opts) {
  if (!table || !opts || !opts.tableKey) return {};
  const heads = headerCells(table);
  if (heads.length === 0) return {};

  const storage = opts.storage !== undefined ? opts.storage : defaultTableStorage();
  const overrides = readColWidthPrefs(storage, opts.tableKey);
  const { demands, headers } = measureDemands(table, heads);

  // Cell padding (6px each side) + the text layer's own 6px each side.
  const CELL_CHROME_PX = 24;
  const cols = heads.map(({ key }) => {
    const rule = colRuleFor(key);
    // A fixed column is sized by its format, not its data -- but it must still
    // be able to show its own header. "PO line" in a 54px column reads
    // "PO LI...", which is precisely the unreadability this packet exists to
    // remove, so the header sets the floor.
    const headerPx = (headers[key] || 0) + CELL_CHROME_PX;
    const fixedPx =
      rule.fixedPx != null ? Math.max(rule.fixedPx, headerPx) : undefined;
    return {
      key,
      demandPx: (demands[key] || 0) + CELL_CHROME_PX,
      minPx: rule.minPx,
      maxPx: rule.maxPx,
      fixedPx,
      flex: rule.flex,
    };
  });

  let available = opts.availablePx;
  if (available == null) {
    const host = table.parentElement;
    available = host ? host.clientWidth : null;
  }

  const widths = distributeColWidths(cols, available, overrides);
  const colEls = ensureColgroup(table, heads.map((h) => h.key));
  colEls.forEach((c, i) => {
    const key = heads[i]?.key;
    const px = key ? widths[key] : null;
    if (px) c.style.width = `${px}px`;
  });
  return widths;
}

/**
 * Mount drag handles on the header cells. Idempotent — safe to call after every
 * repaint, which is when the header row is rebuilt.
 *
 * @param {HTMLTableElement|null} table
 * @param {{
 *   tableKey: string,
 *   storage?: object|null,
 *   onChange?: () => void,
 * }} opts
 */
export function mountColResize(table, opts) {
  if (!table || !opts || !opts.tableKey) return;
  const heads = headerCells(table);
  if (heads.length === 0) return;
  const storage = opts.storage !== undefined ? opts.storage : defaultTableStorage();

  heads.forEach(({ th, key }, index) => {
    // The actions column has nothing to widen.
    if (key === "__action" && index === heads.length - 1) return;
    if (th.querySelector(".col-resize")) return;

    const handle = document.createElement("span");
    handle.className = "col-resize";
    handle.setAttribute("data-col-resize", key);
    handle.title = "Drag to resize · double-click to fit contents";
    th.appendChild(handle);

    let startX = 0;
    let startWidth = 0;
    let dragging = false;

    const colEl = () =>
      table.querySelector(`colgroup col[data-col-key="${CSS.escape(key)}"]`);

    handle.addEventListener("pointerdown", (ev) => {
      const cell = th.getBoundingClientRect();
      startX = ev.clientX;
      startWidth = cell.width;
      dragging = true;
      try {
        handle.setPointerCapture(ev.pointerId);
      } catch {
        /* capture is an optimisation, not a requirement */
      }
      // Stop the header's sort click from firing on mouse-up.
      ev.preventDefault();
      ev.stopPropagation();
    });

    handle.addEventListener("pointermove", (ev) => {
      if (!dragging) return;
      const next = draggedColWidthPx(startWidth, ev.clientX - startX, boundsFor(key));
      if (next == null) return;
      const col = colEl();
      if (col) /** @type {HTMLElement} */ (col).style.width = `${next}px`;
    });

    const endDrag = (ev) => {
      if (!dragging) return;
      dragging = false;
      try {
        handle.releasePointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
      const col = colEl();
      const px = col ? parseFloat(/** @type {HTMLElement} */ (col).style.width) : NaN;
      if (Number.isFinite(px)) {
        writeColWidthPref(storage, opts.tableKey, key, px);
        opts.onChange?.();
      }
    };
    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);

    // Double-click clears the override, handing the column back to auto-fit.
    handle.addEventListener("dblclick", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      writeColWidthPref(storage, opts.tableKey, key, null);
      const col = colEl();
      if (col) /** @type {HTMLElement} */ (col).style.width = "";
      opts.onChange?.();
    });

    // A click that reaches the th would re-sort the grid.
    handle.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
    });
  });
}
