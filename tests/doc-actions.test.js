import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  docActionsFor,
  offeredDocActions,
  docActionById,
  describeVoidAndAmend,
  describeVoidAndAmendResult,
  dropStaleAmendRows,
  DROP_STALE_AMEND_ROWS_JS,
} from "../src/doc-actions.js";

// 🔴 The case that stranded a real bill on 2026-09-22. A Purchase Invoice carrying a Tax
// Withholding Entry row cannot be amended by ERPNext at all: the row Dynamic-links back to the
// invoice, `copy_doc(from_amend)` keeps it (from_amend does NOT strip no_copy fields), and
// `_validate_links` (document.py:477) refuses it before `validate` would have rebuilt it. Running
// the Desk-identical sequence by hand fails the same way, so this is upstream, not our write path.
describe("dropStaleAmendRows — the one deviation from copy_doc's output", () => {
  const source = "ACC-PINV-2026-00232";

  it("drops the child row that links back to the document being amended", () => {
    const draft = {
      doctype: "Purchase Invoice",
      amended_from: source,
      items: [{ item_code: "WIDGET", qty: 2 }],
      tax_withholding_entries: [
        { taxable_doctype: "Purchase Invoice", taxable_name: source, withholding_name: source },
      ],
    };
    const dropped = dropStaleAmendRows(draft, source);
    assert.deepEqual(dropped, ["tax_withholding_entries"]);
    assert.deepEqual(draft.tax_withholding_entries, []);
    assert.equal(draft.items.length, 1, "rows that name something else are untouched");
    assert.equal(draft.amended_from, source, "the parent's own back-reference is the point of it");
  });

  it("keeps sibling rows in the same table that point somewhere else", () => {
    const draft = {
      refs: [{ reference_name: source }, { reference_name: "ACC-PINV-2026-00999" }],
    };
    assert.deepEqual(dropStaleAmendRows(draft, source), ["refs"]);
    assert.deepEqual(draft.refs, [{ reference_name: "ACC-PINV-2026-00999" }]);
  });

  it("changes nothing when no row refers to the source", () => {
    const draft = { items: [{ item_code: "WIDGET" }], taxes: [{ account_head: "TDS - X" }] };
    const before = JSON.parse(JSON.stringify(draft));
    assert.deepEqual(dropStaleAmendRows(draft, source), []);
    assert.deepEqual(draft, before);
  });

  it("survives junk without throwing", () => {
    assert.deepEqual(dropStaleAmendRows(null, source), []);
    assert.deepEqual(dropStaleAmendRows({ items: null }, source), []);
    assert.deepEqual(dropStaleAmendRows({ items: [null, 3, "x"] }, source), []);
    assert.deepEqual(dropStaleAmendRows({ items: [] }, ""), []);
  });

  // The rule ships to the ERP view as source text, so the tested function and the shipped one must
  // be the same thing rather than two implementations that agree today.
  it("the source injected into the ERP view behaves identically", () => {
    const build = () => ({
      tax_withholding_entries: [{ taxable_name: source }, { taxable_name: "OTHER" }],
      items: [{ qty: 1 }],
    });
    const viaExport = build();
    const viaSource = build();
    const shipped = new Function(`${DROP_STALE_AMEND_ROWS_JS}; return dropStaleAmendRows;`)();
    assert.deepEqual(dropStaleAmendRows(viaExport, source), shipped(viaSource, source));
    assert.deepEqual(viaExport, viaSource);
  });
});

const submitted = { docstatus: 1 };

