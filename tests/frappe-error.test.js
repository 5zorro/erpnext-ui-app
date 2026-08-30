import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { flattenFrappeMessage, formatClientErrorReason } from "../src/frappe-error.js";

describe("frappe-error", () => {
  it("flattens nested message objects (avoids [object Object])", () => {
    assert.equal(
      flattenFrappeMessage({ message: { message: "Account mismatch" } }),
      "Account mismatch",
    );
    assert.match(formatClientErrorReason({ message: { title: "X" } }), /title|Unknown|X/);
  });

  it("parses _server_messages JSON array", () => {
    const payload = JSON.stringify([
      JSON.stringify({ message: "Row #1: bad account", title: "Error" }),
    ]);
    assert.match(flattenFrappeMessage({ _server_messages: payload }), /bad account/);
  });

  it("joins arrays", () => {
    assert.equal(flattenFrappeMessage(["A", "B"]), "A · B");
  });

  it("never returns bare [object Object] from formatClientErrorReason", () => {
    const r = formatClientErrorReason({});
    assert.notEqual(r, "[object Object]");
    assert.ok(r.length > 0);
  });

  it("extracts ValidationError from xhr-shaped payload", () => {
    const xhr = {
      readyState: 4,
      responseText: JSON.stringify({
        exception: "frappe.exceptions.ValidationError: Reference No and Reference Date is mandatory for Bank transaction",
        exc_type: "ValidationError",
      }),
    };
    assert.match(
      formatClientErrorReason(xhr),
      /Reference No and Reference Date is mandatory/,
    );
  });
});
