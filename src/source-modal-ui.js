/**
 * Shared source-selection modal — Bill (multi) + Item Receipt (single).
 * Pure keyboard policy lives in source-modal.js; this module owns DOM.
 */

import {
  isSelectableSourceItem,
  sourceItemKey,
  sourceModalKeyAction,
  toggleSourceSelection,
  resolveSourcesToCommit,
  findSourceItemByKey,
  groupHasSelectableItem,
  firstSelectableItemIndex,
  nextSelectableGroupIndex,
} from "./source-modal.js";
import {
  sourceModalArity,
  sourceModalTitleHint,
  sourceModalPickLabel,
  creditSwitchView,
} from "./source-modal-credit-mode.js";
import { logFocus } from "./focus-debug-client.js";
import { uiIconHtml } from "./ui-icons.js";

/**
 * @typedef {import("./source-modal.js").SourceGroup} SourceGroup
 * @typedef {import("./source-modal.js").SourceItem} SourceItem
 */

/**
 * @typedef {{
 *   updateGroups: (groups: SourceGroup[]) => void,
 *   applySlice: (sliceId: string, sliceGroup: SourceGroup, nextGroups?: SourceGroup[]) => void,
 *   setSliceError: (sliceId: string, message: string) => void,
 *   setLoadError: (message: string) => void,
 *   setCreditMode: (credit: boolean, groups?: SourceGroup[]) => void,
 * }} SourceModalController
 *
 * @typedef {{
 *   label: string,
 *   checked?: boolean,
 *   testId?: string,
 *   onChange: (next: boolean) => void,
 * }} SourceModalCreditToggle
 *
 * @typedef {{
 *   groups: SourceGroup[],
 *   mode?: "single" | "multi",
 *   testId?: string,
 *   pickButtonTestId?: string,
 *   creditToggle?: SourceModalCreditToggle,
 *   onChoose: (choice: SourceItem | { mode: string, items: SourceItem[] }) => void|Promise<void>,
 *   setStatus?: (text: string, cls?: string) => void,
 *   focusSurface?: () => void,
 *   isOpenRef?: { current: boolean },
 *   onClose?: (kind: "choose"|"cancel"|"escape"|"backdrop") => void,
 *   onController?: (controller: SourceModalController) => void,
 * }} SourceModalOptions
 */

function dismissLinkDropdowns() {
  document.querySelectorAll(".link-dd").forEach((dd) => {
    dd.hidden = true;
  });
}

/**
 * @param {SourceModalOptions} opts
 * @returns {Promise<{ ok: boolean, kind?: string, reason?: string }>}
 */
