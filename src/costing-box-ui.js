/**
 * Draws the "Costing Assumptions!" box (src/costing-assumptions.js) — on the Bill, before a line's
 * Sales Order split is made, with a "From stock" tick per order; and, read-only, wherever the
 * decision is looked at again (the Sales Order, from its Comment). Text only, no innerHTML.
 */
import { COSTING_TITLE, COSTING_LEAD, costingBoxModel } from "./costing-assumptions.js";

/**
 * @param {Parameters<typeof costingBoxModel>[0]} plan
 * @param {{ onToggleStock?: (salesOrder: string, on: boolean) => void }} [opts] no `onToggleStock` = read-only
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
  for (const h of ["Sales Order", "Needs", "From this bill", "From stock", ...(opts.onToggleStock ? ["Fill from stock"] : [])]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.appendChild(th);
  }
  const tb = table.createTBody();
  for (const r of box.rows) {
    const tr = tb.insertRow();
    tr.dataset.so = r.salesOrder;
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