describe("docActionsFor — which actions a Doc skin offers", () => {
  it("offers void-and-amend on a submitted Bill", () => {
    const [action] = docActionsFor("Purchase Invoice", submitted);
    assert.equal(action.id, "void-and-amend");
    assert.equal(action.label, "Edit (void and amend)");
    assert.equal(action.offered, true);
    assert.equal(action.reason, "");
    assert.equal(action.confirm, true);
  });

  it("keys doctypes the way the rest of the app does", () => {
    for (const spelling of ["Purchase Invoice", "purchase_invoice", "purchase-invoice"]) {
      assert.equal(offeredDocActions(spelling, submitted).length, 1, spelling);
    }
  });

  it("has nothing to say about a doctype that declares no actions", () => {
    assert.deepEqual(docActionsFor("Sales Order", submitted), []);
    assert.deepEqual(docActionsFor("", submitted), []);
    assert.deepEqual(docActionsFor(null, submitted), []);
  });

  // 🔴 Absent because ERP's state says so, never because the skin decided to feel read-only
  // (HANDOFF invariant 7). Each of these is a fact about the document, and each says which.
  it("withholds it on a draft — there is nothing to void", () => {
    const [action] = docActionsFor("purchase-invoice", { docstatus: 0 });
    assert.equal(action.offered, false);
    assert.match(action.reason, /draft/i);
  });

  // 🔴 A cancelled document gets the amend half alone — Desk's own shape, and the state a
  // half-done attempt leaves behind. Refusing here stranded the one document that most needed the
  // action, and told the clerk "not submitted, so there is nothing to void" over a form whose chip
  // still read Submitted (dogfood 2026-09-22).
  it("offers the amend half alone on a cancelled document, and says so in the label", () => {
    const [action] = docActionsFor("purchase-invoice", { docstatus: 2 });
    assert.equal(action.offered, true);
    assert.equal(action.reason, "");
    assert.match(action.label, /amend this cancelled document/i);
    assert.doesNotMatch(action.label, /void and amend/i, "there is no cancel left to do");
  });

  it("still refuses a cancelled document that has already been amended", () => {
    const [action] = docActionsFor("purchase-invoice", { docstatus: 2, alreadyAmended: true });
    assert.equal(action.offered, false);
    assert.match(action.reason, /already been amended/i);
  });

  it("withholds it once the document has been amended, which ERPNext allows only once", () => {
    const [action] = docActionsFor("purchase-invoice", { ...submitted, alreadyAmended: true });
    assert.equal(action.offered, false);
    assert.match(action.reason, /already been amended/i);
  });

  it("withholds it while there are unsaved edits on screen", () => {
    const [action] = docActionsFor("purchase-invoice", { ...submitted, dirty: true });
    assert.equal(action.offered, false);
    assert.match(action.reason, /Save or discard/i);
  });

  it("withholds it on a doctype with no amended_from field", () => {
    const [action] = docActionsFor("purchase-invoice", { ...submitted, amendable: false });
    assert.equal(action.offered, false);
    assert.match(action.reason, /cannot be amended/i);
  });

  it("treats junk context as 'not a state I can act on', rather than throwing", () => {
    for (const ctx of [null, undefined, {}, { docstatus: NaN }, { docstatus: "submitted" }]) {
      const [action] = docActionsFor("purchase-invoice", ctx);
      assert.equal(action.offered, false, JSON.stringify(ctx));
      assert.ok(action.reason);
    }
  });

  // A docstatus arriving as a string is ordinary, not junk: it is a number in ERP's own payloads
  // but survives a round trip through JSON and the IPC hop as "1" often enough to matter.
  it("reads a numeric docstatus that arrived as a string", () => {
    assert.equal(docActionsFor("purchase-invoice", { docstatus: "1" })[0].offered, true);
    assert.equal(docActionsFor("purchase-invoice", { docstatus: "0" })[0].offered, false);
  });

  it("finds one action by id, and nothing for an id it does not have", () => {
    assert.equal(docActionById("purchase-invoice", "void-and-amend", submitted).offered, true);
    assert.equal(docActionById("purchase-invoice", "copy-as-draft", submitted), null);
  });
});

