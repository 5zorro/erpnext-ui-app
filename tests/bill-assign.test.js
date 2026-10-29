import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assignStart,
  assignStep,
  assignView,
  assignPrimaryAction,
  assignActiveCustomer,
  assignCustomerChoice,
  assignOfferedSalesOrders,
  assignProject,
  assignNeedsPlan,
  assignPlanRequest,
  assignApplyRequest,
  assignMarginLines,
  filterAssignProjects,
  assignProjectLabel,
} from "../src/bill-assign.js";

const run = (actions, state = assignStart()) => actions.reduce(assignStep, state);
const CUSTOMERS = [
  { value: "CUST-A", description: "Acme" },
  { value: "CUST-B", description: "Bolt" },
  { value: "CUST-C" },
];
const ORDERS = [{ name: "SO-1" }, { name: "SO-2", negativeMargin: true }, { name: "SO-3", draft: true }];
const PROJECTS = [
  { name: "PROJ-1", project_name: "Kitchen", customer_name: "Acme" },
  { name: "PROJ-2", project_name: "Bath", customer: "CUST-B" },
  { name: "PROJ-3" },
];

/** Through the customer step to the Sales Orders, as the dialog does it. */
function toOrders(value, state = run([{ type: "customers", rows: CUSTOMERS }])) {
  const s = assignStep(state, { type: "pickCustomer", value });
  return assignStep(s, { type: "salesOrders", ...assignCustomerChoice(s), rows: ORDERS });
}

describe("Assign — the customer step", () => {
  it("starts on All customers", () => {
    const s = run([{ type: "customers", rows: CUSTOMERS }]);
    assert.equal(s.step, "customer");
    assert.deepEqual(assignActiveCustomer(s), { value: "", description: "All customers" });
    assert.deepEqual(assignCustomerChoice(s), { customer: "", customerName: "All customers" });
    assert.equal(assignPrimaryAction(s), "load-sales-orders");
  });

  it("a picked customer is the filter; a customer with no description is named by its id", () => {
    const s = run([{ type: "customers", rows: CUSTOMERS }]);
    assert.deepEqual(assignCustomerChoice(assignStep(s, { type: "pickCustomer", value: "CUST-A" })), { customer: "CUST-A", customerName: "Acme" });
    assert.deepEqual(assignCustomerChoice(assignStep(s, { type: "pickCustomer", value: "CUST-C" })), { customer: "CUST-C", customerName: "CUST-C" });
  });

  it("a search keeps the picked customer wherever it moves in the list (OI-192)", () => {
    const s = run([{ type: "customers", rows: CUSTOMERS }, { type: "pickCustomer", value: "CUST-C" }]);
    const moved = assignStep(s, { type: "customers", rows: [CUSTOMERS[2], CUSTOMERS[0]] });
    assert.equal(assignActiveCustomer(moved).value, "CUST-C");
  });

  it("a search that hides the picked customer falls back to All customers (OI-192)", () => {
    const s = run([{ type: "customers", rows: CUSTOMERS }, { type: "pickCustomer", value: "CUST-C" }]);
    const hidden = assignStep(s, { type: "customers", rows: CUSTOMERS.slice(0, 2) });
    assert.equal(hidden.customerPick, "");
    assert.deepEqual(assignCustomerChoice(hidden), { customer: "", customerName: "All customers" });
    // and stays there when the customer comes back: the clerk sees All customers highlighted
    assert.equal(assignActiveCustomer(assignStep(hidden, { type: "customers", rows: CUSTOMERS })).value, "");
  });
});

