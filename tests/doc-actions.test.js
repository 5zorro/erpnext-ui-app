import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  docActionsFor,
  offeredDocActions,
  docActionById,
  describeVoidAndAmend,
  describeVoidAndAmendResult,
} from "../src/doc-actions.js";

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

  it("withholds it on a cancelled document", () => {
    const [action] = docActionsFor("purchase-invoice", { docstatus: 2 });
    assert.equal(action.offered, false);
    assert.match(action.reason, /already cancelled/i);
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
