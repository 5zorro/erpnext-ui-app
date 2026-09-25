import test from "node:test";
import assert from "node:assert/strict";

import { buildBlindPoSheet } from "../src/receiving/blind-po-sheet.js";
import { parseLabelPayload } from "../src/receiving/label-payload.js";
import { encodableCode128B } from "../src/receiving/code128.js";

const opts = { prefix: "W" };

// Every number a Purchase Order carries that says, or lets someone work out, how much was ordered
// or what it cost. Values are distinct five-digit primes so a leak is findable in any form, even
// inside a string. Field names are the real ones on this ERPNext version (Purchase Order Item).
let nextSecret = 0;
const SECRETS = [
  10007, 10009, 10037, 10039, 10061, 10067, 10069, 10079, 10091, 10093, 10099, 10103, 10111, 10133,
  10139, 10141, 10151, 10159, 10163, 10169, 10177, 10181, 10193, 10211, 10223, 10243, 10247, 10253,
  10259, 10267, 10271, 10273, 10289, 10301, 10303, 10313, 10321, 10331, 10333, 10337, 10343, 10357,
];
const secret = () => SECRETS[nextSecret++];

const ROW_NUMBERS = [
  "qty", "stock_qty", "received_qty", "returned_qty", "fg_item_qty", "subcontracted_qty",
  "actual_qty", "company_total_stock", "conversion_factor", "weight_per_unit", "total_weight",
  "rate", "amount", "price_list_rate", "last_purchase_rate", "net_rate", "net_amount",
  "base_rate", "base_amount", "billed_amt", "discount_amount",
];
const PARENT_NUMBERS = ["total_qty", "total", "grand_total", "per_received", "per_billed", "total_net_weight"];

function row(idx, itemCode, extra = {}) {
  const r = {
    idx,
    name: `row-${idx}`,
    item_code: itemCode,
    item_name: `Widget ${itemCode}`,
    uom: "Box",
    stock_uom: "Nos",
    warehouse: "Stores - HI",
    schedule_date: "2026-10-01",
    ...extra,
  };
  for (const field of ROW_NUMBERS) r[field] = secret();
  return r;
}

function purchaseOrder(items, extra = {}) {
  const po = {
    name: "PUR-ORD-2026-00386",
    docstatus: 1,
    status: "To Receive",
    supplier: "SUP-0001",
    supplier_name: "Example Supply Co",
    transaction_date: "2026-09-08",
    items,
    ...extra,
  };
  for (const field of PARENT_NUMBERS) po[field] = secret();
  return po;
}

function everyKeyAndNumber(value, keys = [], numbers = []) {
  if (Array.isArray(value)) {
    for (const v of value) everyKeyAndNumber(v, keys, numbers);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      keys.push(k);
      everyKeyAndNumber(v, keys, numbers);
    }
  } else if (typeof value === "number") {
    numbers.push(value);
  }
  return { keys, numbers };
}

const po = purchaseOrder([row(1, "AB_12-C"), row(2, "FL820S"), row(3, "10042")]);
const sheet = buildBlindPoSheet(po, opts);

test("the sheet carries the order header and one line per order row, in order", () => {
  assert.equal(sheet.orderNumber, "PUR-ORD-2026-00386");
  assert.equal(sheet.supplier, "Example Supply Co");
  assert.equal(sheet.orderDate, "2026-09-08");
  assert.equal(sheet.lineCount, 3);
  assert.deepEqual(
    sheet.lines.map((l) => [l.lineNumber, l.itemNumber, l.description, l.unit]),
    [
      [1, "AB_12-C", "Widget AB_12-C", "Box"],
      [2, "FL820S", "Widget FL820S", "Box"],
      [3, "10042", "Widget 10042", "Box"],
    ],
  );
});

test("BLIND: no ordered, received or priced figure appears anywhere, in any form", () => {
  // The defining test of this module. Checked by value rather than by field name, so a leak is
  // caught however it gets in — renamed, nested, or turned into text.
  const text = JSON.stringify(sheet);
  for (const value of SECRETS.slice(0, nextSecret)) {
    assert.equal(text.includes(String(value)), false, `leaked ${value}`);
  }
});

test("BLIND: the only numbers on the sheet are line numbers and the line count", () => {
  const { numbers } = everyKeyAndNumber(sheet);
  const allowed = new Set([sheet.lineCount, ...sheet.lines.map((l) => l.lineNumber)]);
  for (const n of numbers) assert.ok(allowed.has(n), `unexpected number ${n}`);
});

test("BLIND: no field on the sheet is named like a quantity, a price or a total", () => {
  const { keys } = everyKeyAndNumber(sheet);
  const suspicious = /qty|quant|amount|amt|rate|price|total|received|ordered|billed|stock|weight|conversion|expected/i;
  assert.deepEqual(keys.filter((k) => suspicious.test(k)), []);
});

test("BLIND: a field ERPNext adds later stays off the sheet until added on purpose", () => {
  const future = purchaseOrder([row(1, "10042", { expected_count_hint: 4241 })]);
  assert.equal(JSON.stringify(buildBlindPoSheet(future, opts)).includes("4241"), false);
});

test("each line's barcode is the item number, and scans back to it", () => {
  for (const line of sheet.lines) {
    assert.ok(encodableCode128B(line.payload), line.payload);
    assert.deepEqual(parseLabelPayload(line.payload, opts), { ok: true, itemNumber: line.itemNumber });
  }
  assert.deepEqual(sheet.keyedByHand, []);
});

test("an item number no label can carry prints without a barcode instead of stopping the sheet", () => {
  const mixed = buildBlindPoSheet(purchaseOrder([row(1, "10042"), row(2, "lower case"), row(3, "FL820S")]), opts);
  assert.equal(mixed.lineCount, 3);
  assert.equal(mixed.lines[1].payload, null);
  assert.equal(mixed.lines[1].itemNumber, "lower case");
  assert.deepEqual(mixed.keyedByHand, [2]);
  assert.ok(mixed.lines[0].payload && mixed.lines[2].payload);
});

test("only a submitted order can be received against", () => {
  assert.throws(() => buildBlindPoSheet(purchaseOrder([row(1, "10042")], { docstatus: 0 }), opts), /not submitted/);
  assert.throws(() => buildBlindPoSheet(purchaseOrder([row(1, "10042")], { docstatus: 2 }), opts), /not submitted/);
  assert.throws(() => buildBlindPoSheet(null, opts), /no purchase order/);
});

test("a missing company prefix is a setup error, not a line to key by hand", () => {
  assert.throws(() => buildBlindPoSheet(po), /company prefix is required/);
});

test("falls back sensibly when optional fields are empty", () => {
  const bare = buildBlindPoSheet(
    purchaseOrder([{ item_code: "10042", stock_uom: "Nos" }], { supplier_name: "", transaction_date: undefined }),
    opts,
  );
  assert.equal(bare.supplier, "SUP-0001");
  assert.equal(bare.orderDate, "");
  assert.deepEqual(bare.lines[0], {
    lineNumber: 1,
    itemNumber: "10042",
    description: "10042",
    unit: "Nos",
    payload: bare.lines[0].payload,
  });
});
