import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PAY_FROM_ACCOUNT_TYPES,
  paidFromAccountFilters,
  checkDocLinkFilters,
} from "../src/payment-entry-link-filters.js";

describe("paidFromAccountFilters — Vanilla's own paid_from query", () => {
  it("excludes group accounts, which is the bug this exists to prevent", () => {
    // Dogfood 2026-09-08: picking "Bank Accounts - HI" (a group) failed only at submit with
    // "group accounts cannot be used in transactions". Vanilla never offers it.
    assert.equal(paidFromAccountFilters().is_group, 0);
  });

  it("offers Bank and Cash accounts when paying", () => {
    assert.deepEqual(paidFromAccountFilters({ paymentType: "Pay" }).account_type, [
      "in",
      ["Bank", "Cash"],
    ]);
    assert.deepEqual([...PAY_FROM_ACCOUNT_TYPES], ["Bank", "Cash"]);
  });

  it("defaults to Pay — this tranche is AP", () => {
    assert.deepEqual(paidFromAccountFilters().account_type, paidFromAccountFilters({ paymentType: "Pay" }).account_type);
  });

  it("Receive uses the party's own account type (AR, unbuilt but shaped)", () => {
    assert.deepEqual(
      paidFromAccountFilters({ paymentType: "Receive", partyType: "Customer" }).account_type,
      ["in", ["Receivable"]],
    );
    assert.deepEqual(
      paidFromAccountFilters({ paymentType: "Receive", partyType: "Supplier" }).account_type,
      ["in", ["Payable"]],
    );
  });

  it("an unknown party type still yields a usable filter, not undefined", () => {
    const f = paidFromAccountFilters({ paymentType: "Receive", partyType: "Shareholder" });
    assert.deepEqual(f.account_type, ["in", ["Payable"]]);
  });

  it("scopes by company when known", () => {
    assert.equal(paidFromAccountFilters({ company: "SANDBOX Co" }).company, "SANDBOX Co");
  });

  it("omits company entirely when unknown — an empty picker is worse than an unscoped one", () => {
    for (const company of [undefined, null, ""]) {
      assert.ok(!("company" in paidFromAccountFilters({ company })));
    }
  });

  it("does not mutate or share state between calls", () => {
    const a = paidFromAccountFilters();
    a.account_type[1].push("Equity");
    assert.deepEqual(paidFromAccountFilters().account_type[1], ["Bank", "Cash"]);
  });
});

describe("checkDocLinkFilters", () => {
  it("filters the Account picker", () => {
    assert.equal(checkDocLinkFilters("Account").is_group, 0);
  });

  it("leaves Mode of Payment unfiltered — Vanilla has no set_query for it either", () => {
    assert.equal(checkDocLinkFilters("Mode of Payment"), null);
  });

  it("junk doctype is unfiltered rather than an error", () => {
    assert.equal(checkDocLinkFilters(null), null);
    assert.equal(checkDocLinkFilters(undefined), null);
    assert.equal(checkDocLinkFilters(""), null);
  });
});
