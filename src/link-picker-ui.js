/**
 * Shared ERP Link picker mount — Bill + doc-form shells.
 */

import {
  linkOptionLabel,
  linkOptionClassNames,
  withEmptySearchActions,
  isCreateSupplierLinkAction,
  isCreatePaymentTermsLinkAction,
  isCreateProjectLinkAction,
} from "./link-search.js";
import {
  initialLinkHighlightIndex,
  nextLinkHighlightIndex,
  resolveLinkPickIndex,
  linkPickerKeyAction,
  scrollLinkOptionIntoView,
} from "./link-picker-policy.js";
import { logFocus } from "./focus-debug-client.js";
import { uiIconHtml } from "./ui-icons.js";

/**
 * @typedef {{
 *   searchLink?: (doctype: string, query: string) => Promise<{ ok?: boolean, reason?: string, results?: unknown[] }>,
 *   openVendorAdd?: () => void,
 *   openPaymentTermsAdd?: () => void,
 *   openProjectAdd?: () => void,
 * }} LinkPickerApi
 */

/**
 * @typedef {{
 *   api: LinkPickerApi|null,
 *   linkMounted: WeakMap<HTMLElement, true>,
 *   setStatus: (text: string, cls?: string) => void,
 *   onBeforePick?: (value: string, doctype: string, btn: HTMLButtonElement|null) => void,
 *   optionDataAttrs?: (row: import("./link-search.js").LinkOption) => Record<string, string>,
 * }} LinkPickerDeps
 */

/**
 * @param {string|null|undefined} v
 */
function escapeHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {Record<string, string>} attrs
 */
function attrsToString(attrs) {
  return Object.entries(attrs)
    .filter(([, val]) => val != null && val !== "")
    .map(([k, val]) => ` ${k}="${escapeHtml(val)}"`)
    .join("");
}

/**
 * @param {HTMLInputElement} input
 * @param {string} doctype
 * @param {(value: string) => void|Promise<void>} onPicked
 * @param {LinkPickerDeps} deps
 * @param {{ refocusAfterPick?: boolean }} [pickOpts]
 */
