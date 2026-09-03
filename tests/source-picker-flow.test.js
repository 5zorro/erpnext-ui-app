import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mayAutoOpenSourcePicker,
  runSourcePickerFlow,
} from "../src/source-picker-flow.js";

describe("mayAutoOpenSourcePicker", () => {
  it("allows first auto-open per vendor pick session", () => {
    const session = { supplier: "Alpine Supply", userClosed: false };
    assert.equal(mayAutoOpenSourcePicker(session, "Alpine Supply", "link_pick").ok, true);
  });

  it("blur stays blocked after user closed modal for same supplier", () => {
    const session = { supplier: "Alpine Supply", userClosed: true };
    const r = mayAutoOpenSourcePicker(session, "Alpine Supply", "blur");
    assert.equal(r.ok, false);
    assert.equal(r.reason, "pick_closed");
  });

  it("blur opens for new supplier after dismiss on another", () => {
    const session = { supplier: "Alpine Supply", userClosed: true };
    assert.equal(mayAutoOpenSourcePicker(session, "Other Vendor", "blur").ok, true);
  });

  it("link_pick stays blocked after user closed modal", () => {
    const session = { supplier: "Alpine Supply", userClosed: true };
    const r = mayAutoOpenSourcePicker(session, "Alpine Supply", "link_pick");
    assert.equal(r.ok, false);
    assert.equal(r.reason, "pick_closed");
  });

  it("toolbar always bypasses closed session", () => {
    const session = { supplier: "Alpine Supply", userClosed: true };
    assert.equal(mayAutoOpenSourcePicker(session, "Alpine Supply", "toolbar").ok, true);
  });

  it("new vendor bypasses closed session for link_pick", () => {
    const session = { supplier: "Alpine Supply", userClosed: true };
    assert.equal(mayAutoOpenSourcePicker(session, "Other Vendor", "link_pick").ok, true);
  });
});

describe("runSourcePickerFlow", () => {
  it("resolves when user closes, not when slices finish", async () => {
    const order = [];
    const t0 = Date.now();

    const flowP = runSourcePickerFlow({
      supplier: "Alpine Supply",
      trigger: "link_pick",
      listSourceSlice: async (_vendor, sliceId) => {
        order.push(`slice-start:${sliceId}`);
        await new Promise((r) => setTimeout(r, 50));
        order.push(`slice-end:${sliceId}`);
        return { ok: true, rows: [] };
      },
      showModal: ({ onController, onClose }) => {
        order.push("modal-open");
        return new Promise((resolve) => {
          onController({
            applySlice: () => {},
            setSliceError: () => {},
            updateGroups: () => {},
            setLoadError: () => {},
          });
          setTimeout(() => {
            order.push("modal-close");
            onClose("cancel");
            resolve({ ok: true, kind: "cancel" });
          }, 10);
        });
      },
    });

    const result = await flowP;
    const elapsed = Date.now() - t0;
    assert.equal(result.kind, "cancel");
    assert.ok(elapsed < 40, `expected fast resolve, got ${elapsed}ms`);
    assert.ok(order.includes("modal-close"));
    assert.equal(order.filter((x) => x.startsWith("slice-end:")).length, 0);
  });

  it("streams slices into controller while modal stays open", async () => {
    /** @type {string[]} */
    const applied = [];
    /** @type {import("../src/source-modal-ui.js").SourceModalController | null} */
    let ctl = null;

    const flowP = runSourcePickerFlow({
      supplier: "Alpine Supply",
      trigger: "toolbar",
      listSourceSlice: async (_vendor, sliceId) => {
        if (sliceId === "po_submitted") {
          return { ok: true, rows: [{ name: "PO-1", transaction_date: "2019-01-01", grand_total: 10 }] };
        }
        return { ok: true, rows: [] };
      },
      showModal: ({ onController, onClose }) =>
        new Promise((resolve) => {
          onController({
            applySlice: (sliceId) => applied.push(sliceId),
            setSliceError: () => {},
            updateGroups: () => {},
            setLoadError: () => {},
          });
          setTimeout(() => {
            onClose("cancel");
            resolve({ ok: true, kind: "cancel" });
          }, 30);
        }),
    });

    await flowP;
    assert.ok(applied.includes("po_submitted"));
  });
});
