/**
 * Draws the "Costing Assumptions!" box (src/costing-assumptions.js) — on the Bill, before a line's
 * Sales Order split is made, with a "From stock" tick per order; and, read-only, wherever the
 * decision is looked at again (the Sales Order, from its Comment). Text only, no innerHTML.
 */
import { COSTING_TITLE, COSTING_LEAD, costingBoxModel, costingLookbackCaption } from "./costing-assumptions.js";

/**
 * @param {Parameters<typeof costingBoxModel>[0]} plan
 * @param {{ onToggleStock?: (salesOrder: string, on: boolean) => void, here?: string }} [opts] no `onToggleStock` =
 *   read-only; `here` marks the order being looked at
 * @returns {HTMLElement}
 */
export function renderCostingBox(plan, opts = {}) {
  const box = costingBoxModel(plan);
  const wrap = document.createElement("div");
  wrap.className = "costing-box";
  wrap.dataset.testid = "costing-box";
  const title = document.createElement("div");
  title.className = "costing-title";
  title.textContent = COSTING_TITLE;
  const lead = document.createElement("p");
  lead.className = "costing-lead";
  lead.textContent = COSTING_LEAD;
  wrap.append(title, lead);

  const table = document.createElement("table");
  table.className = "costing-table";
  const head = table.createTHead().insertRow();
  const u = box.unit ? ` (${box.unit})` : "";
  for (const h of ["Sales Order", `Needs${u}`, `From this bill${u}`, "From stock", ...(opts.onToggleStock ? ["Fill from stock"] : [])]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.appendChild(th);
  }
  const tb = table.createTBody();
  for (const r of box.rows) {
    const tr = tb.insertRow();
    tr.dataset.so = r.salesOrder;
    if (opts.here && r.salesOrder === opts.here) tr.className = "costing-here";
    for (const v of [r.salesOrder, r.open, r.gets, r.note]) tr.insertCell().textContent = v;
    if (opts.onToggleStock) {
      const cell = tr.insertCell();
      if (r.canTick) {
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = r.fromStock;
        cb.dataset.testid = "costing-from-stock";
        cb.setAttribute("aria-label", `Fill ${r.salesOrder} from stock`);
        cb.onchange = () => opts.onToggleStock(r.salesOrder, cb.checked);
        cell.appendChild(cb);
      }
    }
  }
  if (box.stockRow) {
    const tr = tb.insertRow();
    tr.className = "costing-stock-row";
    const td = tr.insertCell();
    td.colSpan = opts.onToggleStock ? 5 : 4;
    td.textContent = box.stockRow;
  }
  wrap.appendChild(table);
  return wrap;
}

/**
 * The Sales Order's look-back (plan 10-19 R6b-4 step 8): every costing note on one order line, each
 * as the box the clerk said Okay to, read-only, newest first. Esc, Close or the backdrop closes it.
 * @param {import("./costing-assumptions.js").CostingLookback[]} entries
 * @param {{ salesOrder: string, lineLabel: string, onPeek?: (route: string) => void, returnFocus?: HTMLElement|null }} opts
 * @returns {() => void} close
 */
export function showCostingLookback(entries, opts) {
  const back = document.createElement("div");
  back.className = "addr-modal-backdrop";
  back.dataset.testid = "costing-lookback";
  const dlg = document.createElement("div");
  dlg.className = "addr-modal costing-lookback";
  dlg.setAttribute("role", "dialog");
  dlg.setAttribute("aria-modal", "true");
  const h = document.createElement("h2");
  h.textContent = `Costing — ${opts.lineLabel}`;
  dlg.setAttribute("aria-label", h.textContent);
  const hint = document.createElement("p");
  hint.className = "addr-modal-hint";
  hint.textContent =
    entries.length > 1
      ? `${entries.length} bills split onto this line. Each box is what the clerk saw and said Okay to; this order is in bold.`
      : "What the clerk saw and said Okay to when the bill was assigned; this order is in bold.";
  dlg.append(h, hint);

  const close = () => {
    document.removeEventListener("keydown", onKey, true);
    back.remove();
    if (opts.returnFocus && opts.returnFocus.isConnected) opts.returnFocus.focus();
  };
  for (const e of entries) {
    const cap = document.createElement("div");
    cap.className = "costing-caption";
    cap.textContent = costingLookbackCaption(e);
    if (opts.onPeek && e.note.po) {
      const peek = document.createElement("button");
      peek.type = "button";
      peek.className = "costing-peek";
      peek.textContent = `Peek at ${e.note.po}`;
      peek.onclick = () => {
        close();
        opts.onPeek(`/app/purchase-order/${encodeURIComponent(e.note.po)}`);
      };
      cap.append(" ", peek);
    }
    dlg.append(cap, renderCostingBox(e.note, { here: opts.salesOrder }));
  }
  const actions = document.createElement("div");
  actions.className = "addr-modal-actions";
  const shut = document.createElement("button");
  shut.type = "button";
  shut.className = "primary";
  shut.dataset.testid = "costing-lookback-close";
  shut.textContent = "Close";
  shut.onclick = close;
  actions.appendChild(shut);
  dlg.appendChild(actions);
  back.appendChild(dlg);

  const onKey = (ev) => {
    if (ev.key !== "Escape") return;
    ev.preventDefault();
    ev.stopPropagation();
    close();
  };
  back.addEventListener("mousedown", (ev) => {
    if (ev.target === back) close();
  });
  document.addEventListener("keydown", onKey, true);
  document.body.appendChild(back);
  shut.focus();
  return close;
}
