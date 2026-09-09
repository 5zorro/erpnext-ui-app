import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CREDIT_SOURCE_GROUP_ID,
  CREDIT_NIC_GROUP_ID,
  sourceModalArity,
  sourceModalTitleHint,
  sourceModalPickLabel,
  creditSwitchView,
  creditSourceItemFromRow,
  buildCreditSourceLoadingGroups,
  buildCreditSourceGroups,
  buildCreditSourceErrorGroups,
  classifyCreditSourceChoice,
} from "../src/source-modal-credit-mode.js";
import {
  isSelectableSourceItem,
  sourceItemKey,
  groupHasSelectableItem,
} from "../src/source-modal.js";

describe("sourceModalArity", () => {
  it("forces single-pick in credit mode — return_against is one Link", () => {
    assert.equal(sourceModalArity(true, "multi"), "single");
    assert.equal(sourceModalArity(true, "single"), "single");
  });

  it("leaves the host's arity alone when credit mode is off", () => {
    assert.equal(sourceModalArity(false, "multi"), "multi");
    assert.equal(sourceModalArity(false, "single"), "single");
  });

  it("defaults to multi when the host said nothing", () => {
    assert.equal(sourceModalArity(false, undefined), "multi");
    assert.equal(sourceModalArity(false, null), "multi");
  });
});

describe("sourceModalTitleHint", () => {
  it("asks the credit question, not the source question, in credit mode", () => {
    const hint = sourceModalTitleHint("single", true);
    assert.match(hint, /which Bill is this against/i);
    assert.doesNotMatch(hint, /Space: check/);
  });

  it("keeps the multi-select keyboard legend when credit mode is off", () => {
    assert.match(sourceModalTitleHint("multi", false), /Space: check/);
    assert.match(sourceModalTitleHint("single", false), /Enter: select/);
  });
});

describe("sourceModalPickLabel", () => {
  it("names the credit action", () => {
    assert.equal(sourceModalPickLabel("single", true), "Use this Bill");
  });

  it("keeps the source labels otherwise", () => {
    assert.equal(sourceModalPickLabel("multi", false), "Pull selected");
    assert.equal(sourceModalPickLabel("single", false), "Select this source");
  });
});

describe("creditSwitchView", () => {
  it("reports switch state for aria + styling", () => {
    const on = creditSwitchView(true);
    assert.equal(on.on, true);
    assert.equal(on.ariaChecked, "true");
    assert.match(on.ariaLabel, /Yes/);

    const off = creditSwitchView(false);
    assert.equal(off.on, false);
    assert.equal(off.ariaChecked, "false");
    assert.match(off.ariaLabel, /No/);
  });

  it("explains which corpus is showing in each state", () => {
    assert.match(creditSwitchView(true).title, /Bills/);
    assert.match(creditSwitchView(false).title, /Purchase Orders and Item Receipts/);
  });
});

describe("creditSourceItemFromRow", () => {
  it("maps a searchLink row to a selectable bill item", () => {
    const it = creditSourceItemFromRow({
      value: "ACC-PINV-2026-00231",
      description: "Alpine Supply — 768.50",
    });
    assert.equal(it.kind, "bill");
    assert.equal(it.name, "ACC-PINV-2026-00231");
    assert.match(it.label, /ACC-PINV-2026-00231/);
    assert.match(it.label, /Alpine Supply/);
    assert.equal(isSelectableSourceItem(it), true);
  });

  it("does not repeat the name when the description is the name", () => {
    const it = creditSourceItemFromRow({ value: "PINV-1", description: "PINV-1" });
    assert.equal(it.label, "PINV-1");
  });

  it("gets a stable selection key distinct from PO/PR keys", () => {
    const it = creditSourceItemFromRow({ value: "PINV-1" });
    assert.equal(sourceItemKey(it), "bill:PINV-1");
    assert.notEqual(sourceItemKey(it), sourceItemKey({ kind: "po", name: "PINV-1" }));
  });

  it("rejects rows with no name", () => {
    assert.equal(creditSourceItemFromRow({ value: "   " }), null);
    assert.equal(creditSourceItemFromRow(null), null);
    assert.equal(creditSourceItemFromRow("PINV-1"), null);
  });
});

