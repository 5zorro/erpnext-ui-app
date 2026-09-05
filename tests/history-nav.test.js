import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyHistoryOpen,
  pickFallbackDocRoute,
  doctypeHasDocSkin,
  FALLBACK_DOC_ROUTE,
  isSoftPeekRoute,
  appRouteParts,
  recordHasForeignAbbr,
  shouldOmitHistoryRoute,
  filterHistoryForCompany,
  decorateHistoryEntry,
  softPeekReturnLabel,
  shouldEscDismissSoftPeek,
  shouldForceVanillaReopen,
  isQueryReportRoute,
  erpLivePathDiffers,
} from "../src/history-nav.js";
import { encodeErpPath, erpUrl } from "../src/nav-guard.js";
import { pushHistory } from "../src/history.js";

describe("classifyHistoryOpen", () => {
  it("marks Bill / PO / IR as doc-preferred", () => {
    assert.equal(classifyHistoryOpen("/app/purchase-invoice/new").mode, "doc-preferred");
    assert.equal(classifyHistoryOpen("/app/purchase-order/PO-1").mode, "doc-preferred");
    assert.equal(classifyHistoryOpen("/app/purchase-receipt/new").mode, "doc-preferred");
  });

  it("normalizes /desk/… to /app/… (OI-118)", () => {
    const c = classifyHistoryOpen("/desk/purchase-invoice/ACC-1");
    assert.equal(c.mode, "doc-preferred");
    assert.equal(c.path, "/app/purchase-invoice/ACC-1");
  });

  it("marks tax / company masters as vanilla-always setup", () => {
    assert.equal(
      classifyHistoryOpen("/app/tax-category/TAX%20EXEMPT%20-%20RETAIL%20SALES").mode,
      "vanilla-always",
    );
    assert.equal(
      classifyHistoryOpen("/app/purchase-taxes-and-charges-template/My%20Template").kind,
      "setup",
    );
    assert.equal(classifyHistoryOpen("/app/company/HID").mode, "vanilla-always");
  });
});

describe("isSoftPeekRoute / appRouteParts", () => {
  it("soft-peeks masters, not Doc forms, desk root, or query reports", () => {
    assert.equal(isSoftPeekRoute("/app/tax-category/X"), true);
    assert.equal(isSoftPeekRoute("/desk/account/TAX%207.25%25%20-%20HID"), true);
    assert.equal(isSoftPeekRoute("/app/query-report/TDS%20Computation%20Summary"), false);
    assert.equal(isSoftPeekRoute("/app/query-report/General%20Ledger"), false);
    assert.equal(isSoftPeekRoute("/app/purchase-invoice/new"), false);
    assert.equal(isSoftPeekRoute("/desk"), false);
  });

  it("isQueryReportRoute detects report paths", () => {
    assert.equal(isQueryReportRoute("/app/query-report/General%20Ledger"), true);
    assert.equal(isQueryReportRoute("/app/tax-category/X"), false);
  });

  it("splits /app path for frappe.set_route", () => {
    assert.deepEqual(appRouteParts("/app/tax-category/TAX%20EXEMPT"), ["tax-category", "TAX EXEMPT"]);
    assert.deepEqual(appRouteParts("/desk/item/ABC"), ["item", "ABC"]);
    assert.deepEqual(appRouteParts("/desk"), []);
  });
});

describe("company abbr hygiene (OI-118)", () => {
  it("detects foreign Account abbr suffix", () => {
    assert.equal(recordHasForeignAbbr("TAX 7.25% - HID", "HI"), true);
    assert.equal(recordHasForeignAbbr("TAX 7.25% - HI", "HI"), false);
    assert.equal(recordHasForeignAbbr("no-suffix", "HI"), false);
  });

  it("omits HID accounts when company abbr is HI", () => {
    assert.equal(
      shouldOmitHistoryRoute("/app/account/TAX%207.25%25%20-%20HID", { companyAbbr: "HI" }),
      true,
    );
    assert.equal(
      shouldOmitHistoryRoute("/app/account/TAX%207.25%25%20-%20HI", { companyAbbr: "HI" }),
      false,
    );
    assert.equal(shouldOmitHistoryRoute("/app/company/HID", { companyAbbr: "HI" }), true);
  });

  it("filterHistoryForCompany drops foreign rows", () => {
    const list = [
      { route: "/app/purchase-invoice/new", dt: "purchase-invoice", label: "Bill" },
      { route: "/app/account/TAX 7.25% - HID", dt: "account", label: "Account" },
    ];
    const next = filterHistoryForCompany(list, "HI");
    assert.equal(next.length, 1);
    assert.equal(next[0].dt, "purchase-invoice");
  });

  it("pushHistory skips omit routes and stores /app paths", () => {
    let h = pushHistory([], "/desk/purchase-invoice/A", { companyAbbr: "HI" });
    assert.equal(h[0].route, "/app/purchase-invoice/A");
    h = pushHistory(h, "/desk/account/TAX 7.25% - HID", { companyAbbr: "HI" });
    assert.equal(h.length, 1);
  });
});

