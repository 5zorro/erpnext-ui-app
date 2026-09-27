import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runVoidAndAmend, confirmBodyFromLines } from "../src/void-amend-flow.js";

/**
 * The whole point of extracting this flow (P1 stage 2) is that four skins now run it, and the
 * sequence's value is being careful in the *same* way every time. These tests drive it with fakes,
 * which is the only way the dangerous path — cancel landed, insert failed — can be exercised at
 * all without cancelling a real document.
 */

function harness(overrides = {}) {
  const status = [];
  const calls = [];
  const confirms = [];
  const api = {
    voidAmendFacts: async (doctype, name) => {
      calls.push(["facts", doctype, name]);
      return overrides.facts ?? { ok: true, blockers: [], linkedPaymentCount: 0 };
    },
    voidAndAmend: async (doctype, name) => {
      calls.push(["write", doctype, name]);
      if (overrides.writeThrows) throw new Error(overrides.writeThrows);
      return overrides.result ?? { ok: true, name, amendedName: `${name}-1`, cancelled: true };
    },
    ...(overrides.api || {}),
  };
  return {
    status,
    calls,
    confirms,
    deps: {
      doctype: "purchase-invoice",
      name: "ACC-PINV-2026-00231",
      docstatus: 1,
      dirty: false,
      api,
      confirm: (title, body) => {
        confirms.push({ title, body });
        return overrides.agree !== false;
      },
      setStatus: (text, cls) => status.push([text, cls]),
      ...(overrides.deps || {}),
    },
  };
}

const lastStatus = (status) => status.filter(([t]) => t)[status.filter(([t]) => t).length - 1];

describe("runVoidAndAmend — read, ask, write, report", () => {
  it("reads the facts before asking, and asks before writing", async () => {
    const h = harness();
    const out = await runVoidAndAmend(h.deps);
    assert.deepEqual(h.calls, [
      ["facts", "purchase-invoice", "ACC-PINV-2026-00231"],
      ["write", "purchase-invoice", "ACC-PINV-2026-00231"],
    ]);
    assert.equal(h.confirms.length, 1);
    assert.equal(out.ok, true);
    assert.equal(out.amendedName, "ACC-PINV-2026-00231-1");
  });

  it("carries the doctype on both calls, so one channel can serve four skins", async () => {
    const h = harness({ deps: { doctype: "payment-entry", name: "ACC-PAY-2026-00002" } });
    await runVoidAndAmend(h.deps);
    assert.deepEqual(
      h.calls.map((c) => c[1]),
      ["payment-entry", "payment-entry"],
    );
  });

  it("writes nothing when the clerk backs out of the confirm", async () => {
    const h = harness({ agree: false });
    const out = await runVoidAndAmend(h.deps);
    assert.deepEqual(h.calls.map((c) => c[0]), ["facts"]);
    assert.equal(out.ran, false);
    assert.equal(out.reason, "", "backing out is not an error and must not be reported as one");
  });

  it("refuses a dirty form, a draft, and a document with no name — before any ERP call", async () => {
    for (const deps of [{ dirty: true }, { docstatus: 0 }, { name: "" }]) {
      const h = harness({ deps });
      const out = await runVoidAndAmend(h.deps);
      assert.equal(out.ran, false);
      assert.deepEqual(h.calls, [], JSON.stringify(deps));
    }
  });

  // 🔴 The dogfood bug: a method missing from a preload/adapter is simply `undefined`, and the old
  // message told the clerk to restart the shell — a remedy that could not possibly work.
  it("names a wiring gap as a wiring gap, and does not suggest a restart", async () => {
    const h = harness({ api: { voidAndAmend: undefined } });
    const out = await runVoidAndAmend(h.deps);
    assert.equal(out.ran, false);
    assert.match(out.reason, /adapter/i);
    assert.doesNotMatch(out.reason, /restart/i);
    assert.deepEqual(h.calls, []);
  });

  it("stops on an already-amended document rather than letting ERP refuse the insert", async () => {
    const h = harness({ facts: { ok: true, alreadyAmended: true } });
    const out = await runVoidAndAmend(h.deps);
    assert.equal(out.ran, false);
    assert.match(out.reason, /already been amended once/i);
    assert.equal(h.confirms.length, 0, "there is nothing to confirm if it cannot happen");
  });

  it("stops when the facts could not be read — a confirm that cannot name its consequences is not one", async () => {
    const h = harness({ facts: { ok: false, reason: "ERP Desk not ready." } });
    const out = await runVoidAndAmend(h.deps);
    assert.equal(out.ran, false);
    assert.equal(out.reason, "ERP Desk not ready.");
    assert.equal(h.confirms.length, 0);
  });

  it("puts the facts it read into the confirm body", async () => {
    const h = harness({
      facts: {
        ok: true,
        linkedPaymentCount: 2,
        unlinksPaymentsOnCancel: true,
        blockers: [],
      },
    });
    await runVoidAndAmend(h.deps);
    assert.match(h.confirms[0].body, /2 payments/);
    assert.match(h.confirms[0].body, /detached/);
    assert.doesNotMatch(h.confirms[0].body, /\*\*/, "markdown emphasis renders literally in a native confirm");
  });
});

describe("runVoidAndAmend — the half-done outcome, which is the dangerous one", () => {
  it("reports a cancelled-but-not-amended document as stranded, naming it", async () => {
    const h = harness({
      result: {
        ok: false,
        cancelled: true,
        name: "ACC-PINV-2026-00231",
        reason: "Cannot link cancelled document",
        step: "insert",
      },
    });
    const out = await runVoidAndAmend(h.deps);
    assert.equal(out.ok, false);
    assert.equal(out.ran, true);
    assert.equal(out.strandedName, "ACC-PINV-2026-00231");
    const [text, cls] = lastStatus(h.status);
    assert.equal(cls, "err");
    assert.match(text, /was cancelled, but the amended copy was not created/i);
    assert.match(text, /do not re-enter it/i);
  });

  // A thrown call is worse than a failed one: the cancel may or may not have landed and the page
  // cannot tell. Reporting "nothing happened" is how a bill ends up entered twice.
  it("treats a lost connection as possibly-cancelled, never as nothing-happened", async () => {
    const h = harness({ writeThrows: "socket hang up" });
    const out = await runVoidAndAmend(h.deps);
    assert.equal(out.ran, true);
    assert.equal(out.ok, false);
    assert.equal(out.strandedName, "ACC-PINV-2026-00231");
    assert.match(out.reason, /may already be cancelled/i);
  });

  it("reports a refused cancel as nothing-changed, with no stranded document", async () => {
    const h = harness({
      result: { ok: false, cancelled: false, name: "PUR-ORD-2026-00031", reason: "Cannot cancel because..." },
    });
    const out = await runVoidAndAmend(h.deps);
    assert.equal(out.strandedName, "", "a refusal rolls back — nothing is stranded");
    assert.match(out.reason, /Nothing was changed/i);
  });

  it("uses the doctype's own noun when it has nothing else to go on", async () => {
    const h = harness({ deps: { doctype: "purchase-receipt", docstatus: 0 } });
    const out = await runVoidAndAmend(h.deps);
    assert.match(out.reason, /Item Receipt/);
  });
});

describe("confirmBodyFromLines", () => {
  it("strips markdown emphasis and blank-line separates", () => {
    assert.equal(confirmBodyFromLines(["a **b**", "c"]), "a b\n\nc");
    assert.equal(confirmBodyFromLines(null), "");
  });
});
