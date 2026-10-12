import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { soCreateEntries, soCreateFlow, linkedCounts, normalizeCreateView, SO_CREATE_CATALOG } from "../src/so-create-menu.js";

// Plan 2026-10-12 S5: Vanilla's Create entries, in its order and under its conditions.
const open = { docstatus: 1, status: "To Deliver and Bill", order_type: "Sales", per_delivered: 0, per_billed: 0, per_picked: 0 };
const ids = (r) => r.entries.map((e) => e.id);

describe("soCreateEntries", () => {
  it("a fresh order: Vanilla's list, in its order", () => {
    assert.deepEqual(ids(soCreateEntries(open)), [
      "pick-list", "delivery-note", "work-order", "production-plan", "sales-invoice",
      "material-request", "raw-materials", "purchase-order", "project", "payment-request", "payment",
    ]);
  });
  it("fully delivered: no pick list, delivery, manufacture or project; billing and payment stay", () => {
    assert.deepEqual(ids(soCreateEntries({ ...open, per_delivered: 100 })), ["sales-invoice", "purchase-order", "payment-request", "payment"]);
  });
  it("fully billed: no invoice, payment request or payment", () => {
    const got = ids(soCreateEntries({ ...open, per_billed: 100 }));
    assert.ok(!got.includes("sales-invoice") && !got.includes("payment") && !got.includes("payment-request"));
  });
  it("a maintenance order offers visits and schedules, not delivery", () => {
    const got = ids(soCreateEntries({ ...open, order_type: "Maintenance" }));
    assert.ok(got.includes("maintenance-visit") && got.includes("maintenance-schedule"));
    assert.ok(!got.includes("delivery-note"));
  });
  it("draft, closed or held: nothing, with the reason", () => {
    assert.match(soCreateEntries({ ...open, docstatus: 0 }).reason, /Submit the Sales Order first/);
    assert.match(soCreateEntries({ ...open, status: "On Hold" }).reason, /On Hold/);
    assert.deepEqual(soCreateEntries({ ...open, status: "Closed" }).entries, []);
  });
  it("every entry but Purchase Order runs a Vanilla handler; each has a wash role or none", () => {
    for (const e of SO_CREATE_CATALOG) {
      if (e.id === "purchase-order") assert.equal(e.handler, null);
      else assert.match(e.handler, /^[a-z_]+$/, e.id);
    }
  });
});

describe("soCreateFlow", () => {
  it("columns left to right, the order in the middle, counts from the form dashboard", () => {
    const flow = soCreateFlow({ ...open, name: "SAL-ORD-2026-00001", per_delivered: 100 }, { "Purchase Order": 2, "Delivery Note": 1, Quotation: 1 });
    assert.deepEqual(flow.map((c) => c.stage), ["before", "order", "make", "ship", "bill", "paid", "also"]);
    assert.deepEqual(flow[1].boxes[0], { id: "sales-order", label: "SAL-ORD-2026-00001", role: "order", desk: "ar", made: 1, canCreate: false, current: true });
    const make = Object.fromEntries(flow[2].boxes.map((b) => [b.id, b]));
    assert.equal(make["purchase-order"].made, 2);
    assert.equal(make["purchase-order"].canCreate, true);
    assert.equal(make["work-order"].canCreate, false); // delivered in full
    const ship = Object.fromEntries(flow[3].boxes.map((b) => [b.id, b]));
    assert.deepEqual([ship["delivery-note"].made, ship["delivery-note"].canCreate], [1, false]);
    assert.equal(flow[0].boxes[0].made, 1);
  });
});

describe("linkedCounts / normalizeCreateView", () => {
  it("reads get_open_count's answer", () => {
    assert.deepEqual(
      linkedCounts({ count: { external_links_found: [{ doctype: "Sales Invoice", count: 0, open_count: 0 }, { doctype: "Purchase Order", count: 2 }] } }),
      { "Sales Invoice": 0, "Purchase Order": 2 },
    );
    assert.deepEqual(linkedCounts(null), {});
  });
  it("list unless the clerk chose the flowchart", () => {
    assert.equal(normalizeCreateView("flow"), "flow");
    assert.equal(normalizeCreateView("x"), "list");
    assert.equal(normalizeCreateView(null), "list");
  });
});
