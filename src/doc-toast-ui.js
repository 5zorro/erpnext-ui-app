/**
 * The Doc form's toast — a notice at the bottom of the page that fades by itself, never a dialog —
 * written once for every Doc form page (moved from the Bill page, plan 2026-10-25 closeout item 3).
 * One toast element (`#bill-toast`, in the shared chrome) and one timer.
 *
 * `announceSaveFailure` is how every form says a save failed (5zorro: "fail loud and clearly", no
 * blocking dialog unless the gate is the point): the red status line carries the words from
 * `save-failure.js`, scrolled into view, and a clickable toast points at it.
 */

/**
 * @param {{
 *   toastEl: () => HTMLElement|null|undefined,
 *   statusEl: () => HTMLElement|null|undefined,
 *   setStatus: (text: string, cls?: string) => void,
 * }} deps
 */
export function createDocToast(deps) {
  /** @type {ReturnType<typeof setTimeout>|null} */
  let timer = null;

  function scrollStatusIntoView() {
    const status = deps.statusEl();
    if (!status) return;
    try {
      status.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch {
      status.scrollIntoView();
    }
  }

  function clearLater(t, ms, onFade) {
    timer = setTimeout(() => {
      t.classList.add("fade-out");
      if (onFade) onFade();
      timer = setTimeout(() => {
        t.classList.remove("show", "fade-out");
        t.hidden = true;
        t.textContent = "";
        timer = null;
      }, 650);
    }, ms);
  }

  /**
   * A fading notice (last-row delete, etc.). No toast element: the status line.
   * @param {string} text
   * @param {number} [ms]
   */
  function show(text, ms = 3200) {
    const t = deps.toastEl();
    if (!t) {
      deps.setStatus(text, "warn");
      return;
    }
    if (timer) clearTimeout(timer);
    t.hidden = false;
    t.textContent = text;
    t.classList.remove("fade-out", "is-action");
    t.onclick = null;
    t.classList.add("show");
    clearLater(t, ms);
  }

  /**
   * A notice the clerk can click (it runs `onClick`, then shows the status line); it stays longer.
   * @param {string} text
   * @param {(() => void)|null} [onClick]
   * @param {number} [ms]
   */
  function showBlocking(text, onClick, ms = 8000) {
    const t = deps.toastEl();
    if (!t) {
      scrollStatusIntoView();
      deps.setStatus(text, "err");
      return;
    }
    if (timer) clearTimeout(timer);
    t.hidden = false;
    t.textContent = text;
    t.classList.remove("fade-out");
    t.classList.add("show");
    if (onClick) {
      t.classList.add("is-action");
      t.onclick = () => {
        onClick();
        scrollStatusIntoView();
      };
    } else {
      t.classList.remove("is-action");
      t.onclick = null;
    }
    clearLater(t, ms, () => {
      t.classList.remove("is-action");
      t.onclick = null;
    });
  }

  /**
   * A clickable toast shown over an open dialog (the dialogs' backdrops sit above the toast's own
   * layer), cleared by `hideOverDialog` (review S1: a second Apply held back).
   * @param {string} text
   * @param {() => void} onClick
   */
  function showOverDialog(text, onClick) {
    const t = deps.toastEl();
    if (t) t.classList.add("over-dialog");
    showBlocking(text, () => {
      hideOverDialog();
      onClick();
    });
  }

  function hideOverDialog() {
    const t = deps.toastEl();
    if (!t || !t.classList.contains("over-dialog")) return;
    if (timer) clearTimeout(timer);
    timer = null;
    t.classList.remove("show", "fade-out", "is-action", "over-dialog");
    t.onclick = null;
    t.hidden = true;
    t.textContent = "";
  }

  /**
   * A save failed: its words in the red status line, shown, and a toast pointing at them.
   * `toast` / `onClick` replace the toast's words and click (the Bill's PO-limit cases).
   * @param {import("./save-failure.js").SaveFailure} failure
   * @param {{ toast?: string, onClick?: () => void }} [override]
   */
  function announceSaveFailure(failure, override = {}) {
    scrollStatusIntoView();
    showBlocking(override.toast || failure.toast, override.onClick || scrollStatusIntoView);
    deps.setStatus(failure.status, "err");
  }

  return { show, showBlocking, showOverDialog, hideOverDialog, scrollStatusIntoView, announceSaveFailure };
}
