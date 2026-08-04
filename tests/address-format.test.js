import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isHomeCountry,
  addressHtmlToLines,
  formatAddressLines,
  formatAddressDisplay,
  formatUsAddressBlock,
  addressTextareaRows,
} from "../src/address-format.js";

describe("isHomeCountry", () => {
  it("treats USA aliases as home", () => {
    assert.equal(isHomeCountry("United States"), true);
    assert.equal(isHomeCountry("USA"), true);
    assert.equal(isHomeCountry("us"), true);
    assert.equal(isHomeCountry("Canada"), false);
  });
});

describe("formatAddressDisplay", () => {
  it("keeps multi-row breaks from ERP HTML and drops USA country line", () => {
    const html =
      "<p>Three Little Pigs<br>attn:AR clerk<br>123 street addr<br>City, TX 77444-1234<br>United States</p>";
    assert.equal(
      formatAddressDisplay(html),
      "Three Little Pigs\nattn:AR clerk\n123 street addr\nCity, TX 77444-1234",
    );
  });

  it("keeps non-US country as its own row", () => {
    const html = "Acme Ltd<br>1 King St<br>Toronto, ON M5V 1E3<br>Canada";
    assert.equal(
      formatAddressDisplay(html),
      "Acme Ltd\n1 King St\nToronto, ON M5V 1E3\nCanada",
    );
  });

  it("returns empty for blank HTML", () => {
    assert.equal(formatAddressDisplay(""), "");
    assert.equal(formatAddressDisplay(null), "");
  });
});

describe("formatUsAddressBlock", () => {
  it("builds USA rows without country line", () => {
    assert.equal(
      formatUsAddressBlock({
        title: "Three Little Pigs",
        attention: "AR clerk",
        line1: "123 street addr",
        city: "City",
        state: "TX",
        pincode: "77444-1234",
        country: "United States",
      }),
      "Three Little Pigs\nattn:AR clerk\n123 street addr\nCity, TX 77444-1234",
    );
  });

  it("adds country row when not USA", () => {
    const text = formatUsAddressBlock({
      title: "Acme",
      line1: "1 King",
      city: "Toronto",
      state: "ON",
      pincode: "M5V",
      country: "Canada",
    });
    assert.match(text, /\nCanada$/);
  });
});

describe("addressTextareaRows", () => {
  it("grows with visible lines", () => {
    assert.equal(addressTextareaRows(""), 4);
    assert.equal(addressTextareaRows("a\nb\nc\nd\ne"), 5);
  });
});

describe("addressHtmlToLines / formatAddressLines", () => {
  it("splits br and strips tags", () => {
    assert.deepEqual(addressHtmlToLines("<b>A</b><br>B"), ["A", "B"]);
    assert.equal(formatAddressLines(["A", "USA"]), "A");
  });
});
