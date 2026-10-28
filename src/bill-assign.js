/**
 * A Bill line's *Assign…* dialog, its steps without the screen (OI-134; plan 2026-10-25 R6a-2):
 * customer → Sales Order(s) → Project, and a fourth, "check the costing" (review 10-19 R6b-4), when
 * the by-need split is not exact. The dialog (src/bill-assign-modal-ui.js) keeps one state, changes
 * it only through `assignStep`, and draws what `assignView` says.
 *
 * Picks are kept by name (museum OI-192): "" is "All customers" / "— No project —", and a search
 * that hides the pick falls back to that, so what is highlighted is what Apply sends. Only the
 * Sales Orders on the list shown stay ticked: a new list (another customer) drops the others.
 */
import { normalizeEditableText } from "./dirty-gate.js";
import { soPickerBillLines } from "./so-picker.js";

/** @typedef {"customer"|"so"|"project"|"costing"} AssignStepName */

/**
 * @typedef {{
 *   step: AssignStepName,
 *   customers: Array<{ value: string, description?: string }>,
 *   customerPick: string,
 *   customer: string,
 *   customerName: string,
 *   salesOrders: Array<{ name: string, draft?: boolean, negativeMargin?: boolean }>,
 *   selected: string[],
 *   projects: Array<{ name: string, project_name?: string, customer?: string, customer_name?: string }>,
 *   projectPick: string,
 *   fromStock: string[],
 *   plan: any,
 * }} AssignState
 */

/** @returns {AssignState} */
export function assignStart() {
  return {
    step: "customer",
    customers: [],
    customerPick: "",
    customer: "",
    customerName: "",
    salesOrders: [],
    selected: [],
    projects: [],
    projectPick: "",
    fromStock: [],
    plan: null,
  };
}

const ALL_CUSTOMERS = Object.freeze({ value: "", description: "All customers" });

/** The picked customer's row: `{ value: "" }` for "All customers". */
export function assignActiveCustomer(state) {
  return (state.customerPick && state.customers.find((c) => c.value === state.customerPick)) || ALL_CUSTOMERS;
}

/** The customer filter and name the Sales Order step loads with, from the current position. */
export function assignCustomerChoice(state) {
  const c = assignActiveCustomer(state);
  const customer = c && c.value ? c.value : "";
  return { customer, customerName: c && c.description ? c.description : customer };
}

/** A pick still on the list, else "" (All customers / No project). */
const kept = (pick, rows, key) => (pick && rows.some((r) => r[key] === pick) ? pick : "");
const toggled = (list, name) => (list.includes(name) ? list.filter((x) => x !== name) : [...list, name]);

/**
 * @param {AssignState} state
 * @param {{ type: string, [k: string]: any }} action
 *   - `customers` { rows } — a customer search answered
 *   - `pickCustomer` { value } / `pickProject` { name } — a row clicked ("" for All / No project)
 *   - `salesOrders` { customer, customerName, rows } — on to the Sales Order step; ticks not on
 *     the new list are dropped
 *   - `toggleSalesOrder` { name }
 *   - `projects` { rows } — on to the Project step, "— No project —" chosen
 *   - `projectsFound` { rows } — a project search answered; the pick stays if it is listed
 *   - `costing` { plan } — on to (or redraw) the costing step
 *   - `toggleStock` { salesOrder, on }
 *   - `back`
 * @returns {AssignState}
 */
export function assignStep(state, action) {
  switch (action.type) {
    case "customers":
      return { ...state, customers: action.rows, customerPick: kept(state.customerPick, action.rows, "value") };
    case "pickCustomer":
      return { ...state, customerPick: action.value };
    case "salesOrders": {
      const offered = action.rows.filter((row) => !row.draft).map((row) => row.name);
      return {
        ...state,
        step: "so",
        customer: action.customer,
        customerName: action.customerName,
        salesOrders: action.rows,
        selected: state.selected.filter((name) => offered.includes(name)),
      };
    }
    case "toggleSalesOrder":
      return { ...state, selected: toggled(state.selected, action.name) };
    case "projects":
      return { ...state, step: "project", projects: action.rows, projectPick: "" };
    case "projectsFound":
      return { ...state, projects: action.rows, projectPick: kept(state.projectPick, action.rows, "name") };
    case "pickProject":
      return { ...state, projectPick: action.name };
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
export const assignProject = (state) => kept(state.projectPick, state.projects, "name");

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
  return soPickerBillLines(rows[rowIndex] ? [rows[rowIndex]] : rows);
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
