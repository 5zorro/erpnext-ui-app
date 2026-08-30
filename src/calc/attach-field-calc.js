/**
 * DOM attach helper for in-field calc (Bill + PO/IR Doc skins).
 * Pure logic stays in field-calc.js — this only binds listeners + overlay.
 *
 * Layout: vertical footing tape ABOVE the field; hover expands session history
 * upward (scrollable) with per-block copy.
 */
import {
  createFieldCalcState,
  reduceFieldCalc,
  resetFieldCalc,
  commitFieldCalc,
  isCalcEligibleField,
} from "./field-calc.js";
import { calcHistoryTapeOrder } from "./session-history.js";
import { copyTableIconHtml, copyTotalIconHtml, uiIconHtml } from "../ui-icons.js";
import { padDisplayToFooting, stripCalcDisplayPad, footingAlignMetrics, formatAlignedFootingLine } from "./calc-engine.js";

export { calcHistoryTapeOrder } from "./session-history.js";

const CALC_MONO =
  'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/**
 * @param {HTMLElement} el
 * @param {string} align "left"|"right"|"center"|"start"|"end"
 */
function applyTapeTextAlign(el, align) {
  if (!el) return;
  const a = align === "left" || align === "start" || align === "center" ? "left" : "right";
  el.style.textAlign = a;
}

/**
 * @param {HTMLInputElement} inp
 * @returns {"left"|"right"}
 */
function fieldTextAlign(inp) {
  try {
    const a = getComputedStyle(inp).textAlign;
    if (a === "right" || a === "end") return "right";
  } catch {
    /* ignore */
  }
  return "left";
}

/**
 * @param {{
 *   overlay: HTMLElement|null,
 *   exprEl: HTMLElement|null,
 *   resultEl?: HTMLElement|null,
 *   historyEl?: HTMLElement|null,
 *   getHistory?: () => Promise<import("./session-history.js").CalcHistoryEntry[]|null|undefined> | import("./session-history.js").CalcHistoryEntry[],
 *   copyHistory?: (id: string, mode?: string) => Promise<{ ok?: boolean }|null|undefined> | void,
 * }} els
 */