describe("Assign — the Sales Order step", () => {
  it("loads for the chosen customer and offers no drafts", () => {
    const s = toOrders("CUST-B");
    assert.equal(s.step, "so");
    assert.equal(s.customer, "CUST-B");
    assert.equal(s.customerName, "Bolt");
    assert.deepEqual(assignOfferedSalesOrders(s).map((o) => o.name), ["SO-1", "SO-2"]);
    assert.equal(assignPrimaryAction(s), "load-projects");
  });

  it("ticks and unticks orders, keeping the order they were ticked in", () => {
    let s = toOrders("");
    for (const name of ["SO-2", "SO-1", "SO-2", "SO-2"]) s = assignStep(s, { type: "toggleSalesOrder", name });
    assert.deepEqual(s.selected, ["SO-1", "SO-2"]);
  });

  it("an order ticked under one customer is dropped when another customer's list has no such order (OI-192)", () => {
    const a = assignStep(toOrders("CUST-A"), { type: "toggleSalesOrder", name: "SO-1" });
    const b = run([{ type: "back" }, { type: "pickCustomer", value: "CUST-B" }], a);
    const atB = assignStep(b, { type: "salesOrders", ...assignCustomerChoice(b), rows: [{ name: "SO-9" }] });
    assert.deepEqual(atB.selected, []);
    assert.equal(assignNeedsPlan(atB), false);
    assert.deepEqual(assignApplyRequest(atB, "V").salesOrders, []);
  });

  it("ticks on the new list stay; a tick on an order that is now a draft does not", () => {
    const s = run([{ type: "toggleSalesOrder", name: "SO-1" }, { type: "toggleSalesOrder", name: "SO-2" }, { type: "back" }], toOrders(""));
    const again = assignStep(s, { type: "salesOrders", customer: "", customerName: "All customers", rows: [{ name: "SO-1" }, { name: "SO-2", draft: true }] });
    assert.deepEqual(again.selected, ["SO-1"]);
  });
});

describe("Assign — the Project step", () => {
  const atProjects = () => assignStep(assignStep(toOrders("CUST-A"), { type: "toggleSalesOrder", name: "SO-1" }), { type: "projects", rows: PROJECTS });

  it("starts on No project, every time it is reached", () => {
    const s = assignStep(atProjects(), { type: "pickProject", name: "PROJ-2" });
    assert.equal(assignProject(s), "PROJ-2");
    const again = assignStep(assignStep(s, { type: "back" }), { type: "projects", rows: PROJECTS });
    assert.equal(again.projectPick, "");
    assert.equal(assignProject(again), "");
    assert.equal(assignPrimaryAction(again), "apply");
  });

  it("a project search keeps the picked project when it is still listed (OI-192)", () => {
    const s = assignStep(atProjects(), { type: "pickProject", name: "PROJ-2" });
    const found = assignStep(s, { type: "projectsFound", rows: filterAssignProjects(PROJECTS, "  BATH ") });
    assert.deepEqual(found.projects.map((p) => p.name), ["PROJ-2"]);
    assert.equal(assignProject(found), "PROJ-2");
  });

  it("a project search that hides the pick falls back to No project, so Apply sends what is highlighted (OI-192)", () => {
    const s = assignStep(atProjects(), { type: "pickProject", name: "PROJ-3" });
    const found = assignStep(s, { type: "projectsFound", rows: filterAssignProjects(PROJECTS, "kitchen") });
    assert.equal(found.projectPick, "");
    assert.equal(assignApplyRequest(found, "V").project, "");
  });

  it("the search matches name, title or customer name, any case; blank matches all", () => {
    assert.deepEqual(filterAssignProjects(PROJECTS, "acme").map((p) => p.name), ["PROJ-1"]);
    assert.deepEqual(filterAssignProjects(PROJECTS, "proj-3").map((p) => p.name), ["PROJ-3"]);
    assert.equal(filterAssignProjects(PROJECTS, " ").length, 3);
  });

  it("labels a project by title and customer", () => {
    assert.equal(assignProjectLabel(PROJECTS[0]), "Kitchen · Acme");
    assert.equal(assignProjectLabel(PROJECTS[1]), "Bath · CUST-B");
    assert.equal(assignProjectLabel(PROJECTS[2]), "PROJ-3");
  });

  it("Apply works out the split first only when orders are ticked", () => {
    const s = atProjects();
    assert.equal(assignNeedsPlan(s), true);
    assert.deepEqual(assignPlanRequest(s), { salesOrders: ["SO-1"], fromStock: [] });
    const none = assignStep(s, { type: "toggleSalesOrder", name: "SO-1" });
    assert.equal(assignNeedsPlan(none), false);
  });

  it("applies with no costing key before the costing was shown", () => {
    const s = assignStep(atProjects(), { type: "pickProject", name: "PROJ-1" });
    assert.deepEqual(assignApplyRequest(s, "VEND"), {
      customer: "CUST-A",
      customerName: "Acme",
      salesOrders: ["SO-1"],
      project: "PROJ-1",
      supplier: "VEND",
      fromStock: [],
      confirmedKey: undefined,
    });
  });
});

