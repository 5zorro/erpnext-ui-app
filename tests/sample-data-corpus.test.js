import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SAMPLE_TAG,
  DEFAULT_COUNTS,
  DEFAULT_DRAFTS_PER_KIND,
  AP_DOGFOOD_FIXTURE_KEYS,
  AP_FIXTURE_EXTRA_COUNTS,
  PAYMENT_BATCH_FIXTURE_KEYS,
  buildCorpusPlan,
  dateForOffset,
  idleVendorPoPostingDate,
  postingDateForDoc,
  summarizePlan,
  pad2,
} from "../src/sample-data/corpus-plan.js";
import {
  assertSandboxTarget,
  assertSeedConfirmed,
  DEFAULT_ALLOWED_SITES,
} from "../src/sample-data/sandbox-guard.js";

/** @param {{ kind: string, index?: number, key?: string }} source */
function sourcePlanKey(source) {
  if (source.key) return source.key;
  if (source.kind === "quotation") return `Q-${pad2(source.index)}`;
  if (source.kind === "sales_order") return `SO-${pad2(source.index)}`;
  if (source.kind === "purchase_order") return `PO-${pad2(source.index)}`;
  if (source.kind === "purchase_receipt") return `PR-${pad2(source.index)}`;
  return null;
}

describe("sample-data corpus plan", () => {
  it("pads indices", () => {
    assert.equal(pad2(3), "03");
    assert.equal(pad2(25), "25");
  });

  it("builds ~25 of each doctype with tag and 60-day window", () => {
    const plan = buildCorpusPlan();
    assert.equal(plan.tag, SAMPLE_TAG);
    assert.equal(plan.windowDays, 60);
    for (const [kind, n] of Object.entries(DEFAULT_COUNTS)) {
      assert.equal(plan.counts[kind], n, kind);
      const submitted = plan.docs.filter((d) => d.kind === kind && !d.asDraft && !d.outsideWindow);
      const drafts = plan.docs.filter((d) => d.kind === kind && d.asDraft);
      const extra = AP_FIXTURE_EXTRA_COUNTS[kind] || 0;
      assert.equal(submitted.length, n + extra, `submitted docs ${kind}`);
      assert.equal(drafts.length, DEFAULT_DRAFTS_PER_KIND, `draft docs ${kind}`);
    }
    assert.equal(plan.parties.suppliers.filter((s) => !s.activity).length, 10);
    assert.equal(plan.parties.suppliers.length, 12);
    assert.equal(plan.parties.customers.length, 8);
    assert.equal(plan.parties.items.length, 12);
    assert.equal(plan.parties.projects.length, 4);
    assert.ok(plan.parties.suppliers.some((s) => s.accountNumber === "CUST-44192"));
    assert.ok(plan.parties.suppliers.some((s) => s.accountNumber === "ACCT-998877"));
    assert.equal(plan.summary.drafts, DEFAULT_DRAFTS_PER_KIND * 6);
  });

  it("drafts are create-from-nothing and spread across distinct parties", () => {
    const plan = buildCorpusPlan();
    const draftPi = plan.docs.filter((d) => d.kind === "purchase_invoice" && d.asDraft);
    assert.equal(draftPi.length, 5);
    for (const d of draftPi) {
      assert.equal(d.source, null);
      assert.equal(d.asDraft, true);
    }
    const vendors = new Set(draftPi.map((d) => d.partyKey));
    assert.equal(vendors.size, 5, "one draft Bill per distinct SAMPLE vendor (of first 5)");
  });

  it("varies create-from-source vs create-from-nothing", () => {
    const plan = buildCorpusPlan();
    const submitted = plan.docs.filter((d) => !d.asDraft);
    const { bySource } = summarizePlan(submitted);

    assert.equal(bySource["sales_order←quotation"], 15);
    assert.equal(bySource["sales_order←none"], 10);
    assert.equal(bySource["sales_invoice←sales_order"], 12);
    assert.equal(bySource["sales_invoice←none"], 13);

    assert.equal(bySource["purchase_receipt←purchase_order"], 14);
    assert.equal(bySource["purchase_receipt←none"], 13);
    assert.equal(bySource["purchase_invoice←purchase_receipt"], 8);
    assert.equal(bySource["purchase_invoice←purchase_order"], 8);
    // +2 over the base 9: OI-161 Packet G's PI-DAILY / PI-DAILY-LG (create-from-nothing).
    assert.equal(bySource["purchase_invoice←none"], 11);
  });

  it("leaves open POs for source-picker dogfood (20..24)", () => {
    const plan = buildCorpusPlan();
    const prFromPo = new Set(
      plan.docs
        .filter((d) => d.kind === "purchase_receipt" && d.source?.kind === "purchase_order")
        .map((d) => d.source.index)
    );
    const piFromPo = new Set(
      plan.docs
        .filter((d) => d.kind === "purchase_invoice" && d.source?.kind === "purchase_order")
        .map((d) => d.source.index)
    );
    for (let i = 20; i <= 24; i++) {
      assert.equal(prFromPo.has(i), false, `PR should not consume PO ${i}`);
      assert.equal(piFromPo.has(i), false, `PI should not consume PO ${i}`);
    }
  });

  it("keeps linked chains chronological (source older than child)", () => {
    const plan = buildCorpusPlan();
    const byKey = Object.fromEntries(plan.docs.map((d) => [d.key, d]));
    for (const d of plan.docs) {
      if (!d.source) continue;
      const srcKey = sourcePlanKey(d.source);
      assert.ok(srcKey && byKey[srcKey], `missing source ${srcKey}`);
      assert.ok(
        byKey[srcKey].dayOffset >= d.dayOffset,
        `${d.key} offset ${d.dayOffset} should be <= source ${srcKey} ${byKey[srcKey].dayOffset}`
      );
    }
  });

  it("rotates parties and spreads dayOffsets across the window", () => {
    const plan = buildCorpusPlan();
    const supplierKeys = new Set(
      plan.docs.filter((d) => d.kind === "purchase_order").map((d) => d.partyKey)
    );
    const customerKeys = new Set(
      plan.docs.filter((d) => d.kind === "sales_order").map((d) => d.partyKey)
    );
    assert.ok(supplierKeys.size >= 5);
    assert.ok(customerKeys.size >= 5);

    const offsets = plan.docs.filter((d) => !d.outsideWindow).map((d) => d.dayOffset);
    assert.equal(Math.min(...offsets), 0);
    assert.ok(Math.max(...offsets) >= 50);
    assert.ok(offsets.every((o) => o >= 0 && o < 60));
  });

  it("OI-131 includes one idle vendor (old PO) and one never-PO vendor", () => {
    const plan = buildCorpusPlan();
    assert.ok(plan.parties.suppliers.some((s) => s.key === "SUP-IDLE" && s.activity === "idle"));
    assert.ok(plan.parties.suppliers.some((s) => s.key === "SUP-NEVER" && s.activity === "never"));
    const idlePos = plan.docs.filter((d) => d.kind === "purchase_order" && d.partyKey === "SUP-IDLE");
    assert.equal(idlePos.length, 1);
    assert.ok(idlePos[0].dayOffset > plan.windowDays);
    const neverDocs = plan.docs.filter((d) => d.partyKey === "SUP-NEVER");
    assert.equal(neverDocs.length, 0);
  });

  it("links some PO lines to sales orders for SO picker dogfood", () => {
    const plan = buildCorpusPlan();
    const linked = plan.docs.filter((d) => d.kind === "purchase_order" && d.salesOrderLink);
    assert.equal(linked.length, 7); // indices 0,4,8,12,16,20,24
  });

  it("dateForOffset counts back from asOf", () => {
    assert.equal(dateForOffset("2026-08-01", 0), "2026-08-01");
    assert.equal(dateForOffset("2026-08-01", 1), "2026-07-31");
    assert.equal(dateForOffset("2026-08-01", 60), "2026-06-02");
  });

  it("PO-IDLE postingDate is prior calendar year (inside FY N−1)", () => {
    assert.equal(idleVendorPoPostingDate("2026-08-21"), "2025-11-15");
    const plan = buildCorpusPlan();
    const idle = plan.docs.find((d) => d.key === "PO-IDLE");
    assert.equal(postingDateForDoc("2026-08-21", idle), "2025-11-15");
  });

  it("summarizePlan matches buildCorpusPlan.summary", () => {
    const plan = buildCorpusPlan();
    assert.deepEqual(summarizePlan(plan.docs), plan.summary);
  });

  it("T0 AP fixtures for OI-149 / OI-153 / OI-154", () => {
    const plan = buildCorpusPlan();
    assert.equal(plan.apFixtures.keys.length, AP_DOGFOOD_FIXTURE_KEYS.length);
    for (const key of AP_DOGFOOD_FIXTURE_KEYS) {
      const row = plan.docs.find((d) => d.key === key);
      assert.ok(row, key);
      assert.equal(row.asDraft, undefined);
    }
    const poMn = plan.docs.find((d) => d.key === "PO-MN");
    assert.equal(poMn.logbookPoNo, "JE-88421");
    assert.equal(poMn.dogfoodScenario, "oi149-po-pr");
    const prMn = plan.docs.find((d) => d.key === "PR-MN");
    assert.deepEqual(prMn.partialReceive, [{ lineIndex: 1, qty: 4 }]);
    assert.equal(prMn.source.key, "PO-MN");
    const poPp = plan.docs.find((d) => d.key === "PO-PP");
    assert.equal(poPp.advancePayment.amount, 120);
    assert.equal(poPp.advancePayment.manual, true);
    const poLb = plan.docs.find((d) => d.key === "PO-LB");
    assert.equal(poLb.logbookPoNo, "TO-5599");
    const piFromMn = plan.docs.filter(
      (d) =>
        d.kind === "purchase_invoice" &&
        (d.source?.key === "PO-MN" || d.source?.key === "PR-MN")
    );
    assert.equal(piFromMn.length, 0);
  });

  it("OI-161 Packet G: daily payment-schedule fixture at two dollar scales", () => {
    const plan = buildCorpusPlan();
    assert.equal(PAYMENT_BATCH_FIXTURE_KEYS.length, 2);

    const cases = [
      { key: "PI-DAILY", partyKey: "SUP-DAILY", rate: 50.0, grandTotal: 4500.0 },
      { key: "PI-DAILY-LG", partyKey: "SUP-DAILY-LG", rate: 2500.0, grandTotal: 225000.0 },
    ];
    for (const c of cases) {
      const row = plan.docs.find((d) => d.key === c.key);
      assert.ok(row, c.key);
      assert.equal(row.kind, "purchase_invoice");
      assert.equal(row.partyKey, c.partyKey);
      assert.equal(row.source, null);
      assert.equal(row.asDraft, undefined, "must be submitted, not a draft");
      assert.equal(row.items.length, 1);
      assert.equal(row.items[0].qty, 90);
      assert.equal(row.items[0].rate, c.rate);

      assert.equal(row.paymentSchedule.length, 90);
      const amountSum = row.paymentSchedule.reduce((s, r) => s + r.amount, 0);
      assert.ok(Math.abs(amountSum - c.grandTotal) < 1e-9, `${c.key} schedule sum ${amountSum}`);
      for (const r of row.paymentSchedule) {
        assert.equal(r.amount, c.rate);
      }

      // dayOffset resolves to 90 consecutive, distinct calendar days once given an asOf.
      const dueDates = row.paymentSchedule.map((r) => dateForOffset("2026-09-05", r.dayOffset));
      assert.equal(new Set(dueDates).size, 90, `${c.key} due dates must be distinct`);
      const sorted = [...dueDates].sort();
      assert.deepEqual(dueDates, sorted, `${c.key} schedule rows must already be in ascending date order`);

      const postingDate = postingDateForDoc("2026-09-05", row);
      assert.ok(dueDates[0] > postingDate, "first due date is after posting");
    }

    // Dedicated vendors — never reused by any other fixture or the 60-day rotation.
    const dailyPis = plan.docs.filter(
      (d) => d.kind === "purchase_invoice" && (d.partyKey === "SUP-DAILY" || d.partyKey === "SUP-DAILY-LG"),
    );
    assert.equal(dailyPis.length, 2);
  });

  it("OI-115 tax mix: ~7/8 customers taxable, ~2/8 suppliers TW", () => {
    const plan = buildCorpusPlan();
    assert.equal(plan.tax.tdsCategory, "SAMPLE-TDS");
    assert.equal(plan.tax.taxableCustomers, 7);
    assert.equal(plan.tax.withholdingSuppliers, 2);
    assert.equal(plan.parties.customers.filter((c) => c.taxable).length, 7);
    assert.equal(plan.parties.customers.filter((c) => !c.taxable).length, 1);
    assert.equal(plan.parties.suppliers.filter((s) => s.taxWithholding).length, 2);

    const submittedSi = plan.docs.filter((d) => d.kind === "sales_invoice" && !d.asDraft);
    const taxableKeys = new Set(plan.parties.customers.filter((c) => c.taxable).map((c) => c.key));
    for (const d of submittedSi) {
      assert.equal(!!d.salesTax, taxableKeys.has(d.partyKey), d.key);
    }
    const draftSi = plan.docs.filter((d) => d.kind === "sales_invoice" && d.asDraft);
    assert.ok(draftSi.every((d) => !d.salesTax));

    const submittedPi = plan.docs.filter((d) => d.kind === "purchase_invoice" && !d.asDraft);
    const twKeys = new Set(plan.parties.suppliers.filter((s) => s.taxWithholding).map((s) => s.key));
    const twPis = submittedPi.filter((d) => d.taxWithholding);
    assert.ok(twPis.length >= 6, `expected several TW PIs, got ${twPis.length}`);
    for (const d of submittedPi) {
      assert.equal(!!d.taxWithholding, twKeys.has(d.partyKey), d.key);
    }
    const draftPi = plan.docs.filter((d) => d.kind === "purchase_invoice" && d.asDraft);
    assert.ok(draftPi.every((d) => !d.taxWithholding));
  });
});

describe("sample-data sandbox guard", () => {
  it("allowlists frontend + SANDBOX company", () => {
    const r = assertSandboxTarget({
      site: "frontend",
      company: "HECSANDBOX INCORPORATED",
    });
    assert.equal(r.ok, true);
    assert.deepEqual(DEFAULT_ALLOWED_SITES, ["frontend"]);
  });

  it("rejects production-looking targets", () => {
    const r = assertSandboxTarget({
      site: "books.example.com",
      company: "Acme Manufacturing",
    });
    assert.equal(r.ok, false);
  });

  it("requires CONFIRM_SAMPLE_SEED", () => {
    assert.equal(assertSeedConfirmed({}).ok, false);
    assert.equal(assertSeedConfirmed({ CONFIRM_SAMPLE_SEED: "1" }).ok, true);
  });
});
