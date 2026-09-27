import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVITY_TIERS,
  AP_SETTLE_DAYS,
  AR_SETTLE_DAYS,
  NEGATIVE_ITEMS,
  RESELLING_CUSTOMER_COUNT,
  RESELLING_ITEMS,
  RESELLING_MONTHS,
  RESELLING_MONTH_DAYS,
  RESELLING_VENDOR_COUNT,
  buildResellingCorpus,
  costForMonth,
  monthBaseOffset,
  priceForMonth,
} from "../src/sample-data/reselling-corpus.js";
import { buildCorpusPlan } from "../src/sample-data/corpus-plan.js";

const corpus = buildResellingCorpus();
const byKey = Object.fromEntries(corpus.docs.map((d) => [d.key, d]));

describe("reselling corpus — the population", () => {
  it("is 25 vendors and 25 customers with graded activity and nobody idle", () => {
    assert.equal(corpus.vendors.length, RESELLING_VENDOR_COUNT);
    assert.equal(corpus.customers.length, RESELLING_CUSTOMER_COUNT);
    const tiers = new Set(corpus.vendors.map((v) => v.activityTier));
    assert.deepEqual([...tiers].sort(), ["heavy", "light", "steady"]);
    // The ask put a floor of one transaction a month under every party, so no tier may be zero.
    for (const tier of ACTIVITY_TIERS) assert.ok(tier.cyclesPerMonth >= 1, tier.label);
    for (const v of corpus.vendors) assert.ok(v.cyclesPerMonth >= 1, v.key);
    assert.equal(
      ACTIVITY_TIERS.reduce((n, t) => n + t.vendors, 0),
      RESELLING_VENDOR_COUNT,
      "the tier table must account for every vendor",
    );
  });

  it("gives every party at least one document in every one of the twelve months", () => {
    assert.equal(corpus.months, RESELLING_MONTHS);
    assert.ok(corpus.summary.minVendorDocsPerMonth >= 1, "a vendor has a silent month");
    assert.ok(corpus.summary.minCustomerDocsPerMonth >= 1, "a customer has a silent month");
    // Spot-check the weakest case directly rather than trusting the summary.
    for (const party of [...corpus.vendors, ...corpus.customers]) {
      const months = new Set(
        corpus.docs.filter((d) => d.partyKey === party.key && d.kind !== "payment_entry")
          .map((d) => d.resellingMonth),
      );
      for (let m = 0; m < RESELLING_MONTHS; m++) {
        assert.ok(months.has(m), `${party.key} has nothing in month ${m}`);
      }
    }
  });

  it("busier tiers really do trade more", () => {
    const load = (tier) => {
      const v = corpus.vendors.find((x) => x.activityTier === tier);
      return corpus.docs.filter((d) => d.partyKey === v.key && d.kind === "purchase_invoice").length;
    };
    assert.ok(load("heavy") > load("steady"), "heavy should out-trade steady");
    assert.ok(load("steady") > load("light"), "steady should out-trade light");
  });

  it("stays inside its own year", () => {
    const offsets = corpus.docs.map((d) => d.dayOffset);
    assert.ok(Math.min(...offsets) >= 0);
    assert.ok(Math.max(...offsets) < RESELLING_MONTHS * RESELLING_MONTH_DAYS);
    assert.equal(corpus.windowDays, 360);
  });
});

