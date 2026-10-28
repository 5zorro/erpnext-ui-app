/**
 * A Bill line's *Assign…* dialog on screen (OI-134; plan 2026-10-25 R6a-2): customer → Sales
 * Order(s) → Project → (when the split is not exact) check the costing. Its steps are pure
 * (src/bill-assign.js); this module owns the DOM and the calls. The Bill page checks the dialog may
 * open, then hands over what it needs as `deps`.
 */
import {
  assignStart,
  assignStep,
  assignView,
  assignPrimaryAction,
  assignCustomerChoice,
  assignOfferedSalesOrders,
  assignNeedsPlan,
  assignPlanRequest,
  assignApplyRequest,
  assignMarginLines,
  filterAssignProjects,
  assignProjectLabel,
} from "./bill-assign.js";
import { formatSalesOrderPickerLabel } from "./so-picker.js";
import { uiIconHtml } from "./ui-icons.js";
import { renderCostingBox } from "./costing-box-ui.js";

/**
 * @typedef {{
 *   api: any,
 *   rowIndex: number,
 *   supplier: string,
 *   items: () => Array<any>|null|undefined,
 *   setStatus: (text: string, tone?: string) => void,
 *   onClose: () => void,
 *   onApplied: (res: any) => void,
 *   refresh: () => Promise<unknown>,
 * }} AssignModalDeps
 *   `items` — the Bill's lines when the Sales Orders load (for their margins); `onClose` — the
 *   dialog is gone; `onApplied` — ERPNext took the allocation (`res` from `applyLineAllocation`),
 *   repaint; `refresh` — it refused, reload the Bill
 */

