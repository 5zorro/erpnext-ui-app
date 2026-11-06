/**
 * One wording for a failed save on every Doc form (plan 2026-10-25 closeout, item 3): the case is
 * read from the reply's mark, never guessed from its words; no answer is never called a rejection.
 *
 * @covers src/save-failure.js src/doc-toast-ui.js
 */
import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { saveFailure, saveFailureKind, plainErpText } from "../src/save-failure.js";
import { createDocToast } from "../src/doc-toast-ui.js";
import { humanizeBillErpMessage } from "../src/bill-po-qty-split.js";

describe("which case a failed save is", () => {
  it("reads the bridge's mark", () => {
    assert.equal(saveFailureKind({ ok: false, outcome: "refused", erpReason: "Could not find Project: X" }), "rejected");
    assert.equal(saveFailureKind({ ok: false, outcome: "refused", erpReason: "", reason: "Save failed — ERPNext gave no reason." }), "no-reason");
    assert.equal(saveFailureKind({ ok: false, outcome: "no-answer", reason: "x" }), "no-answer");
    assert.equal(saveFailureKind({ ok: false, timedOut: true, reason: "Save draft timed out" }), "no-answer");
    assert.equal(saveFailureKind({ ok: false, outcome: "unread", reason: "x" }), "unread");
    assert.equal(saveFailureKind({ ok: false, outcome: "not-sent", preflight: true, blockers: ["Supplier"] }), "not-sent");
  });
  it("an unmarked reply was stopped by the shell; no reply at all is no answer", () => {
    assert.equal(saveFailureKind({ ok: false, reason: "Could not clear Already paid before Submit." }), "not-sent");
    assert.equal(saveFailureKind(null), "no-answer");
    assert.equal(saveFailureKind(undefined), "no-answer");
  });
  it("words that sound like a timeout do not make one (the mark decides)", () => {
    assert.equal(saveFailureKind({ ok: false, outcome: "refused", erpReason: "Request timed out" }), "rejected");
  });
});

describe("the words", () => {
  it("rejected with a reason: ERPNext's own words, plain", () => {
    const f = saveFailure({ ok: false, outcome: "refused", erpReason: "Could not find <strong>Project</strong>: ZZ" });
    assert.equal(f.status, "Save rejected — ERPNext says: Could not find Project: ZZ");
    assert.equal(f.gate.title, "Save rejected — ERPNext says:");
    assert.deepEqual(f.gate.blockers, ["Could not find Project: ZZ"]);
    assert.match(f.gate.hint, /Nothing was saved/);
    assert.match(f.toast, /^Save rejected by ERPNext/);
  });
  it("a Submit says Submit", () => {
    const f = saveFailure({ ok: false, outcome: "refused", erpReason: "No" }, { submit: true });
    assert.equal(f.status, "Submit rejected — ERPNext says: No");
  });
  it("the Bill's words for ERPNext's text", () => {
    const f = saveFailure({ ok: false, outcome: "refused", erpReason: "This document is over-billed against Purchase Invoice X" }, { humanize: humanizeBillErpMessage });
    assert.equal(f.status, "Save rejected — ERPNext says: This bill is over-billed against Bill X");
  });
  it("rejected with no reason sends the clerk to Vanilla", () => {
    const f = saveFailure({ ok: false, outcome: "refused", erpReason: "" });
    assert.equal(f.status, "Save rejected — ERPNext gave no reason; open Vanilla to read its message.");
  });
  it("no answer: may still save, reload first, with the wait in seconds; never 'rejected'", () => {
    const f = saveFailure({ ok: false, outcome: "no-answer", timedOut: true, waitedMs: 12000, reason: "Save did not finish in Vanilla within 12s" });
    assert.equal(f.status, "Save did not finish — ERPNext did not answer in 12 s and may still save it; reload before trying again.");
    for (const text of [f.status, f.toast, f.gate.title, f.gate.hint]) assert.doesNotMatch(text, /rejected/i);
    const sub = saveFailure({ ok: false, timedOut: true, waitedMs: 18000 }, { submit: true });
    assert.match(sub.status, /^Submit did not finish — ERPNext did not answer in 18 s and may still submit it/);
    const none = saveFailure(null);
    assert.equal(none.status, "Save did not finish — ERPNext did not answer and may still save it; reload before trying again.");
  });
  it("no answer because the ERPNext page reloaded under the save says so", () => {
    const f = saveFailure({ ok: false, outcome: "no-answer", interrupted: "reloaded", reason: "The ERPNext page reloaded before the step finished." });
    assert.equal(f.status, "Save did not finish — the ERPNext page reloaded before ERPNext answered and may still save it; reload before trying again.");
  });
  it("no answer leaves out text scraped off ERPNext's page (it can be an earlier refusal still on screen)", () => {
    const f = saveFailure({ ok: false, timedOut: true, waitedMs: 12000, blockers: ["Please wait"] });
    assert.match(f.status, /reload before trying again\.$/);
    assert.deepEqual(f.gate.blockers, []);
  });
  it("not sent: what to fix first, and how many more", () => {
    const f = saveFailure({ ok: false, outcome: "not-sent", preflight: true, blockers: ["Supplier is required.", "Item is required."] });
    assert.equal(f.status, "Can't save yet — Supplier is required. (and 1 more)");
    assert.deepEqual(f.gate.blockers, ["Supplier is required.", "Item is required."]);
    assert.equal(saveFailure({ ok: false, reason: "Fix Amount Due checksum before save." }).status, "Can't save yet — Fix Amount Due checksum before save.");
  });
  it("unread: may have gone through", () => {
    assert.match(saveFailure({ ok: false, outcome: "unread" }).status, /^Save may have gone through — .*reload before trying again\.$/);
  });
});