describe("reselling corpus — cost that moves month to month", () => {
  it("gives every SKU twelve distinct monthly costs", () => {
    for (const item of RESELLING_ITEMS) {
      const costs = Array.from({ length: RESELLING_MONTHS }, (_, m) => costForMonth(item, m));
      assert.equal(new Set(costs).size, RESELLING_MONTHS, `${item.key} repeats a monthly cost`);
      for (const c of costs) assert.ok(c > 0, `${item.key} went non-positive`);
    }
  });

  it("does not assume cost only rises", () => {
    const falling = RESELLING_ITEMS.filter((i) => i.costStep < 0);
    assert.ok(falling.length >= 2, "at least two SKUs must deflate, or the panel can cheat");
  });

  it("prices every month above that month's cost", () => {
    for (const item of RESELLING_ITEMS) {
      for (let m = 0; m < RESELLING_MONTHS; m++) {
        assert.ok(
          priceForMonth(item, m) > costForMonth(item, m),
          `${item.key} month ${m} sells at or below cost`,
        );
      }
    }
  });

  it("buys each cycle at its own month's cost, so a queue rate names a month", () => {
    const receipts = corpus.docs.filter(
      (d) => d.kind === "purchase_receipt" && !d.negativeFlavour && d.resellingMonth != null,
    );
    assert.ok(receipts.length > 100);
    for (const pr of receipts) {
      const item = RESELLING_ITEMS.find((i) => i.key === pr.items[0].itemKey);
      assert.equal(pr.items[0].rate, costForMonth(item, pr.resellingMonth), pr.key);
    }
  });

  it("maps month index onto the window oldest-first", () => {
    assert.equal(monthBaseOffset(RESELLING_MONTHS - 1), 0);
    assert.equal(monthBaseOffset(0), (RESELLING_MONTHS - 1) * RESELLING_MONTH_DAYS);
    for (let m = 1; m < RESELLING_MONTHS; m++) {
      assert.ok(monthBaseOffset(m) < monthBaseOffset(m - 1), "later month must be a newer date");
    }
  });
});

describe("reselling corpus — the two ageing rules", () => {
  const paid = (kind) =>
    new Set(
      corpus.docs
        .filter((d) => d.kind === "payment_entry" && d.direction === (kind === "ap" ? "Pay" : "Receive"))
        .flatMap((d) => d.allocations.map((a) => a.key)),
    );

  it("pays every bill older than 60 days, and none younger", () => {
    const settled = paid("ap");
    for (const d of corpus.docs) {
      if (d.kind !== "purchase_invoice" || d.negativeFlavour) continue;
      const shouldBePaid = d.dayOffset > AP_SETTLE_DAYS;
      assert.equal(settled.has(d.key), shouldBePaid, `${d.key} at ${d.dayOffset} days`);
    }
  });

  it("collects every invoice older than 25 days, and none younger", () => {
    const settled = paid("ar");
    for (const d of corpus.docs) {
      if (d.kind !== "sales_invoice" || d.negativeFlavour) continue;
      const shouldBePaid = d.dayOffset > AR_SETTLE_DAYS;
      assert.equal(settled.has(d.key), shouldBePaid, `${d.key} at ${d.dayOffset} days`);
    }
  });

  it("settles in full — no allocation ever names an amount", () => {
    for (const pe of corpus.docs.filter((d) => d.kind === "payment_entry")) {
      assert.ok(pe.allocations.length >= 1, pe.key);
      for (const a of pe.allocations) assert.equal(a.amount, undefined, `${pe.key} caps an allocation`);
      assert.equal(pe.amount, undefined, `${pe.key} caps the payment`);
    }
  });

  it("never pays an invoice before it exists, nor in the future", () => {
    for (const pe of corpus.docs.filter((d) => d.kind === "payment_entry")) {
      assert.ok(pe.dayOffset >= 0, `${pe.key} is dated in the future`);
      for (const a of pe.allocations) {
        const inv = byKey[a.key];
        assert.ok(inv, `${pe.key} allocates to missing ${a.key}`);
        assert.ok(inv.dayOffset > pe.dayOffset, `${pe.key} predates ${a.key}`);
        assert.equal(inv.partyKey, pe.partyKey, `${pe.key} pays another party's invoice`);
      }
    }
  });

  it("groups a party's month into one payment rather than one per invoice", () => {
    const multi = corpus.docs.filter((d) => d.kind === "payment_entry" && d.allocations.length > 1);
    assert.ok(multi.length > 0, "a monthly cheque run should settle several invoices at once");
  });
});