export function mountLinkPicker(input, doctype, onPicked, deps, pickOpts = {}) {
  const { refocusAfterPick = true } = pickOpts;
  const { api, linkMounted, setStatus, onBeforePick, optionDataAttrs } = deps;
  if (!input || linkMounted.get(input)) return;
  linkMounted.set(input, true);
  const wrap = document.createElement("div");
  wrap.className = "link-wrap";
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "link-btn";
  btn.innerHTML = uiIconHtml("chevron-picker", { size: 12 });
  btn.title = `Search ${doctype}`;
  btn.tabIndex = -1;
  wrap.appendChild(btn);
  const dd = document.createElement("div");
  dd.className = "link-dd";
  dd.hidden = true;
  wrap.appendChild(dd);

  let timer = null;
  /** @type {HTMLButtonElement[]} */
  let opts = [];
  let hi = -1;

  function setHi(i) {
    opts.forEach((b) => b.classList.remove("active"));
    hi = i;
    if (hi >= 0 && opts[hi]) {
      opts[hi].classList.add("active");
      scrollLinkOptionIntoView(opts[hi]);
    }
  }

  async function pickValue(v, fromBtn) {
    if (
      isCreateSupplierLinkAction(v) ||
      isCreatePaymentTermsLinkAction(v) ||
      isCreateProjectLinkAction(v)
    ) {
      dd.hidden = true;
      hi = -1;
      const restore =
        input.dataset.linkCommitted != null
          ? input.dataset.linkCommitted
          : String(input.getAttribute("data-committed") || "");
      input.value = restore;
      if (isCreateSupplierLinkAction(v)) {
        if (api && api.openVendorAdd) {
          setStatus("Opening Vendor add in Vanilla…");
          api.openVendorAdd();
        } else {
          setStatus("Vendor add API missing — restart the shell.", "err");
        }
        return;
      }
      if (isCreatePaymentTermsLinkAction(v)) {
        if (api && api.openPaymentTermsAdd) {
          setStatus("Opening Payment Terms in Vanilla (Esc returns here)…");
          api.openPaymentTermsAdd();
        } else {
          setStatus("Payment Terms add API missing — restart the shell.", "err");
        }
        return;
      }
      if (api && api.openProjectAdd) {
        setStatus("Opening Project add in Vanilla…");
        api.openProjectAdd();
      } else {
        setStatus("Project add API missing — restart the shell.", "err");
      }
      return;
    }
    const btnOpt =
      fromBtn ||
      opts.find((b) => (b.getAttribute("data-value") || "") === v) ||
      null;
    if (onBeforePick) onBeforePick(v, doctype, btnOpt);
    logFocus("link-pick", doctype);
    input.value = v;
    input.dataset.linkCommitted = v;
    dd.hidden = true;
    hi = -1;
    if (refocusAfterPick) {
      try {
        input.blur();
      } catch {
        /* ignore */
      }
      logFocus("link-pick-blur", doctype);
    }
    await onPicked(v);
    if (refocusAfterPick) {
      try {
        input.focus({ preventScroll: false });
      } catch {
        /* ignore */
      }
    }
    logFocus("link-pick-done", doctype);
  }

  async function runSearch(q) {
    if (!api || !api.searchLink) {
      dd.hidden = false;
      dd.innerHTML = `<div class="link-muted">Search API missing — restart the shell.</div>`;
      return;
    }
    dd.hidden = false;
    dd.innerHTML = `<div class="link-muted">Searching ${escapeHtml(doctype)}…</div>`;
    const res = await api.searchLink(doctype, q || "");
    if (!res || !res.ok) {
      dd.innerHTML = `<div class="link-muted">${escapeHtml((res && res.reason) || "Search failed — is Vanilla logged in?")}</div>`;
      opts = [];
      return;
    }
    const rows = withEmptySearchActions(res.results || [], doctype);
    if (!rows.length) {
      dd.innerHTML = `<div class="link-muted">No matches${q ? ` for “${escapeHtml(q)}”` : ""}</div>`;
      opts = [];
      return;
    }
    dd.innerHTML = rows
      .map((o) => {
        const extra = optionDataAttrs ? optionDataAttrs(o) : {};
        const dataValue = escapeHtml(o.value);
        return `<button type="button" class="${linkOptionClassNames(o)}" tabindex="-1" data-value="${dataValue}"${attrsToString(extra)}>${escapeHtml(linkOptionLabel(o))}</button>`;
      })
      .join("");
    opts = [...dd.querySelectorAll(".link-opt")];
    hi = initialLinkHighlightIndex(opts.length);
    if (hi === 0) {
      opts[0].classList.add("active");
      scrollLinkOptionIntoView(opts[0]);
    }
    opts.forEach((b) => {
      b.onmousedown = (ev) => {
        ev.preventDefault();
      };
      b.onclick = async () => {
        await pickValue(b.getAttribute("data-value") || "", b);
      };
    });
  }

  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => runSearch(input.value), 280);
  });
  if (input.dataset.linkCommitted == null) {
    input.dataset.linkCommitted = String(input.value || "");
  }
  input.addEventListener("keydown", async (ev) => {
    const act = linkPickerKeyAction(ev.key, {
      dropdownOpen: !dd.hidden,
      optionCount: opts.length,
    });
    if (act === "close") {
      dd.hidden = true;
      hi = -1;
      return;
    }
    if (act === "search") {
      ev.preventDefault();
      await runSearch(input.value || "");
      return;
    }
    if (act === "none") return;
    if (act === "pick") {
      ev.preventDefault();
      const idx = resolveLinkPickIndex(hi, opts.length);
      const pick = idx >= 0 ? opts[idx] : null;
      if (pick) await pickValue(pick.getAttribute("data-value") || "", pick);
      else {
        dd.hidden = true;
        hi = -1;
      }
      return;
    }
    if (act === "move_down") {
      ev.preventDefault();
      setHi(nextLinkHighlightIndex(hi, opts.length, "down"));
    }
    if (act === "move_up") {
      ev.preventDefault();
      setHi(nextLinkHighlightIndex(hi, opts.length, "up"));
    }
  });
  btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    runSearch(input.value || "");
  });
  document.addEventListener("click", (ev) => {
    if (!wrap.contains(/** @type {Node} */ (ev.target))) dd.hidden = true;
  });
}
