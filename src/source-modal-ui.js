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
} from "./source-modal.js";
import { logFocus } from "./focus-debug-client.js";
import { uiIconHtml } from "./ui-icons.js";

/**
 * @typedef {import("./source-modal.js").SourceGroup} SourceGroup
 * @typedef {import("./source-modal.js").SourceItem} SourceItem
 */

/**
 * @typedef {{
 *   groups: SourceGroup[],
 *   mode?: "single" | "multi",
 *   testId?: string,
 *   pickButtonTestId?: string,
 *   onChoose: (choice: SourceItem | { mode: string, items: SourceItem[] }) => void|Promise<void>,
 *   setStatus?: (text: string, cls?: string) => void,
 *   focusSurface?: () => void,
 *   isOpenRef?: { current: boolean },
 *   onClose?: (kind: "choose"|"cancel"|"escape"|"backdrop") => void,
 * }} SourceModalOptions
 */

function dismissLinkDropdowns() {
  document.querySelectorAll(".link-dd").forEach((dd) => {
    dd.hidden = true;
  });
}

/**
 * @param {SourceModalOptions} opts
 * @returns {boolean} false when already open
 */
export function showSourceModal(opts) {
  const openRef = opts.isOpenRef || { current: false };
  if (openRef.current) return false;
  openRef.current = true;

  const mode = opts.mode === "single" ? "single" : "multi";
  const groups = opts.groups || [];
  const setStatus = opts.setStatus || (() => {});
  let gi = 0;
  let ii = 0;
  /** @type {string[]} */
  let selectedKeys = [];

  const back = document.createElement("div");
  back.className = "src-back";
  back.dataset.testid = opts.testId || "doc-source-modal";
  const box = document.createElement("div");
  box.className = "src-box";
  box.tabIndex = -1;
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", "Source Selection");

  const titleHint =
    mode === "single"
      ? "Source Selection — Tab: group · ↑/↓: item · Enter: select"
      : "Source Selection — Tab: group · ↑/↓: move · Space: check · Enter: pull";
  const pickLabel = mode === "single" ? "Select this source" : "Pull selected";
  const pickTestId = opts.pickButtonTestId
    ? ` data-testid="${opts.pickButtonTestId}"`
    : "";

  box.innerHTML = `<div class="src-title">${titleHint}</div>
    <div class="src-body"></div>
    <div class="src-foot">
      <button type="button" class="primary" data-act="pick"${pickTestId}>${pickLabel}</button>
      <button type="button" data-act="cancel">Cancel</button>
    </div>`;
  back.appendChild(box);
  document.body.appendChild(back);
  const body = box.querySelector(".src-body");
  const pickBtn = box.querySelector('[data-act="pick"]');

  function activeItem() {
    return groups[gi] && groups[gi].items[ii];
  }

  function updatePickLabel() {
    if (!pickBtn || mode === "single") return;
    const n = selectedKeys.filter((k) => k && k !== "nic").length;
    const nic = selectedKeys.includes("nic");
    if (nic) pickBtn.textContent = "Continue without source (NIC)";
    else if (n > 1) pickBtn.textContent = `Pull selected (${n})`;
    else if (n === 1) pickBtn.textContent = "Pull selected (1)";
    else pickBtn.textContent = "Pull highlighted / selected";
  }

  function draw() {
    if (!body) return;
    body.innerHTML = "";
    groups.forEach((g, ggi) => {
      const h = document.createElement("div");
      h.className = "src-group" + (ggi === gi ? " active" : "");
      h.textContent = g.name;
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
          if (it.draft) return;
          gi = ggi;
          ii = iii;
          if (mode === "multi") {
            selectedKeys = toggleSourceSelection(selectedKeys, it);
          }
          draw();
        };
        r.ondblclick = () => {
          if (it.draft) return;
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
      btn.tabIndex = btn.classList.contains("active") ? 0 : -1;
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
    if (opts.onClose && !closeOpts.deferOnClose) opts.onClose(kind);
  }

  async function choose() {
    if (mode === "single") {
      const it = activeItem();
      if (!isSelectableSourceItem(it)) return;
      close("choose", { deferOnClose: true });
      await opts.onChoose(it);
      logFocus("source-modal-choose-done", it.kind || "");
      if (opts.onClose) opts.onClose("choose");
      return;
    }
    const resolved = resolveSourcesToCommit(groups, selectedKeys, activeItem());
    if (resolved.mode === "none") {
      setStatus("Space to check a source (or highlight NIC), then Enter.", "warn");
      return;
    }
    close("choose", { deferOnClose: true });
    await opts.onChoose(resolved);
    logFocus("source-modal-choose-done", resolved.mode || "");
    if (opts.onClose) opts.onClose("choose");
  }

  function onKey(ev) {
    if (mode === "single") {
      if (ev.key === "Tab") {
        ev.preventDefault();
        gi = (gi + (ev.shiftKey ? groups.length - 1 : 1)) % groups.length;
        ii = 0;
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
      gi = (gi + (ev.shiftKey ? groups.length - 1 : 1)) % groups.length;
      ii = 0;
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
  draw();
  logFocus("source-modal-open", mode);
  setTimeout(focusModalKeyboard, 0);
  setTimeout(focusModalKeyboard, 40);
  setStatus(
    mode === "single" ? "Choose a source (or NIC)." : "Space to check sources · Enter to pull (or NIC).",
  );
  return true;
}
