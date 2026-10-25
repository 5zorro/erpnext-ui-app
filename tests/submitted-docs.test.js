import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  submittedEntryFromDoc,
  pushSubmittedDoc,
  markSubmittedPriorSession,
  submittedThisSessionCount,
  submittedRowSummary,
  submittedEntryRoute,
  submittedEntryLabel,
  SUBMITTED_CAP,
} from "../src/submitted-docs.js";

const bill = (name, docstatus = 1) => ({
  doctype: "Purchase Invoice",
  name,
  docstatus,
});

describe("submittedEntryFromDoc", () => {
  it("only captures submitted docs", () => {
    assert.equal(submittedEntryFromDoc("purchase-invoice", bill("ACC-1", 0)), null);
    assert.equal(submittedEntryFromDoc("purchase-invoice", bill("ACC-1", 2)), null);
    assert.equal(submittedEntryFromDoc("purchase-invoice", null), null);
    assert.equal(submittedEntryFromDoc("purchase-invoice", { docstatus: 1 }), null, "no name");
    const e = submittedEntryFromDoc("purchase-invoice", bill("ACC-1"));
    assert.equal(e.name, "ACC-1");
    assert.equal(e.route, "/app/purchase-invoice/ACC-1");
    assert.equal(e.label, "Bill");
    assert.equal(e.detail, "ACC-1");
  });

  it("prefers a copyRef (vendor invoice #) as the detail", () => {
    const e = submittedEntryFromDoc("purchase-invoice", bill("ACC-2"), { copyRef: "INV-9912" });
    assert.equal(e.detail, "INV-9912");
  });

  it("labels each doctype", () => {
    assert.equal(submittedEntryLabel("purchase-order"), "Purchase Order");
    assert.equal(submittedEntryLabel("purchase-invoice"), "Bill");
  });
});

describe("pushSubmittedDoc", () => {
  it("keeps a mixed run newest-first", () => {
    let list = [];
    for (const [dt, n] of [
      ["purchase-invoice", "ACC-1"],
      ["purchase-order", "PO-1"],
      ["payment-entry", "PE-1"],
      ["purchase-invoice", "ACC-2"],
    ]) {
      list = pushSubmittedDoc(list, submittedEntryFromDoc(dt, { doctype: dt, name: n, docstatus: 1 }));
    }
    assert.deepEqual(list.map((e) => e.name), ["ACC-2", "PE-1", "PO-1", "ACC-1"]);
  });

  it("dedupes a re-submitted document and does not mutate the input", () => {
    const first = pushSubmittedDoc([], submittedEntryFromDoc("purchase-invoice", bill("ACC-1")));
    const second = pushSubmittedDoc(first, submittedEntryFromDoc("purchase-invoice", bill("ACC-1")));
    assert.equal(second.length, 1);
    assert.equal(first.length, 1);
  });

  it("ignores junk and caps the list", () => {
    let list = [];
    assert.deepEqual(pushSubmittedDoc(list, null), []);
    for (let i = 0; i < SUBMITTED_CAP + 6; i++) {
      list = pushSubmittedDoc(list, submittedEntryFromDoc("purchase-invoice", bill(`ACC-${i}`)));
    }
    assert.equal(list.length, SUBMITTED_CAP);
    assert.equal(list[0].name, `ACC-${SUBMITTED_CAP + 5}`);
  });
});