describe("decorateHistoryEntry", () => {
  it("marks setup rows with muted setup detail", () => {
    const d = decorateHistoryEntry({
      route: "/app/tax-category/X",
      dt: "tax-category",
      label: "Tax Category",
    });
    assert.equal(d.kind, "setup");
    assert.equal(d.detail, "setup");
    assert.equal(d.detailMuted, true);
    assert.equal(d.route, "/app/tax-category/X");
  });
});

describe("softPeekReturnLabel / shouldEscDismissSoftPeek", () => {
  it("labels Esc return for Bill / PO / IR", () => {
    assert.equal(softPeekReturnLabel({ mode: "bill" }), "Esc · back to Bill");
    assert.equal(softPeekReturnLabel({ mode: "doc", skinId: "po" }), "Esc · back to Purchase Order");
    assert.equal(softPeekReturnLabel(null), "");
    assert.equal(
      softPeekReturnLabel(null, { dt: "purchase-invoice", route: "/app/purchase-invoice/new" }),
      "Esc · back to Bill",
    );
  });

  it("prefers peek parent over parked Bill while on a Mode of Payment child", () => {
    assert.equal(
      softPeekReturnLabel(
        { mode: "bill", route: "/app/purchase-invoice/ACC-1" },
        { dt: "payment-entry", route: "/app/payment-entry/new-pe-1", label: "New Payment Entry" },
        { currentRoute: "/app/mode-of-payment/Credit%20Card" },
      ),
      "Esc · back to Payment Entry",
    );
  });

  it("Esc dismisses only when armed and no Frappe dialog", () => {
    assert.equal(shouldEscDismissSoftPeek({ softPeekArmed: true, frappeDialogOpen: false }), true);
    assert.equal(shouldEscDismissSoftPeek({ softPeekArmed: true, frappeDialogOpen: true }), false);
    assert.equal(shouldEscDismissSoftPeek({ softPeekArmed: false }), false);
  });
});

describe("shouldForceVanillaReopen", () => {
  it("reopens when forceLoad hits the same Vanilla route (hist New Bill no-op)", () => {
    assert.equal(
      shouldForceVanillaReopen({ forceLoad: true, sameRoute: true, alreadyOnErp: true }),
      true,
    );
    assert.equal(
      shouldForceVanillaReopen({ forceLoad: true, sameRoute: false, alreadyOnErp: true }),
      false,
    );
    assert.equal(
      shouldForceVanillaReopen({
        forceLoad: true,
        sameRoute: true,
        alreadyOnErp: true,
        softPeek: true,
      }),
      false,
    );
  });
});

describe("doctypeHasDocSkin", () => {
  it("is true only for Doc skin registry keys", () => {
    assert.equal(doctypeHasDocSkin("purchase-invoice"), true);
    assert.equal(doctypeHasDocSkin("tax-category"), false);
  });
});

describe("pickFallbackDocRoute", () => {
  it("prefers the most recent Doc-skin history entry", () => {
    const route = pickFallbackDocRoute([
      { route: "/app/tax-category/X", dt: "tax-category" },
      { route: "/desk/purchase-invoice/ACC-001", dt: "purchase-invoice" },
      { route: "/app/company/HID", dt: "company" },
    ]);
    assert.equal(route, "/app/purchase-invoice/ACC-001");
  });

  it("uses dirty saved Bill name when history has no Doc entry", () => {
    const route = pickFallbackDocRoute([{ route: "/app/tax-category/X", dt: "tax-category" }], {
      dirtyDoctypeKey: "Purchase Invoice",
      dirtyDocName: "ACC-99",
    });
    assert.equal(route, "/app/purchase-invoice/ACC-99");
  });

  it("falls back to new Bill", () => {
    assert.equal(pickFallbackDocRoute([]), FALLBACK_DOC_ROUTE);
  });
});

describe("encodeErpPath / erpUrl spaces", () => {
  it("encodes Tax Category-style names once", () => {
    const p = encodeErpPath("/app/tax-category/TAX EXEMPT - RETAIL");
    assert.equal(p, "/app/tax-category/TAX%20EXEMPT%20-%20RETAIL");
    assert.equal(
      encodeErpPath("/app/tax-category/TAX%20EXEMPT%20-%20RETAIL"),
      "/app/tax-category/TAX%20EXEMPT%20-%20RETAIL",
    );
  });

  it("erpUrl joins encoded path", () => {
    assert.equal(
      erpUrl("http://localhost:8080", "/app/company/My Co"),
      "http://localhost:8080/app/company/My%20Co",
    );
  });
});

describe("erpLivePathDiffers", () => {
  it("treats /desk vs /app of the same form as the same path", () => {
    assert.equal(
      erpLivePathDiffers(
        "/app/account/new-account-x",
        "http://localhost:8080/desk/account/new-account-x",
        "http://localhost:8080",
      ),
      false,
    );
  });

  it("detects shell claiming Bill while ERP is still on Account", () => {
    assert.equal(
      erpLivePathDiffers(
        "/app/purchase-invoice/new-purchase-invoice-qjajzrlibi",
        "/desk/account/new-account-pcqeppsntg",
      ),
      true,
    );
  });
});
