import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pushHistory, splitHistory, RECENT_MAX } from "../src/history.js";
import {
  PEEK_CHILD_CAP,
  applyPeekTreeToHistory,
  applyErpHopToPeekStack,
  beginPeekParent,
  pushPeekChild,
  shouldCollapsePeekStack,
  collapsePeekStack,
  isActivePeekStack,
  peekRefFromRoute,
  resolveSoftPeekEscAction,
} from "../src/peek-stack.js";

const bill = "/app/purchase-invoice/new";
const tax = "/app/tax-category/RETAIL";
const vendor = "/app/supplier/Acme";
const po = "/app/purchase-order/new";

describe("beginPeekParent / pushPeekChild", () => {
  it("starts a parent and collects sibling peeks (not peek-of-peek)", () => {
    let stack = beginPeekParent(null, bill);
    stack = pushPeekChild(stack, tax);
    stack = pushPeekChild(stack, vendor);
    assert.equal(isActivePeekStack(stack), true);
    assert.equal(stack.parent.dt, "purchase-invoice");
    assert.equal(stack.children.length, 2);
    assert.equal(stack.children[0].dt, "tax-category");
    assert.equal(stack.children[1].dt, "supplier");
  });

  it("keeps children when re-beginning the same parent (Esc then peek again)", () => {
    let stack = beginPeekParent(null, bill);
    stack = pushPeekChild(stack, tax);
    stack = beginPeekParent(stack, bill);
    assert.equal(stack.children.length, 1);
  });

  it("resets children when the parent Bill/PO changes", () => {
    let stack = beginPeekParent(null, bill);
    stack = pushPeekChild(stack, tax);
    stack = beginPeekParent(stack, po);
    assert.equal(stack.children.length, 0);
    assert.equal(stack.parent.dt, "purchase-order");
  });

  it("ignores the parent route as a child and non-peek routes", () => {
    let stack = beginPeekParent(null, bill);
    stack = pushPeekChild(stack, bill);
    stack = pushPeekChild(stack, "/app/query-report/General Ledger");
    stack = pushPeekChild(stack, "/desk");
    assert.equal(stack.children.length, 0);
  });

  it("dedupes a re-visited child and moves it last (MRU among siblings)", () => {
    let stack = beginPeekParent(null, bill);
    stack = pushPeekChild(stack, tax);
    stack = pushPeekChild(stack, vendor);
    stack = pushPeekChild(stack, tax);
    assert.equal(stack.children.length, 2);
    assert.equal(stack.children[1].dt, "tax-category");
  });

  it("caps siblings", () => {
    let stack = beginPeekParent(null, bill);
    for (let i = 0; i < PEEK_CHILD_CAP + 3; i++) {
      stack = pushPeekChild(stack, `/app/item/SKU-${i}`);
    }
    assert.equal(stack.children.length, PEEK_CHILD_CAP);
    assert.match(stack.children[0].route, /SKU-3/);
  });
});

describe("shouldCollapsePeekStack", () => {
  it("keeps the tree on Esc-back to the parent and on another setup peek", () => {
    let stack = beginPeekParent(null, bill);
    stack = pushPeekChild(stack, tax);
    assert.equal(shouldCollapsePeekStack(stack, bill), false);
    assert.equal(shouldCollapsePeekStack(stack, vendor), false);
  });

  it("collapses on Home/desk, another Doc, and reports", () => {
    let stack = beginPeekParent(null, bill);
    stack = pushPeekChild(stack, tax);
    assert.equal(shouldCollapsePeekStack(stack, "/desk", { hardLeave: true }), true);
    assert.equal(shouldCollapsePeekStack(stack, po), true);
    assert.equal(shouldCollapsePeekStack(stack, "/app/query-report/Trial Balance"), true);
    assert.equal(shouldCollapsePeekStack(stack, "/desk"), true);
  });

  it("collapsePeekStack returns null (flatten is history staying put)", () => {
    assert.equal(collapsePeekStack(), null);
  });
});

