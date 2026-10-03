import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { traceChain } from "./fixtures/trace-chain.js";
import { downstreamQueries, upstreamKeys, fetchTrace } from "../src/trace-query.js";
import { TABLE_DOCTYPE } from "../src/trace-links.js";

const K = (dt, n) => `${dt}::${n}`;

/**
 * A fake ERPNext over the fixture: `getDoc` by name, and `getList` answering exactly the filters
 * downstreamQueries builds (a child-table field filter, a header filter, docstatus).
 */
function fakeErp(docs, opts = {}) {
  const calls = { doc: [], list: [] };
  const match = (doc, f) => {
    if (f.length === 3) { const [field, , value] = f; return doc[field] === value || (field === "docstatus" && Number(doc.docstatus) === value); }
    const [childDt, field, , value] = f;
    const table = childDt === "Payment Entry Reference" ? doc.references : (TABLE_DOCTYPE[doc.doctype] === childDt ? doc.items : null);
    return Array.isArray(table) && table.some((r) => r[field] === value);
  };
  return {
    calls,
    getDoc: async (doctype, name) => {
      calls.doc.push(`${doctype}::${name}`);
      if (opts.failDoc === name) return { ok: false, reason: "403" };
      const d = docs.find((x) => x.doctype === doctype && x.name === name);
      return d ? { ok: true, doc: structuredClone(d) } : { ok: false, reason: "not found" };
    },
    getList: async (q) => {
      calls.list.push(q);
      return { ok: true, rows: docs.filter((d) => d.doctype === q.doctype && q.filters.every((f) => match(d, f))).map((d) => ({ name: d.name })) };
    },
  };
}

describe("trace-query: the questions", () => {
  it("asks a receipt's children by the field on their lines", () => {
    const qs = downstreamQueries(K("Purchase Receipt", "MAT-PRE-0211"));
    assert.ok(qs.some((q) => q.doctype === "Purchase Invoice" && JSON.stringify(q.filters[0]) === JSON.stringify(["Purchase Invoice Item", "purchase_receipt", "=", "MAT-PRE-0211"])));
    assert.ok(qs.some((q) => q.doctype === "Purchase Receipt" && q.filters.some((f) => f[0] === "return_against")), "returns against a receipt");
    assert.ok(qs.every((q) => q.filters.some((f) => f[0] === "docstatus")), "submitted only");
  });
  it("asks for payments that reference a bill, by doctype and name", () => {
    const pay = downstreamQueries(K("Purchase Invoice", "ACC-PINV-0268")).find((q) => q.doctype === "Payment Entry");
    assert.deepEqual(pay.filters.slice(0, 2), [["Payment Entry Reference", "reference_name", "=", "ACC-PINV-0268"], ["Payment Entry Reference", "reference_doctype", "=", "Purchase Invoice"]]);
  });
  it("names every source on a document's lines, including the skip-level ones", () => {
    const bill = traceChain().find((d) => d.name === "ACC-PINV-0268");
    assert.deepEqual(upstreamKeys(bill).sort(), [K("Purchase Order", "PUR-ORD-0404"), K("Purchase Order", "PUR-ORD-0405"), K("Purchase Receipt", "MAT-PRE-0211"), K("Purchase Receipt", "MAT-PRE-0212")].sort());
  });
});

describe("trace-query: fetchTrace", () => {
  it("from a bill: everything it came from and everything that came from it, but not the payment's other bills", async () => {
    const erp = fakeErp(traceChain());
    const t = await fetchTrace({ focus: [K("Purchase Invoice", "ACC-PINV-0268")], getDoc: erp.getDoc, getList: erp.getList });
    const names = t.docs.map((d) => d.name).sort();
    assert.deepEqual(names, ["ACC-PAY-0004", "ACC-PINV-0268", "ACC-PINV-0273", "MAT-MR-0031", "MAT-PRE-0211", "MAT-PRE-0212", "PUR-ORD-0404", "PUR-ORD-0405", "SAL-ORD-0543", "SAL-QTN-0608"].sort());
    assert.ok(!erp.calls.doc.includes(K("Purchase Invoice", "ACC-PINV-0255")), "Other payables stay unfetched");
    assert.ok(!names.includes("ACC-SINV-0525"), "the order's invoice is a sibling, not part of the bill's story");
  });
  it("from a payment in focus: walks back into every bill it paid", async () => {
    const erp = fakeErp(traceChain());
    await fetchTrace({ focus: [K("Payment Entry", "ACC-PAY-0004")], getDoc: erp.getDoc, getList: erp.getList });
    assert.ok(erp.calls.doc.includes(K("Purchase Invoice", "ACC-PINV-0255")));
  });
  it("from a Sales Order: both sides of the business", async () => {
    const erp = fakeErp(traceChain());
    const t = await fetchTrace({ focus: [K("Sales Order", "SAL-ORD-0543")], getDoc: erp.getDoc, getList: erp.getList });
    const names = new Set(t.docs.map((d) => d.name));
    for (const n of ["SAL-QTN-0608", "PUR-ORD-0404", "MAT-PRE-0212", "ACC-PINV-0268", "ACC-PAY-0004", "ACC-SINV-0525", "ACC-PAY-0005"]) assert.ok(names.has(n), n);
  });
  it("stops at the size limit and says so", async () => {
    const erp = fakeErp(traceChain());
    const t = await fetchTrace({ focus: [K("Sales Order", "SAL-ORD-0543")], getDoc: erp.getDoc, getList: erp.getList, maxDocs: 3 });
    assert.equal(t.docs.length, 3);
    assert.equal(t.truncated, true);
  });
  it("skips drafts and reports what it could not read", async () => {
    const docs = traceChain();
    docs.find((d) => d.name === "MAT-PRE-0212").docstatus = 0;
    const erp = fakeErp(docs, { failDoc: "PUR-ORD-0404" });
    const t = await fetchTrace({ focus: [K("Purchase Invoice", "ACC-PINV-0268")], getDoc: erp.getDoc, getList: erp.getList });
    assert.ok(!t.docs.some((d) => d.name === "MAT-PRE-0212"));
    assert.deepEqual(t.failed.map((f) => f.key), [K("Purchase Order", "PUR-ORD-0404")]);
  });
  it("asks each document once, however many paths reach it", async () => {
    const erp = fakeErp(traceChain());
    await fetchTrace({ focus: [K("Purchase Invoice", "ACC-PINV-0268"), K("Payment Entry", "ACC-PAY-0005")], getDoc: erp.getDoc, getList: erp.getList });
    const counts = erp.calls.doc.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map());
    assert.ok([...counts.values()].every((n) => n === 1), JSON.stringify([...counts]));
  });
});
