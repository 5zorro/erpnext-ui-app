import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findRowMenu, findPartyDoctype, FIND_ROW_MENU_MAX_ITEMS, FIND_ROW_MENU_MAX_PER_GROUP } from "../src/find-row-menu.js";
import { findSkinFor } from "../src/find-skin-registry.js";

const bill = { name: "ACC-PINV-2026-00008", supplier: "SUMMIT TRADERS", party: "Summit Traders", docstatus: 1 };
const ids = (groups) => groups.flatMap((g) => g.items.map((i) => i.id));
const item = (groups, id) => groups.flatMap((g) => g.items).find((i) => i.id === id);

describe("findRowMenu (5zorro 2026-10-11: right-click on a Find row)", () => {
  it("four groups, broad to narrow to the page; at most 12 items, at most 5 a group", () => {
    for (const dt of ["purchase-invoice", "purchase-order", "purchase-receipt", "payment-entry", "sales-order", "sales-invoice", "quotation"]) {
      const g = findRowMenu({ doctypeKey: dt, row: { ...bill, customer: "C1", party_name: "C1" } });
      assert.deepEqual(g.map((x) => x.id), ["party", "document", "view", "page"], dt);
      assert.ok(ids(g).length <= FIND_ROW_MENU_MAX_ITEMS, dt);
      for (const grp of g) assert.ok(grp.items.length <= FIND_ROW_MENU_MAX_PER_GROUP, `${dt} ${grp.id}`);
    }
  });

  it("speaks the row's own words", () => {
    const g = findRowMenu({ doctypeKey: "purchase-invoice", row: bill });
    assert.equal(g[0].title, "Vendor · Summit Traders");
    assert.equal(g[1].title, "This bill · ACC-PINV-2026-00008");
    assert.equal(item(g, "party-only").label, "Show only Summit Traders here");
    assert.equal(item(g, "view-open").label, "Open this bill");
    assert.equal(item(g, "view-open").route, "/app/purchase-invoice/ACC-PINV-2026-00008");
    assert.equal(item(g, "party-open").route, "/app/supplier/SUMMIT%20TRADERS");
  });

  it("a payment's party follows its direction", () => {
    const row = { name: "ACC-PAY-2026-00005", party: "X", party_name: "X" };
    const recv = findRowMenu({ doctypeKey: "payment-entry", row: { ...row, party: "ACME" }, direction: "Receive" });
    assert.equal(item(recv, "party-open").route, "/app/customer/ACME");
    assert.equal(findPartyDoctype(findSkinFor("payment-entry"), "Pay"), "Supplier");
  });

  it("placeholders are listed but disabled, with a hint", () => {
    const g = findRowMenu({ doctypeKey: "purchase-invoice", row: bill });
    for (const id of ["party-new", "doc-linked", "doc-cancel", "view-print", "page-settings"]) {
      assert.equal(item(g, id).enabled, false, id);
      assert.match(item(g, id).hint, /Not built yet/);
    }
  });

  it("Show cancelled mirrors the page; the Cancelled status pins it on", () => {
    assert.equal(item(findRowMenu({ doctypeKey: "purchase-invoice", row: bill }), "page-cancelled").checked, false);
    assert.equal(item(findRowMenu({ doctypeKey: "purchase-invoice", row: bill, showCancelled: true }), "page-cancelled").checked, true);
    const pinned = item(findRowMenu({ doctypeKey: "payment-entry", row: bill, status: "Cancelled" }), "page-cancelled");
    assert.deepEqual([pinned.checked, pinned.enabled], [true, false]);
  });

  it("no Find page, no row → no menu", () => {
    assert.deepEqual(findRowMenu({ doctypeKey: "item", row: bill }), []);
    assert.deepEqual(findRowMenu({ doctypeKey: "purchase-invoice", row: null }), []);
  });
});