/** @param {AssignModalDeps} deps */
export async function openAssignModal(deps) {
  const { api, rowIndex, supplier: sup, setStatus } = deps;
  let state = assignStart();
  const dispatch = (action) => {
    state = assignStep(state, action);
  };

  const back = document.createElement("div");
  back.className = "src-back";
  back.dataset.testid = "bill-allocation-picker";
  const box = document.createElement("div");
  box.className = "src-box";
  box.tabIndex = -1;
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", "Assign deal");
  box.innerHTML = `<div class="src-title" data-alloc-title>Assign — customer</div>
    <div class="src-so-search" style="padding:8px 14px;border-bottom:1px solid #e2e8f0;">
      <input type="text" data-alloc-search placeholder="Search…" style="width:100%;padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;" />
    </div>
    <div class="src-body"></div>
    <div class="src-foot">
      <button type="button" data-act="back" hidden>Back</button>
      <button type="button" class="primary" data-act="pick">Continue</button>
      <button type="button" data-act="cancel">Cancel</button>
    </div>`;
  back.appendChild(box);
  document.body.appendChild(back);
  const body = box.querySelector(".src-body");
  const titleEl = box.querySelector("[data-alloc-title]");
  const searchEl = box.querySelector("[data-alloc-search]");
  const pickBtn = box.querySelector('[data-act="pick"]');
  const backBtn = box.querySelector('[data-act="back"]');

  async function loadCustomers(q) {
    if (!api.searchLink) return [];
    const res = await api.searchLink("Customer", q || "");
    return res && res.ok && Array.isArray(res.results) ? res.results : [];
  }

  async function loadSalesOrders(customer) {
    const res = await api.listSalesOrdersForPicker({
      supplier: sup,
      customer: customer || "",
      billLines: assignMarginLines(deps.items(), rowIndex),
    });
    return res && res.ok && Array.isArray(res.orders) ? res.orders : [];
  }

  async function loadProjects(customer) {
    if (!api.listProjectsForPicker) return [];
    const res = await api.listProjectsForPicker(customer || "");
    return res && res.ok && Array.isArray(res.projects) ? res.projects : [];
  }

  function close() {
    deps.onClose();
    document.removeEventListener("keydown", onKey, true);
    if (back.parentNode) back.parentNode.removeChild(back);
  }

  /** The step's title, buttons and search box, and an empty list to fill. */
  function frame() {
    const v = assignView(state, rowIndex);
    titleEl.textContent = v.title;
    pickBtn.textContent = v.primary;
    backBtn.hidden = !v.back;
    searchEl.parentElement.hidden = !v.search;
    if (v.search) searchEl.placeholder = v.search;
    body.innerHTML = "";
  }

  /** A row button; `onPick` changes the state, then the step is drawn again. */
  function row(text, className, onPick) {
    const r = document.createElement("button");
    r.type = "button";
    r.className = className;
    if (text != null) r.textContent = text;
    r.onclick = () => {
      onPick();
      draw();
    };
    body.appendChild(r);
    return r;
  }

  function drawCustomers() {
    row("All customers", "src-item" + (state.customerIndex === 0 ? " active" : ""), () => dispatch({ type: "pickCustomer", index: 0 }));
    state.customers.forEach((c, idx) => {
      row(c.description || c.value, "src-item" + (state.customerIndex === idx + 1 ? " active" : ""), () =>
        dispatch({ type: "pickCustomer", index: idx + 1 }),
      );
    });
  }

  function drawSalesOrders() {
    if (!state.salesOrders.length) {
      const empty = document.createElement("div");
      empty.className = "src-group";
      empty.textContent = "No Sales Orders — continue to assign Project only.";
      body.appendChild(empty);
      return;
    }
    for (const so of assignOfferedSalesOrders(state)) {
      const on = state.selected.includes(so.name);
      const r = row(null, "src-item" + (on ? " selected" : "") + (so.negativeMargin ? " negative" : ""), () =>
        dispatch({ type: "toggleSalesOrder", name: so.name }),
      );
      const mark = document.createElement("span");
      mark.className = "src-check";
      mark.setAttribute("aria-hidden", "true");
      mark.innerHTML = uiIconHtml(on ? "checkbox-checked" : "checkbox", { size: 12 });
      const lab = document.createElement("span");
      lab.className = "src-item-label";
      lab.textContent = formatSalesOrderPickerLabel(so);
      r.appendChild(mark);
      r.appendChild(lab);
    }
  }

  function drawProjects() {
    row("— No project —", "src-item" + (state.projectIndex === 0 ? " active" : ""), () => dispatch({ type: "pickProject", index: 0 }));
    if (!state.projects.length) {
      const empty = document.createElement("button");
      empty.type = "button";
      empty.className = "src-item link-action";
      empty.textContent = "No projects found — create Project in Vanilla…";
      empty.onclick = () => {
        if (api.openProjectAdd) api.openProjectAdd();
      };
      body.appendChild(empty);
    }
    state.projects.forEach((p, idx) => {
      row(assignProjectLabel(p), "src-item" + (state.projectIndex === idx + 1 ? " active" : ""), () =>
        dispatch({ type: "pickProject", index: idx + 1 }),
      );
    });
  }

  /**
   * "Costing Assumptions!" (review 10-19 R6b-4): the by-need split, per Sales Order, before
   * anything is made — the clerk can fill an order from stock instead, or say Okay.
   */
  function drawCosting() {
    body.appendChild(
      renderCostingBox(state.plan, {
        onToggleStock: async (so, on) => {
          dispatch({ type: "toggleStock", salesOrder: so, on });
          const again = await api.planLineAllocation(rowIndex, assignPlanRequest(state));
          if (again && again.ok && again.plan) showCosting(again.plan);
          else setStatus((again && again.reason) || "Could not work out the split.", "err");
        },
      }),
    );
  }

  function draw() {
    frame();
    if (state.step === "customer") drawCustomers();
    else if (state.step === "so") drawSalesOrders();
    else if (state.step === "project") drawProjects();
    else drawCosting();
  }

  function showCosting(plan) {
    dispatch({ type: "costing", plan });
    draw();
    setStatus("The split is not exact — check what comes from stock, then Okay or Cancel.", "warn");
  }

  async function goToSalesOrders() {
    const choice = assignCustomerChoice(state);
    setStatus("Loading Sales Orders…");
    const rows = await loadSalesOrders(choice.customer);
    dispatch({ type: "salesOrders", ...choice, rows });
    draw();
  }

  async function goToProjects() {
    setStatus("Loading projects…");
    dispatch({ type: "projects", rows: await loadProjects(state.customer) });
    draw();
  }

  async function applyAllocation() {
    if (assignNeedsPlan(state) && api.planLineAllocation) {
      setStatus("Working out the split…");
      const pr = await api.planLineAllocation(rowIndex, assignPlanRequest(state));
      if (!(pr && pr.ok)) {
        setStatus((pr && pr.reason) || "Could not work out the split.", "err");
        return;
      }
      if (pr.plan && pr.plan.needsConfirm) {
        showCosting(pr.plan);
        return;
      }
    }
    setStatus("Applying allocation…");
    const res = await api.applyLineAllocation(rowIndex, assignApplyRequest(state, sup));
    if (res && res.needsConfirm && res.plan) {
      // The orders changed since the box was drawn (another PO against them): show it again.
      showCosting(res.plan);
      setStatus("The orders changed since you looked — check the costing again.", "warn");
      return;
    }
    close();
    if (res && res.ok) {
      deps.onApplied(res);
      const poNote = res.bridgePo ? ` · PO ${res.bridgePo}` : "";
      // Review 10-19 R2-2: the line is assigned either way; a missing PO is said, not hidden.
      if (res.bridgeFailure) setStatus(`Line ${rowIndex + 1} assigned${poNote}. ${res.bridgeFailure}`, "warn");
      else setStatus(`Line ${rowIndex + 1} assigned${poNote}.`);
    } else {
      setStatus((res && res.reason) || "Could not apply allocation.", "err");
      await deps.refresh();
    }
  }

  async function onPrimary() {
    const next = assignPrimaryAction(state);
    if (next === "load-sales-orders") await goToSalesOrders();
    else if (next === "load-projects") await goToProjects();
    else await applyAllocation();
  }

  function onKey(ev) {
    if (ev.key === "Escape") {
      ev.preventDefault();
      close();
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      onPrimary();
    }
  }

  let searchTimer = null;
  // Only the newest search may paint: a slow answer for older text must not replace it (R5b-1).
  let searchSeq = 0;
  searchEl.oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      const seq = ++searchSeq;
      const text = searchEl.value;
      if (state.step === "customer") {
        const rows = await loadCustomers(text);
        if (seq !== searchSeq || state.step !== "customer") return;
        dispatch({ type: "customers", rows });
        draw();
      } else if (state.step === "project") {
        const rows = await loadProjects(state.customer);
        if (seq !== searchSeq || state.step !== "project") return;
        dispatch({ type: "projectsFound", rows: filterAssignProjects(rows, text) });
        draw();
      }
    }, 180);
  };

  pickBtn.onclick = () => onPrimary();
  backBtn.onclick = () => {
    dispatch({ type: "back" });
    draw();
  };
  box.querySelector('[data-act="cancel"]').onclick = () => close();
  back.addEventListener("click", (ev) => {
    if (ev.target === back) close();
  });
  document.addEventListener("keydown", onKey, true);

  dispatch({ type: "customers", rows: await loadCustomers("") });
  draw();
  try {
    if (api.focusBillSurface) api.focusBillSurface();
  } catch {
    /* ignore */
  }
  searchEl.focus();
}
