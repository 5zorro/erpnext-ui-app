/**
 * Create ▾ on the Sales Order Doc skin and its Purchase Order picker (plan 2026-10-12 S2). Each
 * entry wears its document's wash. The picker mirrors Vanilla's "Select Items" dialog: tick lines,
 * a vendor for all ticked lines or per line; every PO is saved as a draft and the page stays on
 * the Sales Order. Logic in src/so-create-po.js.
 */
import { SO_CREATE_ENTRIES, canCreatePoFrom, poPendingLines, draftQtyBySoLine, poSelection, createdPosMessage, pendingForSave } from "./so-create-po.js";
import { soCreateEntries, soCreateFlow, CREATE_VIEW_KEY, normalizeCreateView } from "./so-create-menu.js";
import { DOC_WASH_BY_PROFILE, DOC_WASH_COLORS, DOC_WASH_ACCENTS } from "./doc-wash.js";

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const STYLE_ID = "so-create-style";
function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement("style");
  st.id = STYLE_ID;
  st.textContent = `
.sc-menu { position: fixed; z-index: 70; min-width: 240px; max-width: calc(100vw - 48px); max-height: calc(100vh - 80px); overflow: auto;
  background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; box-shadow: 0 8px 24px rgba(15,23,42,.18); padding: 6px; }
.sc-view { display: flex; gap: 0; margin: 0 0 6px; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; width: max-content; }
.sc-view button { border: 0; background: #fff; padding: 3px 10px; font-size: 12px; cursor: pointer; color: #334155; }
.sc-view button[aria-pressed="true"] { background: #1e293b; color: #fff; }
.sc-menu[data-view="flow"] { width: max-content; }
.sc-flow { display: flex; gap: 6px; align-items: stretch; }
.sc-col { display: flex; flex-direction: column; gap: 4px; min-width: 112px; max-width: 150px; }
.sc-col h4 { margin: 0 0 2px; font-size: 10px; letter-spacing: .4px; text-transform: uppercase; color: #64748b; }
.sc-arrow { align-self: center; color: #94a3b8; font-size: 16px; }
.sc-box { font-size: 12px; padding: 6px 8px; display: flex; flex-direction: column; gap: 3px; }
.sc-box .sc-made { font-size: 11px; color: #475569; }
.sc-box.sc-current { outline: 2px solid #1e293b; }
.sc-box.sc-off { opacity: .55; }
.sc-box button { align-self: flex-start; font-size: 11px; padding: 1px 8px; border: 1px solid #94a3b8; border-radius: 5px; background: #fff; cursor: pointer; }
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
.sc-note { font-size: 11px; color: #64748b; margin: 4px; }
.sc-foot { display: flex; gap: 8px; align-items: center; justify-content: flex-end; padding: 10px 16px; border-top: 1px solid #e2e8f0; }
.sc-foot .sc-msg { margin-right: auto; font-size: 12px; color: #b91c1c; }
.sc-foot button { padding: 6px 12px; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; font-size: 13px; }
.sc-foot button.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
.sc-foot button:disabled { opacity: .6; cursor: default; }
`;
  document.head.appendChild(st);
}

