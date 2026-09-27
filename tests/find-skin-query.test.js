/**
 * Find pages, live (plan 2026-09-26, stage F3): the page's searches as a Frappe list query.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FIND_LIST_LIMIT,
  FIND_LIST_ORDER,
  findListQuery,
  findRowsFromList,
  groupRowsByParty,
  findPeekLines,
} from "../src/find-skin-query.js";
import { FIND_SKINS, FIND_SKIN_DOCTYPES } from "../src/find-skin-registry.js";
import { buildFrappeResourceListUrl } from "../src/erp-http-list.js";

describe("findListQuery", () => {
  it("asks for every column the page shows, plus party name and status, in Vanilla's order", () => {
    for (const dt of FIND_SKIN_DOCTYPES) {
      const q = findListQuery(dt);
      const skin = FIND_SKINS[dt];
      assert.equal(q.doctype, skin.doctype, dt);
      for (const c of skin.columns) assert.ok(q.fields.includes(c.field), `${dt}.${c.field}`);
      for (const f of ["name", "status", skin.party.field, skin.party.nameField]) assert.ok(q.fields.includes(f), `${dt}.${f}`);
      assert.equal(new Set(q.fields).size, q.fields.length, `${dt} fields unique`);
      assert.equal(q.orderBy, FIND_LIST_ORDER);
      assert.equal(q.limit, FIND_LIST_LIMIT + 1);
    }
    assert.equal(findListQuery("item"), null);
  });

  it("a blank page asks for everything (a payment page still picks its direction)", () => {
    assert.deepEqual(findListQuery("purchase-invoice").filters, []);
    assert.deepEqual(findListQuery("payment-entry").filters, [["payment_type", "=", "Pay"]]);
    assert.deepEqual(findListQuery("payment-entry", { direction: "Receive" }).filters, [["payment_type", "=", "Receive"]]);
  });

  it("boxes match part of a value; the party box matches id or name; status is exact", () => {
    const q = findListQuery("purchase-invoice", {
      values: { bill_no: "123", supplier: "Vendor 0", ignored: "x" },
      status: "Unpaid",
    });
    assert.deepEqual(q.filters, [
      ["bill_no", "like", "%123%"],
      ["status", "=", "Unpaid"],
    ]);
    assert.deepEqual(q.orFilters, [
      ["supplier", "like", "%Vendor 0%"],
      ["supplier_name", "like", "%Vendor 0%"],
    ]);
  });

  it("drops a status the page does not offer", () => {
    assert.deepEqual(findListQuery("sales-order", { status: "Bogus" }).filters, []);
  });

  it("builds a /api/resource URL with or_filters and order_by", () => {
    const q = findListQuery("sales-invoice", { values: { customer: "Grant" } });
    const url = new URL(
      buildFrappeResourceListUrl("http://erp", q.doctype, {
        fields: q.fields,
        filters: q.filters,
        orFilters: q.orFilters,
        orderBy: q.orderBy,
        limit: q.limit,
      }),
    );
    assert.equal(url.pathname, "/api/resource/Sales%20Invoice");
    assert.equal(url.searchParams.get("order_by"), "creation desc");
    assert.deepEqual(JSON.parse(url.searchParams.get("or_filters")), q.orFilters);
    assert.equal(url.searchParams.get("limit_page_length"), String(FIND_LIST_LIMIT + 1));
  });

  it("the URL builder refuses an order that is not `field asc|desc`", () => {
    const url = new URL(buildFrappeResourceListUrl("http://erp", "X", { orderBy: "creation desc; drop" }));
    assert.equal(url.searchParams.get("order_by"), null);
  });
});

describe("findRowsFromList / groupRowsByParty", () => {
  it("shows the party's name, falling back to its id, and reports a cut list", () => {
    const { rows, more } = findRowsFromList("sales-order", [
      { name: "SO-2", customer: "C1", customer_name: "Grant Plastics" },
      { name: "SO-1", customer: "C2", customer_name: "" },
    ]);
    assert.equal(more, false);
    assert.deepEqual(rows.map((r) => r.party), ["Grant Plastics", "C2"]);
    const many = Array.from({ length: FIND_LIST_LIMIT + 1 }, (_, i) => ({ name: `X-${i}`, supplier: "V" }));
    const cut = findRowsFromList("purchase-invoice", many);
    assert.equal(cut.more, true);
    assert.equal(cut.rows.length, FIND_LIST_LIMIT);
  });

  it("groups keep the list's newest-first order", () => {
    const { rows } = findRowsFromList("purchase-invoice", [
      { name: "3", supplier: "B" },
      { name: "2", supplier: "A" },
      { name: "1", supplier: "B" },
    ]);
    assert.deepEqual(
      groupRowsByParty(rows).map((g) => [g.party, g.rows.map((r) => r.name)]),
      [
        ["B", ["3", "1"]],
        ["A", ["2"]],
      ],
    );
  });
});

describe("findPeekLines", () => {
  it("reads items for a document and applied references for a payment", () => {
    const doc = { items: [{ item_code: "SKU1", item_name: "Widget", qty: 2, amount: 20 }] };
    assert.deepEqual(findPeekLines("sales-invoice", doc).lines, [{ label: "SKU1 — Widget", qty: "2", amount: 20 }]);
    const pay = {
      references: [{ reference_doctype: "Purchase Invoice", reference_name: "PI-1", allocated_amount: 40 }],
    };
    const p = findPeekLines("payment-entry", pay);
    assert.equal(p.heads[0], "Applied to");
    assert.deepEqual(p.lines, [{ label: "Purchase Invoice PI-1", qty: "", amount: 40 }]);
    assert.deepEqual(findPeekLines("purchase-order", null).lines, []);
  });
});