export function createFieldCalcUi(els) {
  const overlay = els.overlay;
  const exprEl = els.exprEl;
  const resultEl = els.resultEl || null;
  const historyEl = els.historyEl || null;

  /** @type {import("./field-calc.js").FieldCalcState} */
  let fieldCalc = createFieldCalcState();
  /** @type {HTMLInputElement|null} */
  let fieldCalcInput = null;
  /** @type {HTMLElement|null} */
  let lastAnchor = null;
  let historyExpanded = false;
  let historyLoading = false;
  /** Keep blur from committing while pointer is on the overlay (copy / scroll). */
  let pointerOnOverlay = false;
  /** @type {HTMLInputElement|null} */
  let monoStyledInput = null;

  function restoreInputCalcStyle() {
    if (!monoStyledInput) return;
    const inp = monoStyledInput;
    monoStyledInput = null;
    if (inp.dataset.calcFontPrev != null) {
      inp.style.fontFamily = inp.dataset.calcFontPrev;
      delete inp.dataset.calcFontPrev;
    } else {
      inp.style.fontFamily = "";
    }
    if (inp.dataset.calcWhiteSpacePrev != null) {
      inp.style.whiteSpace = inp.dataset.calcWhiteSpacePrev;
      delete inp.dataset.calcWhiteSpacePrev;
    } else {
      inp.style.whiteSpace = "";
    }
  }

  /**
   * Monospace + preserve spaces so padded decimals match the tape.
   * @param {HTMLInputElement} inp
   */
  function applyInputCalcStyle(inp) {
    if (!inp) return;
    if (monoStyledInput && monoStyledInput !== inp) restoreInputCalcStyle();
    if (monoStyledInput === inp) return;
    monoStyledInput = inp;
    if (inp.dataset.calcFontPrev == null) {
      inp.dataset.calcFontPrev = inp.style.fontFamily || "";
    }
    if (inp.dataset.calcWhiteSpacePrev == null) {
      inp.dataset.calcWhiteSpacePrev = inp.style.whiteSpace || "";
    }
    inp.style.fontFamily = CALC_MONO;
    inp.style.whiteSpace = "pre";
  }

  function hideHistoryPanel() {
    historyExpanded = false;
    if (historyEl) {
      historyEl.hidden = true;
      historyEl.innerHTML = "";
    }
    if (overlay) overlay.classList.remove("calc-expanded");
  }

  function hideOverlay() {
    pointerOnOverlay = false;
    lastAnchor = null;
    hideHistoryPanel();
    restoreInputCalcStyle();
    if (overlay) {
      overlay.hidden = true;
      overlay.style.maxHeight = "";
      overlay.style.height = "";
      overlay.style.bottom = "";
    }
    if (exprEl) {
      exprEl.textContent = "";
      exprEl.style.textAlign = "";
    }
    if (resultEl) {
      resultEl.textContent = "";
      resultEl.style.textAlign = "";
    }
  }

  /**
   * Position tape to match the field box (left edge + width). Tape/result
   * text-align follows the input so left-aligned Amount Due and right-aligned
   * rate cells both get decimal columns that match the field.
   * @param {HTMLElement} anchor
   */
  function positionOverlay(anchor) {
    if (!overlay || !anchor) return;
    const r = anchor.getBoundingClientRect();
    const gap = 6;
    const topPad = 8;
    const width = Math.max(72, Math.round(r.width));
    overlay.style.left = `${Math.max(0, r.left)}px`;
    overlay.style.width = `${width}px`;
    overlay.style.minWidth = `${width}px`;
    overlay.style.maxWidth = `${width}px`;

    const align =
      anchor instanceof HTMLInputElement || anchor instanceof HTMLTextAreaElement
        ? fieldTextAlign(/** @type {HTMLInputElement} */ (anchor))
        : "right";
    if (exprEl) applyTapeTextAlign(exprEl, align);
    if (resultEl) applyTapeTextAlign(resultEl, align);
    if (historyEl) {
      historyEl.querySelectorAll(".calc-hist-tape, .calc-hist-total, .calc-hist-empty").forEach((node) => {
        applyTapeTextAlign(/** @type {HTMLElement} */ (node), align);
      });
    }

    if (historyExpanded) {
      const bottom = window.innerHeight - r.top + gap;
      const maxH = Math.max(120, r.top - topPad - gap);
      overlay.style.top = "auto";
      overlay.style.bottom = `${bottom}px`;
      overlay.style.maxHeight = `${maxH}px`;
      overlay.classList.add("calc-expanded");
    } else {
      overlay.style.bottom = "";
      overlay.style.maxHeight = "";
      const oh = overlay.offsetHeight || 88;
      let top = r.top - oh - gap;
      if (top < topPad) {
        top = r.bottom + gap;
      }
      overlay.style.top = `${top}px`;
      overlay.classList.remove("calc-expanded");
    }
  }

  /**
   * Compact hover history: digits + icon copy only (source labels stay in the left flyout).
   * @param {import("./session-history.js").CalcHistoryEntry[]} entries
   */
  function renderHistoryBlocks(entries) {
    if (!historyEl) return;
    historyEl.innerHTML = "";
    const ordered = calcHistoryTapeOrder(entries);
    if (!ordered.length) {
      const empty = document.createElement("div");
      empty.className = "calc-hist-empty";
      empty.textContent = "No prior calcs.";
      historyEl.appendChild(empty);
      return;
    }
    for (const e of ordered) {
      const block = document.createElement("div");
      block.className = "calc-hist-block";
      if (e.priorSession) block.classList.add("prior-session");
      block.dataset.id = e.id;

      if (e.footing) {
        const tape = document.createElement("pre");
        tape.className = "calc-hist-tape";
        tape.textContent = e.footing;
        block.appendChild(tape);
      }

      const tot = document.createElement("div");
      tot.className = "calc-hist-total";
      tot.textContent = `= ${e.total}`;
      block.appendChild(tot);

      const actions = document.createElement("div");
      actions.className = "calc-hist-actions";

      const copyTable = document.createElement("button");
      copyTable.type = "button";
      copyTable.className = "calc-hist-copy";
      copyTable.innerHTML = copyTableIconHtml();
      copyTable.title = "Copy table (spreadsheet-friendly)";
      copyTable.setAttribute("aria-label", "Copy table");

      const copyTotal = document.createElement("button");
      copyTotal.type = "button";
      copyTotal.className = "calc-hist-copy";
      copyTotal.innerHTML = copyTotalIconHtml();
      copyTotal.title = "Copy total";
      copyTotal.setAttribute("aria-label", "Copy total");

      const wireCopy = (btn, mode) => {
        const iconHtml = btn.innerHTML;
        btn.addEventListener("mousedown", (ev) => {
          ev.preventDefault();
        });
        btn.addEventListener("click", async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (!els.copyHistory) return;
          try {
            const r = await els.copyHistory(e.id, mode);
            const ok = !!(r && r.ok);
            btn.innerHTML = ok ? uiIconHtml("check", { size: 12 }) : uiIconHtml("alert", { size: 12 });
            setTimeout(() => {
              btn.innerHTML = iconHtml;
            }, 900);
          } catch {
            /* ignore */
          }
          if (fieldCalcInput) {
            try {
              fieldCalcInput.focus({ preventScroll: true });
            } catch {
              /* ignore */
            }
          }
        });
      };
      wireCopy(copyTable, "table");
      wireCopy(copyTotal, "total");
      actions.appendChild(copyTable);
      actions.appendChild(copyTotal);
      block.appendChild(actions);
      historyEl.appendChild(block);
    }
  }

  function scrollHistoryToNewest() {
    if (!historyEl) return;
    historyEl.scrollTop = historyEl.scrollHeight;
  }

  async function expandHistory() {
    if (!overlay || overlay.hidden || !historyEl || historyLoading) return;
    historyExpanded = true;
    historyEl.hidden = false;
    if (els.getHistory) {
      historyLoading = true;
      try {
        const rows = await els.getHistory();
        renderHistoryBlocks(Array.isArray(rows) ? rows : []);
      } catch {
        renderHistoryBlocks([]);
      } finally {
        historyLoading = false;
      }
    } else {
      renderHistoryBlocks([]);
    }
    if (lastAnchor) positionOverlay(lastAnchor);
    // Scroll after expand layout (maxHeight) so newest sits at the bottom.
    requestAnimationFrame(() => {
      scrollHistoryToNewest();
      requestAnimationFrame(scrollHistoryToNewest);
    });
  }

  function collapseHistory() {
    if (!historyExpanded) return;
    hideHistoryPanel();
    if (lastAnchor && !overlay.hidden) positionOverlay(lastAnchor);
  }

  /**
   * Footing tape above the input (flips below only if no room at top).
   * @param {HTMLElement} anchor
   * @param {string} [expression] newline-separated footing
   * @param {string} [preview]
   */
  function showOverlay(anchor, expression, preview) {
    if (!overlay || !exprEl || !anchor) return;
    lastAnchor = anchor;
    exprEl.textContent = expression || "";
    if (resultEl) {
      if (preview != null && preview !== "") {
        const logical = String(expression || "")
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        const bare = stripCalcDisplayPad(preview);
        const metrics = footingAlignMetrics([...logical, bare, `${bare}=`]);
        // Put "=" in the op column so the decimal matches the tape/field.
        resultEl.textContent = formatAlignedFootingLine(`${bare}=`, metrics);
      } else {
        resultEl.textContent = "";
      }
    }
    overlay.hidden = false;
    if (!historyExpanded) hideHistoryPanel();
    positionOverlay(anchor);
  }

  /**
   * Paint mid-calc field value with leading spaces matching the tape.
   * @param {HTMLInputElement} inp
   * @param {string|null|undefined} preview
   * @param {string|null|undefined} expression
   */
  function paintFieldAligned(inp, preview, expression) {
    if (!inp) return;
    applyInputCalcStyle(inp);
    if (preview == null || preview === "") {
      inp.value = "";
      return;
    }
    inp.value = padDisplayToFooting(preview, expression || "");
  }

  function clear(prior) {
    fieldCalc = resetFieldCalc(fieldCalc, prior != null ? prior : fieldCalc.priorValue);
    fieldCalcInput = null;
    hideOverlay();
  }

  if (overlay) {
    overlay.addEventListener("mouseenter", () => {
      pointerOnOverlay = true;
      if (!overlay.hidden && fieldCalc.mode === "active") {
        expandHistory();
      }
    });
    overlay.addEventListener("mouseleave", () => {
      pointerOnOverlay = false;
      collapseHistory();
    });
  }

  /**
   * @param {HTMLInputElement} inp
   * @param {{
   *   kind: string,
   *   onCommit: (value: string) => void | Promise<void>,
   *   isPainting?: () => boolean,
   *   isEditable?: () => boolean,
   *   commitOnIdleBlur?: boolean,
   *   onHistory?: (payload: { footing: string, total: string, fieldKind: string }) => void,
   * }} opts
   */
  function attach(inp, opts) {
    if (!inp || !isCalcEligibleField(opts.kind)) return;

    const painting = () => (opts.isPainting ? !!opts.isPainting() : false);
    const editable = () => (opts.isEditable ? !!opts.isEditable() : true);
    const commitIdleBlur = !!opts.commitOnIdleBlur;

    function noteHistory(footing, total) {
      if (!opts.onHistory || total == null || String(total).trim() === "") return;
      if (footing == null || String(footing).trim() === "") return;
      try {
        opts.onHistory({
          footing: String(footing),
          total: String(total).trim(),
          fieldKind: opts.kind,
        });
      } catch {
        /* ignore */
      }
    }

    inp.addEventListener("focus", () => {
      fieldCalc = createFieldCalcState(inp.value, undefined, { kind: opts.kind });
      fieldCalcInput = inp;
    });

    inp.addEventListener("keydown", (ev) => {
      if (painting() || !editable()) return;
      if (fieldCalcInput !== inp) {
        fieldCalc = createFieldCalcState(inp.value, undefined, { kind: opts.kind });
        fieldCalcInput = inp;
      }
      const r = reduceFieldCalc(fieldCalc, {
        key: ev.key,
        fieldValue: stripCalcDisplayPad(inp.value),
      });
      fieldCalc = r.state;
      if (r.action === "none" || r.action === "ignore") return;

      if (r.action === "prevent") {
        ev.preventDefault();
        ev.stopPropagation();
        paintFieldAligned(inp, r.preview, r.expression);
        showOverlay(inp, r.expression, r.preview);
        return;
      }

      if (r.action === "commit") {
        if (!r.allowDefault) {
          ev.preventDefault();
          ev.stopPropagation();
        }
        hideOverlay();
        fieldCalcInput = null;
        inp.value = r.commitValue != null ? r.commitValue : "";
        noteHistory(r.expression, inp.value);
        Promise.resolve(opts.onCommit(inp.value)).catch(() => {});
        return;
      }

      if (r.action === "cancel") {
        ev.preventDefault();
        ev.stopPropagation();
        hideOverlay();
        fieldCalcInput = null;
        inp.value = r.commitValue != null ? r.commitValue : fieldCalc.priorValue;
      }
    });

    inp.addEventListener("blur", (ev) => {
      if (fieldCalcInput !== inp) return;
      const related = /** @type {Node|null} */ (ev.relatedTarget);
      if (pointerOnOverlay || (overlay && related && overlay.contains(related))) {
        // Moving to / interacting with the tape — stay mid-calc.
        return;
      }
      if (fieldCalc.mode === "active") {
        const r = commitFieldCalc(fieldCalc);
        fieldCalc = r.state;
        hideOverlay();
        fieldCalcInput = null;
        if (r.action === "commit") {
          inp.value = r.commitValue != null ? r.commitValue : "";
          noteHistory(r.expression, inp.value);
          Promise.resolve(opts.onCommit(inp.value)).catch(() => {});
        } else {
          inp.value = fieldCalc.priorValue;
          clear(fieldCalc.priorValue);
        }
      } else if (commitIdleBlur) {
        const value = inp.value;
        fieldCalcInput = null;
        hideOverlay();
        Promise.resolve(opts.onCommit(value)).catch(() => {});
      } else {
        fieldCalcInput = null;
        hideOverlay();
      }
    });
  }

  return {
    attach,
    clear,
    hideOverlay,
    showOverlay,
    /** @returns {import("./field-calc.js").FieldCalcState} */
    getState: () => fieldCalc,
    /** @returns {HTMLInputElement|null} */
    getInput: () => fieldCalcInput,
    setState(next, input) {
      fieldCalc = next;
      if (input !== undefined) fieldCalcInput = input;
    },
  };
}