describe("buildCreditSourceGroups", () => {
  const rows = [
    { value: "PINV-1", description: "Alpine Supply" },
    { value: "PINV-2", description: "Alpine Supply" },
  ];

  it("puts the decline row first so Enter on open writes nothing", () => {
    const groups = buildCreditSourceGroups(rows, { supplier: "Alpine Supply" });
    assert.equal(groups[0].id, CREDIT_NIC_GROUP_ID);
    assert.equal(groups[0].items[0].kind, "nic");
    assert.equal(groups[1].id, CREDIT_SOURCE_GROUP_ID);
  });

  it("names the vendor it scoped to", () => {
    const groups = buildCreditSourceGroups(rows, { supplier: "Alpine Supply" });
    assert.match(groups[1].name, /Alpine Supply/);
  });

  it("never offers the document back to itself", () => {
    const groups = buildCreditSourceGroups(rows, { exclude: "PINV-1" });
    const names = groups[1].items.map((i) => i.name);
    assert.deepEqual(names, ["PINV-2"]);
  });

  it("renders an unselectable placeholder when the vendor has no Bills", () => {
    const groups = buildCreditSourceGroups([], { supplier: "Alpine Supply" });
    assert.equal(groups[1].items.length, 1);
    assert.equal(isSelectableSourceItem(groups[1].items[0]), false);
    assert.equal(groupHasSelectableItem(groups[1]), false);
    // The decline row still is selectable, so the modal is never a dead end.
    assert.equal(groupHasSelectableItem(groups[0]), true);
  });

  it("treats an all-excluded list as empty rather than crashing", () => {
    const groups = buildCreditSourceGroups([{ value: "PINV-1" }], { exclude: "PINV-1" });
    assert.equal(groupHasSelectableItem(groups[1]), false);
  });
});

describe("buildCreditSourceLoadingGroups / error groups", () => {
  it("shows a loading placeholder that cannot be picked", () => {
    const groups = buildCreditSourceLoadingGroups("Alpine Supply");
    assert.equal(groups[1].loading, true);
    assert.equal(isSelectableSourceItem(groups[1].items[0]), false);
  });

  it("keeps the decline row available while loading, so Escape is not the only way out", () => {
    const groups = buildCreditSourceLoadingGroups("Alpine Supply");
    assert.equal(groupHasSelectableItem(groups[0]), true);
  });

  it("surfaces a load failure in the group instead of an empty list", () => {
    const groups = buildCreditSourceErrorGroups("ERP unreachable", "Alpine Supply");
    assert.equal(groups[1].error, "ERP unreachable");
    assert.match(groups[1].items[0].label, /ERP unreachable/);
    assert.equal(isSelectableSourceItem(groups[1].items[0]), false);
  });

  it("falls back to a generic message when the error has no text", () => {
    const groups = buildCreditSourceErrorGroups("", "Alpine Supply");
    assert.equal(groups[1].error, "Load failed");
  });
});

describe("classifyCreditSourceChoice", () => {
  it("links a picked bill", () => {
    const r = classifyCreditSourceChoice({ kind: "bill", name: "PINV-1", label: "PINV-1" });
    assert.deepEqual(r, { action: "link", name: "PINV-1" });
  });

  it("treats the decline row as decline, not as a clear", () => {
    assert.equal(classifyCreditSourceChoice({ kind: "nic", label: "Decide later" }).action, "decline");
    assert.equal(classifyCreditSourceChoice({ mode: "nic", items: [] }).action, "decline");
  });

  it("unwraps a single-item multi payload (host arity race)", () => {
    const r = classifyCreditSourceChoice({
      mode: "merge",
      items: [{ kind: "bill", name: "PINV-9" }],
    });
    assert.deepEqual(r, { action: "link", name: "PINV-9" });
  });

  it("ignores PO/PR items — credit mode must never pull lines from an order", () => {
    assert.equal(classifyCreditSourceChoice({ kind: "po", name: "PO-1" }).action, "ignore");
    assert.equal(classifyCreditSourceChoice({ kind: "pr", name: "PR-1" }).action, "ignore");
  });

  it("ignores a bill item with no name, and junk", () => {
    assert.equal(classifyCreditSourceChoice({ kind: "bill", name: "  " }).action, "ignore");
    assert.equal(classifyCreditSourceChoice(null).action, "ignore");
    assert.equal(classifyCreditSourceChoice({ mode: "merge", items: [] }).action, "ignore");
  });
});
