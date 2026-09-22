import test from "node:test";
import assert from "node:assert/strict";

import {
  code128BValues,
  code128CheckValue,
  code128Modules,
  code128Svg,
  encodableCode128B,
} from "../src/receiving/code128.js";

/**
 * Module strings produced by an independent Code 128 implementation (python-barcode 0.16),
 * recorded 2026-09-21. An encoder that agrees with a second implementation on these is the
 * closest thing to proof available without a printer and a scanner.
 *
 * Only payloads the reference also encoded in code set B alone are listed. On digit runs it
 * switches to code set C, which is a narrower but equally valid symbol for the same data — so a
 * mismatch there would say nothing about correctness. Round-trip decoding below covers those.
 */
const REFERENCE = [
  { text: "TEST", modules: "1101001000011011100010100011010001101110100011011100010110010100001100011101011" },
  { text: "A", modules: "1101001000010100011000100010110001100011101011" },
  {
    text: "ABC 123",
    modules:
      "1101001000010100011000100010110001000100011011011001100100111001101100111001011001011100110011100101100011101011",
  },
  {
    text: "!#$%&*+",
    modules:
      "1101001000011001101100100100110001001000110010001001100100110010001100100010011000100100110011011001100011101011",
  },
  {
    text: "AC-DELCO-PF46",
    modules:
      "1101001000010100011000100010001101001101110010110001000100011010001000110111010001000110100011101101001101110011101110110100011000101100100111011001110100100110011101100011101011",
  },
  { text: "Q", modules: "1101001000011010001110110001011101100011101011" },
  { text: "~}|{", modules: "1101001000010001011110101000111101010111100011110110110111101010001100011101011" },
  { text: "0", modules: "1101001000010011101100100111001101100011101011" },
  {
    text: "MOTORCRAFT FL-820S",
    modules:
      "11010010000101110110001000111011011011100010100011101101100010111010001000110110001011101010001100010001100010110111000101101100110010001100010100011011101001101110011101001100110011100101001110110011011101000110010010001100011101011",
  },
];

/** Split a symbol back into 11-module chunks, dropping the two bars that close it. */
function symbolsOf(modules) {
  return modules.slice(0, -2).match(/.{11}/g);
}

/** Symbol value → the single character that encodes to it, derived from the encoder itself. */
const VALUE_OF_SYMBOL = new Map(
  Array.from({ length: 95 }, (_, i) => {
    const ch = String.fromCharCode(32 + i);
    return [symbolsOf(code128Modules(ch))[1], ch];
  }),
);

test("agrees with an independent implementation on every reference vector", () => {
  for (const { text, modules } of REFERENCE) {
    assert.equal(code128Modules(text), modules, `mismatch encoding ${JSON.stringify(text)}`);
  }
});

test("every symbol decodes back to the payload it was built from", () => {
  const symbolOfValue = new Map(
    [...VALUE_OF_SYMBOL].map(([symbol, ch]) => [ch.charCodeAt(0) - 32, symbol]),
  );
  const startB = symbolsOf(code128Modules("A"))[0];

  for (const text of ["P-10042-7", "ZZ-9988-QQ", "0123456789", "Widget/Blue-12", "1"]) {
    const chunks = symbolsOf(code128Modules(text));
    const data = chunks.slice(1, -2);

    assert.equal(chunks[0], startB, `${text} must start in code set B`);
    assert.equal(chunks.at(-1), "11000111010", `${text} must end with the stop character`);
    assert.equal(data.map((symbol) => VALUE_OF_SYMBOL.get(symbol)).join(""), text);

    const checkValue = code128CheckValue(text);
    if (symbolOfValue.has(checkValue)) {
      assert.equal(chunks.at(-2), symbolOfValue.get(checkValue), `${text} check symbol`);
    }
  }
});

test("every symbol table entry satisfies the ISO/IEC 15417 invariants", () => {
  // Reachable through the encoder: one character per code set B value, plus start/check/stop.
  const everyCharacter = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("");
  const modules = code128Modules(everyCharacter);

  assert.equal(modules.length % 11, 2, "symbol length is whole symbols plus the two closing bars");

  const symbols = modules.slice(0, -2).match(/.{11}/g);
  for (const symbol of symbols) {
    assert.equal(symbol.length, 11);
    assert.equal(symbol[0], "1", `symbol ${symbol} must start with a bar`);
    const barModules = symbol.split("").filter((m) => m === "1").length;
    assert.equal(barModules % 2, 0, `symbol ${symbol} must carry an even number of bar modules`);
  }
});

test("symbol length is start + data + check + stop", () => {
  for (const text of ["A", "TEST", "Widget/Blue-12"]) {
    assert.equal(code128Modules(text).length, 11 * text.length + 35);
  }
});

test("code set B values are the character minus the space", () => {
  assert.deepEqual(code128BValues(" !A"), [0, 1, 33]);
});

test("check value is the mod-103 weighted sum, start symbol included", () => {
  // "TEST" = 52, 37, 51, 52 weighted 1..4, started at 104.
  const expected = (104 + 52 * 1 + 37 * 2 + 51 * 3 + 52 * 4) % 103;
  assert.equal(code128CheckValue("TEST"), expected);
  assert.ok(code128CheckValue("TEST") >= 0 && code128CheckValue("TEST") < 103);
});

test("a changed character changes the check value", () => {
  // This is the property that makes a garbled read impossible to pass off as a good one.
  assert.notEqual(code128CheckValue("P-10042-7"), code128CheckValue("P-10043-7"));
});

test("refuses what code set B cannot carry", () => {
  assert.equal(encodableCode128B("P-10042-7"), true);
  assert.equal(encodableCode128B("café"), false);
  assert.equal(encodableCode128B(""), false);
  assert.equal(encodableCode128B(null), false);

  assert.throws(() => code128Modules(""), /nothing to encode/);
  assert.throws(() => code128Modules("café"), /outside code set B/);
});

test("svg carries a quiet zone and one rect per run of bars", () => {
  const svg = code128Svg("A", { moduleWidth: 2, height: 40, quietZone: 10 });
  const modules = code128Modules("A");
  const expectedWidth = (modules.length + 20) * 2;

  assert.match(svg, new RegExp(`width="${expectedWidth}"`));
  assert.match(svg, /height="40"/);
  assert.equal(svg.match(/<rect /g).length, modules.match(/1+/g).length);
  // First bar sits one quiet zone in, never at x=0.
  assert.match(svg, /<rect x="20" /);
});

test("svg defaults to the quiet zone the standard requires", () => {
  const svg = code128Svg("A");
  const expectedWidth = (code128Modules("A").length + 20) * 2;
  assert.match(svg, new RegExp(`width="${expectedWidth}"`));
});