describe("session counter", () => {
  it("counts only this run; restored rows are marked prior", () => {
    let list = pushSubmittedDoc([], submittedEntryFromDoc("purchase-invoice", bill("ACC-1")));
    list = pushSubmittedDoc(list, submittedEntryFromDoc("purchase-order", { doctype: "Purchase Order", name: "PO-1", docstatus: 1 }));
    assert.equal(submittedThisSessionCount(list), 2);

    const restored = markSubmittedPriorSession(list);
    assert.equal(submittedThisSessionCount(restored), 0);
    assert.ok(restored.every((e) => e.priorSession));

    const afterNewSubmit = pushSubmittedDoc(restored, submittedEntryFromDoc("purchase-invoice", bill("ACC-9")));
    assert.equal(submittedThisSessionCount(afterNewSubmit), 1);
  });

  it("summary line reflects the split", () => {
    assert.equal(submittedRowSummary([]), "Nothing submitted yet");
    const one = pushSubmittedDoc([], submittedEntryFromDoc("purchase-invoice", bill("ACC-1")));
    assert.match(submittedRowSummary(one), /^1 this session/);
    const two = pushSubmittedDoc(one, submittedEntryFromDoc("purchase-invoice", bill("ACC-2")));
    assert.match(submittedRowSummary(two), /^2 this session/);
    const restored = markSubmittedPriorSession(two);
    assert.match(submittedRowSummary(restored), /None this session · 2 earlier/);
    const mixed = pushSubmittedDoc(restored, submittedEntryFromDoc("purchase-invoice", bill("ACC-3")));
    assert.match(submittedRowSummary(mixed), /^1 this session · 2 earlier/);
  });
});

describe("submittedEntryRoute", () => {
  it("normalizes to an /app path", () => {
    const e = submittedEntryFromDoc("purchase-invoice", bill("ACC-1"));
    assert.equal(submittedEntryRoute(e), "/app/purchase-invoice/ACC-1");
    assert.equal(submittedEntryRoute({ route: "/desk/purchase-order/PO-1" }), "/app/purchase-order/PO-1");
    assert.equal(submittedEntryRoute(null), "");
  });
});

describe("sorting the panel (plan 2026-10-24 answer 5)", async () => {
  const { normalizeSubmittedSort, markSubmittedViewed, sortSubmitted } = await import("../src/submitted-docs.js");
  const row = (name, at, viewedAt) => ({ doctypeKey: "purchase-invoice", name, route: `/app/purchase-invoice/${name}`, label: "Bill", detail: name, at, ...(viewedAt ? { viewedAt } : {}) });
  // Newest submission first, as pushSubmittedDoc keeps it.
  const list = [row("C", "2026-10-24T10:00:00Z"), row("B", "2026-10-24T09:00:00Z"), row("A", "2026-10-24T08:00:00Z")];

  it("defaults to submission order; anything else but 'viewed' is the default", () => {
    assert.equal(normalizeSubmittedSort(undefined), "submitted");
    assert.equal(normalizeSubmittedSort("bogus"), "submitted");
    assert.equal(normalizeSubmittedSort("viewed"), "viewed");
    assert.deepEqual(sortSubmitted(list, "submitted").map((e) => e.name), ["C", "B", "A"]);
  });

  it("by viewed: the one looked at last comes first; never viewed counts from its submission", () => {
    const seen = markSubmittedViewed(list, "purchase-invoice", "A", "2026-10-24T11:00:00Z");
    assert.deepEqual(sortSubmitted(seen, "viewed").map((e) => e.name), ["A", "C", "B"]);
    const again = markSubmittedViewed(seen, "purchase-invoice", "B", "2026-10-24T11:05:00Z");
    assert.deepEqual(sortSubmitted(again, "viewed").map((e) => e.name), ["B", "A", "C"]);
    // The submission order is untouched by viewing.
    assert.deepEqual(sortSubmitted(again, "submitted").map((e) => e.name), ["C", "B", "A"]);
  });

  it("marking returns the same list when nothing changes (no needless save)", () => {
    assert.equal(markSubmittedViewed(list, "purchase-invoice", "ZZ", "2026-10-24T11:00:00Z"), list);
    // C is already the most recently "viewed" (its submission is newest).
    assert.equal(markSubmittedViewed(list, "purchase-invoice", "C", "2026-10-24T11:00:00Z"), list);
    const seen = markSubmittedViewed(list, "Purchase Invoice", "A", "2026-10-24T11:00:00Z");
    assert.notEqual(seen, list);
    assert.equal(list[2].viewedAt, undefined);
  });
});
