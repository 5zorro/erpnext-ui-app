import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PE_REASON_FROM_JS, endSentence } from "../src/erp-refusal-reason.js";

/** The page's `reasonFrom`, with `lastResponse` as `frappe.last_response`. */
function reasonFrom(lastResponse) {
  const window = { frappe: { last_response: lastResponse } };
  return new Function("window", "frappe", `${PE_REASON_FROM_JS}; return reasonFrom;`)(window, window.frappe);
}
const msgs = (...ms) => JSON.stringify(ms.map((m) => JSON.stringify(m)));

describe("reasonFrom (the ERPNext page's reason for a refused call)", () => {
  it("an error that says something is read as before", () => {
    assert.equal(reasonFrom(null)({ message: "<b>Nope</b>" }), "Nope");
    assert.equal(reasonFrom(null)(new Error("TypeError here")), "TypeError here");
  });
  it("xcall's undefined: ERPNext's raised message from the reply that failed (dogfood R9)", () => {
    const r = {
      _server_messages: msgs(
        { message: "Expense Head changed", indicator: "blue" },
        { message: "<strong>Purchase Order</strong> <strong>PUR-ORD-1</strong> status is <strong>On Hold</strong>.", raise_exception: 1 },
      ),
    };
    assert.equal(reasonFrom(r)(undefined), "Purchase Order PUR-ORD-1 status is On Hold.");
  });
  it("no messages: the traceback's last XError line", () => {
    const r = { exc: JSON.stringify(["Traceback…\nfrappe.exceptions.ValidationError: Cannot create accounting entries against disabled accounts"]) };
    assert.equal(reasonFrom(r)(undefined), "Cannot create accounting entries against disabled accounts");
  });
  it("an earlier, successful reply's notes are not this call's reason (a call that died with no reply)", () => {
    const r = { _server_messages: msgs({ message: "Expense Head changed", indicator: "blue" }) };
    assert.equal(reasonFrom(r)(undefined), "ERPNext refused without saying why.");
  });
  it("a refusal with a traceback and only plain messages: the messages", () => {
    const r = { _server_messages: msgs({ message: "Not authorized" }), exc: JSON.stringify(["Traceback…\nfrappe.exceptions.ValidationError: x"]) };
    assert.equal(reasonFrom(r)(undefined), "Not authorized");
  });
  it("nothing at all: says so, and no longer blames a Payment Entry", () => {
    assert.equal(reasonFrom(null)(undefined), "ERPNext refused without saying why.");
    assert.equal(reasonFrom({})(undefined), "ERPNext refused without saying why.");
  });
});

describe("endSentence", () => {
  it("ends ERPNext's sentence once", () => {
    assert.equal(endSentence("disabled accounts: X"), "disabled accounts: X.");
    assert.equal(endSentence("Period closed."), "Period closed.");
    assert.equal(endSentence(" "), "");
    assert.equal(endSentence(null), "");
  });
});