describe("applyPeekTreeToHistory", () => {
  it("pins parent plus L→ children at the top and de-dupes the tail", () => {
    let hist = [];
    hist = pushHistory(hist, bill, { labels: { "purchase-invoice": "Bill" } });
    hist = pushHistory(hist, tax);
    hist = pushHistory(hist, vendor);
    hist = pushHistory(hist, "/app/item/SKU-1");

    let stack = beginPeekParent(null, bill, { history: hist });
    stack = pushPeekChild(stack, tax, { history: hist });
    stack = pushPeekChild(stack, vendor, { history: hist });

    const rows = applyPeekTreeToHistory(hist, stack);
    assert.equal(rows[0].treeRole, "parent");
    assert.equal(rows[0].label, "New Bill");
    assert.equal(rows[1].treeRole, "child");
    assert.equal(rows[1].treeDepth, 1);
    assert.equal(rows[1].treeParentLabel, "New Bill");
    assert.equal(rows[2].treeRole, "child");
    assert.equal(rows.filter((r) => r.dt === "tax-category").length, 1);
    assert.equal(rows.filter((r) => r.dt === "supplier").length, 1);
    assert.ok(rows.some((r) => r.dt === "item" && !r.treeRole));
    const { recent } = splitHistory(rows);
    assert.equal(recent.length <= RECENT_MAX, true);
    assert.equal(recent[0].treeRole, "parent");
    assert.equal(recent.filter((r) => r.treeRole === "child").length, 2);
  });

  it("passthrough when there is no peek session", () => {
    const hist = pushHistory([], bill, { labels: { "purchase-invoice": "Bill" } });
    const rows = applyPeekTreeToHistory(hist, null);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].treeRole, null);
    assert.equal(rows[0].treeDepth, 0);
  });

  it("peekRefFromRoute prefers an existing history label", () => {
    const hist = pushHistory([], tax);
    const ref = peekRefFromRoute(tax, hist);
    assert.equal(ref.label, hist[0].label);
    assert.equal(ref.dt, "tax-category");
  });
});

describe("applyErpHopToPeekStack (Vanilla in-SPA leave)", () => {
  it("starts a peek when leaving a new Bill for a new Account", () => {
    const from = "/app/purchase-invoice/new-purchase-invoice-qjajzrlibi";
    const to = "/desk/account/new-account-pcqeppsntg";
    const stack = applyErpHopToPeekStack(null, from, to);
    assert.equal(isActivePeekStack(stack), true);
    assert.equal(stack.parent.dt, "purchase-invoice");
    assert.equal(stack.children.length, 1);
    assert.equal(stack.children[0].dt, "account");
  });

  it("does not start a peek from Home/desk or when hopping Bill → PO", () => {
    assert.equal(applyErpHopToPeekStack(null, "/desk", "/app/account/new-account-x"), null);
    assert.equal(applyErpHopToPeekStack(null, bill, po), null);
  });

  it("keeps an existing parent when hopping Account → another setup", () => {
    let stack = applyErpHopToPeekStack(null, bill, tax);
    stack = applyErpHopToPeekStack(stack, tax, vendor);
    assert.equal(stack.children.length, 2);
    assert.equal(stack.parent.dt, "purchase-invoice");
  });

  it("re-parents when hopping Payment Entry → Mode of Payment (even under stale Bill)", () => {
    const pe = "/app/payment-entry/new-payment-entry-abc";
    const mop = "/app/mode-of-payment/Credit%20Card";
    let stack = applyErpHopToPeekStack(null, bill, pe);
    stack = applyErpHopToPeekStack(stack, pe, mop);
    assert.equal(stack.parent.dt, "payment-entry");
    assert.equal(stack.children.length, 1);
    assert.equal(stack.children[0].dt, "mode-of-payment");
  });
});

describe("resolveSoftPeekEscAction", () => {
  const pe = "/app/payment-entry/new-payment-entry-abc";
  const mop = "/app/mode-of-payment/Credit%20Card";
  const parkedBill = { mode: "bill", route: "/app/purchase-invoice/ACC-1" };

  it("Bill→Tax with matching park resumes Doc in one Esc", () => {
    let stack = beginPeekParent(null, "/app/purchase-invoice/ACC-1");
    stack = pushPeekChild(stack, tax);
    const d = resolveSoftPeekEscAction({
      parked: { mode: "bill", route: "/app/purchase-invoice/ACC-1" },
      peekStack: stack,
      currentRoute: tax,
    });
    assert.equal(d.action, "resume-park");
  });

  it("PE→MoP with stale Bill park returns to Payment Entry", () => {
    let stack = beginPeekParent(null, pe);
    stack = pushPeekChild(stack, mop);
    const d = resolveSoftPeekEscAction({
      parked: parkedBill,
      peekStack: stack,
      currentRoute: mop,
    });
    assert.equal(d.action, "return-parent");
    assert.equal(d.route, pe);
  });

  it("disarms when already on vanilla peek parent with unrelated park", () => {
    let stack = beginPeekParent(null, pe);
    stack = pushPeekChild(stack, mop);
    const d = resolveSoftPeekEscAction({
      parked: parkedBill,
      peekStack: stack,
      currentRoute: pe,
    });
    assert.equal(d.action, "disarm");
  });
});
