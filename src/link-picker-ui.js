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
  isCreateItemLinkAction,
  itemCreateRoute,
  isCreateCustomerLinkAction,
  customerCreateRoute,
} from "./link-search.js";
import {
  initialLinkHighlightIndex,
  nextLinkHighlightIndex,
  resolveLinkPickIndex,
  linkPickerKeyAction,
  linkPickerOpenQuery,
  scrollLinkOptionIntoView,
} from "./link-picker-policy.js";
import { logFocus } from "./focus-debug-client.js";
import { linkDropdownPlacement } from "./link-dropdown-place.js";
import { uiIconHtml } from "./ui-icons.js";

/**
 * @typedef {{
 *   searchLink?: (doctype: string, query: string) => Promise<{ ok?: boolean, reason?: string, results?: unknown[] }>,
 *   openVendorAdd?: () => void,
 *   openPaymentTermsAdd?: () => void,
 *   openProjectAdd?: () => void,
 *   softPeekRoute?: (route: string) => Promise<{ ok?: boolean, reason?: string }>,
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
  const { api, linkMounted, setStatus, onBeforePick, optionDataAttrs, onCreatePeek } = deps;
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

  /** Against the window, not the cell: a line cell clips what overflows it (DF-01). */
  function placeDropdown() {
    if (dd.hidden) return;
    const r = wrap.getBoundingClientRect();
    const p = linkDropdownPlacement(r, { width: window.innerWidth, height: window.innerHeight });
    dd.classList.add("link-dd-floating");
    dd.style.left = `${p.left}px`;
    dd.style.width = `${p.width}px`;
    dd.style.maxHeight = `${p.maxHeight}px`;
    dd.style.top = p.top == null ? "auto" : `${p.top}px`;
    dd.style.bottom = p.bottom == null ? "auto" : `${p.bottom}px`;
  }
  function showDropdown() {
    dd.hidden = false;
    placeDropdown();
  }
  window.addEventListener("resize", placeDropdown);
  // Any scroller (the line table, the page) moves the box; the dropdown follows it.
  window.addEventListener("scroll", placeDropdown, true);

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
      isCreateProjectLinkAction(v) ||
      isCreateItemLinkAction(v) ||
      isCreateCustomerLinkAction(v)
    ) {
      dd.hidden = true;
      hi = -1;
      const typed = input.value;
      const restore =
        input.dataset.linkCommitted != null
          ? input.dataset.linkCommitted
          : String(input.getAttribute("data-committed") || "");
      input.value = restore;
      if (isCreateSupplierLinkAction(v)) {
        if (api && api.openVendorAdd) {
          setStatus("Opening a new Vendor in Vanilla (Esc returns here)…");
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
      if (isCreateCustomerLinkAction(v)) {
        if (api && api.softPeekRoute) {
          setStatus("Opening a new Customer in Vanilla (Esc returns here)…");
          // Esc back lands in this box, holding the new Customer if it was saved (DF-03).
          if (onCreatePeek) onCreatePeek(input, "Customer");
          const res = await api.softPeekRoute(customerCreateRoute(typed));
          if (res && res.ok === false) setStatus(res.reason || "Could not open a new Customer.", "err");
        } else {
          setStatus("Customer add API missing — restart the shell.", "err");
        }
        return;
      }
      if (isCreateItemLinkAction(v)) {
        if (api && api.softPeekRoute) {
          setStatus("Opening a new Item in Vanilla (Esc returns here)…");
          // Esc back lands in this cell, holding the new Item if it was saved (DF-02).
          if (onCreatePeek) onCreatePeek(input, "Item");
          const res = await api.softPeekRoute(itemCreateRoute(typed));
          if (res && res.ok === false) setStatus(res.reason || "Could not open a new Item.", "err");
        } else {
          setStatus("Item add API missing — restart the shell.", "err");
        }
        return;
      }
      if (api && api.openProjectAdd) {
        setStatus("Opening a new Project in Vanilla (Esc returns here)…");
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
      showDropdown();
      dd.innerHTML = `<div class="link-muted">Search API missing — restart the shell.</div>`;
      return;
    }
    showDropdown();
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
      // ArrowDown on a closed dropdown is the same "show me the choices" gesture as the chevron.
      await runSearch(linkPickerOpenQuery(input.value, input.dataset.linkCommitted));
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
    // Not `input.value`: a committed value is not a filter, or the field's own dropdown offers
    // only the value it already has. See linkPickerOpenQuery.
    runSearch(linkPickerOpenQuery(input.value, input.dataset.linkCommitted));
  });
  document.addEventListener("click", (ev) => {
    if (!wrap.contains(/** @type {Node} */ (ev.target))) dd.hidden = true;
  });
}
