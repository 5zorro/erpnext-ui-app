import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isSelectableSourceItem,
  formatSourceMoney,
  sourceItemFromRow,
  sourceItemKey,
  toggleSourceSelection,
  resolveSourcesToCommit,
  combineMappedBillSources,
  sourceModalKeyAction,
  groupHasSelectableItem,
  firstSelectableItemIndex,
  nextSelectableGroupIndex,
} from "../src/source-modal.js";
import {
  buildBillSourceLoadingGroups,
  buildSourceGroupFromSliceRows,
  applySourceSliceToGroups,
  rollUpReceiptRows,
  sourceSlicesForSkin,
  SOURCE_LIST_SLICE_DEFS,
  SOURCE_LIST_SLICE_ORDER,
} from "../src/source-list-slices.js";

/** The groups the picker shows once every slice has answered (NIC first). */
function groupsFrom(slices) {
  let g = buildBillSourceLoadingGroups().filter((x) => x.id === "nic");
  for (const [id, rows] of Object.entries(slices)) {
    const one = buildSourceGroupFromSliceRows(id, rows);
    if (one) g = applySourceSliceToGroups(g, one);
  }
  return g;
}

describe("source groups", () => {
  it("always includes NIC and greys drafts", () => {
    const g = groupsFrom({
      po_submitted: [{ name: "PO-1", transaction_date: "2019-01-01", grand_total: 10 }],
      po_draft: [{ name: "PO-D", transaction_date: "2019-01-02", grand_total: 1 }],
    });
    assert.equal(g[0].items[0].kind, "nic");
    assert.equal(isSelectableSourceItem(g[0].items[0]), true);
    const po = g.find((x) => x.name.includes("submitted"));
    assert.ok(po);
    assert.equal(isSelectableSourceItem(po.items[0]), true);
    const draft = g.find((x) => x.name.includes("draft"));
    assert.ok(draft);
    assert.equal(isSelectableSourceItem(draft.items[0]), false);
  });

  it("formats money", () => {
    assert.equal(formatSourceMoney(12.5), "12.50");
    assert.equal(formatSourceMoney(null), "");
  });

  it("shows PO ERP name and logbook title on submitted rows", () => {
    const item = sourceItemFromRow(
      {
        name: "PUR-ORD-2026-0001",
        title: "TO0001",
        transaction_date: "2026-08-01",
        grand_total: 12.5,
      },
      "po",
      false,
    );
    assert.match(item.label, /PUR-ORD-2026-0001/);
    assert.match(item.label, /TO0001/);
    assert.match(item.label, /12\.50/);
  });

  it("shows PO number on Item Receipt rows (one list row per receipt line, rolled up — R7-3)", () => {
    const prs = rollUpReceiptRows([
      { name: "PR-1", posting_date: "2019-02-01", grand_total: 50, purchase_order: "PO-9" },
      { name: "PR-1", posting_date: "2019-02-01", grand_total: 50, purchase_order: "PO-9" },
      { name: "PR-1", posting_date: "2019-02-01", grand_total: 50, purchase_order: "PO-10" },
      { name: "PR-2", posting_date: "2019-02-02", grand_total: 5, purchase_order: null },
    ]);
    assert.deepEqual(prs.map((r) => [r.name, r.purchase_orders]), [["PR-1", ["PO-9", "PO-10"]], ["PR-2", []]]);
    assert.equal("purchase_order" in prs[0], false);
    const item = sourceItemFromRow(prs[0], "pr", false);
    assert.match(item.label, /PO PO-9, PO-10/);
    assert.ok(item.label.includes("PR-1"));
    assert.match(sourceItemFromRow(prs[1], "pr", false).label, /no PO/);
  });

  it("says nothing about a PO it never read (R7-3: every row used to read 'no PO')", () => {
    const item = sourceItemFromRow({ name: "PR-3", posting_date: "2019-02-01", grand_total: 1 }, "pr", false);
    assert.doesNotMatch(item.label, /PO/);
  });

  it("labels receipt with no PO clearly", () => {
    const item = sourceItemFromRow(
      { name: "PR-2", posting_date: "2019-02-01", grand_total: 1, purchase_orders: [] },
      "pr",
      false,
    );
    assert.match(item.label, /no PO/);
  });
});

