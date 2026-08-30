import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collectBillSourceRefs,
  collectReceiptSourceRefs,
  formatSourceTermsReadonly,
  hasSourceTermsToShow,
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
    assert.match(text, /PO PO-1:\nFreight included/);
    assert.match(text, /Item Receipt PR-2:\nHandle with care/);
  });

  it("hasSourceTermsToShow is false when all empty", () => {
    assert.equal(
      hasSourceTermsToShow([{ kind: "po", name: "X" }], { "po:X": "" }),
      false,
    );
  });
});