/** The picker header's wash: background + accent edge, from the Doc skin it opens. */
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
 *   stickyStatus?: (text: string) => void,
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

  /** List or flowchart — the clerk's choice, remembered on this machine (a convenience only). */
  function readView() {
    try {
      return normalizeCreateView(localStorage.getItem(CREATE_VIEW_KEY));
    } catch {
      return "list";
    }
  }
  function writeView(v) {
    try {
      localStorage.setItem(CREATE_VIEW_KEY, v);
    } catch {
      /* per-viewer convenience only */
    }
  }

  /** Run one Create entry: Purchase Order is the shell's picker; the rest are Vanilla's buttons. */
  async function runEntry(id, label) {
    closeMenu();
    if (id === "purchase-order") {
      void openPoPicker();
      return;
    }
    setStatus(`Opening Vanilla's ${label} — Esc comes back here.`);
    const r = await api.soVanillaCreate(id).catch((e) => ({ ok: false, reason: String(e) }));
    if (!r || !r.ok) setStatus((r && r.reason) || `Could not start ${label}.`, "err");
  }

  function openMenu() {
    closeMenu();
    const doc = getDoc();
    const view = readView();
    menu = document.createElement("div");
    menu.className = "sc-menu";
    menu.setAttribute("role", "menu");
    menu.dataset.testid = "doc-create-menu";
    menu.dataset.view = view;
    menu.innerHTML = `<div class="sc-view" role="group" aria-label="Show Create as">
        <button type="button" data-view="list" aria-pressed="${view === "list"}">List</button>
        <button type="button" data-view="flow" aria-pressed="${view === "flow"}">Flowchart</button></div>
      <div data-sc="body"></div>`;
    const body = /** @type {HTMLElement} */ (menu.querySelector('[data-sc="body"]'));
    const entryHtml = (e, extra = "") =>
      `<button type="button" role="menuitem" class="sc-entry" data-create="${esc(e.id)}" data-role="${esc(e.role)}" data-desk="${esc(e.desk)}"${extra}><span class="hatch-clear">${esc(e.label)}</span></button>`;
    if (view === "list") {
      const { entries, reason } = soCreateEntries(doc);
      body.innerHTML = entries.length
        ? entries.map((e) => entryHtml({ ...e, label: e.id === "purchase-order" ? "Purchase Order…" : e.label })).join("")
        : `<p class="sc-note">${esc(reason || "Nothing to create from this order.")}</p>`;
    } else {
      body.innerHTML = `<div class="sc-flow" data-testid="doc-create-flow"><p class="sc-note">Counting what exists…</p></div>`;
      void paintFlow(body, doc);
    }
    menu.querySelectorAll("[data-view]").forEach((b) =>
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        writeView(/** @type {HTMLElement} */ (b).dataset.view === "flow" ? "flow" : "list");
        openMenu();
      }),
    );
    body.addEventListener("click", (ev) => {
      const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (ev.target).closest("[data-create]"));
      if (!b || b.hasAttribute("disabled")) return;
      ev.stopPropagation();
      void runEntry(b.dataset.create || "", (b.dataset.label || b.textContent || "").replace(/…$/, "").trim());
    });
    document.body.appendChild(menu);
    placeMenu();
    button.setAttribute("aria-expanded", "true");
    const first = /** @type {HTMLButtonElement|null} */ (menu.querySelector("[data-create]") || menu.querySelector("button"));
    if (first) first.focus();
  }

  /** The flowchart: Before → This order → Buy or make → Ship → Bill → Get paid (→ Also). */
  async function paintFlow(body, doc) {
    const res = doc && doc.name && api.soCreateCounts ? await api.soCreateCounts(doc.name).catch(() => null) : null;
    if (!menu || !body.isConnected) return;
    const cols = soCreateFlow(doc, (res && res.counts) || {});
    const flow = /** @type {HTMLElement} */ (body.querySelector(".sc-flow"));
    flow.innerHTML = cols
      .map((col, i) => {
        const boxes = col.boxes
          .map((b) => {
            const made = b.current ? "" : `<span class="sc-made">${b.made ? `${b.made} made` : "none yet"}</span>`;
            const act = b.canCreate
              ? `<button type="button" data-create="${esc(b.id)}" data-label="${esc(b.label)}">Create</button>`
              : "";
            return `<div class="sc-box sc-entry${b.current ? " sc-current" : ""}${!b.canCreate && !b.current && !b.made ? " sc-off" : ""}" data-box="${esc(b.id)}" data-role="${esc(b.role)}" data-desk="${esc(b.desk)}"><span class="hatch-clear">${esc(b.label)}</span>${made}${act}</div>`;
          })
          .join("");
        const arrow = i < cols.length - 1 && col.stage !== "paid" ? `<span class="sc-arrow" aria-hidden="true">→</span>` : "";
        return `<div class="sc-col" data-stage="${esc(col.stage)}"><h4>${esc(col.label)}</h4>${boxes}</div>${arrow}`;
      })
      .join("");
    placeMenu();
  }

  /**
   * Under the button, slid left as far as needed to fit the window (16px gutter). Measured at the
   * left edge first: a fixed box measured where it stands is only as wide as the room to its right.
   */
  function placeMenu() {
    if (!menu) return;
    const r = button.getBoundingClientRect();
    menu.style.top = `${Math.round(r.bottom + 4)}px`;
    menu.style.left = "16px";
    const w = menu.offsetWidth;
    menu.style.left = `${Math.round(Math.max(16, Math.min(r.left, window.innerWidth - w - 16)))}px`;
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
      const again = () => {
        save.disabled = false;
        save.textContent = "Save draft purchase orders";
      };
      // The drafts as they are now, not as they were when this opened (review R8-1).
      const ctx = await api.soCreatePoContext(doc.name).catch((e) => ({ ok: false, reason: String(e) }));
      if (!ctx || !ctx.ok) {
        again();
        msg.textContent = (ctx && ctx.reason) || "Could not read the draft purchase orders.";
        return;
      }
      const { pending, anyLeft } = pendingForSave(picks, poPendingLines(doc, draftQtyBySoLine(ctx.rows)));
      if (!anyLeft) {
        again();
        msg.textContent = "Every ticked line is already on a draft purchase order — see Drafts.";
        return;
      }
      const res = await api.soCreatePos({ soName: doc.name, selectedItems: sel.selectedItems, pending }).catch((e) => ({ ok: false, reason: String(e) }));
      if (res && res.uncertain) {
        // ERPNext may have made some or all of them: never the same Save twice (review R8-1).
        close();
        if (opts.onCreated) await opts.onCreated([]);
        const lost = "Lost contact with ERPNext while saving — the purchase orders may already have been made. Check Drafts before trying again.";
        // Through the repaints the reload brings, not just until the next one.
        if (opts.stickyStatus) opts.stickyStatus(lost);
        else setStatus(lost, "warn");
        return;
      }
      if (!res || !res.ok) {
        save.disabled = false;
        save.textContent = "Save draft purchase orders";
        msg.textContent = (res && res.reason) || "Could not create the purchase orders.";
        return;
      }
      close();
      if (opts.stickyStatus) opts.stickyStatus("");
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
      const can = soCreateEntries(doc);
      button.disabled = !can.ok;
      button.title = can.ok ? "Create documents from this order — as a list or a flowchart" : can.reason || "";
    },
  };
}
