import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { docShellKind, needsDocShellReload } from "../src/doc-shell-kind.js";
import { resolveResumeRoute, resumeDocMatches, shouldHoldBillPark } from "../src/doc-resume.js";

describe("doc-shell-kind", () => {
  it("the Bill has its own page code; everything else shares one", () => {
    assert.equal(docShellKind("bill"), "bill");
    assert.equal(docShellKind("po"), "doc-form");
    assert.equal(docShellKind("receipt"), "doc-form");
  });

  it("Item Receipt → Bill needs a reload (focus incident 2026-10-01T03:55)", () => {
    assert.equal(needsDocShellReload("receipt", "bill"), true);
    assert.equal(needsDocShellReload("bill", "po"), true);
  });

  it("within one page code, or before any page code booted, no reload", () => {
    assert.equal(needsDocShellReload("po", "receipt"), false);
    assert.equal(needsDocShellReload("bill", "bill"), false);
    assert.equal(needsDocShellReload(null, "bill"), false);
    assert.equal(needsDocShellReload("", "receipt"), false);
  });
});

describe("resolveResumeRoute", () => {
  const draft = { doctype: "Purchase Invoice", name: "new-purchase-invoice-xukjvxmsxv" };

  it("a generic /new park reopens the draft by its own name, not a fresh one", () => {
    assert.equal(
      resolveResumeRoute("/app/purchase-invoice/new", draft, "Purchase Invoice"),
      "/app/purchase-invoice/new-purchase-invoice-xukjvxmsxv",
    );
  });

  it("a /desk address is answered with the /app form", () => {
    assert.equal(
      resolveResumeRoute("/desk/purchase-invoice/new", draft, "Purchase Invoice"),
      "/app/purchase-invoice/new-purchase-invoice-xukjvxmsxv",
    );
  });

  it("a draft saved meanwhile reopens under its saved name", () => {
    assert.equal(
      resolveResumeRoute(
        "/app/purchase-invoice/new",
        { doctype: "Purchase Invoice", name: "ACC-PINV-2026-00001" },
        "Purchase Invoice",
      ),
      "/app/purchase-invoice/ACC-PINV-2026-00001",
    );
  });

  it("an address that already names the record is kept", () => {
    const named = "/app/purchase-invoice/ACC-PINV-2026-00007";
    assert.equal(resolveResumeRoute(named, draft, "Purchase Invoice"), named);
  });

  it("a copy of another doctype, or no copy, leaves the park address alone", () => {
    const po = { doctype: "Purchase Order", name: "new-purchase-order-abc" };
    assert.equal(
      resolveResumeRoute("/app/purchase-invoice/new", po, "Purchase Invoice"),
      "/app/purchase-invoice/new",
    );
    assert.equal(
      resolveResumeRoute("/app/purchase-invoice/new", null, "Purchase Invoice"),
      "/app/purchase-invoice/new",
    );
    assert.equal(
      resolveResumeRoute("/app/purchase-invoice/new", { name: "new" }, "Purchase Invoice"),
      "/app/purchase-invoice/new",
    );
  });
});

describe("resumeDocMatches", () => {
  it("same name is the same draft", () => {
    assert.equal(resumeDocMatches("new-purchase-invoice-a", "new-purchase-invoice-a"), true);
  });

  it("Frappe made a fresh draft instead — not a match (the stale-vendor incident)", () => {
    assert.equal(
      resumeDocMatches("new-purchase-invoice-xukjvxmsxv", "new-purchase-invoice-jbiojnruls"),
      false,
    );
  });

  it("a draft renamed by its save is still the same draft", () => {
    assert.equal(
      resumeDocMatches("new-purchase-invoice-a", "ACC-PINV-2026-00001", {
        "new-purchase-invoice-a": "ACC-PINV-2026-00001",
      }),
      true,
    );
  });

  it("nothing expected means nothing to contradict", () => {
    assert.equal(resumeDocMatches("", "new-purchase-invoice-a"), true);
  });
});

describe("shouldHoldBillPark", () => {
  it("never parks while the clerk is on Vanilla", () => {
    assert.equal(
      shouldHoldBillPark({ surfaceMode: "erp", routeDoctype: "purchase-invoice", hasDirtyDoc: true }),
      false,
    );
  });

  it("still covers the drifted-surface case it was written for (Recent says home)", () => {
    assert.equal(
      shouldHoldBillPark({ surfaceMode: "home", routeDoctype: "purchase-invoice", hasDirtyDoc: true }),
      true,
    );
  });

  it("needs a Bill route and a copy to hold", () => {
    assert.equal(
      shouldHoldBillPark({ surfaceMode: "home", routeDoctype: "purchase-order", hasDirtyDoc: true }),
      false,
    );
    assert.equal(
      shouldHoldBillPark({ surfaceMode: "home", routeDoctype: "purchase-invoice", hasDirtyDoc: false }),
      false,
    );
  });
});
