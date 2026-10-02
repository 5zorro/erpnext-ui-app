import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSearchLinkResults,
  filterLinkOptions,
  linkOptionLabel,
  linkOptionClassNames,
  linkDoctypeForBillField,
  withEmptySearchActions,
  isCreateSupplierLinkAction,
  isCreatePaymentTermsLinkAction,
  isCreateItemLinkAction,
  itemCreateRoute,
  LINK_ACTION_CREATE_ITEM,
  LINK_ACTION_CREATE_SUPPLIER,
  LINK_ACTION_CREATE_PAYMENT_TERMS,
  PAYMENT_TERMS_TEMPLATE_DOCTYPE,
} from "../src/link-search.js";

describe("normalizeSearchLinkResults", () => {
  it("maps search_link shape", () => {
    const out = normalizeSearchLinkResults([
      { value: "SUP-001", description: "Acme Hardware" },
      { name: "ITEM-1", item_name: "Widget" },
      "RAW-CODE",
    ]);
    assert.deepEqual(out, [
      { value: "SUP-001", description: "Acme Hardware" },
      { value: "ITEM-1", description: "Widget" },
      { value: "RAW-CODE", description: "RAW-CODE" },
    ]);
  });

  it("ignores junk", () => {
    assert.deepEqual(normalizeSearchLinkResults(null), []);
    assert.deepEqual(normalizeSearchLinkResults([{}, { value: "" }]), []);
  });
});

describe("filterLinkOptions", () => {
  const opts = [
    { value: "SUP-1", description: "Acme" },
    { value: "SUP-2", description: "Beta Co" },
    { value: "VEN-9", description: "Acme West" },
  ];

  it("filters by value or description", () => {
    assert.equal(filterLinkOptions(opts, "acme").length, 2);
    assert.equal(filterLinkOptions(opts, "SUP-2")[0].value, "SUP-2");
  });

  it("limits and prefers prefix matches", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      value: `X${i}`,
      description: i === 5 ? "zzztarget" : `n${i}`,
    }));
    many.push({ value: "target", description: "Exact" });
    const hit = filterLinkOptions(many, "target", { limit: 5 });
    assert.ok(hit.length <= 5);
    assert.equal(hit[0].value, "target");
  });
});

describe("linkOptionLabel", () => {
  it("shows description with value when distinct", () => {
    assert.equal(
      linkOptionLabel({ value: "SUP-1", description: "Acme" }),
      "Acme (SUP-1)",
    );
    assert.equal(linkOptionLabel({ value: "A", description: "A" }), "A");
    assert.match(
      linkOptionLabel({ value: "V", description: "Idle Co", activity: "idle" }),
      /idle/,
    );
    assert.match(linkOptionClassNames({ value: "V", activity: "never" }), /link-opt-muted/);
  });
});

describe("linkDoctypeForBillField", () => {
  it("maps Bill link fields", () => {
    assert.equal(linkDoctypeForBillField("supplier"), "Supplier");
    assert.equal(linkDoctypeForBillField("item_code"), "Item");
    assert.equal(linkDoctypeForBillField("qty"), null);
  });
});

describe("withEmptySearchActions", () => {
  it("adds Go to Vendor add when Supplier search is empty", () => {
    const out = withEmptySearchActions([], "Supplier");
    assert.equal(out.length, 1);
    assert.equal(out[0].value, LINK_ACTION_CREATE_SUPPLIER);
    assert.match(out[0].description, /Vendor add/i);
    assert.equal(isCreateSupplierLinkAction(out[0]), true);
  });

  it("always offers Create new Payment Terms (even when templates exist)", () => {
    const rows = [{ value: "Net 30", description: "Net 30" }];
    const out = withEmptySearchActions(rows, PAYMENT_TERMS_TEMPLATE_DOCTYPE);
    assert.equal(out.length, 2);
    assert.equal(out[1].value, LINK_ACTION_CREATE_PAYMENT_TERMS);
    assert.equal(isCreatePaymentTermsLinkAction(out[1]), true);
    assert.equal(withEmptySearchActions([], PAYMENT_TERMS_TEMPLATE_DOCTYPE).length, 1);
  });

  it("leaves non-empty and other doctypes alone", () => {
    const rows = [{ value: "A", description: "A" }];
    assert.deepEqual(withEmptySearchActions(rows, "Supplier"), rows);
    assert.deepEqual(withEmptySearchActions(rows, "Item"), rows);
    assert.deepEqual(withEmptySearchActions([], "Warehouse"), []);
  });

  // 5zorro 2026-09-30, DF-01 on a blank bench: "No matches for WIDGET" and no way forward.
  it("offers Create Item when Item search is empty", () => {
    const out = withEmptySearchActions([], "Item");
    assert.equal(out.length, 1);
    assert.equal(out[0].value, LINK_ACTION_CREATE_ITEM);
    assert.equal(isCreateItemLinkAction(out[0]), true);
    assert.equal(isCreateItemLinkAction(LINK_ACTION_CREATE_ITEM), true);
    assert.equal(isCreateSupplierLinkAction(out[0]), false);
    assert.match(linkOptionClassNames(out[0]), /link-action/);
    assert.match(linkOptionLabel(out[0]), /create Item/i);
  });

  it("never lets a create action through the client-side refine", () => {
    const out = filterLinkOptions(withEmptySearchActions([], "Item"), "item");
    assert.deepEqual(out, []);
  });
});

describe("itemCreateRoute", () => {
  it("carries what was typed as the item code and name", () => {
    const route = itemCreateRoute("  WIDGET A ");
    assert.equal(route.split("?")[0], "/app/item/new");
    const q = new URLSearchParams(route.split("?")[1]);
    assert.equal(q.get("item_code"), "WIDGET A");
    assert.equal(q.get("item_name"), "WIDGET A");
  });

  it("escapes characters that would break the address", () => {
    const q = new URLSearchParams(itemCreateRoute("A&B=C #1").split("?")[1]);
    assert.equal(q.get("item_code"), "A&B=C #1");
  });

  it("opens a bare new Item when nothing was typed", () => {
    assert.equal(itemCreateRoute(""), "/app/item/new");
    assert.equal(itemCreateRoute(null), "/app/item/new");
  });
});
