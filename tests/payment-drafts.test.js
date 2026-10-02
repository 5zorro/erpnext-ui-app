import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeDraftPayment,
  normalizeDraftPayments,
  draftPaymentsByInvoice,
  draftPaymentAdvisory,
  draftPaymentConfirmText,
} from "../src/payment-drafts.js";

const draft = (over = {}) => ({
  name: "ACC-PAY-2026-00004",
  docstatus: 0,
  payment_type: "Pay",
  party_type: "Supplier",
  party: "ALPINE SUPPLY CO",
  posting_date: "2026-09-30",
  paid_amount: 563.06,
  mode_of_payment: "Check",
  reference_no: null,
  references: [
    { reference_doctype: "Purchase Invoice", reference_name: "ACC-PINV-2026-00002", allocated_amount: 563.06 },
  ],
  ...over,
});

describe("payment-drafts (plan 2026-09-26 DF-01 D)", () => {
  it("normalizes a draft supplier payment", () => {
    const d = normalizeDraftPayment(draft());
    assert.equal(d.name, "ACC-PAY-2026-00004");
    assert.equal(d.party, "ALPINE SUPPLY CO");
    assert.equal(d.paidAmount, 563.06);
    assert.equal(d.referenceNo, "", "a NULL reference_no must not become the string 'null'");
    assert.deepEqual(d.references, [
      { doctype: "Purchase Invoice", name: "ACC-PINV-2026-00002", allocated: 563.06 },
    ]);
  });

  it("drops submitted payments, receipts and customer payments", () => {
    assert.equal(normalizeDraftPayment(draft({ docstatus: 1 })), null);
    assert.equal(normalizeDraftPayment(draft({ payment_type: "Receive" })), null);
    assert.equal(normalizeDraftPayment(draft({ party_type: "Customer" })), null);
    assert.equal(normalizeDraftPayment(null), null);
  });

  it("keeps a draft applied to no bill (the drawer's blank check)", () => {
    const d = normalizeDraftPayment(draft({ references: [] }));
    assert.deepEqual(d.references, []);
  });

  it("lists oldest first", () => {
    const out = normalizeDraftPayments([
      draft({ name: "B", posting_date: "2026-09-30" }),
      draft({ name: "A", posting_date: "2026-09-01" }),
      draft({ name: "X", docstatus: 1 }),
    ]);
    assert.deepEqual(out.map((d) => d.name), ["A", "B"]);
  });

  it("maps each bill to every draft covering it — two drafts on one bill is the double payment", () => {
    const drafts = normalizeDraftPayments([
      draft({ name: "P1" }),
      draft({
        name: "P2",
        references: [
          { reference_doctype: "Purchase Invoice", reference_name: "ACC-PINV-2026-00002", allocated_amount: 1 },
          { reference_doctype: "Purchase Invoice", reference_name: "ACC-PINV-2026-00009", allocated_amount: 2 },
          { reference_doctype: "Journal Entry", reference_name: "JV-1", allocated_amount: 3 },
        ],
      }),
    ]);
    const map = draftPaymentsByInvoice(drafts);
    assert.deepEqual(map.get("ACC-PINV-2026-00002"), ["P1", "P2"]);
    assert.deepEqual(map.get("ACC-PINV-2026-00009"), ["P2"]);
    assert.equal(map.has("JV-1"), false);
  });

  it("advises on a covered bill and stays silent otherwise", () => {
    assert.equal(draftPaymentAdvisory([]), null);
    assert.equal(draftPaymentAdvisory(undefined), null);
    const one = draftPaymentAdvisory(["P1"]);
    assert.equal(one.level, "warn");
    assert.match(one.title, /P1/);
    assert.match(draftPaymentAdvisory(["P1", "P2"]).title, /^2 draft payments/);
  });

  it("names the payment, vendor, amount and bills in the confirm", () => {
    const d = normalizeDraftPayment(draft());
    const sub = draftPaymentConfirmText(d, "submit");
    assert.match(sub, /ACC-PAY-2026-00004/);
    assert.match(sub, /\$563\.06/);
    assert.match(sub, /ACC-PINV-2026-00002/);
    assert.match(sub, /ledger/);
    assert.match(draftPaymentConfirmText(d, "delete"), /^Delete draft payment/);
    assert.match(
      draftPaymentConfirmText(normalizeDraftPayment(draft({ references: [] })), "delete"),
      /not applied to any bill/,
    );
  });
});
