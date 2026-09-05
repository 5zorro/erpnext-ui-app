import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collectBillSourceRefs,
  collectReceiptSourceRefs,
  formatSourceTermsReadonly,
  hasSourceTermsToShow,
  sourceTermsDisplayBlocks,
} from "../src/doc-source-terms.js";

describe("doc-source-terms", () => {
  it("collectBillSourceRefs dedupes PO and PR from lines", () => {
    const refs = collectBillSourceRefs({
      items: [
        { purchase_order: "PO-1", purchase_receipt: "PR-1" },
        { purchase_order: "PO-1", purchase_receipt: "PR-2" },
      ],
    });
    assert.deepEqual(
      refs.map((r) => `${r.kind}:${r.name}`).sort(),
      ["po:PO-1", "pr:PR-1", "pr:PR-2"],
    );
  });

  it("collectReceiptSourceRefs keeps PO links only", () => {
    const refs = collectReceiptSourceRefs({
      items: [{ purchase_order: "PO-9" }, { purchase_order: "PO-9" }],
    });
    assert.deepEqual(refs, [{ kind: "po", name: "PO-9" }]);
  });

  it("formatSourceTermsReadonly includes PR remarks", () => {
    const text = formatSourceTermsReadonly(
      [{ kind: "pr", name: "PR-2" }],
      { "pr:PR-2": "" },
      { "pr:PR-2": "Received on dock 3 — handle with care." },
    );
    assert.match(text, /Item Receipt remarks:\nReceived on dock 3/);
  });

  it("sourceTermsDisplayBlocks yields washed per-source fields", () => {
    const blocks = sourceTermsDisplayBlocks(
      [
        { kind: "po", name: "PO-1" },
        { kind: "pr", name: "PR-2" },
      ],
      {
        "po:PO-1": "Freight included in rate.",
        "pr:PR-2": "Handle with care",
      },
      { "pr:PR-2": "Dock 3 only." },
    );
    assert.equal(blocks.length, 3);
    assert.equal(blocks[0].label, "PO terms");
    assert.equal(blocks[0].washRole, "order");
    assert.equal(blocks[1].label, "Item Receipt terms");
    assert.equal(blocks[1].washRole, "fulfill");
    assert.equal(blocks[2].label, "Item Receipt remarks");
  });

  it("formatSourceTermsReadonly joins labeled blocks", () => {
    const text = formatSourceTermsReadonly(
      [
        { kind: "po", name: "PO-1" },
        { kind: "pr", name: "PR-2" },
      ],
      {
        "po:PO-1": "Freight included in rate.",
        "pr:PR-2": "<p>Handle with care</p>",
      },
    );
    assert.match(text, /PO terms:\nFreight included/);
    assert.match(text, /Item Receipt terms:\nHandle with care/);
  });

  it("hasSourceTermsToShow is false when all empty", () => {
    assert.equal(
      hasSourceTermsToShow([{ kind: "po", name: "X" }], { "po:X": "" }),
      false,
    );
  });
});
