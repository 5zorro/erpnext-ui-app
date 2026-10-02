import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DOGFOOD_SOURCES,
  DOGFOOD_AP_SOURCES,
  DOGFOOD_AR_SOURCES,
  SOURCE_KIND_TARGET,
  SOURCE_KIND_FLOW,
  listDogfoodSourceIndex,
  sourceFlow,
  sourceTarget,
  sourceOi,
  sourceGrandTotal,
  sourceSubtotal,
} from "../src/sample-data/dogfood-ap-sources.js";
import { renderDogfoodSourceHtml } from "../src/sample-data/render-dogfood-html.js";


/** The four-paper A/R walk (estimate → order → invoice → payment); other A/R papers stand alone. */
const AR_FLOW_IDS = ["DF-18", "DF-19", "DF-20", "DF-21"];
describe("dogfood AP sources", () => {
  it("covers OI-103 scenarios 1–8 at least once", () => {
    const hit = new Set(
      DOGFOOD_AP_SOURCES.map((d) => d.oi103).filter((n) => n != null)
    );
    for (let i = 1; i <= 8; i++) {
      assert.equal(hit.has(i), true, `missing oi103=${i}`);
    }
  });

  it("has unique ids and required fields", () => {
    const ids = new Set();
    for (const d of DOGFOOD_AP_SOURCES) {
      assert.ok(d.id && d.kind && d.docNo && d.lines?.length);
      assert.equal(ids.has(d.id), false, `duplicate ${d.id}`);
      ids.add(d.id);
    }
  });

  it("multi-PO pack references shared invoice POs", () => {
    const inv = DOGFOOD_AP_SOURCES.find((d) => d.id === "DF-03c");
    assert.deepEqual(inv.poNos, ["PO-DOG-2001", "PO-DOG-2002"]);
  });

  it("totals match line math", () => {
    const d = DOGFOOD_AP_SOURCES.find((d) => d.id === "DF-01");
    assert.equal(sourceSubtotal(d), 10 * 40 + 5 * 25);
    const expectedTax = Math.round(sourceSubtotal(d) * 0.0725 * 100) / 100;
    assert.equal(d.taxAmount, expectedTax);
    assert.equal(sourceGrandTotal(d), sourceSubtotal(d) + expectedTax);
  });

  it("includes T0 multi-source and prepay paper (DF-14…16)", () => {
    assert.ok(DOGFOOD_AP_SOURCES.some((d) => d.id === "DF-14"));
    assert.ok(DOGFOOD_AP_SOURCES.some((d) => d.id === "DF-15"));
    assert.ok(DOGFOOD_AP_SOURCES.some((d) => d.id === "DF-16"));
    const df14 = DOGFOOD_AP_SOURCES.find((d) => d.id === "DF-14");
    assert.match(df14.dogfoodHint, /PO-MN/);
  });

  it("index length matches catalog", () => {
    assert.equal(listDogfoodSourceIndex().length, DOGFOOD_SOURCES.length);
  });
});

describe("renderDogfoodSourceHtml", () => {
  it("escapes and includes dogfood id", () => {
    const d = DOGFOOD_AP_SOURCES[0];
    const html = renderDogfoodSourceHtml({
      ...d,
      vendor: { ...d.vendor, legalName: 'A & B <Co>"' },
    });
    assert.match(html, /DF-01/);
    assert.match(html, /A &amp; B &lt;Co&gt;/);
    assert.doesNotMatch(html, /<Co>/);
  });

  it("renders each template without throwing", () => {
    for (const d of DOGFOOD_AP_SOURCES) {
      const html = renderDogfoodSourceHtml(d);
      assert.match(html, /<!DOCTYPE html>/);
      assert.match(html, new RegExp(d.docNo));
    }
  });
});

/**
 * 🔴 The catalogue is the list of edge cases we claim to handle, so it is worth holding to a
 * shape. These are the properties a reader (or a later agent) relies on without checking.
 */
