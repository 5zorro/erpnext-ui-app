import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DOC_SKIN_PROFILES } from "../src/doc-skin-registry.js";
import { DOC_SKIN_INDEX } from "../src/lens-context.js";
import {
  DRAFT_VISIBLE_MAX,
  draftableDoctypeKeys,
  draftShelfLabel,
  formatDraftDate,
  firstPurchaseOrderFromItems,
  shelvedEntryFromDoc,
  pushShelvedDraft,
  removeShelvedDraft,
  applySaveToShelved,
  splitShelvedDrafts,
} from "../src/shelved-drafts.js";

describe("draftableDoctypeKeys completeness", () => {
  it("matches every ready Doc form in DOC_SKIN_INDEX", () => {
    const fromIndex = DOC_SKIN_INDEX.filter(
      (e) => e.ready && e.match && e.match.doctypes && e.match.doctypes.length,
    ).flatMap((e) => e.match.doctypes);
    const keys = draftableDoctypeKeys(DOC_SKIN_PROFILES);
    for (const dt of fromIndex) {
      assert.ok(keys.includes(dt), `missing draftable ${dt}`);
    }
    assert.deepEqual(keys, ["purchase-invoice", "purchase-order", "purchase-receipt"]);
  });
});

describe("draftShelfLabel", () => {
  it("formats Bill with ref, PO source, and date", () => {
    const label = draftShelfLabel("purchase-invoice", {
      name: "ACC-PINV-1",
      bill_no: "I1234",
      posting_date: "2026-07-21",
      docstatus: 0,
      items: [{ purchase_order: "1234" }],
    });
    assert.equal(label, "INV I1234; PO 1234; 7/21/2026");
  });

  it("formats PO with name and date when no source", () => {
    const label = draftShelfLabel("purchase-order", {
      name: "PO-1235",
      transaction_date: "2026-07-23",
      docstatus: 0,
      items: [],
    });
    assert.equal(label, "PO-1235; 7/23/2026");
  });

  it("formats Item Receipt with packing ref", () => {
    const label = draftShelfLabel("purchase-receipt", {
      name: "MAT-PRE-1",
      lr_no: "BOL-9",
      posting_date: "2026-07-20",
      items: [{ purchase_order: "PO-1" }],
    });
    assert.equal(label, "BOL-9; PO-1; 7/20/2026");
  });
});

describe("formatDraftDate / firstPurchaseOrderFromItems", () => {
  it("parses ISO date", () => {
    assert.equal(formatDraftDate("2026-07-21"), "7/21/2026");
  });

  it("reads first purchase_order", () => {
    assert.equal(firstPurchaseOrderFromItems({ items: [{}, { purchase_order: "PO-A" }] }), "PO-A");
    assert.equal(firstPurchaseOrderFromItems({ items: [] }), "");
  });
});

describe("shelved push / split / applySave", () => {
  it("dedupes by doctype+name and keeps MRU first", () => {
    let list = [];
    list = pushShelvedDraft(list, {
      doctypeKey: "purchase-invoice",
      name: "A",
      route: "/app/purchase-invoice/A",
      label: "A",
      shelvedAt: "t1",
    });
    list = pushShelvedDraft(list, {
      doctypeKey: "purchase-order",
      name: "B",
      route: "/app/purchase-order/B",
      label: "B",
      shelvedAt: "t2",
    });
    list = pushShelvedDraft(list, {
      doctypeKey: "purchase-invoice",
      name: "A",
      route: "/app/purchase-invoice/A",
      label: "A2",
      shelvedAt: "t3",
    });
    assert.equal(list.length, 2);
    assert.equal(list[0].name, "A");
    assert.equal(list[0].label, "A2");
  });

  it("splits 3 visible + Older", () => {
    const list = [1, 2, 3, 4, 5].map((n) => ({
      doctypeKey: "purchase-order",
      name: `PO-${n}`,
      route: `/app/purchase-order/PO-${n}`,
      label: `PO-${n}`,
      shelvedAt: `t${n}`,
    }));
    const { visible, older } = splitShelvedDrafts(list);
    assert.equal(visible.length, DRAFT_VISIBLE_MAX);
    assert.equal(older.length, 2);
  });

  it("shelves draft save and drops submitted", () => {
    const draft = {
      name: "ACC-1",
      docstatus: 0,
      bill_no: "R1",
      posting_date: "2026-07-21",
      items: [],
    };
    let list = applySaveToShelved([], "purchase-invoice", draft, { now: "2026-07-21T12:00:00Z" });
    assert.equal(list.length, 1);
    assert.equal(list[0].route, "/app/purchase-invoice/ACC-1");
    list = applySaveToShelved(list, "purchase-invoice", { ...draft, docstatus: 1 });
    assert.equal(list.length, 0);
  });

  it("ignores unsaved new-* names", () => {
    assert.equal(
      shelvedEntryFromDoc("purchase-invoice", { name: "new-purchase-invoice-1", docstatus: 0 }),
      null,
    );
  });

  it("removeShelvedDraft filters one row", () => {
    const list = [
      { doctypeKey: "purchase-invoice", name: "A", route: "/a", label: "A", shelvedAt: "t" },
      { doctypeKey: "purchase-order", name: "B", route: "/b", label: "B", shelvedAt: "t" },
    ];
    const next = removeShelvedDraft(list, "purchase-invoice", "A");
    assert.equal(next.length, 1);
    assert.equal(next[0].name, "B");
  });
});
