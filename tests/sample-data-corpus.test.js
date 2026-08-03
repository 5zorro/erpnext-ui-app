import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SAMPLE_TAG,
  DEFAULT_COUNTS,
  DEFAULT_DRAFTS_PER_KIND,
  buildCorpusPlan,
  dateForOffset,
  summarizePlan,
  pad2,
} from "../src/sample-data/corpus-plan.js";
import {
  assertSandboxTarget,
  assertSeedConfirmed,
  DEFAULT_ALLOWED_SITES,
} from "../src/sample-data/sandbox-guard.js";

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
      const submitted = plan.docs.filter((d) => d.kind === kind && !d.asDraft);
      const drafts = plan.docs.filter((d) => d.kind === kind && d.asDraft);
      assert.equal(submitted.length, n, `submitted docs ${kind}`);
      assert.equal(drafts.length, DEFAULT_DRAFTS_PER_KIND, `draft docs ${kind}`);
    }
    assert.equal(plan.parties.suppliers.length, 8);
    assert.equal(plan.parties.customers.length, 8);
    assert.equal(plan.parties.items.length, 12);
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

    assert.equal(bySource["purchase_receipt←purchase_order"], 12);
    assert.equal(bySource["purchase_receipt←none"], 13);
    assert.equal(bySource["purchase_invoice←purchase_receipt"], 8);
    assert.equal(bySource["purchase_invoice←purchase_order"], 8);
    assert.equal(bySource["purchase_invoice←none"], 9);
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
      const srcKey =
        d.source.kind === "quotation"
          ? `Q-${pad2(d.source.index)}`
          : d.source.kind === "sales_order"
            ? `SO-${pad2(d.source.index)}`
            : d.source.kind === "purchase_order"
              ? `PO-${pad2(d.source.index)}`
              : d.source.kind === "purchase_receipt"
                ? `PR-${pad2(d.source.index)}`
                : null;
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

    const offsets = plan.docs.map((d) => d.dayOffset);
    assert.equal(Math.min(...offsets), 0);
    assert.ok(Math.max(...offsets) >= 50);
    assert.ok(offsets.every((o) => o >= 0 && o < 60));
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

  it("summarizePlan matches buildCorpusPlan.summary", () => {
    const plan = buildCorpusPlan();
    assert.deepEqual(summarizePlan(plan.docs), plan.summary);
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