describe("the dogfood catalogue is well formed", () => {
  it("splits cleanly into money-out and money-in, with nothing lost", () => {
    assert.equal(DOGFOOD_AP_SOURCES.length + DOGFOOD_AR_SOURCES.length, DOGFOOD_SOURCES.length);
    assert.ok(DOGFOOD_AR_SOURCES.length > 0, "the pack has a sales side now");
    for (const d of DOGFOOD_AP_SOURCES) assert.equal(sourceFlow(d), "ap", d.id);
    for (const d of DOGFOOD_AR_SOURCES) assert.equal(sourceFlow(d), "ar", d.id);
  });

  // Flow and target are derived from `kind`, so a new scenario cannot forget either — but only if
  // every kind it could use is actually in both tables.
  it("every kind declares a target doctype and a flow", () => {
    for (const d of DOGFOOD_SOURCES) {
      assert.ok(SOURCE_KIND_TARGET[d.kind], `${d.id}: kind ${d.kind} has no target doctype`);
      assert.ok(SOURCE_KIND_FLOW[d.kind], `${d.id}: kind ${d.kind} has no flow`);
      assert.ok(sourceTarget(d), d.id);
    }
    assert.deepEqual(
      Object.keys(SOURCE_KIND_TARGET).sort(),
      Object.keys(SOURCE_KIND_FLOW).sort(),
      "the two kind tables must cover exactly the same kinds",
    );
  });

  it("every document says what edge case it is, in one line", () => {
    for (const d of DOGFOOD_SOURCES) {
      assert.ok(d.scenario && d.scenario.length > 10, `${d.id} has no scenario`);
      assert.ok(d.dogfoodHint && d.dogfoodHint.length > 10, `${d.id} has no hint`);
    }
  });

  it("ids are unique and the index reports each one once", () => {
    const rows = listDogfoodSourceIndex();
    const ids = rows.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length, "duplicate id in the catalogue");
    for (const r of rows) assert.ok(r.target && r.flow && r.kind, r.id);
  });

  // OI-103 numbering and the newer OI-NNN labels are two different things; one label covers both.
  it("labels the museum item the same way whichever numbering it uses", () => {
    assert.equal(sourceOi({ oi103: 3 }), "OI-103.3");
    assert.equal(sourceOi({ oi: "OI-171" }), "OI-171");
    assert.equal(sourceOi({}), "");
  });

  it("the sales side walks the whole A/R flow: estimate, order, invoice, payment received", () => {
    assert.deepEqual(
      DOGFOOD_AR_SOURCES.filter((d) => AR_FLOW_IDS.includes(d.id)).map((d) => sourceTarget(d)),
      ["Quotation", "Sales Order", "Sales Invoice", "Payment Entry"],
    );
  });

  // 5zorro 2026-10-01: drop ship, end to end. ERPNext marks drop ship on the Sales Order line only.
  it("drop ship runs Sales Order → PO → Bill, and says where the Doc skins fall short", () => {
    const byId = Object.fromEntries(DOGFOOD_SOURCES.map((d) => [d.id, d]));
    assert.deepEqual(
      ["DF-24a", "DF-24b", "DF-24c"].map((id) => byId[id] && sourceTarget(byId[id])),
      ["Sales Order", "Purchase Order", "Purchase Invoice"],
    );
    for (const id of ["DF-24a", "DF-24b", "DF-24c"]) {
      assert.ok(byId[id].expect && byId[id].checks.length, `${id} needs expect + checks`);
    }
    assert.match(byId["DF-24a"].dogfoodHint, /Supplier delivers to Customer/);
    assert.deepEqual(byId["DF-24c"].poNos, [byId["DF-24b"].docNo]);
  });

  // 5zorro 2026-09-26: "add them as paper… so that i hit them when i go through the source".
  it("every A/R skin and both date fixes have paper, and each says what to check after", () => {
    const byId = Object.fromEntries(DOGFOOD_SOURCES.map((d) => [d.id, d]));
    for (const id of ["DF-18", "DF-19", "DF-20", "DF-21", "DF-22", "DF-23"]) {
      assert.ok(byId[id], `${id} missing`);
      assert.ok(Array.isArray(byId[id].checks) && byId[id].checks.length, `${id} has no checks`);
    }
    // The remittance depends on DF-20's invoice, found by the customer's number.
    assert.match(byId["DF-21"].dogfoodHint, /DF-20/);
    assert.deepEqual(byId["DF-21"].poNos, ["CPO-88120"]);
    assert.equal(sourceGrandTotal(byId["DF-21"]), 860);
    assert.equal(sourceSubtotal(byId["DF-20"]), 885, "DF-21's check is written against DF-20's $885.00");
    // The date papers name the posting date as the thing to look at.
    for (const id of ["DF-22", "DF-23"]) assert.ok(byId[id].checks.some((c) => /Posting Date/.test(c)), id);
    // The click-throughs ride on papers where that screen is already open.
    const all = DOGFOOD_SOURCES.flatMap((d) => d.checks || []).join("\n");
    for (const re of [/Hatch/, /Find Payments…/, /Show 200 more/, /Clear search/, /Customers reads Estimates/]) {
      assert.match(all, re);
    }
  });

  it("the sales papers name what the skins cannot do yet, so it is done in Vanilla", () => {
    for (const id of ["DF-18", "DF-19", "DF-20"]) {
      const d = DOGFOOD_SOURCES.find((x) => x.id === id);
      assert.ok(d.knownGaps && d.knownGaps.length, `${id} has no known gaps`);
    }
  });

  // 🔴 DF-17 is the one that stops a bill being paid twice — the residue P1's own amend creates.
  it("carries the void-and-amend re-link trap, and names the vanilla tool that fixes it", () => {
    const df17 = DOGFOOD_SOURCES.find((d) => d.id === "DF-17");
    assert.ok(df17, "DF-17 missing");
    assert.equal(sourceTarget(df17), "Payment Reconciliation");
    assert.match(df17.dogfoodHint, /Payment Reconciliation/);
    assert.match(df17.dogfoodHint, /unlink_payment_on_cancellation_of_invoice/);
    assert.match(df17.expect, /double-payment|credit/i);
  });

  // DF-20 is only enterable after DF-19, and says so — a scenario with an unstated prerequisite is
  // a scenario that fails for the wrong reason.
  it("names its prerequisite when one scenario depends on another", () => {
    const df20 = DOGFOOD_SOURCES.find((d) => d.id === "DF-20");
    assert.match(df20.dogfoodHint, /DF-19/);
    assert.deepEqual(df20.poNos, ["CPO-88120"]);
  });
});

