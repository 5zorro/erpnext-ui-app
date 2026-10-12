/**
 * Create ▾ on the Sales Order Doc skin and its Purchase Order picker (plan 2026-10-12 S2). Each
 * entry wears its document's wash. The picker mirrors Vanilla's "Select Items" dialog: tick lines,
 * a vendor for all ticked lines or per line; every PO is saved as a draft and the page stays on
 * the Sales Order. Logic in src/so-create-po.js.
 */
import { SO_CREATE_ENTRIES, canCreatePoFrom, poPendingLines, draftQtyBySoLine, poSelection, createdPosMessage } from "./so-create-po.js";
import { DOC_WASH_BY_PROFILE, DOC_WASH_COLORS, DOC_WASH_ACCENTS } from "./doc-wash.js";

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const STYLE_ID = "so-create-style";
function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement("style");
  st.id = STYLE_ID;
  st.textContent = `
.sc-menu { position: fixed; z-index: 70; min-width: 220px; background: #fff; border: 1px solid #cbd5e1; border-radius: 8px;
  box-shadow: 0 8px 24px rgba(15,23,42,.18); padding: 6px; }
.sc-menu button { display: block; width: 100%; text-align: left; border: 1px solid transparent; border-left-width: 4px;
  border-radius: 6px; padding: 8px 10px; margin: 2px 0; font-size: 13px; cursor: pointer; color: #0f172a; }
.sc-menu button:hover, .sc-menu button:focus { outline: 2px solid #2563eb; outline-offset: -2px; }
.sc-overlay { position: fixed; inset: 0; z-index: 80; background: rgba(15,23,42,.35); display: flex; align-items: flex-start;
  justify-content: center; padding: 48px 16px; overflow: auto; }
.sc-panel { background: #fff; border-radius: 10px; width: min(860px, 100%); box-shadow: 0 16px 40px rgba(15,23,42,.3); }
.sc-head { padding: 12px 16px; border-bottom: 1px solid #e2e8f0; border-left: 6px solid; border-radius: 10px 10px 0 0; }
.sc-head h2 { margin: 0; font-size: 16px; }
.sc-head p { margin: 4px 0 0; font-size: 12px; color: #475569; }
.sc-body { padding: 12px 16px; }
.sc-all { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; font-size: 13px; flex-wrap: wrap; }
.sc-vendor-box { display: block; min-width: 240px; }
/* The vendor dropdown floats above the dialog (link-dd-floating is z 60 on the page). */
.sc-overlay .link-dd.link-dd-floating { z-index: 90; }
.sc-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.sc-table th { text-align: left; font-size: 11px; text-transform: uppercase; color: #64748b; padding: 4px 6px; border-bottom: 1px solid #e2e8f0; }
.sc-table td { padding: 6px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
.sc-table td.sc-qty { text-align: right; white-space: nowrap; }
.sc-table tr.sc-done td { color: #94a3b8; }
.sc-note { font-size: 11px; color: #64748b; }
.sc-foot { display: flex; gap: 8px; align-items: center; justify-content: flex-end; padding: 10px 16px; border-top: 1px solid #e2e8f0; }
.sc-foot .sc-msg { margin-right: auto; font-size: 12px; color: #b91c1c; }
.sc-foot button { padding: 6px 12px; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; font-size: 13px; }
.sc-foot button.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
.sc-foot button:disabled { opacity: .6; cursor: default; }
`;
  document.head.appendChild(st);
}

/** The entry's wash: background + accent edge, from the Doc skin it opens. */
function washFor(entry) {
  const w = DOC_WASH_BY_PROFILE[entry.washProfile];
  return w ? { bg: DOC_WASH_COLORS[w.role], accent: DOC_WASH_ACCENTS[w.role] } : { bg: "#fff", accent: "#cbd5e1" };
}

/**
 * @param {{
 *   api: { soCreatePoContext: Function, soCreatePos: Function },
 *   button: HTMLButtonElement|null,
 *   getDoc: () => any,
 *   setStatus: (text: string, kind?: string) => void,
 *   mountSupplierPicker: (input: HTMLInputElement, onPicked: (v: string) => void) => void,
 *   onCreated?: (names: string[]) => Promise<void>|void,
 * }} opts
 */