describe("source multi-select", () => {
  const groups = groupsFrom({
    po_submitted: [
      { name: "PO-A", transaction_date: "2026-01-01", grand_total: 1 },
      { name: "PO-B", transaction_date: "2026-01-02", grand_total: 2 },
    ],
    pr_submitted: [{ name: "PR-1", posting_date: "2026-01-03", grand_total: 3 }],
  });

  it("keys NIC and documents", () => {
    assert.equal(sourceItemKey({ kind: "nic" }), "nic");
    assert.equal(sourceItemKey({ kind: "po", name: "PO-A" }), "po:PO-A");
  });

  it("Space toggles; NIC is exclusive", () => {
    let sel = toggleSourceSelection([], { kind: "po", name: "PO-A" });
    assert.deepEqual(sel, ["po:PO-A"]);
    sel = toggleSourceSelection(sel, { kind: "po", name: "PO-B" });
    assert.deepEqual(sel.sort(), ["po:PO-A", "po:PO-B"].sort());
    sel = toggleSourceSelection(sel, { kind: "nic", label: "NIC" });
    assert.deepEqual(sel, ["nic"]);
    sel = toggleSourceSelection(sel, { kind: "po", name: "PO-A" });
    assert.deepEqual(sel, ["po:PO-A"]);
  });

  it("Enter with checks merges those; empty selection implies NIC", () => {
    const multi = resolveSourcesToCommit(groups, ["po:PO-A", "po:PO-B"], {
      kind: "pr",
      name: "PR-1",
    });
    assert.equal(multi.mode, "merge");
    assert.deepEqual(
      multi.items.map((i) => i.name),
      ["PO-A", "PO-B"],
    );
    const impliedNic = resolveSourcesToCommit(groups, [], { kind: "po", name: "PO-B" });
    assert.equal(impliedNic.mode, "nic");
    const nic = resolveSourcesToCommit(groups, ["nic"], { kind: "po", name: "PO-A" });
    assert.equal(nic.mode, "nic");
  });

  it("combineMappedBillSources concatenates items", () => {
    const c = combineMappedBillSources([
      { bill_no: "A", items: [{ item_code: "1" }] },
      { bill_no: "B", items: [{ item_code: "2" }, { item_code: "3" }] },
    ]);
    assert.equal(c.bill_no, "A");
    assert.deepEqual(
      c.items.map((i) => i.item_code),
      ["1", "2", "3"],
    );
  });

  it("sourceModalKeyAction maps Space / Enter", () => {
    assert.equal(sourceModalKeyAction(" "), "toggle");
    assert.equal(sourceModalKeyAction("Enter"), "finalize");
    assert.equal(sourceModalKeyAction("Escape"), "cancel");
  });
});

describe("source modal tab order", () => {
  it("skips draft-only groups when tabbing", () => {
    const groups = [
      {
        id: "nic",
        name: "NIC",
        items: [{ label: "NIC", kind: "nic" }],
      },
      {
        id: "po_draft",
        name: "Purchase Orders — draft (not selectable)",
        items: [{ label: "No draft rows", kind: "po", draft: true }],
      },
    ];
    assert.equal(groupHasSelectableItem(groups[1]), false);
    assert.equal(nextSelectableGroupIndex(groups, 0, 1), 0);
    assert.equal(nextSelectableGroupIndex(groups, 1, 1), 0);
  });

  it("firstSelectableItemIndex skips draft rows", () => {
    const g = {
      name: "PO draft",
      items: [
        { label: "No draft rows", kind: "po", draft: true },
        { label: "PO-1", kind: "po", name: "PO-1" },
      ],
    };
    assert.equal(firstSelectableItemIndex(g), 1);
  });
});

describe("buildBillSourceLoadingGroups", () => {
  it("includes NIC and loading placeholders per category", () => {
    const g = buildBillSourceLoadingGroups();
    assert.equal(g[0].items[0].kind, "nic");
    assert.equal(isSelectableSourceItem(g[0].items[0]), true);
    // The Bill's own slices (each skin lists its own — SOURCE_SLICES_BY_SKIN, plan 2026-10-12 S3).
    assert.equal(g.length, 1 + SOURCE_LIST_SLICE_ORDER.length);
    for (let i = 1; i < g.length; i++) {
      assert.equal(g[i].loading, true);
      assert.equal(g[i].items[0].loading, true);
      assert.equal(isSelectableSourceItem(g[i].items[0]), false);
    }
  });
});

describe("which POs each skin lists (review R7-1)", () => {
  it("the Item Receipt lists POs still to receive, not still to bill", () => {
    assert.deepEqual(sourceSlicesForSkin("receipt"), ["po_to_receive", "po_draft"]);
    assert.ok(!sourceSlicesForSkin("receipt").includes("po_submitted"));
    assert.ok(sourceSlicesForSkin("bill").includes("po_submitted"));
    const g = buildSourceGroupFromSliceRows("po_to_receive", [{ name: "PO-R", transaction_date: "2026-01-01", grand_total: 4 }]);
    assert.equal(g.items[0].kind, "po");
    assert.equal(isSelectableSourceItem(g.items[0]), true);
    assert.match(g.name, /still to receive/);
  });
});
