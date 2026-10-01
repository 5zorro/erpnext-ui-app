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
  resolveSoftPeekParent,
  syncPeekLinks,
  isPeekChildRoute,
  PEEK_LINK_CAP,
} from "../src/peek-stack.js";
import { normalizeAppRoute } from "../src/route-info.js";

const normalizePath = (r) => normalizeAppRoute(r).path;

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
  it("folds the live session's children under the pinned parent, dropdown open", () => {
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
    assert.equal(rows[0].peekLive, true);
    // Newest first, like every other list in Recent.
    assert.deepEqual(
      rows[0].peekChildren.map((c) => c.dt),
      ["supplier", "tax-category"],
    );
    assert.equal(rows[0].peekChildren[0].treeParentLabel, "New Bill");
    // Children are inside the parent's row, not rows of their own — they take no Recent slot.
    assert.equal(rows.filter((r) => r.dt === "tax-category").length, 0);
    assert.equal(rows.filter((r) => r.dt === "supplier").length, 0);
    assert.ok(rows.some((r) => r.dt === "item" && !r.treeRole));
    const { recent } = splitHistory(rows);
    assert.equal(recent[0].treeRole, "parent");
    assert.equal(rows.length, 2);
  });

  it("after the session ends, the remembered links keep the dropdown (closed)", () => {
    let hist = [];
    hist = pushHistory(hist, bill, { labels: { "purchase-invoice": "Bill" } });
    hist = pushHistory(hist, vendor);
    hist = pushHistory(hist, "/app/item/SKU-1");
    let stack = beginPeekParent(null, bill, { history: hist });
    stack = pushPeekChild(stack, vendor, { history: hist });
    const links = syncPeekLinks({}, stack, vendor);

    const rows = applyPeekTreeToHistory(hist, null, undefined, links);
    const parentRow = rows.find((r) => r.dt === "purchase-invoice");
    assert.equal(parentRow.treeRole, "parent");
    assert.equal(parentRow.peekLive, false);
    assert.deepEqual(parentRow.peekChildren.map((c) => c.dt), ["supplier"]);
    assert.equal(rows.some((r) => r.dt === "supplier"), false);
  });

  it("a child whose parent has left Recent is an ordinary row", () => {
    const hist = pushHistory([], vendor);
    const rows = applyPeekTreeToHistory(hist, null, undefined, { [vendor]: bill });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].dt, "supplier");
    assert.equal(rows[0].treeRole, null);
  });

  it("passthrough when there is no peek session", () => {
    const hist = pushHistory([], bill, { labels: { "purchase-invoice": "Bill" } });
    const rows = applyPeekTreeToHistory(hist, null);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].treeRole, null);
    assert.equal(rows[0].treeDepth, 0);
    assert.deepEqual(rows[0].peekChildren, []);
  });

  it("peekRefFromRoute keeps the draft's own address even when Recent holds /new", () => {
    const hist = pushHistory([], "/app/purchase-invoice/new", { labels: { "purchase-invoice": "Bill" } });
    const ref = peekRefFromRoute("/app/purchase-invoice/new-purchase-invoice-abc", hist);
    assert.equal(ref.route, "/app/purchase-invoice/new-purchase-invoice-abc");
    assert.equal(ref.label, "New Bill");
  });

  it("peekRefFromRoute prefers an existing history label", () => {
    const hist = pushHistory([], tax);
    const ref = peekRefFromRoute(tax, hist);
    assert.equal(ref.label, hist[0].label);
    assert.equal(ref.dt, "tax-category");
  });
});

describe("syncPeekLinks", () => {
  it("records each live child under its parent", () => {
    let stack = beginPeekParent(null, bill);
    stack = pushPeekChild(stack, tax);
    stack = pushPeekChild(stack, vendor);
    assert.deepEqual(syncPeekLinks({}, stack, vendor), { [tax]: bill, [vendor]: bill });
  });

  it("a child opened later outside any session stops being one", () => {
    const links = { [vendor]: bill, [tax]: bill };
    assert.deepEqual(syncPeekLinks(links, null, vendor), { [tax]: bill });
  });

  it("keeps the newest links when it fills up", () => {
    const many = {};
    for (let i = 0; i < PEEK_LINK_CAP + 5; i += 1) many[`/app/supplier/S${i}`] = bill;
    const kept = Object.keys(syncPeekLinks(many, null, ""));
    assert.equal(kept.length, PEEK_LINK_CAP);
    assert.equal(kept.at(-1), `/app/supplier/S${PEEK_LINK_CAP + 4}`);
  });
});

