import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildFrappeResourceListUrl,
  buildFrappeResourceDocUrl,
  parseFrappeResourceListResponse,
  parseFrappeResourceDocResponse,
  frappeResourceGetList,
  frappeResourceGetDoc,
} from "../src/erp-http-list.js";
import {
  poItemsAndHeadersFromParentDocs,
  prItemsFromParentDocs,
} from "../src/bill-po-hydrate.js";

describe("erp-http-list", () => {
  it("buildFrappeResourceDocUrl encodes doctype and name", () => {
    const url = buildFrappeResourceDocUrl(
      "http://localhost:8080",
      "Purchase Order",
      "PUR-ORD-2026-00375",
      ["name", "items"],
    );
    assert.equal(
      url,
      "http://localhost:8080/api/resource/Purchase%20Order/PUR-ORD-2026-00375?fields=%5B%22name%22%2C%22items%22%5D",
    );
  });

  it("parseFrappeResourceDocResponse reads data object", () => {
    const doc = parseFrappeResourceDocResponse({ data: { name: "PO-1", items: [] } });
    assert.equal(doc && doc.name, "PO-1");
  });

  it("frappeResourceGetDoc GETs single resource", async () => {
    const fetchImpl = async (url) => {
      assert.match(url, /PUR-ORD-2026-00375/);
      return {
        ok: true,
        async json() {
          return {
            data: {
              name: "PUR-ORD-2026-00375",
              items: [{ name: "line1", qty: 1, billed_amt: 0 }],
            },
          };
        },
      };
    };
    const r = await frappeResourceGetDoc({
      erpBase: "http://localhost:8080",
      doctype: "Purchase Order",
      name: "PUR-ORD-2026-00375",
      fields: ["name", "items"],
      fetchImpl,
    });
    assert.equal(r.ok, true);
    assert.equal(r.doc.items[0].name, "line1");
  });

  it("poItemsAndHeadersFromParentDocs picks child rows by po_detail", () => {
    const { poItemsByName, poHeadersByName } = poItemsAndHeadersFromParentDocs(
      [
        {
          name: "PUR-ORD-2026-00375",
          customer: "V1",
          items: [
            { name: "7es9eg80nf", qty: 1, billed_amt: 0 },
            { name: "other", qty: 5, billed_amt: 0 },
          ],
        },
      ],
      ["7es9eg80nf"],
    );
    assert.equal(Object.keys(poItemsByName).length, 1);
    assert.equal(poItemsByName["7es9eg80nf"].qty, 1);
    assert.equal(poHeadersByName["PUR-ORD-2026-00375"].customer, "V1");
  });

  it("prItemsFromParentDocs picks child rows by pr_detail", () => {
    const prItemsByName = prItemsFromParentDocs(
      [{ name: "PR-1", items: [{ name: "prline", qty: 2, billed_amt: 0 }] }],
      ["prline"],
    );
    assert.equal(prItemsByName.prline.qty, 2);
  });

  it("buildFrappeResourceListUrl encodes doctype and query", () => {
    const url = buildFrappeResourceListUrl("http://localhost:8080/", "Purchase Order", {
      fields: ["name", "title"],
      filters: [["name", "in", ["PO-1"]]],
      limit: 1,
    });
    assert.match(url, /^http:\/\/localhost:8080\/api\/resource\/Purchase%20Order\?/);
    assert.match(url, /fields=%5B%22name%22%2C%22title%22%5D/);
  });

  it("parseFrappeResourceListResponse reads data or message", () => {
    assert.equal(parseFrappeResourceListResponse({ data: [{ name: "A" }] }).length, 1);
    assert.equal(parseFrappeResourceListResponse({ message: [{ name: "B" }] })[0].name, "B");
  });

  it("frappeResourceGetList GETs resource and parses data", async () => {
    let seenMethod = "";
    const fetchImpl = async (url, init) => {
      seenMethod = init.method;
      assert.match(url, /Purchase%20Order/);
      return {
        ok: true,
        async json() {
          return { data: [{ name: "PO-1", title: "LOG-1" }] };
        },
      };
    };
    const r = await frappeResourceGetList({
      erpBase: "http://localhost:8080",
      doctype: "Purchase Order",
      fields: ["name", "title"],
      filters: [["name", "in", ["PO-1"]]],
      limit: 1,
      fetchImpl,
    });
    assert.equal(seenMethod, "GET");
    assert.equal(r.ok, true);
    assert.equal(r.rows[0].title, "LOG-1");
  });

  it("frappeResourceGetList returns ok:false on HTTP error", async () => {
    const r = await frappeResourceGetList({
      erpBase: "http://localhost:8080",
      doctype: "Purchase Order Item",
      fields: ["name"],
      fetchImpl: async () => ({ ok: false, status: 403, statusText: "Forbidden", json: async () => ({}) }),
    });
    assert.equal(r.ok, false);
    assert.equal(r.status, 403);
  });
});
