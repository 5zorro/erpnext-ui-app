import { describe, it } from "node:test";
import { parsePaymentTermGrace } from "../src/payment-term-grace.js";
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
    // 11 activity-less suppliers: the 8 generic ones plus SUP-DAILY / SUP-DAILY-LG (Packet G)
    // and SUP-OVERLAP (overlapping schedules, 2026-09-08).
    assert.equal(plan.parties.suppliers.filter((s) => !s.activity).length, 11);
    assert.equal(plan.parties.suppliers.length, 13);
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
    // +5 over the base 9, all create-from-nothing: OI-161 Packet G's PI-DAILY / PI-DAILY-LG
    // plus the three overlapping-schedule bills (PI-OVERLAP-A/B/C, 2026-09-08).
    assert.equal(bySource["purchase_invoice←none"], 14);
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

  it("OI-161: three bills whose schedules interleave into cross-bill groups (2026-09-08)", () => {
    const plan = buildCorpusPlan();
    const keys = ["PI-OVERLAP-A", "PI-OVERLAP-B", "PI-OVERLAP-C"];
    const rows = keys.map((k) => plan.docs.find((d) => d.key === k));
    for (const [i, row] of rows.entries()) {
      assert.ok(row, keys[i]);
      assert.equal(row.partyKey, "SUP-OVERLAP");
      assert.equal(row.dogfoodScenario, "oi161-overlapping-schedules");
      assert.equal(row.paymentSchedule.length, 3);
      // Same rule ERPNext enforces: schedule amounts must sum to grand_total exactly.
      const grand = row.items.reduce((a, it) => a + it.qty * it.rate, 0);
      const sched = row.paymentSchedule.reduce((a, r) => a + r.amount, 0);
      assert.equal(sched, grand, `${keys[i]} schedule sums to grand total`);
      // ERPNext throws on duplicate due dates within one document.
      const offsets = row.paymentSchedule.map((r) => r.dayOffset);
      assert.equal(new Set(offsets).size, offsets.length, `${keys[i]} distinct due dates`);
      // Ascending due date == descending dayOffset, so "last row wins" gives the header date.
      assert.deepEqual([...offsets].sort((a, b) => b - a), offsets, `${keys[i]} ascending due dates`);
      // No installment on the posting date itself.
      assert.ok(Math.max(...offsets) < row.dayOffset, `${keys[i]} first due date is after posting`);
    }

    // The whole point of the fixture: due dates interleave A,B,C / A,B,C / A,B,C rather than
    // running bill-by-bill, so each suggested group draws one installment from each bill.
    const due = rows.flatMap((r) =>
      r.paymentSchedule.map((sr) => ({ bill: r.key.slice(-1), day: r.dayOffset - sr.dayOffset })),
    );
    due.sort((a, b) => a.day - b.day);
    assert.deepEqual(due.map((d) => d.bill).join(""), "ABCABCABC");

    // Three clusters of three, each cluster inside the default 7-day group window and separated
    // from the next by more than the stagger -- otherwise this collapses into one run-on group.
    const days = due.map((d) => d.day);
    for (let i = 0; i < 3; i += 1) {
      const cluster = days.slice(i * 3, i * 3 + 3);
      assert.ok(cluster[2] - cluster[0] < 7, `cluster ${i} spans under the group window`);
    }
    assert.ok(days[3] - days[2] > 0 && days[6] - days[5] > 0, "clusters are separated");
  });

  it("OI-161 Packet G: daily payment-schedule fixture at two dollar scales", () => {
    const plan = buildCorpusPlan();
    assert.equal(PAYMENT_BATCH_FIXTURE_KEYS.length, 5);

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

// --- Packet A5: payment terms fixtures ----------------------------------------------------------

describe("payment terms fixtures (A5)", () => {
  const plan = buildCorpusPlan({});

  it("names modes of payment by RAIL, not by ERPNext's stock labels", () => {
    // payment-batch-prefs.js keys its fee table by exactly these names; ERPNext's stock
    // "Check / Wire Transfer" do not distinguish ACH from a domestic wire, which is the whole
    // difference the cost model turns on ($0.40 vs $25).
    assert.deepEqual(
      plan.modesOfPayment.map((m) => m.name),
      ["USPS_Check", "ACH", "DOM_WIRE", "INT_WIRE"],
    );
  });

  it("every term name parses under the grace grammar", () => {
    for (const t of plan.paymentTerms) {
      const grace = parsePaymentTermGrace(t.name);
      assert.notEqual(grace, undefined, `${t.name} must encode a grace`);
      assert.ok(Number.isSafeInteger(grace));
    }
  });

  it("spreads grace across the sign, including an explicit zero", () => {
    const graces = plan.paymentTerms.map((t) => parsePaymentTermGrace(t.name));
    assert.ok(graces.some((g) => g < 0), "a strict vendor");
    assert.ok(graces.some((g) => g > 0), "a tolerant vendor");
    assert.ok(graces.includes(0), "an explicit +0 — parses as 0, not as absent");
  });

  it("covers the requested shapes: Net 30 variants, 2/10 Net 30, Net 10th", () => {
    const names = plan.paymentTerms.map((t) => t.name);
    assert.ok(names.filter((n) => n.startsWith("NET_30_DAYS")).length >= 2, "a couple of Net 30");
    assert.ok(names.filter((n) => n.startsWith("2%_10_NET_30")).length >= 1, "2/10 Net 30");
    assert.ok(names.some((n) => n.startsWith("NET_10TH")), "Net 10th");
  });

  it("models Net 10th off the end of the invoice month, not a day-of-month field", () => {
    // ERPNext has no day-of-month due field; "the 10th of next month" is
    // due_date_based_on = "Day(s) after the end of the invoice month". creditDays is 15 rather
    // than 10 because grace folds in (contract month-end+10, tolerance +5) — see below.
    const net10th = plan.paymentTerms.find((t) => t.name.startsWith("NET_10TH"));
    assert.equal(net10th.dueDateBasedOn, "Day(s) after the end of the invoice month");
    assert.equal(net10th.creditDays, 15);
  });

  it("folds grace INTO creditDays — the shell must never shift a due date itself", () => {
    // Reversed 2026-09-09. "Net 30 with +16 tolerance" is a 46-day Payment Term, so ERPNext
    // computes the real due date. Parsing the name to shift it afterwards would double-count,
    // and a name the parser refused would silently produce a wrong date and a wrong batch group.
    const byName = Object.fromEntries(plan.paymentTerms.map((t) => [t.name, t]));
    const CONTRACT = {
      "NET_30_DAYS (POSTAL) -3": 30,
      "NET_30_DAYS (POSTAL) +16": 30,
      "NET_30_DAYS (ACH) +2": 30,
      "2%_10_NET_30 (ACH) +2": 30,
      "2%_10_NET_30 (POSTAL) -3": 30,
      "NET_10TH (ACH) +5": 10,
      "NET_15_DAYS (DOM_WIRE) +0": 15,
    };
    for (const [name, contract] of Object.entries(CONTRACT)) {
      const grace = parsePaymentTermGrace(name);
      assert.equal(
        byName[name].creditDays,
        contract + grace,
        `${name}: creditDays must be contract ${contract} + grace ${grace}`,
      );
    }
  });

  it("keeps the discount window on the contract clock, not the graced one", () => {
    // 2/10 net 30 with +2 tolerance is still "2% if paid within 10 days" — the tolerance moves
    // the net deadline, never the discount window. discountValidity stays 10 while creditDays is 32.
    for (const t of plan.paymentTerms.filter((x) => x.discount)) {
      assert.equal(t.discountValidity, 10);
      assert.ok(t.creditDays > t.discountValidity);
    }
  });

  it("uses only ERPNext's own Select values for due_date_based_on", () => {
    const ALLOWED = new Set([
      "Day(s) after invoice date",
      "Day(s) after the end of the invoice month",
      "Month(s) after the end of the invoice month",
    ]);
    for (const t of plan.paymentTerms) assert.ok(ALLOWED.has(t.dueDateBasedOn), t.dueDateBasedOn);
  });

  it("gives several ACH terms and one wire", () => {
    const modes = plan.paymentTerms.map((t) => t.modeOfPayment);
    assert.ok(modes.filter((m) => m === "ACH").length >= 2, "a few ACH");
    assert.equal(modes.filter((m) => m === "DOM_WIRE").length, 1, "a wire");
    assert.ok(modes.includes("USPS_Check"));
  });

  it("declares every mode its terms reference", () => {
    const declared = new Set(plan.modesOfPayment.map((m) => m.name));
    for (const t of plan.paymentTerms) assert.ok(declared.has(t.modeOfPayment), t.modeOfPayment);
  });

  it("keeps the (METHOD) parenthetical consistent with modeOfPayment", () => {
    // The name is decoration and the field is the SSoT — but a fixture whose decoration lies
    // would make dogfood unreadable, so the seed data at least keeps them in step.
    const LABEL = { USPS_Check: "POSTAL", ACH: "ACH", DOM_WIRE: "DOM_WIRE", INT_WIRE: "INT_WIRE" };
    for (const t of plan.paymentTerms) {
      assert.ok(t.name.includes(`(${LABEL[t.modeOfPayment]})`), `${t.name} vs ${t.modeOfPayment}`);
    }
  });

  it("gives every discount term a validity window and a type", () => {
    for (const t of plan.paymentTerms.filter((x) => x.discount)) {
      assert.equal(t.discountType, "Percentage");
      assert.ok(t.discountValidity > 0);
      assert.equal(t.discountValidityBasedOn, "Day(s) after invoice date");
    }
  });

  it("uses unique names and keys — Payment Term.payment_term_name is unique:1 in ERPNext", () => {
    const names = plan.paymentTerms.map((t) => t.name);
    const keys = plan.paymentTerms.map((t) => t.key);
    assert.equal(new Set(names).size, names.length);
    assert.equal(new Set(keys).size, keys.length);
  });

  it("assigns a real term to every rotating and batching supplier", () => {
    const known = new Set(plan.paymentTerms.map((t) => t.key));
    const assigned = plan.parties.suppliers.filter((s) => s.paymentTermsKey);
    assert.ok(assigned.length >= 11);
    for (const s of assigned) assert.ok(known.has(s.paymentTermsKey), `${s.key} -> ${s.paymentTermsKey}`);
  });

  it("splits the batching fixtures across methods so the contrast is visible", () => {
    // SUP-DAILY on cheque should batch; SUP-OVERLAP on ACH mostly should not ($0.40 loses to
    // float); SUP-DAILY-LG on wire should batch hard ($25). That contrast is the fixture's job.
    const byKey = Object.fromEntries(plan.parties.suppliers.map((s) => [s.key, s]));
    const termByKey = Object.fromEntries(plan.paymentTerms.map((t) => [t.key, t]));
    assert.equal(termByKey[byKey["SUP-DAILY"].paymentTermsKey].modeOfPayment, "USPS_Check");
    assert.equal(termByKey[byKey["SUP-DAILY-LG"].paymentTermsKey].modeOfPayment, "DOM_WIRE");
    assert.equal(termByKey[byKey["SUP-OVERLAP"].paymentTermsKey].modeOfPayment, "ACH");
  });

  it("exercises every term in the catalogue on at least one supplier", () => {
    const used = new Set(plan.parties.suppliers.map((s) => s.paymentTermsKey).filter(Boolean));
    for (const t of plan.paymentTerms) assert.ok(used.has(t.key), `${t.name} is never assigned`);
  });
});
