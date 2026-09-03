import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  shouldAcceptErpTrackNav,
  shouldClearErpNavIntent,
  shouldBlockDocHijackForListIntent,
} from "../src/erp-nav-intent.js";

describe("shouldAcceptErpTrackNav", () => {
  it("accepts everything when no intent", () => {
    assert.equal(shouldAcceptErpTrackNav(null, "/app/purchase-invoice/ACC-1"), true);
  });

  it("accepts same doctype new → named", () => {
    assert.equal(
      shouldAcceptErpTrackNav("/app/purchase-order/new", "/app/purchase-order/new-purchase-order-abc"),
      true,
    );
  });

  it("rejects stale Bill while intent is PO", () => {
    assert.equal(
      shouldAcceptErpTrackNav(
        "/app/purchase-order/new",
        "/app/purchase-invoice/ACC-PINV-2026-00147",
      ),
      false,
    );
  });

  it("rejects stale PI form while intent is PI list (Find jump)", () => {
    assert.equal(
      shouldAcceptErpTrackNav(
        "/app/purchase-invoice",
        "/app/purchase-invoice/new-purchase-invoice-abc",
      ),
      false,
    );
  });

  it("accepts PI list while intent is PI list", () => {
    assert.equal(shouldAcceptErpTrackNav("/app/purchase-invoice", "/app/purchase-invoice"), true);
  });

  it("accepts same doc route", () => {
    assert.equal(
      shouldAcceptErpTrackNav(
        "/app/purchase-order/PO-1",
        "http://erp.local/app/purchase-order/PO-1",
      ),
      true,
    );
  });
});

describe("shouldClearErpNavIntent", () => {
  it("does not clear on optimistic shell trackNav", () => {
    assert.equal(
      shouldClearErpNavIntent("/app/purchase-order/new", "/app/purchase-order/new", {
        fromBrowser: false,
      }),
      false,
    );
  });

  it("clears when browser arrives on intended doctype", () => {
    assert.equal(
      shouldClearErpNavIntent(
        "/app/purchase-order/new",
        "/app/purchase-order/new-purchase-order-xyz",
        { fromBrowser: true },
      ),
      true,
    );
  });

  it("does not clear on stale cross-doctype browser event", () => {
    assert.equal(
      shouldClearErpNavIntent("/app/purchase-order/new", "/app/purchase-invoice/ACC-1", {
        fromBrowser: true,
      }),
      false,
    );
  });

  it("does not clear list intent on stale same-doctype form browser event", () => {
    assert.equal(
      shouldClearErpNavIntent(
        "/app/purchase-invoice",
        "/app/purchase-invoice/new-purchase-invoice-abc",
        { fromBrowser: true },
      ),
      false,
    );
  });
});

describe("shouldBlockDocHijackForListIntent", () => {
  it("blocks stale Bill form while intent is PI list", () => {
    assert.equal(
      shouldBlockDocHijackForListIntent(
        "/app/purchase-invoice",
        "/app/purchase-invoice/new-purchase-invoice-abc",
      ),
      true,
    );
  });

  it("allows unrelated doctype form", () => {
    assert.equal(
      shouldBlockDocHijackForListIntent("/app/purchase-invoice", "/app/purchase-order/PO-1"),
      false,
    );
  });

  it("allows when intent is also a form", () => {
    assert.equal(
      shouldBlockDocHijackForListIntent(
        "/app/purchase-invoice/ACC-1",
        "/app/purchase-invoice/ACC-1",
      ),
      false,
    );
  });
});