export function mountSoCreateMenu(opts) {
  const { api, button, getDoc, setStatus, mountSupplierPicker } = opts;
  if (!button) return { paint: () => {} };
  ensureStyle();
  /** @type {HTMLElement|null} */
  let menu = null;

  function closeMenu() {
    if (menu) menu.remove();
    menu = null;
    button.setAttribute("aria-expanded", "false");
  }

  function openMenu() {
    closeMenu();
    menu = document.createElement("div");
    menu.className = "sc-menu";
    menu.setAttribute("role", "menu");
    menu.dataset.testid = "doc-create-menu";
    for (const entry of SO_CREATE_ENTRIES) {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "menuitem");
      b.dataset.create = entry.id;
      const w = washFor(entry);
      b.style.background = w.bg;
      b.style.borderLeftColor = w.accent;
      b.textContent = entry.label;
      b.addEventListener("click", () => {
        closeMenu();
        if (entry.id === "purchase-order") void openPoPicker();
      });
      menu.appendChild(b);
    }
    document.body.appendChild(menu);
    const r = button.getBoundingClientRect();
    menu.style.top = `${Math.round(r.bottom + 4)}px`;
    menu.style.left = `${Math.round(Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8)))}px`;
    button.setAttribute("aria-expanded", "true");
    const first = /** @type {HTMLButtonElement|null} */ (menu.querySelector("button"));
    if (first) first.focus();
  }

  button.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (menu) closeMenu();
    else openMenu();
  });
  document.addEventListener("click", (ev) => {
    if (menu && !menu.contains(/** @type {Node} */ (ev.target))) closeMenu();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && menu) closeMenu();
  });

  async function openPoPicker() {
    const doc = getDoc();
    const can = canCreatePoFrom(doc);
    if (!can.ok) {
      setStatus(can.reason || "Cannot make a purchase order from this order.", "warn");
      return;
    }
    setStatus("Reading what is already ordered…");
    const ctx = await api.soCreatePoContext(doc.name).catch((e) => ({ ok: false, reason: String(e) }));
    if (!ctx || !ctx.ok) {
      setStatus((ctx && ctx.reason) || "Could not read the draft purchase orders.", "err");
      return;
    }
    const lines = poPendingLines(doc, draftQtyBySoLine(ctx.rows));
    if (!lines.length || lines.every((l) => l.fullyOnDrafts)) {
      const drafts = [...new Set(lines.flatMap((l) => l.onDraftPos))];
      setStatus(
        drafts.length
          ? `Every line is already on a purchase order (drafts: ${drafts.join(", ")}).`
          : "Every line is already on a purchase order.",
        "warn",
      );
      return;
    }
    setStatus("");
    showPicker(doc, lines);
  }

  function showPicker(doc, lines) {
    const w = washFor(SO_CREATE_ENTRIES[0]);
    const overlay = document.createElement("div");
    overlay.className = "sc-overlay";
    overlay.dataset.testid = "so-create-po";
    overlay.innerHTML = `<div class="sc-panel" role="dialog" aria-modal="true" aria-labelledby="sc-title">
      <div class="sc-head" style="background:${w.bg};border-left-color:${w.accent}">
        <h2 id="sc-title">Purchase Order from ${esc(doc.name)}</h2>
        <p>Tick the lines to order and give each a vendor. One purchase order per vendor, each saved as a draft — you stay on this order.</p>
      </div>
      <div class="sc-body">
        <div class="sc-all"><label for="sc-vendor-all">Vendor for ticked lines</label>
          <span class="sc-vendor-box"><input id="sc-vendor-all" data-testid="so-create-vendor-all" autocomplete="off" /></span>
          <button type="button" data-sc="apply">Apply</button></div>
        <table class="sc-table"><thead><tr><th><input type="checkbox" data-sc="all" checked aria-label="Tick every line" /></th>
          <th>Item</th><th>Description</th><th style="text-align:right">To order</th><th>Vendor</th></tr></thead>
          <tbody>${lines
            .map(
              (l, i) => `<tr data-i="${i}" class="${l.fullyOnDrafts ? "sc-done" : ""}">
              <td><input type="checkbox" data-sc="tick" ${l.fullyOnDrafts ? "disabled" : "checked"} aria-label="Order ${esc(l.itemCode)}" /></td>
              <td>${esc(l.itemCode)}</td>
              <td>${esc(l.itemName)}${l.onDraftPos.length ? `<div class="sc-note">Already on draft ${esc(l.onDraftPos.join(", "))}</div>` : ""}</td>
              <td class="sc-qty">${esc(l.pendingQty)} ${esc(l.uom)}</td>
              <td><span class="sc-vendor-box"><input data-sc="vendor" value="${esc(l.supplier)}" autocomplete="off" ${l.fullyOnDrafts ? "disabled" : ""} /></span></td></tr>`,
            )
            .join("")}</tbody></table>
      </div>
      <div class="sc-foot"><span class="sc-msg" data-sc="msg" data-testid="so-create-msg"></span>
        <button type="button" data-sc="cancel">Cancel</button>
        <button type="button" class="primary" data-sc="save" data-testid="so-create-save">Save draft purchase orders</button></div>
    </div>`;
    document.body.appendChild(overlay);
    const q = (sel) => /** @type {HTMLElement} */ (overlay.querySelector(sel));
    const rows = [...overlay.querySelectorAll("tbody tr")];
    const vendorAll = /** @type {HTMLInputElement} */ (q("#sc-vendor-all"));
    const msg = q('[data-sc="msg"]');
    const close = () => {
      overlay.remove();
      document.removeEventListener("keydown", onKey, true);
      button.focus();
    };
    const onKey = (ev) => {
      if (ev.key === "Escape" && !overlay.querySelector(".link-dd:not([hidden])")) {
        ev.stopPropagation();
        close();
      }
    };
    document.addEventListener("keydown", onKey, true);
    mountSupplierPicker(vendorAll, () => {});
    rows.forEach((tr) => {
      const inp = /** @type {HTMLInputElement} */ (tr.querySelector('[data-sc="vendor"]'));
      if (!inp.disabled) mountSupplierPicker(inp, () => {});
    });
    q('[data-sc="apply"]').addEventListener("click", () => {
      const v = vendorAll.value.trim();
      if (!v) return;
      rows.forEach((tr) => {
        const tick = /** @type {HTMLInputElement} */ (tr.querySelector('[data-sc="tick"]'));
        const inp = /** @type {HTMLInputElement} */ (tr.querySelector('[data-sc="vendor"]'));
        if (tick.checked && !inp.disabled) {
          inp.value = v;
          inp.dataset.linkCommitted = v;
        }
      });
    });
    q('[data-sc="all"]').addEventListener("change", (ev) => {
      const on = /** @type {HTMLInputElement} */ (ev.target).checked;
      rows.forEach((tr) => {
        const tick = /** @type {HTMLInputElement} */ (tr.querySelector('[data-sc="tick"]'));
        if (!tick.disabled) tick.checked = on;
      });
    });
    q('[data-sc="cancel"]').addEventListener("click", close);
    const save = /** @type {HTMLButtonElement} */ (q('[data-sc="save"]'));
    save.addEventListener("click", async () => {
      const picks = rows.map((tr, i) => ({
        ...lines[i],
        ticked: /** @type {HTMLInputElement} */ (tr.querySelector('[data-sc="tick"]')).checked,
        supplier: /** @type {HTMLInputElement} */ (tr.querySelector('[data-sc="vendor"]')).value,
      }));
      const sel = poSelection(picks);
      if (!sel.ok) {
        msg.textContent = sel.reason;
        return;
      }
      msg.textContent = "";
      save.disabled = true;
      save.textContent = "Saving…";
      /** @type {Record<string, number>} */
      const pending = {};
      for (const l of lines) pending[l.rowName] = l.pendingQty;
      const res = await api.soCreatePos({ soName: doc.name, selectedItems: sel.selectedItems, pending }).catch((e) => ({ ok: false, reason: String(e) }));
      if (!res || !res.ok) {
        save.disabled = false;
        save.textContent = "Save draft purchase orders";
        msg.textContent = (res && res.reason) || "Could not create the purchase orders.";
        return;
      }
      close();
      // The page re-reads the order first (its repaint resets the status line), then says what was made.
      if (opts.onCreated) await opts.onCreated(res.names || []);
      setStatus(createdPosMessage(res.names, res.failed), res.failed && res.failed.length ? "warn" : "");
    });
    const firstTick = /** @type {HTMLInputElement|null} */ (overlay.querySelector('[data-sc="vendor"]:not([disabled])'));
    (firstTick || vendorAll).focus();
  }

  return {
    /** Show Create where the skin has it; grey it (with the reason) when ERPNext would refuse. */
    paint(show, doc) {
      button.hidden = !show;
      if (!show) {
        closeMenu();
        return;
      }
      const can = canCreatePoFrom(doc);
      button.disabled = !can.ok;
      button.title = can.ok ? "Create documents from this order" : can.reason || "";
    },
  };
}