describe("plain ERPNext words", () => {
  it("names the document and uses the form's name for ERPNext's doctype", () => {
    assert.equal(plainErpText("This document has <b>no</b>  lines in Purchase Receipt", { title: "Item Receipt", doctype: "Purchase Receipt" }), "This Item Receipt has no lines in Item Receipt");
    assert.equal(plainErpText("Row 1&nbsp;bad"), "Row 1 bad");
  });
});

describe("the toast says a failed save, the Bill's way", () => {
  beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
  afterEach(() => mock.timers.reset());
  function fakeToast() {
    const classes = new Set();
    return {
      hidden: true,
      textContent: "",
      onclick: null,
      classList: { add: (...c) => c.forEach((x) => classes.add(x)), remove: (...c) => c.forEach((x) => classes.delete(x)), contains: (c) => classes.has(c) },
      classes,
    };
  }
  it("red status line, scrolled into view, and a clickable toast", () => {
    const t = fakeToast();
    let scrolled = 0;
    const status = { scrollIntoView: () => (scrolled += 1) };
    const said = [];
    const toast = createDocToast({ toastEl: () => t, statusEl: () => status, setStatus: (text, cls) => said.push([text, cls]) });
    toast.announceSaveFailure(saveFailure({ ok: false, outcome: "refused", erpReason: "No" }));
    assert.deepEqual(said, [["Save rejected — ERPNext says: No", "err"]]);
    assert.equal(t.hidden, false);
    assert.equal(t.textContent, "Save rejected by ERPNext — click to see why.");
    assert.ok(t.classes.has("is-action"));
    assert.ok(scrolled >= 1);
    t.onclick();
    assert.ok(scrolled >= 2);
  });
  it("a plain toast after a clickable one is not clickable", () => {
    const t = fakeToast();
    const toast = createDocToast({ toastEl: () => t, statusEl: () => null, setStatus: () => {} });
    toast.showBlocking("x", () => {});
    toast.show("y");
    assert.equal(t.onclick, null);
    assert.ok(!t.classes.has("is-action"));
  });
  it("no toast element: the status line carries it", () => {
    const said = [];
    const toast = createDocToast({ toastEl: () => null, statusEl: () => null, setStatus: (text, cls) => said.push([text, cls]) });
    toast.show("Last line kept");
    assert.deepEqual(said, [["Last line kept", "warn"]]);
  });
});