export function showSourceModal(opts) {
  const openRef = opts.isOpenRef || { current: false };
  if (openRef.current) {
    return Promise.resolve({ ok: false, reason: "already_open" });
  }

  return new Promise((resolve) => {
    openRef.current = true;
    let settled = false;
    /** @param {{ ok: boolean, kind?: string, reason?: string }} payload */
    function settle(payload) {
      if (settled) return;
      settled = true;
      resolve(payload);
    }

    function finishClose(kind) {
      if (opts.onClose) opts.onClose(kind);
      settle({ ok: true, kind });
    }

  // Arity is not fixed for the life of the modal any more: credit mode is single-pick because
  // `return_against` is one Link, while PO/IR stays multi-select merge (OI-166).
  const baseMode = opts.mode === "single" ? "single" : "multi";
  const creditToggle =
    opts.creditToggle && typeof opts.creditToggle === "object" ? opts.creditToggle : null;
  let creditOn = !!(creditToggle && creditToggle.checked);
  let mode = sourceModalArity(creditOn, baseMode);
  let groups = opts.groups || [];
  const setStatus = opts.setStatus || (() => {});
  let gi = 0;
  let ii = 0;
  /** @type {string[]} */
  let selectedKeys = [];
  let loadError = "";

  const back = document.createElement("div");
  back.className = "src-back";
  back.dataset.testid = opts.testId || "doc-source-modal";
  const box = document.createElement("div");
  box.className = "src-box";
  box.tabIndex = -1;
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", "Source Selection");

  const pickTestId = opts.pickButtonTestId
    ? ` data-testid="${opts.pickButtonTestId}"`
    : "";

  // Everything in `.src-foot` is **click-only and out of the tab order**. The modal owns Tab
  // for group navigation (see onKey), so a focusable control down here would be one the clerk
  // can see and never reach by keyboard — worse than an honest mouse-only affordance.
  const creditToggleHtml = creditToggle
    ? `<span class="src-credit-toggle">
        <span class="src-credit-label">${creditToggle.label || "Credit memo?"}</span>
        <button type="button" class="credit-memo-switch src-credit-switch" data-act="credit"
          tabindex="-1" role="switch" aria-checked="false" aria-label="Credit memo: No"${
            creditToggle.testId ? ` data-testid="${creditToggle.testId}"` : ""
          }>
          <span class="switch-word switch-word-no">No</span>
          <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
          <span class="switch-word switch-word-yes">Yes</span>
        </button>
      </span>`
    : "";

  box.innerHTML = `<div class="src-title">${sourceModalTitleHint(mode, creditOn)}</div>
    <div class="src-load-error" hidden></div>
    <div class="src-body"></div>
    <div class="src-foot">
      <button type="button" class="primary" data-act="pick" tabindex="-1"${pickTestId}>${sourceModalPickLabel(
        mode,
        creditOn,
      )}</button>
      <button type="button" data-act="cancel" tabindex="-1">Cancel</button>
      ${creditToggleHtml}
    </div>`;
  back.appendChild(box);
  document.body.appendChild(back);
  const body = box.querySelector(".src-body");
  const titleEl = box.querySelector(".src-title");
  const loadErrorEl = box.querySelector(".src-load-error");
  const pickBtn = box.querySelector('[data-act="pick"]');
  const creditBtn = box.querySelector('[data-act="credit"]');

  function activeItem() {
    return groups[gi] && groups[gi].items[ii];
  }

  function updatePickLabel() {
    if (!pickBtn) return;
    if (mode === "single") {
      pickBtn.textContent = sourceModalPickLabel(mode, creditOn);
      return;
    }
    const n = selectedKeys.filter((k) => k && k !== "nic").length;
    const nic = selectedKeys.includes("nic");
    if (nic) pickBtn.textContent = "Continue without source (NIC)";
    else if (n > 1) pickBtn.textContent = `Pull selected (${n})`;
    else if (n === 1) pickBtn.textContent = "Pull selected (1)";
    else pickBtn.textContent = "Pull highlighted / selected";
  }

  /** Title, primary-button label and switch state — everything outside the list. */
  function paintChrome() {
    if (titleEl) titleEl.textContent = sourceModalTitleHint(mode, creditOn);
    box.setAttribute("aria-label", creditOn ? "Credit memo source" : "Source Selection");
    if (creditBtn) {
      const view = creditSwitchView(creditOn);
      creditBtn.classList.toggle("is-on", view.on);
      creditBtn.setAttribute("aria-checked", view.ariaChecked);
      creditBtn.setAttribute("aria-label", view.ariaLabel);
      creditBtn.title = view.title;
    }
    updatePickLabel();
  }

  /**
   * Swap the corpus the modal is asking about. The host owns *what* is in the new list (it does
   * the fetching); the modal owns arity, labels and the fact that a swap clears the selection —
   * a PO key must never survive into a credit commit.
   * @param {boolean} credit
   * @param {SourceGroup[]} [nextGroups]
   */
  function setCreditMode(credit, nextGroups) {
    creditOn = !!credit;
    mode = sourceModalArity(creditOn, baseMode);
    selectedKeys = [];
    gi = 0;
    ii = 0;
    loadError = "";
    if (Array.isArray(nextGroups)) groups = nextGroups;
    paintChrome();
    draw();
  }

  function paintLoadError() {
    if (!loadErrorEl) return;
    if (loadError) {
      loadErrorEl.hidden = false;
      loadErrorEl.textContent = loadError;
    } else {
      loadErrorEl.hidden = true;
      loadErrorEl.textContent = "";
    }
  }

  function draw() {
    if (!body) return;
    paintLoadError();
    body.innerHTML = "";
    groups.forEach((g, ggi) => {
      const h = document.createElement("div");
      h.className = "src-group" + (ggi === gi ? " active" : "") + (g.loading ? " loading" : "") + (g.error ? " error" : "");
      h.textContent = g.loading
        ? `${g.name} — still loading…`
        : g.error
          ? `${g.name} — ${g.error}`
          : g.name;
      body.appendChild(h);
      g.items.forEach((it, iii) => {
        const key = sourceItemKey(it);
        const checked = mode === "multi" && selectedKeys.includes(key);
        const r = document.createElement("button");
        r.type = "button";
        r.className =
          "src-item" +
          (ggi === gi && iii === ii ? " active" : "") +
          (it.draft ? " draft" : "") +
          (it.loading ? " loading" : "") +
          (checked ? " checked" : "");
        if (mode === "multi") {
          r.setAttribute("aria-checked", checked ? "true" : "false");
          r.dataset.sourceKey = key;
          const mark = document.createElement("span");
          mark.className = "src-check";
          mark.setAttribute("aria-hidden", "true");
          mark.innerHTML = checked ? uiIconHtml("check", { size: 12 }) : "";
          const lab = document.createElement("span");
          lab.className = "src-item-label";
          lab.textContent = it.label;
          r.appendChild(mark);
          r.appendChild(lab);
        } else {
          r.textContent = it.label;
        }
        r.onclick = () => {
          if (it.draft || it.loading) return;
          gi = ggi;
          ii = iii;
          if (mode === "multi") {
            selectedKeys = toggleSourceSelection(selectedKeys, it);
          }
          draw();
        };
        r.ondblclick = () => {
          if (it.draft || it.loading) return;
          gi = ggi;
          ii = iii;
          if (mode === "multi") {
            if (!selectedKeys.includes(key)) {
              selectedKeys = toggleSourceSelection(selectedKeys, it);
            }
            choose();
          } else {
            choose();
          }
        };
        body.appendChild(r);
      });
    });
    updatePickLabel();
    body.querySelectorAll(".src-item").forEach((btn) => {
      const selectable = !btn.classList.contains("draft") && !btn.classList.contains("loading");
      btn.tabIndex = btn.classList.contains("active") && selectable ? 0 : -1;
    });
    const a = body.querySelector(".src-item.active");
    if (a && a.scrollIntoView) a.scrollIntoView({ block: "nearest" });
    focusModalKeyboard();
  }

  /** @param {"choose"|"cancel"|"escape"|"backdrop"} kind */
  /** @param {{ deferOnClose?: boolean }} [closeOpts] */
  function close(kind = "cancel", closeOpts = {}) {
    if (!openRef.current) return;
    openRef.current = false;
    document.removeEventListener("keydown", onKey, true);
    logFocus("source-modal-close", kind);
    if (back.parentNode) back.parentNode.removeChild(back);
    logFocus("source-modal-unmounted", kind);
    if (!closeOpts.deferOnClose) finishClose(kind);
  }

  async function choose() {
    if (mode === "single") {
      const it = activeItem();
      if (!isSelectableSourceItem(it)) return;
      close("choose", { deferOnClose: true });
      try {
        await opts.onChoose(it);
        logFocus("source-modal-choose-done", it.kind || "");
      } finally {
        finishClose("choose");
      }
      return;
    }
    const resolved = resolveSourcesToCommit(groups, selectedKeys, activeItem());
    if (resolved.mode === "none") {
      setStatus("Space to check a source (or highlight NIC), then Enter.", "warn");
      return;
    }
    close("choose", { deferOnClose: true });
    try {
      await opts.onChoose(resolved);
      logFocus("source-modal-choose-done", resolved.mode || "");
    } finally {
      finishClose("choose");
    }
  }

  function onKey(ev) {
    if (mode === "single") {
      if (ev.key === "Tab") {
        ev.preventDefault();
        gi = nextSelectableGroupIndex(groups, gi, ev.shiftKey ? -1 : 1);
        ii = firstSelectableItemIndex(groups[gi]);
        draw();
      } else if (ev.key === "ArrowDown") {
        ev.preventDefault();
        const items = groups[gi].items;
        do {
          ii = Math.min(items.length - 1, ii + 1);
        } while (ii < items.length - 1 && items[ii].draft);
        draw();
      } else if (ev.key === "ArrowUp") {
        ev.preventDefault();
        do {
          ii = Math.max(0, ii - 1);
        } while (ii > 0 && groups[gi].items[ii].draft);
        draw();
      } else if (ev.key === "Enter") {
        ev.preventDefault();
        choose();
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        close("escape");
      }
      return;
    }

    const act = sourceModalKeyAction(ev.key);
    if (act === "none") return;
    if (act === "tab") {
      ev.preventDefault();
      gi = nextSelectableGroupIndex(groups, gi, ev.shiftKey ? -1 : 1);
      ii = firstSelectableItemIndex(groups[gi]);
      draw();
      return;
    }
    if (act === "down") {
      ev.preventDefault();
      const items = groups[gi].items;
      do {
        ii = Math.min(items.length - 1, ii + 1);
      } while (ii < items.length - 1 && items[ii].draft);
      draw();
      return;
    }
    if (act === "up") {
      ev.preventDefault();
      do {
        ii = Math.max(0, ii - 1);
      } while (ii > 0 && groups[gi].items[ii].draft);
      draw();
      return;
    }
    if (act === "toggle") {
      ev.preventDefault();
      const it = activeItem();
      if (!isSelectableSourceItem(it)) return;
      selectedKeys = toggleSourceSelection(selectedKeys, it);
      draw();
      return;
    }
    if (act === "finalize") {
      ev.preventDefault();
      choose();
      return;
    }
    if (act === "cancel") {
      ev.preventDefault();
      close("escape");
    }
  }

  function focusModalKeyboard() {
    dismissLinkDropdowns();
    const active = body && body.querySelector(".src-item.active");
    if (active && typeof active.focus === "function") {
      try {
        active.focus({ preventScroll: true });
        logFocus("source-modal-focus", "active-item");
        return;
      } catch {
        /* fall through */
      }
    }
    try {
      box.focus({ preventScroll: true });
      logFocus("source-modal-focus", "dialog-box");
    } catch {
      /* ignore */
    }
  }

  document.addEventListener("keydown", onKey, true);
  if (pickBtn) pickBtn.onclick = () => choose();
  const cancelBtn = box.querySelector('[data-act="cancel"]');
  if (cancelBtn) cancelBtn.onclick = () => close("cancel");
  if (creditBtn && creditToggle) {
    creditBtn.onclick = () => {
      const next = !creditOn;
      logFocus("source-modal-credit-mode", next ? "on" : "off");
      // Report only. The host answers through controller.setCreditMode() once it knows what
      // the new list holds, so a fetch failure cannot leave the switch lying about the corpus.
      try {
        creditToggle.onChange(next);
      } catch (e) {
        logFocus("source-modal-credit-mode-error", String(e && e.message ? e.message : e));
      }
    };
  }
  back.addEventListener("click", (ev) => {
    if (ev.target === back) close("backdrop");
  });
  if (opts.focusSurface) {
    try {
      opts.focusSurface();
    } catch {
      /* ignore */
    }
  }
  dismissLinkDropdowns();
  const priorFocus = document.activeElement;
  if (
    priorFocus &&
    priorFocus !== document.body &&
    typeof priorFocus.blur === "function" &&
    !back.contains(priorFocus)
  ) {
    try {
      priorFocus.blur();
    } catch {
      /* ignore */
    }
  }
  if (opts.onController) {
    opts.onController({
      updateGroups(nextGroups) {
        if (!openRef.current) return;
        groups = Array.isArray(nextGroups) ? nextGroups : [];
        gi = Math.min(gi, Math.max(0, groups.length - 1));
        ii = 0;
        selectedKeys = selectedKeys.filter((k) => findSourceItemByKey(k, groups));
        loadError = "";
        draw();
      },
      applySlice(sliceId, sliceGroup, nextGroups) {
        if (!openRef.current) return;
        if (Array.isArray(nextGroups)) {
          groups = nextGroups;
        } else if (sliceGroup) {
          const idx = groups.findIndex((g) => g.id === sliceId);
          if (idx >= 0) groups[idx] = sliceGroup;
          else groups.push(sliceGroup);
        }
        gi = Math.min(gi, Math.max(0, groups.length - 1));
        ii = 0;
        draw();
      },
      setSliceError(sliceId, message) {
        if (!openRef.current) return;
        const msg = message != null ? String(message).trim() : "";
        const idx = groups.findIndex((g) => g.id === sliceId);
        if (idx >= 0) {
          groups[idx] = {
            ...groups[idx],
            loading: false,
            error: msg || "Load failed",
            items: [
              {
                label: msg || "Load failed",
                kind: "po",
                draft: true,
              },
            ],
          };
        }
        draw();
      },
      setLoadError(message) {
        if (!openRef.current) return;
        loadError = message != null ? String(message).trim() : "";
        draw();
      },
      setCreditMode(credit, nextGroups) {
        if (!openRef.current) return;
        setCreditMode(credit, nextGroups);
      },
    });
  }
  paintChrome();
  draw();
  logFocus("source-modal-open", creditOn ? `${mode}:credit` : mode);
  setTimeout(focusModalKeyboard, 0);
  setTimeout(focusModalKeyboard, 40);
  setStatus(
    creditOn
      ? "Pick the Bill this credit is against (or decide later)."
      : mode === "single"
        ? "Choose a source (or NIC)."
        : "Space to check sources · Enter to pull (or NIC).",
  );
  });
}
