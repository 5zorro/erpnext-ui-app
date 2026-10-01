import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildRouteHopReporterJs, describeRouteHop, sanitizeRouteHop } from "../src/erp-route-hop.js";

const slug = (d) => String(d).toLowerCase().replace(/ /g, "-");

describe("describeRouteHop (runs in the ERP page)", () => {
  it("names the form left and whether it had unsaved changes", () => {
    const hop = describeRouteHop({
      pathname: "/desk/supplier/ACME%20CO",
      routeHistory: [
        ["Form", "Purchase Invoice", "new-purchase-invoice-abc"],
        ["Form", "Supplier", "ACME CO"],
      ],
      locals: { "Purchase Invoice": { "new-purchase-invoice-abc": { __unsaved: 1 } } },
      fromLink: undefined,
      slug,
    });
    assert.deepEqual(hop, {
      to: "/desk/supplier/ACME%20CO",
      prev: "/app/purchase-invoice/new-purchase-invoice-abc",
      prevUnsaved: true,
      fromLinkParent: "",
      fromLinkTarget: "",
    });
  });

  it("skips a route Frappe recorded twice to find the one actually left", () => {
    const hop = describeRouteHop({
      pathname: "/app/address/A",
      routeHistory: [
        ["Form", "Supplier", "ACME"],
        ["Form", "Address", "A"],
        ["Form", "Address", "A"],
      ],
      locals: { Supplier: { ACME: {} } },
      slug,
    });
    assert.equal(hop.prev, "/app/supplier/ACME");
    assert.equal(hop.prevUnsaved, false);
  });

  it("a list or workspace left is not a form", () => {
    const hop = describeRouteHop({
      pathname: "/app/supplier/ACME",
      routeHistory: [["List", "Supplier", "List"], ["Form", "Supplier", "ACME"]],
      locals: {},
      slug,
    });
    assert.equal(hop.prev, "");
  });

  it("reads Frappe's calling form and the link's doctype from _from_link", () => {
    const hop = describeRouteHop({
      pathname: "/app/supplier/new-supplier-xyz",
      routeHistory: [["Form", "Purchase Order", "PO-1"], ["Form", "Supplier", "new-supplier-xyz"]],
      locals: {},
      fromLink: {
        set_route_args: ["Form", "Purchase Order", "PO-1"],
        field_obj: { df: { fieldtype: "Link", options: "Supplier" }, get_options: () => "Supplier" },
        doc: {},
      },
      slug,
    });
    assert.equal(hop.fromLinkParent, "/app/purchase-order/PO-1");
    assert.equal(hop.fromLinkTarget, "supplier");
  });

  it("a Dynamic Link takes its doctype from the field it points at", () => {
    const hop = describeRouteHop({
      pathname: "/app/customer/new-customer-1",
      routeHistory: [],
      fromLink: {
        set_route_args: ["Form", "Payment Entry", "PE-1"],
        field_obj: { df: { fieldtype: "Dynamic Link", options: "party_type" } },
        doc: { party_type: "Customer" },
      },
      slug,
    });
    assert.equal(hop.fromLinkTarget, "customer");
  });

  it("survives a page with no history at all", () => {
    const hop = describeRouteHop({ pathname: "/app", slug });
    assert.equal(hop.prev, "");
    assert.equal(hop.prevUnsaved, false);
  });
});

describe("sanitizeRouteHop (what the shell accepts from the page)", () => {
  it("keeps only strings and a strict boolean", () => {
    assert.deepEqual(sanitizeRouteHop({ to: "/app/x/1", prev: 5, prevUnsaved: "yes", fromLinkParent: null }), {
      to: "/app/x/1",
      prev: "",
      prevUnsaved: false,
      fromLinkParent: "",
      fromLinkTarget: "",
    });
  });

  it("rejects a hop with nowhere to land", () => {
    assert.equal(sanitizeRouteHop({ prev: "/app/x/1" }), null);
    assert.equal(sanitizeRouteHop("nope"), null);
  });
});

describe("buildRouteHopReporterJs", () => {
  it("is a script that parses and carries the describer", () => {
    const js = buildRouteHopReporterJs();
    assert.doesNotThrow(() => new Function(js));
    assert.match(js, /frappe\.router\.on\("change"/);
    assert.match(js, /function describeRouteHop/);
  });
});
