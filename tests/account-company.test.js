import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  annotateAccountLinkOptions,
  accountCompanyMismatchPickMessage,
  listAccountCompanyMismatchBlockers,
  accountNamesOnBillDoc,
  companiesEqual,
} from "../src/account-company.js";
import { linkOptionLabel, linkOptionClassNames } from "../src/link-search.js";

describe("account-company", () => {
  it("companiesEqual trims", () => {
    assert.equal(companiesEqual(" Demo ", "Demo"), true);
    assert.equal(companiesEqual("A", "B"), false);
    assert.equal(companiesEqual("", ""), false);
  });

  it("annotates mismatch and sorts Bill company first", () => {
    const out = annotateAccountLinkOptions(
      [
        { value: "Freight - HI", company: "HECSANDBOX INCORPORATED" },
        { value: "Freight - HID", company: "HECSANDBOX INCORPORATED (Demo)" },
      ],
      "HECSANDBOX INCORPORATED (Demo)",
    );
    assert.equal(out[0].value, "Freight - HID");
    assert.equal(out[0].companyMismatch, false);
    assert.equal(out[1].companyMismatch, true);
  });

  it("pick message names both companies", () => {
    const msg = accountCompanyMismatchPickMessage({
      account: "Freight - HI",
      accountCompany: "HECSANDBOX INCORPORATED",
      billCompany: "HECSANDBOX INCORPORATED (Demo)",
    });
    assert.match(msg, /Freight - HI/);
    assert.match(msg, /HECSANDBOX INCORPORATED \(Demo\)/);
    assert.match(msg, /mismatch/i);
  });

  it("lists tax and cash-bank blockers", () => {
    const blockers = listAccountCompanyMismatchBlockers({
      billCompany: "HECSANDBOX INCORPORATED (Demo)",
      accountHeads: ["Freight - HI", "Freight - HID"],
      cashBankAccount: "Bank - HI",
      accountCompanyByName: {
        "Freight - HI": "HECSANDBOX INCORPORATED",
        "Freight - HID": "HECSANDBOX INCORPORATED (Demo)",
        "Bank - HI": "HECSANDBOX INCORPORATED",
      },
    });
    assert.equal(blockers.length, 2);
    assert.match(blockers[0], /Taxes and Charges row 1/);
    assert.match(blockers[1], /Cash \/ Bank/);
  });

  it("accountNamesOnBillDoc collects unique heads", () => {
    assert.deepEqual(
      accountNamesOnBillDoc({
        taxes: [{ account_head: "A" }, { account_head: "A" }, { account_head: "B" }],
        cash_bank_account: "C",
      }),
      ["A", "B", "C"],
    );
  });

  it("link label/class show company mismatch cue", () => {
    const opt = {
      value: "Freight - HI",
      description: "Freight - HI",
      companyMismatch: true,
      company: "HECSANDBOX INCORPORATED",
    };
    assert.match(linkOptionLabel(opt), /other company|mismatch/i);
    assert.match(linkOptionClassNames(opt), /link-opt-muted/);
  });
});
