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
  resumeFieldCalc,
  isCalcEligibleField,
} from "./field-calc.js";
import { calcRibbonPlacement } from "./calc-ribbon-place.js";
import { calcHistoryTapeOrder } from "./session-history.js";
import { copyTableIconHtml, copyTotalIconHtml, uiIconHtml } from "../ui-icons.js";
import { padDisplayToFooting, stripCalcDisplayPad, footingAlignMetrics, formatAlignedFootingLine } from "./calc-engine.js";
import {
  DEFAULT_SITE_ROUNDING,
  ROUNDING_CONVENTIONS,
  calcFieldPrecision,
  conventionNote,
  normalizeConvention,
} from "./site-rounding.js";

export { calcHistoryTapeOrder } from "./session-history.js";

const CALC_MONO =
  'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/**
 * A result that had to be rounded keeps its tape up after Enter, with the yellow remainder row,
 * then fades (5zorro 2026-10-25: "stay and fade after about 5 seconds"). Clicks pass through it.
 */
export const CALC_REMAINDER_LINGER_MS = 5000;
export const CALC_REMAINDER_FADE_MS = 700;

/** The clerk's rounding convention, remembered on this computer (a per-person convenience). */
const CONVENTION_KEY = "calc-rounding-convention";

function loadConvention() {
  try {
    return normalizeConvention(window.localStorage.getItem(CONVENTION_KEY));
  } catch {
    return normalizeConvention(null);
  }
}