describe("reselling corpus — negative inventory, both flavours", () => {
  it("carries two forward-dated and two backdated cases", () => {
    const flavours = NEGATIVE_ITEMS.map((i) => i.flavour);
    assert.equal(flavours.filter((f) => f === "forward").length, 2);
    assert.equal(flavours.filter((f) => f === "backdated").length, 2);
  });

  it("ships before it receives, and gets the date relationship right per flavour", () => {
    for (const item of NEGATIVE_ITEMS) {
      const dn = byKey[`RS-NEG-DN-${item.suffix}`];
      const pr = byKey[`RS-NEG-PR-${item.suffix}`];
      assert.ok(dn && pr, item.suffix);
      if (item.flavour === "forward") {
        // Receipt dated LATER than the shipment: no repost, the guess sticks forever.
        assert.ok(pr.dayOffset < dn.dayOffset, `${item.suffix} receipt should post after the ship`);
      } else {
        // Receipt dated EARLIER: ERPNext reposts and restates the shipment's cost.
        assert.ok(pr.dayOffset > dn.dayOffset, `${item.suffix} receipt should post before the ship`);
      }
      assert.ok(pr.items[0].qty > dn.items[0].qty, "the receipt must clear the negative");
    }
  });

  it("holds the receipt back so the shipment is inserted first", () => {
    for (const item of NEGATIVE_ITEMS) {
      // Without this the receipt goes in first, stock is on hand, and neither behaviour occurs.
      assert.equal(byKey[`RS-NEG-PR-${item.suffix}`].applyLast, true, item.suffix);
    }
    // Nothing else in the corpus needs deferring.
    const deferred = corpus.docs.filter((d) => d.applyLast);
    assert.equal(deferred.length, NEGATIVE_ITEMS.length);
  });

  it("gives each case its own SKU, so reposts cannot cascade", () => {
    const codes = new Set();
    for (const item of NEGATIVE_ITEMS) {
      const dn = byKey[`RS-NEG-DN-${item.suffix}`];
      assert.equal(dn.items[0].itemKey, item.key);
      codes.add(item.key);
      // and no ordinary cycle may touch it
      const others = corpus.docs.filter(
        (d) => d.items?.[0]?.itemKey === item.key && !d.key.startsWith("RS-NEG-"),
      );
      assert.equal(others.length, 0, `${item.key} is shared with ordinary cycles`);
    }
    assert.equal(codes.size, NEGATIVE_ITEMS.length);
  });

  it("sets a master rate that is deliberately wrong, in both directions", () => {
    // get_fallback_rate reaches Item.valuation_rate first, so this is the guess the shipment books
    // at. Above cost for one of each flavour and below for the other, so the correction has a sign.
    const high = NEGATIVE_ITEMS.filter((i) => i.masterRate > i.cost);
    const low = NEGATIVE_ITEMS.filter((i) => i.masterRate < i.cost);
    assert.ok(high.length >= 1 && low.length >= 1);
    for (const i of NEGATIVE_ITEMS) assert.notEqual(i.masterRate, i.cost, i.suffix);
  });

  it("marks the SKUs as tolerating negative stock", () => {
    const items = buildResellingCorpus().items;
    for (const item of NEGATIVE_ITEMS) {
      assert.equal(items.find((i) => i.key === item.key).allowNegativeStock, true);
    }
    // All resale SKUs do, so one stray date cannot fail a 2,700-document seed.
    for (const item of RESELLING_ITEMS) {
      assert.equal(items.find((i) => i.key === item.key).allowNegativeStock, true);
    }
  });
});

