/**
 * A Bill line's *Assign…* dialog, its steps without the screen (OI-134; plan 2026-10-25 R6a-2):
 * customer → Sales Order(s) → Project, and a fourth, "check the costing" (review 10-19 R6b-4), when
 * the by-need split is not exact. The dialog (src/bill-assign-modal-ui.js) keeps one state, changes
 * it only through `assignStep`, and draws what `assignView` says.
 *
 * Choices are by position, as the clerk sees them: customer 0 is "All customers", project 0 is
 * "— No project —". A new search keeps the customer position (cut to the new list's length).
 */
import { normalizeEditableText } from "./dirty-gate.js";

/** @typedef {"customer"|"so"|"project"|"costing"} AssignStepName */

/**
 * @typedef {{
 *   step: AssignStepName,
 *   customers: Array<{ value: string, description?: string }>,
 *   customerIndex: number,
 *   customer: string,
 *   customerName: string,
 *   salesOrders: Array<{ name: string, draft?: boolean, negativeMargin?: boolean }>,
 *   selected: string[],
 *   projects: Array<{ name: string, project_name?: string, customer?: string, customer_name?: string }>,
 *   projectIndex: number,
 *   fromStock: string[],
 *   plan: any,
 * }} AssignState
 */

/** @returns {AssignState} */
export function assignStart() {
  return {
    step: "customer",
    customers: [],
    customerIndex: 0,
    customer: "",
    customerName: "",
    salesOrders: [],
    selected: [],
    projects: [],
    projectIndex: 0,
    fromStock: [],
    plan: null,
  };
}

/** The customer at the current position: `{ value: "" }` for "All customers". */
export function assignActiveCustomer(state) {
  if (state.customerIndex === 0) return { value: "", description: "All customers" };
  return state.customers[state.customerIndex - 1];
}

/** The customer filter and name the Sales Order step loads with, from the current position. */
export function assignCustomerChoice(state) {
  const c = assignActiveCustomer(state);
  const customer = c && c.value ? c.value : "";
  return { customer, customerName: c && c.description ? c.description : customer };
}

const toggled = (list, name) => (list.includes(name) ? list.filter((x) => x !== name) : [...list, name]);

/**
 * @param {AssignState} state
 * @param {{ type: string, [k: string]: any }} action
 *   - `customers` { rows } — a customer search answered
 *   - `pickCustomer` { index } / `pickProject` { index } — a row clicked
 *   - `salesOrders` { customer, customerName, rows } — on to the Sales Order step
 *   - `toggleSalesOrder` { name }
 *   - `projects` { rows } — on to the Project step, "— No project —" chosen
 *   - `projectsFound` { rows } — a project search answered; the position stays
 *   - `costing` { plan } — on to (or redraw) the costing step
 *   - `toggleStock` { salesOrder, on }
 *   - `back`
 * @returns {AssignState}
 */
export function assignStep(state, action) {
  switch (action.type) {
    case "customers":
      return { ...state, customers: action.rows, customerIndex: Math.min(state.customerIndex, action.rows.length) };
    case "pickCustomer":
      return { ...state, customerIndex: action.index };
    case "salesOrders":
      return { ...state, step: "so", customer: action.customer, customerName: action.customerName, salesOrders: action.rows };
    case "toggleSalesOrder":
      return { ...state, selected: toggled(state.selected, action.name) };
    case "projects":
      return { ...state, step: "project", projects: action.rows, projectIndex: 0 };
    case "projectsFound":
      return { ...state, projects: action.rows };
    case "pickProject":
      return { ...state, projectIndex: action.index };
    case "costing":
      return { ...state, step: "costing", plan: action.plan };
    case "toggleStock": {
      const has = state.fromStock.includes(action.salesOrder);
      if (has === Boolean(action.on)) return state;
      return { ...state, fromStock: toggled(state.fromStock, action.salesOrder) };
    }
    case "back": {
      const to = { so: "customer", project: "so", costing: "project" }[state.step];
      return to ? { ...state, step: to } : state;
    }
    default:
      return state;
  }
}

/**
 * What the dialog shows for a step: its title, the main button's words, and whether Back and the
 * search box are there.
 * @param {AssignState} state
 * @param {number} rowIndex the Bill line, from 0
 */
export function assignView(state, rowIndex) {
  const line = `Assign line ${rowIndex + 1}`;
  switch (state.step) {
    case "customer":
      return { title: `${line} — pick customer`, primary: "Next: Sales orders", back: false, search: "Customer search…" };
    case "so":
      return { title: `${line} — select Sales order(s)`, primary: "Next: Project", back: true, search: null };
    case "project":
      return { title: `${line} — Project`, primary: "Apply to line", back: true, search: "Project search…" };
    default:
      return { title: `${line} — check the costing`, primary: "Okay, I still want to do this", back: true, search: null };
  }
}

/** What the main button (or Enter) does next: load the Sales Orders, load the projects, or apply. */
export function assignPrimaryAction(state) {
  if (state.step === "customer") return "load-sales-orders";
  if (state.step === "so") return "load-projects";
  return "apply";
}

/** The Sales Orders listed in the second step: drafts are not offered. */
export const assignOfferedSalesOrders = (state) => state.salesOrders.filter((row) => !row.draft);

/** The chosen project's name, "" for none. */
export function assignProject(state) {
  const p = state.projectIndex > 0 && state.projects[state.projectIndex - 1];
  return p ? p.name : "";
}

/** Whether Apply must first work out the split: Sales Orders are ticked and the costing was not shown yet. */
export const assignNeedsPlan = (state) => state.step !== "costing" && state.selected.length > 0;

/** What the split is worked out for. */
export const assignPlanRequest = (state) => ({ salesOrders: [...state.selected], fromStock: [...state.fromStock] });

/**
 * The line's allocation as `applyLineAllocation` takes it; a costing step that was shown sends its
 * plan's key, so the server can tell the orders changed since.
 * @param {AssignState} state
 * @param {string} supplier
 */
export function assignApplyRequest(state, supplier) {
  return {
    customer: state.customer,
    customerName: state.customerName,
    salesOrders: [...state.selected],
    project: assignProject(state),
    supplier,
    fromStock: [...state.fromStock],
    confirmedKey: state.step === "costing" && state.plan ? state.plan.key : undefined,
  };
}

/**
 * The Bill lines the Sales Order margins are worked out from: the line being assigned, or every
 * line when it is not there.
 * @param {Array<any>|null|undefined} items
 * @param {number} rowIndex
 */
export function assignMarginLines(items, rowIndex) {
  const rows = Array.isArray(items) ? items : [];
  const pick = (r) => ({ item_code: r.item_code, qty: r.qty, rate: r.rate, amount: r.amount });
  return rows[rowIndex] ? [pick(rows[rowIndex])] : rows.map(pick);
}

/** The project search: name, title or customer contains the text, any case. */
export function filterAssignProjects(rows, text) {
  const q = normalizeEditableText(text).toLowerCase();
  return rows.filter((p) => !q || `${p.name} ${p.project_name || ""} ${p.customer_name || ""}`.toLowerCase().includes(q));
}

/** A project row's words: "title · customer". */
export function assignProjectLabel(row) {
  const label = row.project_name || row.name;
  const cust = row.customer_name || row.customer || "";
  return cust ? `${label} · ${cust}` : label;
}
