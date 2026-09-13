import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CREDIT_MEMO_LABEL,
  isCreditMemoBill,
  creditMemoReturnAgainst,
  creditMemoOrphaned,
  buildSoLinkToken,
  parseSoLinkToken,
  stripSoLinkToken,
  withSoLinkToken,
  buildBillLinkToken,
  parseBillLinkToken,
  stripBillLinkToken,
  withBillLinkToken,
  draftHasEnteredLines,
  planCreditMemoSource,
  buildBillRefToken,
  creditMemoTermsHint,
  parseBillRefToken,
  stripBillRefToken,
  withBillRefToken,
} from "../src/credit-memo.js";

describe("isCreditMemoBill", () => {
  it("true only when is_return is truthy (1)", () => {
    assert.equal(isCreditMemoBill({ is_return: 1 }), true);
    assert.equal(isCreditMemoBill({ is_return: 0 }), false);
    assert.equal(isCreditMemoBill({}), false);
    assert.equal(isCreditMemoBill(null), false);
  });
});

describe("creditMemoReturnAgainst", () => {
  it("trims and defaults to empty string", () => {
    assert.equal(creditMemoReturnAgainst({ return_against: " ACC-PINV-2026-00231 " }), "ACC-PINV-2026-00231");
    assert.equal(creditMemoReturnAgainst({ return_against: null }), "");
    assert.equal(creditMemoReturnAgainst({}), "");
  });
});

describe("creditMemoOrphaned — dogfood regression (ACC-PINV-2026-00232, 2026-09-06)", () => {
  it("flags is_return with no return_against", () => {
    assert.equal(creditMemoOrphaned({ is_return: 1, return_against: null }), true);
  });
  it("clear once return_against is set", () => {
    assert.equal(creditMemoOrphaned({ is_return: 1, return_against: "ACC-PINV-2026-00231" }), false);
  });
  it("clear on a normal (non-return) Bill", () => {
    assert.equal(creditMemoOrphaned({ is_return: 0, return_against: null }), false);
  });
});

describe("CREDIT_MEMO_LABEL", () => {
  it("is the QB-style relabel", () => {
    assert.equal(CREDIT_MEMO_LABEL, "Vendor Credit");
  });
});

describe("draftHasEnteredLines — 'is there work here worth protecting?'", () => {
  it("a fresh form (no items, or one blank child row) has nothing to lose", () => {
    assert.equal(draftHasEnteredLines({}), false);
    assert.equal(draftHasEnteredLines({ items: [] }), false);
    assert.equal(draftHasEnteredLines({ items: [{}] }), false);
    assert.equal(
      draftHasEnteredLines({ items: [{ item_code: "", description: "", qty: 0, rate: 0 }] }),
      false,
    );
    assert.equal(draftHasEnteredLines(null), false);
  });

  it("any typed item_code, description, qty, rate or amount counts as entered", () => {
    assert.equal(draftHasEnteredLines({ items: [{ item_code: "WIDGET-1" }] }), true);
    assert.equal(draftHasEnteredLines({ items: [{ description: "Hand-typed line" }] }), true);
    assert.equal(draftHasEnteredLines({ items: [{ qty: 2 }] }), true);
    assert.equal(draftHasEnteredLines({ items: [{ rate: 19.5 }] }), true);
    assert.equal(draftHasEnteredLines({ items: [{ amount: 39 }] }), true);
  });

  it("negative qty (the credit-memo case) still counts as entered", () => {
    assert.equal(draftHasEnteredLines({ items: [{ qty: -2 }] }), true);
  });

  it("an HTML-only description is not real content", () => {
    assert.equal(draftHasEnteredLines({ items: [{ description: "<div><br></div>" }] }), false);
  });

  it("finds entered work on any row, not just the first", () => {
    assert.equal(draftHasEnteredLines({ items: [{}, {}, { item_code: "BOLT" }] }), true);
  });
});

describe("planCreditMemoSource — never silently destroy entered lines", () => {
  it("an untouched draft takes the native make_debit_note path (real return_against)", () => {
    assert.equal(planCreditMemoSource({ docstatus: 0, items: [] }), "native");
    // New unsaved forms often omit docstatus entirely (matches bill-map isDraftBillDoc).
    assert.equal(planCreditMemoSource({ items: [{}] }), "native");
  });

  it("a draft with typed lines falls back to the informal token instead of a rebuild", () => {
    assert.equal(planCreditMemoSource({ docstatus: 0, items: [{ item_code: "WIDGET-1" }] }), "informal");
  });

  it("submitted or cancelled Bills are blocked — nothing to plan", () => {
    assert.equal(planCreditMemoSource({ docstatus: 1, items: [] }), "blocked");
    assert.equal(planCreditMemoSource({ docstatus: 2, items: [] }), "blocked");
    assert.equal(planCreditMemoSource(null), "blocked");
  });
});