describe("applyErpHopToPeekStack — who is a parent (plan 2026-09-26 N1)", () => {
  const newBill = "/app/purchase-invoice/new-purchase-invoice-qjajzrlibi";
  const newAccount = "/desk/account/new-account-pcqeppsntg";
  const supplier = "/app/supplier/ALPINE%20SUPPLY%20CO";
  const address = "/app/address/ALPINE%20SUPPLY%20CO-Billing";

  it("a form left with unsaved changes is the parent — the unsaved Vanilla Bill of the incident", () => {
    const stack = applyErpHopToPeekStack(null, newBill, newAccount, { prevUnsaved: true });
    assert.equal(stack.parent.dt, "purchase-invoice");
    assert.deepEqual(stack.children.map((c) => c.dt), ["account"]);
  });

  it("a clean form left for a setup record is plain navigation, not a peek", () => {
    assert.equal(applyErpHopToPeekStack(null, "/app/purchase-order/PO-1", supplier), null);
  });

  it("Frappe's own caller (a Link field's Create a new …) is the parent, unsaved or not", () => {
    const po = "/app/purchase-order/PO-1";
    const stack = applyErpHopToPeekStack(null, po, "/app/supplier/new-supplier-abc", {
      fromLinkParent: po,
      fromLinkTarget: "supplier",
    });
    assert.equal(stack.parent.route, po);
  });

  it("a leftover _from_link does not count: wrong form, wrong doctype, or not a new record", () => {
    const po = "/app/purchase-order/PO-1";
    const other = "/app/purchase-order/PO-2";
    assert.equal(
      applyErpHopToPeekStack(null, other, "/app/supplier/new-supplier-abc", {
        fromLinkParent: po,
        fromLinkTarget: "supplier",
      }),
      null,
    );
    assert.equal(
      applyErpHopToPeekStack(null, po, "/app/item/new-item-abc", { fromLinkParent: po, fromLinkTarget: "supplier" }),
      null,
    );
    assert.equal(
      applyErpHopToPeekStack(null, po, supplier, { fromLinkParent: po, fromLinkTarget: "supplier" }),
      null,
    );
  });

  it("any doctype can be a parent — no Bill/PO/IR list", () => {
    const pe = "/app/payment-entry/new-payment-entry-abc";
    const mop = "/app/mode-of-payment/Credit%20Card";
    const stack = applyErpHopToPeekStack(null, pe, mop, { prevUnsaved: true });
    assert.equal(stack.parent.dt, "payment-entry");
  });

  it("never from Home/desk, a list, or Bill → PO", () => {
    assert.equal(applyErpHopToPeekStack(null, "/desk", "/app/account/new-account-x", { prevUnsaved: true }), null);
    assert.equal(applyErpHopToPeekStack(null, "/app/purchase-invoice", supplier, { prevUnsaved: true }), null);
    assert.equal(applyErpHopToPeekStack(null, bill, po, { prevUnsaved: true }), null);
  });

  it("Esc ping-pong (nav incident 2026-10-01T03:50): returning to the parent keeps the stack", () => {
    let stack = applyErpHopToPeekStack(null, newBill, supplier, { prevUnsaved: true });
    stack = applyErpHopToPeekStack(stack, supplier, address);
    // Esc on Address → back on the Bill; the hop is Address → Bill.
    const back = applyErpHopToPeekStack(stack, address, newBill, { prevUnsaved: true });
    assert.equal(back, stack);
    // And Supplier ↔ Address hops inside the session never swap parent and child.
    const hop = applyErpHopToPeekStack(stack, address, supplier, { prevUnsaved: true });
    assert.equal(hop.parent.route, normalizePath(newBill));
  });

  it("from the parent or a clean child, another setup record is a sibling (depth one)", () => {
    let stack = applyErpHopToPeekStack(null, bill, tax, { prevUnsaved: true });
    stack = applyErpHopToPeekStack(stack, tax, vendor);
    assert.equal(stack.parent.dt, "purchase-invoice");
    assert.equal(stack.children.length, 2);
  });

  it("a child left with unsaved changes becomes the parent (was: a Payment Entry list)", () => {
    const pe = "/app/payment-entry/new-payment-entry-abc";
    const mop = "/app/mode-of-payment/Credit%20Card";
    let stack = applyErpHopToPeekStack(null, bill, pe, { prevUnsaved: true });
    stack = applyErpHopToPeekStack(stack, pe, mop, { prevUnsaved: true });
    assert.equal(stack.parent.dt, "payment-entry");
    assert.deepEqual(stack.children.map((c) => c.dt), ["mode-of-payment"]);
  });

  it("…unless a Doc skin is parked under the session: it stays the anchor", () => {
    const pe = "/app/payment-entry/new-payment-entry-abc";
    const mop = "/app/mode-of-payment/Credit%20Card";
    let stack = beginPeekParent(null, bill);
    stack = pushPeekChild(stack, pe);
    stack = applyErpHopToPeekStack(stack, pe, mop, { prevUnsaved: true, anchorRoute: bill });
    assert.equal(stack.parent.dt, "purchase-invoice");
    assert.equal(stack.children.length, 2);
  });

  it("leaving the session for another document ends it", () => {
    const stack = applyErpHopToPeekStack(null, bill, tax, { prevUnsaved: true });
    assert.equal(applyErpHopToPeekStack(stack, tax, "/app/purchase-order/PO-9"), null);
  });

  it("a setup list is not a peek child", () => {
    assert.equal(isPeekChildRoute("/app/supplier"), false);
    assert.equal(isPeekChildRoute(supplier), true);
    assert.equal(isPeekChildRoute(bill), false);
  });
});