describe("describeVoidAndAmend — the consequences, before the click", () => {
  it("names the document, the new ID it will get, and the number that survives", () => {
    const d = describeVoidAndAmend({
      name: "ACC-PINV-2026-00001",
      supplierRef: "INV-88213",
      linkedPaymentCount: 0,
    });
    assert.match(d.title, /ACC-PINV-2026-00001/);
    const text = d.lines.join(" ");
    assert.match(text, /ACC-PINV-2026-00001-1/, "the amended name ERPNext will actually assign");
    assert.match(text, /INV-88213, stays the same/);
    assert.match(text, /amended once/);
    assert.equal(d.severity, "info", "nothing is being detached, so this is not a warning");
  });

  // 🔴 The fact that is invisible on the form and irreversible after the cancel.
  it("warns that applied payments are DETACHED, not cancelled, when the site unlinks them", () => {
    const d = describeVoidAndAmend({
      name: "ACC-PINV-2026-00001",
      linkedPaymentCount: 2,
      unlinksPaymentsOnCancel: true,
    });
    const text = d.lines.join(" ");
    assert.match(text, /2 payments/);
    assert.match(text, /detached/i);
    assert.match(text, /outstanding goes back up/);
    assert.match(text, /by hand/);
    assert.equal(d.severity, "warn");
  });

  it("says the opposite when the site refuses the cancel instead", () => {
    const d = describeVoidAndAmend({
      name: "ACC-PINV-2026-00001",
      linkedPaymentCount: 1,
      unlinksPaymentsOnCancel: false,
    });
    const text = d.lines.join(" ");
    assert.match(text, /refuse to cancel/);
    assert.doesNotMatch(text, /detached/i, "promising the wrong outcome is worse than saying nothing");
    assert.equal(d.severity, "warn");
  });

  // The retry path after a half-done attempt. The cancel already happened, so promising it again
  // (and re-warning about payments it already detached) would describe the past as the future.
  it("describes an already-cancelled document as needing only the copy", () => {
    const d = describeVoidAndAmend({
      name: "ACC-PINV-2026-00001",
      docstatus: 2,
      linkedPaymentCount: 2,
      unlinksPaymentsOnCancel: true,
    });
    assert.match(d.title, /^Amend ACC-PINV-2026-00001\?/);
    const text = d.lines.join(" ");
    assert.match(text, /already cancelled/i);
    assert.doesNotMatch(text, /will be cancelled/i);
    assert.doesNotMatch(text, /detached/i, "that happened when it was cancelled, not now");
    assert.match(text, /amended once/);
  });

  it("says so when the payment count could not be read, instead of rendering it as none", () => {
    const d = describeVoidAndAmend({ name: "ACC-PINV-2026-00001" });
    assert.match(d.lines.join(" "), /could not be checked/);
    assert.equal(d.severity, "warn");
  });

  it("still reads as a sentence with no facts at all", () => {
    const d = describeVoidAndAmend();
    assert.ok(d.title);
    assert.ok(d.lines.length >= 2);
    assert.ok(d.lines.every((l) => typeof l === "string" && l.length));
  });
});

describe("describeVoidAndAmendResult — and especially the half-done one", () => {
  it("reports the new document on success", () => {
    const r = describeVoidAndAmendResult({
      ok: true,
      name: "ACC-PINV-2026-00001",
      amendedName: "ACC-PINV-2026-00001-1",
    });
    assert.equal(r.ok, true);
    assert.match(r.headline, /ACC-PINV-2026-00001-1/);
    assert.equal(r.strandedName, "");
  });

  it("names rows that could not carry over, rather than letting them go missing quietly", () => {
    const r = describeVoidAndAmendResult({
      ok: true,
      name: "ACC-PINV-2026-00001",
      amendedName: "ACC-PINV-2026-00001-1",
      droppedRows: ["tax_withholding_entries"],
    });
    assert.match(r.detail, /1 row in tax_withholding_entries/);
    assert.match(r.detail, /ERPNext recalculates them/);
  });

  // 🔴 Cancel succeeded, insert failed: the bill is cancelled and there is no replacement. A flat
  // "failed" here would read as "nothing happened", and the clerk's next move would be to re-enter
  // a bill that now exists twice.
  it("says the bill is cancelled with no replacement, and names it", () => {
    const r = describeVoidAndAmendResult({
      ok: false,
      cancelled: true,
      step: "insert",
      name: "ACC-PINV-2026-00001",
      reason: "Insert failed: mandatory field missing.",
    });
    assert.equal(r.ok, false);
    assert.equal(r.strandedName, "ACC-PINV-2026-00001");
    assert.match(r.headline, /was cancelled, but the amended copy was not created/);
    assert.match(r.detail, /mandatory field missing/, "keeps ERP's own words");
    assert.match(r.detail, /cancelled in ERPNext right now/);
    assert.match(r.detail, /do not re-enter it as a new bill/);
  });

  it("says plainly that nothing changed when the cancel itself never went through", () => {
    const r = describeVoidAndAmendResult({
      ok: false,
      cancelled: false,
      reason: "Cannot cancel: linked with submitted document PE-0007.",
    });
    assert.equal(r.strandedName, "", "nothing is stranded — the document is untouched");
    assert.match(r.headline, /Nothing was changed/);
    assert.match(r.detail, /PE-0007/);
  });

  it("never throws on an empty or junk result", () => {
    for (const bad of [undefined, {}, { ok: false }]) {
      const r = describeVoidAndAmendResult(bad);
      assert.equal(typeof r.headline, "string");
      assert.ok(r.headline.length);
    }
  });
});
