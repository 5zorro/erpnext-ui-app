import test from "node:test";
import assert from "node:assert/strict";

import { SCAN, clearCount, keyCount, progress, scan, selectLine, startCount } from "../src/receiving/blind-count.js";
import { buildBlindPoSheet } from "../src/receiving/blind-po-sheet.js";
import { REJECTED, buildLabelPayload } from "../src/receiving/label-payload.js";

const opts = { prefix: "W" };
const label = (itemNumber) => buildLabelPayload(itemNumber, opts);

const ORDERED = 10007; // a quantity that must never reach the session
function purchaseOrder(itemCodes) {
  return {
    name: "PUR-ORD-2026-00386",
    docstatus: 1,
    supplier_name: "Example Supply Co",
    transaction_date: "2026-09-08",
    total_qty: ORDERED,
    items: itemCodes.map((item_code, i) => ({
      idx: i + 1,
      item_code,
      item_name: `Widget ${item_code}`,
      uom: "Box",
      qty: ORDERED,
      received_qty: ORDERED,
    })),
  };
}

const fresh = (itemCodes = ["AB_12-C", "FL820S", "10042"]) =>
  startCount(buildBlindPoSheet(purchaseOrder(itemCodes), opts));

/** Scan several labels in a row, returning the last session and every outcome. */
function scanAll(session, labels) {
  const outcomes = [];
  for (const l of labels) {
    const step = scan(session, l, opts);
    session = step.session;
    outcomes.push(step.outcome);
  }
  return { session, outcomes };
}

const line = (session, n) => session.lines.find((l) => l.lineNumber === n);

test("every line starts blank — never 1, never 0", () => {
  const s = fresh();
  assert.deepEqual(s.lines.map((l) => l.counted), [null, null, null]);
  assert.deepEqual(progress(s), { counted: 0, lines: 3, canSubmit: false });
});

test("BLIND: the session carries no ordered or received figure", () => {
  assert.equal(JSON.stringify(fresh()).includes(String(ORDERED)), false);
});

test("BLIND: extra fields on a sheet line do not ride into the session", () => {
  const sheet = buildBlindPoSheet(purchaseOrder(["10042"]), opts);
  sheet.lines[0].expected = ORDERED;
  assert.equal(JSON.stringify(startCount(sheet)).includes(String(ORDERED)), false);
});

test("one scan selects the line and leaves the count blank for the keypad", () => {
  const { session, outcomes } = scanAll(fresh(), [label("FL820S")]);
  assert.deepEqual(outcomes, [{ kind: SCAN.SELECTED, lineNumber: 2, counted: null }]);
  assert.equal(session.active, 2);
  assert.equal(line(session, 2).counted, null);
});

test("scanning five stickers of one item counts five, not four", () => {
  // The spec's "re-scan adds one", read literally, would give four: the first scan only selects.
  const { session, outcomes } = scanAll(fresh(), Array(5).fill(label("10042")));
  assert.equal(line(session, 3).counted, 5);
  assert.deepEqual(outcomes.map((o) => o.kind), [
    SCAN.SELECTED, SCAN.ADDED_ONE, SCAN.ADDED_ONE, SCAN.ADDED_ONE, SCAN.ADDED_ONE,
  ]);
  assert.deepEqual(outcomes.slice(1).map((o) => o.counted), [2, 3, 4, 5]);
});

test("scanning a different line switches to it without touching either count", () => {
  let { session } = scanAll(fresh(), [label("10042"), label("10042"), label("10042")]);
  ({ session } = scanAll(session, [label("FL820S")]));
  assert.equal(session.active, 2);
  assert.equal(line(session, 3).counted, 3);
  assert.equal(line(session, 2).counted, null);
  // Coming back to a line is a selection, not a unit: its count stands until scanned again.
  const back = scan(session, label("10042"), opts);
  assert.deepEqual(back.outcome, { kind: SCAN.SELECTED, lineNumber: 3, counted: 3 });
  assert.equal(line(back.session, 3).counted, 3);
  assert.equal(line(scan(back.session, label("10042"), opts).session, 3).counted, 4);
});