describe("resolveSoftPeekParent (the shell opens a peek)", () => {
  it("a Doc skin on screen is the parent (just parked)", () => {
    assert.equal(
      resolveSoftPeekParent({ surfaceMode: "doc", currentRoute: bill, parkedRoute: bill }),
      bill,
    );
  });

  it("inside a session it is a sibling under the same parent", () => {
    let stack = beginPeekParent(null, bill);
    stack = pushPeekChild(stack, tax);
    assert.equal(
      resolveSoftPeekParent({ stack, surfaceMode: "erp", currentRoute: tax, currentUnsaved: true }),
      stack.parent.route,
    );
  });

  it("on Vanilla, the form on screen only if it has unsaved changes; a stale park never wins", () => {
    const pe = "/app/payment-entry/PE-1";
    assert.equal(resolveSoftPeekParent({ surfaceMode: "erp", currentRoute: pe, currentUnsaved: true }), pe);
    assert.equal(
      resolveSoftPeekParent({ surfaceMode: "erp", currentRoute: pe, currentUnsaved: false, parkedRoute: bill }),
      "",
    );
    assert.equal(
      resolveSoftPeekParent({ surfaceMode: "erp", currentRoute: "/app/supplier", currentUnsaved: true }),
      "",
    );
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

  it("a parent opened from a Recent dropdown is reopened, not stepped back to", () => {
    let stack = beginPeekParent(null, "/app/purchase-invoice/ACC-1", { reopen: true });
    stack = pushPeekChild(stack, tax);
    const d = resolveSoftPeekEscAction({ parked: null, peekStack: stack, currentRoute: tax });
    assert.deepEqual(d, { action: "reopen-parent", route: "/app/purchase-invoice/ACC-1" });
  });

  it("…but a matching Doc park still resumes in one Esc", () => {
    let stack = beginPeekParent(null, "/app/purchase-invoice/ACC-1", { reopen: true });
    stack = pushPeekChild(stack, tax);
    const d = resolveSoftPeekEscAction({ parked: parkedBill, peekStack: stack, currentRoute: tax });
    assert.equal(d.action, "resume-park");
  });
});