describe("Sales Order synthetic link token (OI-165)", () => {
  it("builds a parseable line", () => {
    assert.equal(buildSoLinkToken("SAL-ORD-2026-00123"), "Linked Sales Order: SAL-ORD-2026-00123");
    assert.equal(buildSoLinkToken(""), "");
    assert.equal(buildSoLinkToken(null), "");
  });

  it("round-trips through parse", () => {
    const token = buildSoLinkToken("SAL-ORD-2026-00123");
    assert.equal(parseSoLinkToken(token), "SAL-ORD-2026-00123");
  });

  it("parses the token even alongside other remarks lines", () => {
    const remarks = "Dry-rotted rubber, warranty claim filed.\nLinked Sales Order: SAL-ORD-2026-00123\nFollow up with supplier.";
    assert.equal(parseSoLinkToken(remarks), "SAL-ORD-2026-00123");
  });

  it("returns empty when no token present", () => {
    assert.equal(parseSoLinkToken("Just a normal memo."), "");
    assert.equal(parseSoLinkToken(""), "");
    assert.equal(parseSoLinkToken(null), "");
  });

  it("strips only the token line, keeping the rest of the memo intact", () => {
    const remarks = "Dry-rotted rubber, warranty claim filed.\nLinked Sales Order: SAL-ORD-2026-00123\nFollow up with supplier.";
    assert.equal(
      stripSoLinkToken(remarks),
      "Dry-rotted rubber, warranty claim filed.\nFollow up with supplier.",
    );
  });

  it("withSoLinkToken appends when remarks has content, replaces a stale token", () => {
    assert.equal(withSoLinkToken("Warranty claim.", "SAL-ORD-2026-00123"), "Warranty claim.\nLinked Sales Order: SAL-ORD-2026-00123");
    const withStale = "Warranty claim.\nLinked Sales Order: SAL-ORD-2026-00001";
    assert.equal(
      withSoLinkToken(withStale, "SAL-ORD-2026-00123"),
      "Warranty claim.\nLinked Sales Order: SAL-ORD-2026-00123",
    );
  });

  it("withSoLinkToken on empty remarks is just the token", () => {
    assert.equal(withSoLinkToken("", "SAL-ORD-2026-00123"), "Linked Sales Order: SAL-ORD-2026-00123");
  });

  it("withSoLinkToken with no SO name just cleans existing token", () => {
    const withStale = "Warranty claim.\nLinked Sales Order: SAL-ORD-2026-00001";
    assert.equal(withSoLinkToken(withStale, ""), "Warranty claim.");
  });
});

describe("Bill informal link token (OI-147/164 — 'create from nothing' then link later)", () => {
  it("builds and parses", () => {
    assert.equal(buildBillLinkToken("ACC-PINV-2026-00231"), "Linked Bill: ACC-PINV-2026-00231");
    assert.equal(parseBillLinkToken("Linked Bill: ACC-PINV-2026-00231"), "ACC-PINV-2026-00231");
    assert.equal(parseBillLinkToken(""), "");
  });

  it("strips only the Bill token, keeping the rest of the memo intact", () => {
    const remarks = "Vendor forgot to credit us.\nLinked Bill: ACC-PINV-2026-00231\nFollow up next statement.";
    assert.equal(
      stripBillLinkToken(remarks),
      "Vendor forgot to credit us.\nFollow up next statement.",
    );
  });

  it("withBillLinkToken appends, replaces a stale token, and cleans when name is empty", () => {
    assert.equal(withBillLinkToken("Note.", "ACC-PINV-2026-00231"), "Note.\nLinked Bill: ACC-PINV-2026-00231");
    assert.equal(
      withBillLinkToken("Note.\nLinked Bill: ACC-PINV-2026-00001", "ACC-PINV-2026-00231"),
      "Note.\nLinked Bill: ACC-PINV-2026-00231",
    );
    assert.equal(withBillLinkToken("Note.\nLinked Bill: ACC-PINV-2026-00231", ""), "Note.");
  });

  it("Bill and Sales Order tokens coexist without clobbering each other", () => {
    let remarks = "";
    remarks = withBillLinkToken(remarks, "ACC-PINV-2026-00231");
    remarks = withSoLinkToken(remarks, "SAL-ORD-2026-00123");
    assert.equal(parseBillLinkToken(remarks), "ACC-PINV-2026-00231");
    assert.equal(parseSoLinkToken(remarks), "SAL-ORD-2026-00123");
    // Replacing the Bill link leaves the SO link untouched.
    remarks = withBillLinkToken(remarks, "ACC-PINV-2026-00999");
    assert.equal(parseBillLinkToken(remarks), "ACC-PINV-2026-00999");
    assert.equal(parseSoLinkToken(remarks), "SAL-ORD-2026-00123");
  });
});