test("a typed count is final against habit re-scans, and says so", () => {
  let { session } = scanAll(fresh(), [label("FL820S")]);
  session = keyCount(session, 12);
  const again = scan(session, label("FL820S"), opts);
  assert.deepEqual(again.outcome, { kind: SCAN.ALREADY_KEYED, lineNumber: 2 });
  assert.equal(line(again.session, 2).counted, 12);
});

test("typing over a scanned count replaces it", () => {
  let { session } = scanAll(fresh(), Array(3).fill(label("10042")));
  session = keyCount(session, 30);
  assert.deepEqual([line(session, 3).counted, line(session, 3).source], [30, "keyed"]);
});

test("zero is a real count and different from blank", () => {
  let session = keyCount(fresh(), 0, { lineNumber: 1 });
  assert.equal(line(session, 1).counted, 0);
  assert.equal(progress(session).counted, 1);
  session = clearCount(session, 1);
  assert.equal(line(session, 1).counted, null);
  assert.equal(progress(session).canSubmit, false);
});

test("a count must be a whole number of zero or more, on a line that exists", () => {
  const selected = scanAll(fresh(), [label("10042")]).session;
  for (const bad of [-1, 1.5, "3", NaN, null]) assert.throws(() => keyCount(selected, bad), /whole number/);
  assert.throws(() => keyCount(fresh(), 3), /no line is selected/);
  assert.throws(() => keyCount(fresh(), 3, { lineNumber: 9 }), /no line 9/);
});

test("an item on two lines of one order asks which, then counts on the chosen line", () => {
  let session = fresh(["10042", "FL820S", "10042"]);
  let step = scan(session, label("10042"), opts);
  assert.deepEqual(step.outcome, { kind: SCAN.CHOOSE_LINE, itemNumber: "10042", lineNumbers: [1, 3] });
  assert.equal(step.session.active, null);
  assert.throws(() => selectLine(step.session, 2), /not one of the lines/);

  session = selectLine(step.session, 3);
  assert.equal(session.choosing, null);
  ({ session } = scanAll(session, [label("10042"), label("10042")]));
  assert.equal(line(session, 3).counted, 3);
  assert.equal(line(session, 1).counted, null);
});

test("an item that is not on this order stops the receiver and changes nothing", () => {
  const before = fresh();
  const step = scan(before, label("ZZ-999"), opts);
  assert.deepEqual(step.outcome, { kind: SCAN.NOT_ON_ORDER, itemNumber: "ZZ-999" });
  assert.equal(step.session, before);
});

test("a vendor's barcode or a misread stops the receiver with the reason, and changes nothing", () => {
  const before = scanAll(fresh(), [label("10042")]).session;
  const vendor = scan(before, "5012345678900", opts);
  assert.deepEqual(vendor.outcome, { kind: SCAN.REJECTED, reason: REJECTED.NOT_OURS });
  assert.equal(vendor.session, before);

  const garbled = label("10042").slice(0, -1) + (label("10042").endsWith("A") ? "B" : "A");
  assert.deepEqual(scan(before, garbled, opts).outcome, { kind: SCAN.REJECTED, reason: REJECTED.CHECK_FAILED });
});

test("the session is never changed in place", () => {
  const s = fresh();
  const snapshot = JSON.stringify(s);
  scanAll(s, [label("10042"), label("10042")]);
  keyCount(s, 4, { lineNumber: 1 });
  clearCount(s, 1);
  selectLine(s, 2);
  assert.equal(JSON.stringify(s), snapshot);
});

test("submit unlocks once any line is counted", () => {
  const session = keyCount(fresh(), 7, { lineNumber: 2 });
  assert.deepEqual(progress(session), { counted: 1, lines: 3, canSubmit: true });
});

test("only a sheet can start a session", () => {
  assert.throws(() => startCount(purchaseOrder(["10042"])), /start from a blind sheet/);
});
