/**
 * The Doc page's preload holds what touches ERPNext's form while a new Bill's blank is provisional
 * (electron/doc-form-preload.cjs; HANDOFF § Navigation spine, "A new document waits on nothing").
 * A call it does not hold goes straight to ERPNext even before ERPNext's blank exists, so every
 * channel the page can call must be sorted: held (HELD_EDITS / HELD_READS there) or passed on
 * purpose (here, with the reason). A new channel fails this test until it is sorted.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(new URL("../electron/doc-form-preload.cjs", import.meta.url), "utf8");

/** @param {string} name */
function setOf(name) {
  const m = src.match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  assert.ok(m, `${name} not found`);
  return new Set([...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
}

/** Channels that never touch ERPNext's form, or that must work before it exists. */
const PASSED = new Map([
  ["doc-get-ui", "the page's own layout"],
  ["bill-search-link", "pick lists answer from the shell's copies (or live search, no form)"],
  ["doc-search-link", "same"],
  ["link-list-refresh", "same"],
  ["link-picker-mounted", "notes which lists the page's pickers use; no form"],
  ["doc-link-exists", "asks ERPNext whether a record exists; no form"],
  ["bill-new", "New again replaces the provisional blank (its held calls are refused)"],
  ["doc-new", "same"],
  ["bill-retry-load", "reloads the form; replaces the open"],
  ["doc-retry-load", "same"],
  ["bill-find", "opens the Find page"],
  ["doc-find", "same"],
  ["erp-refocus-list-filter", "the ERPNext list page"],
  ["papers-list", "papers are fetched by file, not from the form"],
  ["papers-bytes", "same"],
  ["papers-upload", "same"],
  ["papers-open", "same"],
  ["papers-download", "same"],
  ["papers-zip", "same"],
  ["papers-printed-pdf", "same"],
  ["papers-pdf", "same"],
  ["so-create-po-context", "Sales Order pages, not the Bill"],
  ["so-create-pos", "same"],
  ["so-line-sources", "same"],
  ["so-create-counts", "same"],
  ["so-vanilla-create", "same"],
  ["print-options", "printing reads saved documents"],
  ["print-block-reason", "same"],
  ["print-run", "same"],
  ["print-queue-get", "same"],
  ["print-job-status", "same"],
  ["print-queue-add", "same"],
  ["print-queue-remove", "same"],
  ["print-queue-clear", "same"],
  ["print-queue-run", "same"],
  ["bill-list-source-slice", "reads POs / receipts by vendor (only after a vendor is written)"],
  ["fetch-source-terms", "reads the named sources"],
  ["bill-create-credit-memo", "from a submitted Bill, never a new one"],
  ["doc-void-amend-facts", "submitted documents only"],
  ["doc-void-and-amend", "same"],
  ["soft-peek-route", "a peek of a linked record (its buttons need a saved link)"],
  ["bill-receive-facts", "reads item stock facts by code"],
  ["tax-default-facts", "reads the vendor's tax default by name"],
  ["set-bill-receive-ask", "a preference"],
  ["get-doc-number-lead", "a preference"],
  ["set-doc-number-lead", "a preference"],
  ["calc-history-list", "the calculator"],
  ["calc-history-copy", "the calculator"],
  ["calc-site-rounding", "the calculator"],
  ["bill-prefetch-vendor-refs", "reads a vendor's past Bill numbers by name"],
  ["bill-open-add-payment", "submitted Bills only"],
  ["bill-open-landed-cost", "submitted Bills only"],
  ["bill-so-picker-list", "reads Sales Orders"],
  ["bill-list-projects", "reads Projects"],
  ["bill-open-supplier-form", "opens the vendor's own record"],
]);

describe("the Doc page preload sorts every channel for a provisional blank", () => {
  const held = new Set([...setOf("HELD_EDITS"), ...setOf("HELD_READS")]);
  const called = new Set();
  for (const m of src.matchAll(/invokeSkin\("([^"]+)", "([^"]+)"/g)) {
    called.add(m[1]);
    called.add(m[2]);
  }
  for (const m of src.matchAll(/(?<![\w.])invoke\("([^"]+)"/g)) called.add(m[1]);

  it("finds the page's channels", () => {
    assert.ok(called.size > 40, `found ${called.size}`);
  });

  it("every channel the page calls is held or passed on purpose", () => {
    const unsorted = [...called].filter((c) => !held.has(c) && !PASSED.has(c)).sort();
    assert.deepEqual(unsorted, []);
  });

  it("no channel is both held and passed, and none is listed that the page never calls", () => {
    assert.deepEqual([...held].filter((c) => PASSED.has(c)), []);
    assert.deepEqual([...held, ...PASSED.keys()].filter((c) => !called.has(c)).sort(), []);
  });
});