describe("Assign — the costing step", () => {
  const plan = { key: "k1", needsConfirm: true };
  const atCosting = () =>
    run([{ type: "toggleSalesOrder", name: "SO-1" }, { type: "projects", rows: PROJECTS }, { type: "costing", plan }], toOrders(""));

  it("Okay applies with the plan's key and does not work out the split again", () => {
    const s = atCosting();
    assert.equal(s.step, "costing");
    assert.equal(assignPrimaryAction(s), "apply");
    assert.equal(assignNeedsPlan(s), false);
    assert.equal(assignApplyRequest(s, "VEND").confirmedKey, "k1");
  });

  it("from-stock ticks are a set: ticking twice keeps one", () => {
    let s = atCosting();
    s = run([{ type: "toggleStock", salesOrder: "SO-1", on: true }, { type: "toggleStock", salesOrder: "SO-1", on: true }], s);
    assert.deepEqual(assignPlanRequest(s).fromStock, ["SO-1"]);
    s = run([{ type: "toggleStock", salesOrder: "SO-1", on: false }, { type: "toggleStock", salesOrder: "SO-1", on: false }], s);
    assert.deepEqual(s.fromStock, []);
  });

  it("Back walks costing → project → Sales Orders → customer, and stops there", () => {
    let s = atCosting();
    const steps = [];
    for (let i = 0; i < 4; i += 1) {
      s = assignStep(s, { type: "back" });
      steps.push(s.step);
    }
    assert.deepEqual(steps, ["project", "so", "customer", "customer"]);
    assert.equal(assignApplyRequest(run([{ type: "projects", rows: [] }], s), "V").confirmedKey, undefined);
  });
});

describe("Assign — what each step shows", () => {
  it("title, main button, Back and search per step (line numbers from 1)", () => {
    const shown = (step) => assignView({ ...assignStart(), step }, 2);
    assert.deepEqual(shown("customer"), { title: "Assign line 3 — pick customer", primary: "Next: Sales orders", back: false, search: "Customer search…" });
    assert.deepEqual(shown("so"), { title: "Assign line 3 — select Sales order(s)", primary: "Next: Project", back: true, search: null });
    assert.deepEqual(shown("project"), { title: "Assign line 3 — Project", primary: "Apply to line", back: true, search: "Project search…" });
    assert.deepEqual(shown("costing"), { title: "Assign line 3 — check the costing", primary: "Okay, I still want to do this", back: true, search: null });
  });

  it("an unknown action changes nothing", () => {
    const s = assignStart();
    assert.equal(assignStep(s, { type: "nope" }), s);
  });
});

describe("Assign — the lines the margins are worked out from", () => {
  const items = [
    { item_code: "A", qty: 2, rate: 5, amount: 10, extra: 1 },
    { item_code: "B", qty: 1, rate: 3, amount: 3 },
  ];
  it("the assigned line only", () => {
    assert.deepEqual(assignMarginLines(items, 1), [{ item_code: "B", qty: 1, rate: 3, amount: 3 }]);
  });
  it("every line when that line is not there; none without items", () => {
    assert.equal(assignMarginLines(items, 5).length, 2);
    assert.deepEqual(assignMarginLines(null, 0), []);
  });
});