describe("renderDogfoodSourceHtml — the sales side", () => {
  it("titles each new kind as the paper a person would recognise", () => {
    const titles = DOGFOOD_AR_SOURCES.filter((d) => AR_FLOW_IDS.includes(d.id)).map((d) => {
      const m = /<h1>([^<]*)<\/h1>/.exec(renderDogfoodSourceHtml(d));
      return m && m[1];
    });
    assert.deepEqual(titles, [
      "Request for Quote",
      "Customer Purchase Order",
      "Shipping Notice / Billing Instruction",
      "Remittance Advice",
    ]);
  });

  // The company across the top of money-in paper is the customer. The field is still called
  // `vendor`, but a label that says "Your account #" on a customer's PO teaches the wrong habit.
  it("calls the counterparty's reference theirs, not ours, on money-in paper", () => {
    const html = renderDogfoodSourceHtml(DOGFOOD_AR_SOURCES[0]);
    assert.match(html, /Their reference #/);
    assert.doesNotMatch(html, /Your account #/);
    assert.match(renderDogfoodSourceHtml(DOGFOOD_AP_SOURCES[0]), /Your account #/);
  });

  // The banner used to print "OI-103" on every page, including the ones that have nothing to do
  // with OI-103 — so it said something false on 12 of 24 documents.
  it("banners the real museum item, the flow and the target doctype", () => {
    const html = renderDogfoodSourceHtml(DOGFOOD_SOURCES.find((d) => d.id === "DF-19"));
    assert.match(html, /AR → Sales Order/);
    assert.match(html, /OI-134/);
    assert.doesNotMatch(html, /OI-103/);
  });

  it("renders every document in the pack without throwing", () => {
    for (const d of DOGFOOD_SOURCES) {
      const html = renderDogfoodSourceHtml(d);
      assert.match(html, /<!DOCTYPE html>/);
      assert.match(html, new RegExp(d.docNo));
    }
  });
});

describe("renderDogfoodSourceHtml — checks and known gaps", () => {
  it("prints the checks as tick boxes and the gaps on the banner", () => {
    const html = renderDogfoodSourceHtml(DOGFOOD_SOURCES.find((d) => d.id === "DF-20"));
    assert.match(html, /<h2>Then check<\/h2>/);
    assert.match(html, /☐/);
    const banner = html.slice(html.indexOf('<header class="banner">'), html.indexOf("</header>"));
    assert.match(banner, /Known gap today/);
    assert.match(banner, /Create › Sales Invoice/);
  });

  it("prints neither block on a paper that has none, and a remittance totals as a check", () => {
    const plain = renderDogfoodSourceHtml(DOGFOOD_SOURCES.find((d) => d.id === "DF-02"));
    assert.doesNotMatch(plain, /Then check|Known gap/);
    const rem = renderDogfoodSourceHtml(DOGFOOD_SOURCES.find((d) => d.id === "DF-21"));
    assert.match(rem, /Check amount<\/span><span>\$860\.00/);
  });
});
