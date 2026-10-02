import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  UPDATE_STOCK_DEFAULT_ROUTE,
  mergeReceiveAskPrefs,
  unreceivedStockLines,
  receiveAskDecision,
  receiveAskCopy,
  receiveAskOffNote,
} from "../src/bill-receive-ask.js";

const bill = (over = {}) => ({
  name: "new-purchase-invoice-abc",
  docstatus: 0,
  update_stock: 0,
  is_return: 0,
  is_opening: "No",
  items: [
    { item_code: "WIDGET A", qty: 2 },
    { item_code: "WIDGET-B", qty: 1 },
    { item_code: "FREIGHT", qty: 1 },
  ],
  ...over,
});
const STOCK = ["WIDGET A", "WIDGET-B"];

describe("bill-receive-ask (DF-01 R)", () => {
  it("asks on a draft bill with stock lines nothing has received", () => {
    const d = receiveAskDecision({ doc: bill(), stockCodes: STOCK, askAtSave: true });
    assert.equal(d.ask, true);
    assert.deepEqual(d.lines.map((r) => r.item_code), ["WIDGET A", "WIDGET-B"], "a non-stock line never counts");
  });

  it("skips lines from a receipt, drop-ship lines and zero quantities", () => {
    const doc = bill({
      items: [
        { item_code: "WIDGET A", qty: 2, pr_detail: "x1", purchase_receipt: "MAT-PRE-1" },
        { item_code: "WIDGET-B", qty: 1, delivered_by_supplier: 1 },
        { item_code: "WIDGET A", qty: 0 },
      ],
    });
    assert.deepEqual(unreceivedStockLines(doc, STOCK), []);
    assert.equal(receiveAskDecision({ doc, stockCodes: STOCK, askAtSave: true }).ask, false);
  });

  it("stays quiet where the question cannot or need not be asked", () => {
    const quiet = (over) => receiveAskDecision({ doc: bill(over), stockCodes: STOCK, askAtSave: true });
    assert.equal(quiet({ docstatus: 1 }).why, "not a draft");
    assert.equal(quiet({ update_stock: 1 }).why, "already receives with the bill");
    assert.equal(quiet({ is_return: 1 }).why, "credit memo");
    assert.equal(quiet({ is_opening: "Yes" }).why, "opening entry");
    const answered = new Set(["new-purchase-invoice-abc"]);
    assert.equal(
      receiveAskDecision({ doc: bill(), stockCodes: STOCK, askAtSave: true, answered }).why,
      "answered for this bill",
    );
  });

  it("switched off: does not ask, but still reports the lines so the save can say so", () => {
    const d = receiveAskDecision({ doc: bill(), stockCodes: STOCK, askAtSave: false });
    assert.equal(d.ask, false);
    assert.equal(d.lines.length, 2);
    assert.match(receiveAskOffNote(2), /2 stock lines not received/);
  });

  it("asks by default", () => {
    assert.deepEqual(mergeReceiveAskPrefs(null), { askAtSave: true });
    assert.deepEqual(mergeReceiveAskPrefs({ askAtSave: false }), { askAtSave: false });
  });

  it("links Customize Form on Purchase Invoice", () => {
    const [path, q] = UPDATE_STOCK_DEFAULT_ROUTE.split("?");
    assert.equal(path, "/app/customize-form");
    assert.equal(new URLSearchParams(q).get("doc_type"), "Purchase Invoice");
  });

  it("says what each choice does to inventory, and names the warehouse", () => {
    const c = receiveAskCopy({ lineCount: 2, warehouse: "Stores - USE" });
    assert.match(c.body, /Stock Received But Not Billed/);
    assert.match(c.body, /before the bill is submitted/);
    assert.equal(c.receive, "Receive with this bill (Stores - USE)");
    assert.doesNotMatch(receiveAskCopy({ lineCount: 1, warehouse: "", perpetual: false }).body, /Not Billed/);
  });
});