describe("reselling corpus — insert order protects the ledger", () => {
  it("emits one global oldest-first order across every kind", () => {
    // 🔴 Per-kind order is NOT enough: the seeder would put every receipt in before any shipment,
    // and each shipment would then be backdated against the newest receipt on file — which is what
    // queues a Repost Item Valuation. A two-month run left 59 of them queued before this was fixed.
    const rows = corpus.docs.filter((d) => !d.applyLast);
    for (let i = 1; i < rows.length; i++) {
      assert.ok(
        rows[i].dayOffset <= rows[i - 1].dayOffset,
        `${rows[i].key} (${rows[i].dayOffset}) inserted after ${rows[i - 1].key} (${rows[i - 1].dayOffset})`,
      );
    }
  });

  it("interleaves receipts and shipments rather than batching them", () => {
    const stock = corpus.docs.filter(
      (d) => ["purchase_receipt", "delivery_note"].includes(d.kind) && !d.applyLast,
    );
    let flips = 0;
    for (let i = 1; i < stock.length; i++) {
      if (stock[i].kind !== stock[i - 1].kind) flips += 1;
    }
    // Batched by kind there would be exactly one flip; interleaved there are hundreds.
    assert.ok(flips > 100, `only ${flips} receipt/shipment alternations — still batched by kind`);
  });

  it("never places a document before the one it is created from", () => {
    const position = new Map(corpus.docs.map((d, i) => [d.key, i]));
    for (const d of corpus.docs) {
      if (!d.source?.key || d.applyLast) continue;
      assert.ok(
        position.get(d.source.key) < position.get(d.key),
        `${d.key} is applied before its source ${d.source.key}`,
      );
    }
  });

  it("marks every row for the seeder's chronological pass", () => {
    for (const d of corpus.docs) assert.equal(d.chronoGroup, "reselling", d.key);
  });

  it("receives before it ships in every ordinary cycle", () => {
    const cycles = corpus.docs.filter((d) => d.kind === "purchase_receipt" && !d.negativeFlavour);
    for (const pr of cycles) {
      const id = pr.key.slice("RS-PR-".length);
      const dn = byKey[`RS-DN-${id}`];
      assert.ok(dn, id);
      assert.ok(pr.dayOffset > dn.dayOffset, `${id} ships before it receives`);
    }
  });

  it("sells less than it buys, so ordinary stock never goes negative", () => {
    for (const pr of corpus.docs.filter((d) => d.kind === "purchase_receipt" && !d.negativeFlavour)) {
      const dn = byKey[`RS-DN-${pr.key.slice("RS-PR-".length)}`];
      assert.ok(dn.items[0].qty < pr.items[0].qty, pr.key);
    }
  });
});

describe("reselling corpus — how it joins the main plan", () => {
  it("is on by default and can be switched off or shortened", () => {
    const withIt = buildCorpusPlan();
    const without = buildCorpusPlan({ reselling: false });
    assert.equal(without.reselling, null);
    assert.ok(withIt.reselling.total > 2000);
    assert.ok(withIt.docs.length > without.docs.length + 2000);
    const short = buildCorpusPlan({ resellingMonths: 2 });
    assert.equal(short.reselling.months, 2);
    assert.ok(short.docs.length < withIt.docs.length);
  });

  it("adds its parties without disturbing the rotation's", () => {
    const plan = buildCorpusPlan();
    const base = buildCorpusPlan({ reselling: false });
    assert.equal(plan.parties.suppliers.length, base.parties.suppliers.length + RESELLING_VENDOR_COUNT);
    assert.equal(plan.parties.customers.length, base.parties.customers.length + RESELLING_CUSTOMER_COUNT);
    assert.equal(
      plan.parties.items.length,
      base.parties.items.length + RESELLING_ITEMS.length + NEGATIVE_ITEMS.length,
    );
    // The tax mix is calibrated on the rotation; the reselling parties must not move it.
    assert.equal(plan.tax.taxableCustomers, base.tax.taxableCustomers);
    assert.equal(plan.tax.withholdingSuppliers, base.tax.withholdingSuppliers);
  });

  it("keeps every plan key unique across both populations", () => {
    const keys = buildCorpusPlan().docs.map((d) => d.key);
    assert.equal(new Set(keys).size, keys.length, "duplicate plan key — the seeder keys on these");
  });
});