/** @param {string} id */
function saveConvention(id) {
  try {
    window.localStorage.setItem(CONVENTION_KEY, id);
  } catch {
    /* private window / blocked storage: the choice lasts this page only */
  }
}

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
 *   getSiteRounding?: () => ({ method: string, currency: number, float: number } | null | undefined),
 * }} els
 *   getSiteRounding: the site's rounding (main.js `calc-site-rounding`); the stock default until known.
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
  /** The yellow "Rounds to … — remainder …" row under the result (R13-1), made when first needed. */
  /** @type {HTMLElement|null} */
  let remainderEl = null;
  function ensureRemainderEl() {
    if (!remainderEl && overlay && resultEl) {
      remainderEl = document.createElement("div");
      remainderEl.className = "calc-remainder";
      remainderEl.dataset.testid = "doc-calc-remainder";
      remainderEl.hidden = true;
      resultEl.after(remainderEl);
    }
    return remainderEl;
  }
  /** @type {ReturnType<typeof setTimeout>|null} */
  let lingerTimer = null;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let fadeTimer = null;

  let convention = loadConvention();
  /** The box the tape is for, so the ⓘ speaks of its places (cents / thousandths). */
  let activeKind = "";
  /** @type {HTMLElement|null} */
  let conventionBar = null;
  /** @type {HTMLElement|null} */
  let conventionNoteEl = null;

  /** @param {string} kind */
  function roundingFor(kind) {
    const site = (els.getSiteRounding && els.getSiteRounding()) || DEFAULT_SITE_ROUNDING;
    return { precision: calcFieldPrecision(kind, site), method: site.method, convention };
  }

  /**
   * The state with the rounding as it is now: the clerk may switch the convention mid-calculation,
   * and the one showing when the result goes in is the one used.
   * @param {import("./field-calc.js").FieldCalcState} st
   * @param {string} kind
   */
  function withRounding(st, kind) {
    const rounding = roundingFor(kind);
    return { ...st, rounding, session: st.session ? { ...st.session, rounding } : st.session };
  }

  function paintConventionBar() {
    if (!conventionBar) return;
    conventionBar.querySelectorAll("button[data-convention]").forEach((b) => {
      const on = /** @type {HTMLElement} */ (b).dataset.convention === convention;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    if (conventionNoteEl) conventionNoteEl.textContent = conventionNote(roundingFor(activeKind));
  }

  /**
   * Round · Round up · Round down, pinned to the top of the tape, with an ⓘ that says the rule in
   * plain words at the box's places (5zorro 2026-10-25). Made when the tape first shows.
   */
  function ensureConventionBar() {
    if (conventionBar || !overlay) return;
    conventionBar = document.createElement("div");
    conventionBar.className = "calc-convention";
    conventionBar.dataset.testid = "doc-calc-convention";
    // Clicking here must not take focus from the box mid-calculation.
    conventionBar.addEventListener("mousedown", (ev) => ev.preventDefault());
    for (const c of ROUNDING_CONVENTIONS) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.convention = c.id;
      b.dataset.testid = `doc-calc-convention-${c.id}`;
      b.textContent = c.label;
      b.addEventListener("click", () => {
        convention = c.id;
        saveConvention(c.id);
        paintConventionBar();
        if (lastAnchor) positionOverlay(lastAnchor);
      });
      conventionBar.appendChild(b);
    }
    const info = document.createElement("button");
    info.type = "button";
    info.className = "calc-convention-info";
    info.dataset.testid = "doc-calc-convention-info";
    info.title = "How this rounds";
    info.setAttribute("aria-label", "How this rounds");
    info.innerHTML = uiIconHtml("info", { size: 12 });
    conventionBar.appendChild(info);
    conventionNoteEl = document.createElement("div");
    conventionNoteEl.className = "calc-convention-note";
    conventionNoteEl.dataset.testid = "doc-calc-convention-note";
    conventionNoteEl.hidden = true;
    info.addEventListener("click", () => {
      if (!conventionNoteEl) return;
      conventionNoteEl.hidden = !conventionNoteEl.hidden;
      if (lastAnchor) positionOverlay(lastAnchor);
    });
    overlay.prepend(conventionNoteEl);
    overlay.prepend(conventionBar);
    paintConventionBar();
  }

  function lingering() {
    return lingerTimer != null || fadeTimer != null;
  }

  function stopLinger() {
    if (lingerTimer != null) clearTimeout(lingerTimer);
    if (fadeTimer != null) clearTimeout(fadeTimer);
    lingerTimer = null;
    fadeTimer = null;
    if (overlay) overlay.classList.remove("calc-lingering", "calc-fading");
    if (remainderEl) {
      remainderEl.hidden = true;
      remainderEl.textContent = "";
    }
  }

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
    stopLinger();
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
   * Position tape lined up with the field box, wide enough for its tape. Tape/result
   * text-align follows the input so left-aligned Amount Due and right-aligned
   * rate cells both get decimal columns that match the field.
   * @param {HTMLElement} anchor
   */
  function positionOverlay(anchor) {
    if (!overlay || !anchor) return;
    const r = anchor.getBoundingClientRect();
    const gap = 6;
    const topPad = 8;
    const align =
      anchor instanceof HTMLInputElement || anchor instanceof HTMLTextAreaElement
        ? fieldTextAlign(/** @type {HTMLInputElement} */ (anchor))
        : "right";
    // The tape's natural width first, then lined up with the field and grown to fit it
    // (calc-ribbon-place.js — a narrow cell no longer squeezes the tape out of the ribbon).
    overlay.style.minWidth = "";
    overlay.style.maxWidth = "";
    overlay.style.width = "max-content";
    const natural = overlay.getBoundingClientRect().width;
    const place = calcRibbonPlacement(r, natural, align, window.innerWidth);
    overlay.style.left = `${place.left}px`;
    overlay.style.width = `${place.width}px`;
    overlay.style.minWidth = `${place.width}px`;
    overlay.style.maxWidth = `${place.width}px`;
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
      // ↩ carries on from this calculation's result before rounding (5zorro 2026-10-25).
      if (e.exact && fieldCalc.mode === "active" && fieldCalcInput) {
        const resume = document.createElement("button");
        resume.type = "button";
        resume.className = "calc-hist-copy calc-hist-resume";
        resume.dataset.testid = "doc-calc-resume";
        resume.textContent = "↩";
        resume.title = `Resume this calculation from ${e.exact} (before rounding)`;
        resume.setAttribute("aria-label", resume.title);
        resume.addEventListener("mousedown", (ev) => ev.preventDefault());
        resume.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const inp = fieldCalcInput;
          if (!inp) return;
          const r = resumeFieldCalc(fieldCalc, e.exact);
          if (r.action !== "prevent") return;
          fieldCalc = r.state;
          collapseHistory();
          paintFieldAligned(inp, r.preview, r.expression);
          showOverlay(inp, r.expression, r.preview);
          try {
            inp.focus({ preventScroll: true });
          } catch {
            /* ignore */
          }
        });
        actions.appendChild(resume);
      }
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
    stopLinger();
    ensureConventionBar();
    paintConventionBar();
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

  /**
   * The finished tape stays up with its remainder row, then fades. The repaint that follows the
   * commit (`clear`) leaves it be; a new calculation or an explicit hide ends it at once.
   * @param {HTMLElement} anchor
   * @param {string|undefined} expression
   * @param {string|undefined} result
   * @param {string} note
   */
  function lingerWithRemainder(anchor, expression, result, note) {
    restoreInputCalcStyle();
    hideHistoryPanel();
    pointerOnOverlay = false;
    showOverlay(anchor, expression, result);
    if (!overlay || overlay.hidden || !ensureRemainderEl()) return;
    remainderEl.textContent = note;
    remainderEl.hidden = false;
    overlay.classList.add("calc-lingering");
    positionOverlay(anchor);
    lingerTimer = setTimeout(() => {
      lingerTimer = null;
      overlay.classList.add("calc-fading");
      fadeTimer = setTimeout(() => {
        fadeTimer = null;
        hideOverlay();
      }, CALC_REMAINDER_FADE_MS);
    }, CALC_REMAINDER_LINGER_MS);
  }

  /**
   * Close the tape after a commit: hide it, or leave it up with the remainder when one was dropped.
   * @param {HTMLElement} anchor
   * @param {import("./field-calc.js").FieldCalcResult} r
   */
  function endTape(anchor, r) {
    if (r.remainder) lingerWithRemainder(anchor, r.expression, r.preview, r.remainder);
    else hideOverlay();
  }

  function clear(prior) {
    fieldCalc = resetFieldCalc(fieldCalc, prior != null ? prior : fieldCalc.priorValue);
    fieldCalcInput = null;
    if (lingering()) {
      restoreInputCalcStyle();
      return;
    }
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

    function noteHistory(footing, total, exact) {
      if (!opts.onHistory || total == null || String(total).trim() === "") return;
      if (footing == null || String(footing).trim() === "") return;
      try {
        opts.onHistory({
          footing: String(footing),
          total: String(total).trim(),
          ...(exact ? { exact: String(exact) } : {}),
          fieldKind: opts.kind,
        });
      } catch {
        /* ignore */
      }
    }

    inp.addEventListener("focus", () => {
      fieldCalc = createFieldCalcState(inp.value, undefined, { kind: opts.kind, rounding: roundingFor(opts.kind) });
      fieldCalcInput = inp;
      activeKind = opts.kind;
    });

    inp.addEventListener("keydown", (ev) => {
      if (painting() || !editable()) return;
      if (fieldCalcInput !== inp) {
        fieldCalc = createFieldCalcState(inp.value, undefined, { kind: opts.kind, rounding: roundingFor(opts.kind) });
        fieldCalcInput = inp;
      }
      activeKind = opts.kind;
      fieldCalc = withRounding(fieldCalc, opts.kind);
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
        endTape(inp, r);
        fieldCalcInput = null;
        inp.value = r.commitValue != null ? r.commitValue : "";
        noteHistory(r.expression, inp.value, r.exact);
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
        const r = commitFieldCalc(withRounding(fieldCalc, opts.kind));
        fieldCalc = r.state;
        if (r.action === "commit") endTape(inp, r);
        else hideOverlay();
        fieldCalcInput = null;
        if (r.action === "commit") {
          inp.value = r.commitValue != null ? r.commitValue : "";
          noteHistory(r.expression, inp.value, r.exact);
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
    /** The clerk's rounding convention (round / up / down), for a sum the tape never saw. */
    getConvention: () => convention,
    setState(next, input) {
      fieldCalc = next;
      if (input !== undefined) fieldCalcInput = input;
    },
  };
}
