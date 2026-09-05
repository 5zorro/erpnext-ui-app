import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldOpenSourceModalAfterVendorPick, runVendorPickWithSourceModal } from "../src/doc-source-flow.js";

describe("shouldOpenSourceModalAfterVendorPick", () => {
  it("opens on link_pick even if setHeader not finished (approach A)", () => {
    const r = shouldOpenSourceModalAfterVendorPick({
      trigger: "link_pick",
      hasSupplier: true,
      editable: true,
      setHeaderOk: null,
    });
    assert.equal(r.open, true);
    assert.equal(r.reason, "vendor_link_pick");
  });

  it("opens on toolbar when supplier set", () => {
    assert.equal(
      shouldOpenSourceModalAfterVendorPick({
        trigger: "toolbar",
        hasSupplier: true,
        editable: true,
      }).open,
      true,
    );
  });

  it("refuses without supplier, when not editable, or modal open", () => {
    assert.equal(
      shouldOpenSourceModalAfterVendorPick({
        trigger: "link_pick",
        hasSupplier: false,
        editable: true,
      }).reason,
      "no_supplier",
    );
    assert.equal(
      shouldOpenSourceModalAfterVendorPick({
        trigger: "link_pick",
        hasSupplier: true,
        editable: false,
      }).reason,
      "not_editable",
    );
    assert.equal(
      shouldOpenSourceModalAfterVendorPick({
        trigger: "link_pick",
        hasSupplier: true,
        editable: true,
        modalAlreadyOpen: true,
      }).reason,
      "modal_already_open",
    );
  });

  it("blur: skips noop; opens on successful commit", () => {
    assert.equal(
      shouldOpenSourceModalAfterVendorPick({
        trigger: "blur",
        hasSupplier: true,
        editable: true,
        setHeaderSkipped: true,
      }).open,
      false,
    );
    assert.equal(
      shouldOpenSourceModalAfterVendorPick({
        trigger: "blur",
        hasSupplier: true,
        editable: true,
        setHeaderOk: true,
      }).open,
      true,
    );
  });
});

describe("runVendorPickWithSourceModal", () => {
  it("runs setHeader and openSourcePicker in parallel", async () => {
    const order = [];
    await runVendorPickWithSourceModal({
      supplier: "Alpine Supply",
      decision: { open: true, reason: "vendor_link_pick" },
      setHeader: async (field, value) => {
        order.push("header-start");
        await new Promise((r) => setTimeout(r, 30));
        order.push("header-end");
        return { ok: true, doc: { supplier: value } };
      },
      openSourcePicker: async () => {
        order.push("modal-start");
        await new Promise((r) => setTimeout(r, 10));
        order.push("modal-end");
      },
      onHeaderSuccess: () => order.push("paint"),
      onHeaderFailure: () => {},
    });
    assert.ok(order.indexOf("header-start") >= 0);
    assert.ok(order.indexOf("modal-start") >= 0);
    assert.ok(order.indexOf("modal-start") < order.indexOf("header-end"));
    assert.ok(order.indexOf("header-end") < order.indexOf("paint"));
    assert.equal(order.at(-1), "paint");
  });

  it("skips modal when decision.open is false", async () => {
    let modalCalled = false;
    await runVendorPickWithSourceModal({
      supplier: "Alpine Supply",
      decision: { open: false, reason: "not_editable" },
      setHeader: async () => ({ ok: true, doc: {} }),
      openSourcePicker: async () => {
        modalCalled = true;
      },
      onHeaderSuccess: () => {},
      onHeaderFailure: () => {},
      onModalSkipped: (reason) => assert.equal(reason, "not_editable"),
    });
    assert.equal(modalCalled, false);
  });
});
