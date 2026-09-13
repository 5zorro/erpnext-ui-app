import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  shouldAcceptErpTrackNav,
  shouldClearErpNavIntent,
  shouldBlockDocHijackForListIntent,
  resolveErpNavIntent,
} from "../src/erp-nav-intent.js";

describe("resolveErpNavIntent", () => {
  const BASE = "http://localhost:8080";

  it("arms form and list routes", () => {
    assert.deepEqual(resolveErpNavIntent("/app/purchase-invoice/ACC-1"), {
      action: "arm",
      path: "/app/purchase-invoice/ACC-1",
    });
    assert.deepEqual(resolveErpNavIntent("/app/payment-entry"), {
      action: "arm",
      path: "/app/payment-entry",
    });
    assert.deepEqual(resolveErpNavIntent(`${BASE}/desk/purchase-order/PO-1`, BASE), {
      action: "arm",
      path: "/app/purchase-order/PO-1",
    });
  });

  it("clears for destinations no doctype guard can match", () => {
    for (const dest of ["/desk", "/", "/login", "", null, undefined]) {
      assert.deepEqual(resolveErpNavIntent(dest, BASE), { action: "clear" }, String(dest));
    }
  });

  it("clearing is what keeps a stale intent from eating the real arrival", () => {
    // Regression (nav incident 2026-09-05): Vanilla → /desk while a payment-entry
    // intent was armed. Leaving it armed rejects the true arrival …
    const stale = "/app/payment-entry";
    assert.equal(shouldAcceptErpTrackNav(stale, `${BASE}/app`, BASE), false);
    // … while still accepting a late event from the page we just left.
    assert.equal(shouldAcceptErpTrackNav(stale, `${BASE}/app/payment-entry`, BASE), true);
    // So /desk must clear rather than arm.
    assert.equal(resolveErpNavIntent("/desk", BASE).action, "clear");
  });

  it("does not arm a /desk intent (it could never accept its own arrival)", () => {
    assert.equal(shouldAcceptErpTrackNav("/desk", `${BASE}/app`, BASE), false);
    assert.equal(shouldClearErpNavIntent("/desk", `${BASE}/app`, { fromBrowser: true }, BASE), false);
  });
});

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
  // Nav incident 2026-09-08T03:39 (see the module doc): erpForceReopenRoute armed an intent,
  // called loadURL, then optimistically trackNav(target) with no opts. Under the old
  // `!== false` reading that cleared the guard ~3ms later, and the Payment Entry navigation
  // the shell had already rejected as stale three times was accepted on the fourth.
  it("does NOT clear when fromBrowser is omitted — the flag must be opted into", () => {
    assert.equal(
      shouldClearErpNavIntent("/app/purchase-invoice/new", "/app/purchase-invoice/new"),
      false,
    );
    assert.equal(
      shouldClearErpNavIntent("/app/purchase-invoice/new", "/app/purchase-invoice/new", {}),
      false,
    );
  });

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
