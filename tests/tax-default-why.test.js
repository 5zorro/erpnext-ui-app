import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { taxDefaultWhy } from "../src/tax-default-why.js";

describe("taxDefaultWhy (DF-02: Vendor tax template default ⓘ)", () => {
  it("the Default template, as on the blank bench", () => {
    const w = taxDefaultWhy({ supplier: "ALPINE SUPPLY CO", current: "US ST 6% - USE", defaultTemplate: "US ST 6% - USE" });
    assert.match(w.lines[0], /No Tax Rule names ALPINE SUPPLY CO, so new bills start with US ST 6% - USE, the template marked Default/);
    assert.deepEqual(w.links.map((l) => l.route), [
      "/app/purchase-taxes-and-charges-template/US%20ST%206%25%20-%20USE",
      "/app/tax-rule/new?tax_type=Purchase&supplier=ALPINE%20SUPPLY%20CO",
    ]);
  });
  it("a vendor Tax Rule wins and is what the links open", () => {
    const w = taxDefaultWhy({ supplier: "V", current: "Exempt", defaultTemplate: "US ST 6% - USE", vendorRule: { name: "TR-0001", template: "Exempt" } });
    assert.match(w.lines[0], /has its own Tax Rule \(TR-0001\)/);
    assert.deepEqual(w.links.map((l) => l.label), ["Open Tax Rule TR-0001", "Open Exempt"]);
  });
  it("nothing set up → no taxes, and how to add a vendor default", () => {
    const w = taxDefaultWhy({ supplier: "V" });
    assert.match(w.lines[0], /new bills start with no taxes/);
    assert.equal(w.links.length, 1);
  });
  it("says when this bill differs from the default, or the clerk removed them", () => {
    assert.ok(taxDefaultWhy({ supplier: "V", current: "Other", defaultTemplate: "D" }).lines.some((l) => /uses Other/.test(l)));
    assert.ok(taxDefaultWhy({ supplier: "V", defaultTemplate: "D", removed: true }).lines.some((l) => /stay removed until you save/.test(l)));
  });
});