describe("returned Bill's Ref No token (5zorro 2026-09-09)", () => {
  it("records the returned Bill's supplier invoice number as a note", () => {
    assert.equal(buildBillRefToken("INV-9911"), "Ref No on returned Bill: INV-9911");
    assert.equal(withBillRefToken("", "INV-9911"), "Ref No on returned Bill: INV-9911");
  });

  it("handles a vendor invoice number containing spaces", () => {
    // Unlike Linked Bill / Linked Sales Order, which hold ERP document names, a supplier's
    // own invoice number is free text and routinely has spaces in it.
    const notes = withBillRefToken("", "INV 99 11/A");
    assert.equal(parseBillRefToken(notes), "INV 99 11/A");
  });

  it("coexists with the informal Bill and Sales Order tokens", () => {
    let notes = withBillRefToken("Short shipment, credit expected.", "INV-9911");
    notes = withBillLinkToken(notes, "ACC-PINV-2026-00231");
    notes = withSoLinkToken(notes, "SAL-ORD-2026-00007");
    assert.equal(parseBillRefToken(notes), "INV-9911");
    assert.equal(parseBillLinkToken(notes), "ACC-PINV-2026-00231");
    assert.equal(parseSoLinkToken(notes), "SAL-ORD-2026-00007");
    assert.match(notes, /^Short shipment, credit expected\./);
  });

  it("strips only its own line", () => {
    let notes = withBillRefToken("", "INV-9911");
    notes = withBillLinkToken(notes, "ACC-PINV-2026-00231");
    assert.equal(stripBillRefToken(notes), "Linked Bill: ACC-PINV-2026-00231");
    assert.equal(parseBillRefToken(stripBillRefToken(notes)), "");
  });

  it("is not confused by the label ending in the word Bill", () => {
    // "Ref No on returned Bill" and "Linked Bill" both end in Bill; the line anchors must
    // keep them apart in both directions.
    const notes = withBillRefToken("", "INV-9911");
    assert.equal(parseBillLinkToken(notes), "");
    const linked = withBillLinkToken("", "ACC-PINV-2026-00231");
    assert.equal(parseBillRefToken(linked), "");
  });

  it("replaces rather than repeats when set twice", () => {
    let notes = withBillRefToken("", "INV-1");
    notes = withBillRefToken(notes, "INV-2");
    assert.equal(parseBillRefToken(notes), "INV-2");
    assert.equal(notes.split("\n").filter((l) => l.startsWith("Ref No")).length, 1);
  });

  it("adds nothing when the returned Bill had no Ref No", () => {
    assert.equal(buildBillRefToken(""), "");
    assert.equal(buildBillRefToken(null), "");
    assert.equal(withBillRefToken("Just a memo.", ""), "Just a memo.");
  });
});

describe("creditMemoTermsHint", () => {
  it("explains the empty Payment Terms on a credit memo", () => {
    // ERPNext's own make_return_doc sets payment_terms_template = "" and payment_schedule = []
    // for every Purchase Invoice return. Nothing was dropped; the field just has no answer.
    const hint = creditMemoTermsHint({ is_return: 1 });
    assert.match(hint, /credit memo/i);
    assert.ok(hint.length > 0);
  });

  it("says nothing on an ordinary Bill", () => {
    assert.equal(creditMemoTermsHint({ is_return: 0 }), "");
    assert.equal(creditMemoTermsHint({}), "");
    assert.equal(creditMemoTermsHint(null), "");
  });

  it("is a hint, not a lock — it says nothing about editability", () => {
    // Doc skins stay typeable; read-only may only reflect docstatus (HANDOFF invariant 7).
    const hint = creditMemoTermsHint({ is_return: 1 });
    assert.doesNotMatch(hint, /read-?only|locked|cannot|can't/i);
  });
});
