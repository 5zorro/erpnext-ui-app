/**
 * The Bill's informal link dialog on screen (OI-147/164/165; plan 2026-10-25 R6a-2): a Bill or a
 * Sales Order noted in Remarks as a plain-text token, never the real ERP `return_against` field.
 * Its words and lists are pure (src/bill-informal-link.js); this module owns the DOM. The Bill
 * page checks it may open and hands over the writes as `deps`, because the same writes serve the
 * source picker's Credit memo switch (OI-166) and must not drift apart.
 *
 * "Bill" defaults to the current vendor's submitted Bills; typing a name searches any vendor
 * (2026-09-07 decision). "Sales Order" reuses the OI-134 line-allocation fetch as-is — rough first
 * pass, not dogfooded yet (5zorro 2026-09-07: "won't verify it until later").
 *
 * `purpose: "source"` (Bill only) is the same list opened right after the clerk flips **Credit
 * memo? → Yes** on a Bill they did *not* reach from a submitted Bill. Picking there goes to
 * `chooseSource` (the page's `commitCreditSource`): an untouched draft is rebuilt through the native
 * make_debit_note path, a draft with lines falls back to the informal token.
 */
import {
  informalLinkView,
  filterInformalLinkRows,
  informalLinkRowLabel,
  informalLinkEmptyText,
  salesOrderLinkRows,
  informalLinkStatus,
  DECIDE_LATER_STATUS,
} from "./bill-informal-link.js";
import { soPickerBillLines } from "./so-picker.js";

/**
 * @typedef {{
 *   api: any,
 *   kind: "bill"|"so",
 *   purpose?: "link"|"source",
 *   supplier: string,
 *   items: () => Array<any>|null|undefined,
 *   searchBills: (query: string) => Promise<Array<{ value: string, description?: string }>>,
 *   writeLink: (kind: "bill"|"so", name: string) => Promise<{ ok: boolean, reason?: string }>,
 *   chooseSource: (name: string) => Promise<unknown>,
 *   setStatus: (text: string, tone?: string) => void,
 *   onClose: () => void,
 * }} InformalLinkDeps
 *   `searchBills` — submitted Bills, the vendor's for an empty query, any vendor's otherwise, this
 *   Bill left out; `writeLink` — write (or with "" clear) the token and repaint; `chooseSource` —
 *   the source door's pick, after the dialog closed; `onClose` — the dialog is gone
 */

/** @param {InformalLinkDeps} deps */
export async function openInformalLinkModal(deps) {
  const { api, kind, supplier, setStatus } = deps;
  const v = informalLinkView(kind, deps.purpose);
  let rows = [];
  let query = "";

  const back = document.createElement("div");
  back.className = "src-back";
  back.dataset.testid = v.testId;
  const box = document.createElement("div");
  box.className = "src-box";
  box.tabIndex = -1;
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", v.dialogLabel);
  box.innerHTML = `<div class="src-title"></div>
    <div class="src-so-search" style="padding:8px 14px;border-bottom:1px solid #e2e8f0;">
      <input type="text" data-link-search style="width:100%;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;" />
    </div>
    <div class="src-body"></div>
    <div class="src-foot">
      <button type="button" data-act="clear"></button>
      <button type="button" data-act="cancel">Cancel</button>
    </div>`;
  box.querySelector(".src-title").textContent = v.title;
  back.appendChild(box);
  document.body.appendChild(back);
  const body = box.querySelector(".src-body");
  const searchEl = box.querySelector("[data-link-search]");
  searchEl.placeholder = v.placeholder;
  const clearBtn = box.querySelector('[data-act="clear"]');
  clearBtn.textContent = v.clearText;
  const cancelBtn = box.querySelector('[data-act="cancel"]');

  let searchDebounce = null;

  function close() {
    if (searchDebounce) clearTimeout(searchDebounce);
    deps.onClose();
    document.removeEventListener("keydown", onKey, true);
    if (back.parentNode) back.parentNode.removeChild(back);
  }

  async function applyLink(name) {
    const words = informalLinkStatus(v.label, name);
    setStatus(words.working);
    try {
      const res = await deps.writeLink(kind, name);
      if (res.ok) setStatus(words.done);
      else setStatus(res.reason, "err");
    } finally {
      close();
    }
  }

  async function chooseSourceBill(name) {
    close();
    await deps.chooseSource(name);
  }

  function drawRows() {
    body.innerHTML = "";
    const filtered = filterInformalLinkRows(rows, query);
    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "src-empty";
      empty.textContent = informalLinkEmptyText(v.isBill, query, supplier);
      body.appendChild(empty);
      return;
    }
    for (const r of filtered) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "src-item";
      btn.dataset.testid = v.rowTestId;
      btn.textContent = informalLinkRowLabel(r);
      btn.onclick = () => (v.sourcePick ? chooseSourceBill(r.value) : applyLink(r.value));
      body.appendChild(btn);
    }
  }

  async function loadSoRows() {
    if (!api.listSalesOrdersForPicker) return [];
    const res = await api.listSalesOrdersForPicker({
      supplier: supplier || "",
      customer: "",
      billLines: soPickerBillLines(deps.items()),
    });
    return salesOrderLinkRows(res && res.ok && Array.isArray(res.orders) ? res.orders : []);
  }

  // A throw anywhere in here used to leave the dialog's open flag stuck true, locking the picker
  // out for the rest of the session with no way back short of reopening the Bill.
  async function reload() {
    body.innerHTML = `<div class="src-empty">Loading…</div>`;
    try {
      rows = v.isBill ? await deps.searchBills(query.trim()) : await loadSoRows();
    } catch (err) {
      rows = [];
      body.innerHTML = "";
      const failed = document.createElement("div");
      failed.className = "src-empty";
      failed.dataset.testid = "bill-link-picker-error";
      failed.textContent = `Could not load ${v.label}s: ${String(err && err.message ? err.message : err)}`;
      body.appendChild(failed);
      return;
    }
    drawRows();
  }

  searchEl.addEventListener("input", () => {
    query = searchEl.value || "";
    if (v.isBill) {
      if (searchDebounce) clearTimeout(searchDebounce);
      searchDebounce = setTimeout(reload, 220);
    } else {
      drawRows(); // SO rows are fetched once; filtered client-side while typing.
    }
  });

  function onKey(ev) {
    if (ev.key === "Escape") {
      ev.preventDefault();
      close();
    }
  }
  document.addEventListener("keydown", onKey, true);
  back.addEventListener("mousedown", (ev) => {
    if (ev.target === back) close();
  });
  // "Decide later" must not strip an existing token — it only declines to add one now.
  clearBtn.onclick = () => {
    if (!v.sourcePick) return applyLink("");
    close();
    setStatus(DECIDE_LATER_STATUS, "warn");
    return undefined;
  };
  cancelBtn.onclick = () => close();

  await reload();
  searchEl.focus();
}
