/**
 * Code 128, code set B — pure encoder. Emits module strings and SVG markup; never touches the DOM,
 * so it runs under `node --test` and in the phone page unchanged.
 *
 * Symbol table is ISO/IEC 15417's; it is machine-transcribed from an independent implementation and
 * every entry is re-checked structurally by the unit tests (11 modules, leading bar, even bar parity).
 */

/** Module patterns by symbol value. "1" is a bar module, "0" a space module. */
const PATTERNS = Object.freeze([
  "11011001100", "11001101100", "11001100110", "10010011000",
  "10010001100", "10001001100", "10011001000", "10011000100",
  "10001100100", "11001001000", "11001000100", "11000100100",
  "10110011100", "10011011100", "10011001110", "10111001100",
  "10011101100", "10011100110", "11001110010", "11001011100",
  "11001001110", "11011100100", "11001110100", "11101101110",
  "11101001100", "11100101100", "11100100110", "11101100100",
  "11100110100", "11100110010", "11011011000", "11011000110",
  "11000110110", "10100011000", "10001011000", "10001000110",
  "10110001000", "10001101000", "10001100010", "11010001000",
  "11000101000", "11000100010", "10110111000", "10110001110",
  "10001101110", "10111011000", "10111000110", "10001110110",
  "11101110110", "11010001110", "11000101110", "11011101000",
  "11011100010", "11011101110", "11101011000", "11101000110",
  "11100010110", "11101101000", "11101100010", "11100011010",
  "11101111010", "11001000010", "11110001010", "10100110000",
  "10100001100", "10010110000", "10010000110", "10000101100",
  "10000100110", "10110010000", "10110000100", "10011010000",
  "10011000010", "10000110100", "10000110010", "11000010010",
  "11001010000", "11110111010", "11000010100", "10001111010",
  "10100111100", "10010111100", "10010011110", "10111100100",
  "10011110100", "10011110010", "11110100100", "11110010100",
  "11110010010", "11011011110", "11011110110", "11110110110",
  "10101111000", "10100011110", "10001011110", "10111101000",
  "10111100010", "11110101000", "11110100010", "10111011110",
  "10111101110", "11101011110", "11110101110", "11010000100",
  "11010010000", "11010011100",
]);

/** Stop character plus the two bars that always close a Code 128 symbol. */
const TERMINATOR = "1100011101011";

const START_B = 104;
const LOWEST_B = 32;
const HIGHEST_B = 126;

/** True when every character can be carried by code set B. */
export function encodableCode128B(text) {
  if (typeof text !== "string" || text.length === 0) return false;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code < LOWEST_B || code > HIGHEST_B) return false;
  }
  return true;
}

function assertEncodable(text) {
  if (typeof text !== "string" || text.length === 0) {
    throw new Error("Code 128: nothing to encode");
  }
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code < LOWEST_B || code > HIGHEST_B) {
      throw new Error(`Code 128: ${JSON.stringify(ch)} is outside code set B`);
    }
  }
}

/** Symbol values for the text, without start, check or stop. */
export function code128BValues(text) {
  assertEncodable(text);
  return [...text].map((ch) => ch.codePointAt(0) - LOWEST_B);
}

/** The mod-103 check symbol the decoder verifies before it will emit a read. */
export function code128CheckValue(text) {
  const values = code128BValues(text);
  let sum = START_B;
  values.forEach((value, index) => {
    sum += value * (index + 1);
  });
  return sum % 103;
}

/** The full symbol as module characters: "1" bar, "0" space. */
export function code128Modules(text) {
  const values = code128BValues(text);
  const symbols = [START_B, ...values, code128CheckValue(text)];
  return symbols.map((value) => PATTERNS[value]).join("") + TERMINATOR;
}

/**
 * SVG markup for the symbol. `quietZone` is in modules and defaults to the 10 the standard
 * requires — a barcode printed hard against a table border is the classic unreadable label.
 */
export function code128Svg(text, options = {}) {
  const { moduleWidth = 2, height = 56, quietZone = 10, title = "" } = options;
  const modules = code128Modules(text);
  const totalModules = modules.length + quietZone * 2;
  const width = totalModules * moduleWidth;

  const bars = [];
  let index = 0;
  while (index < modules.length) {
    if (modules[index] === "0") {
      index += 1;
      continue;
    }
    let run = 0;
    while (index + run < modules.length && modules[index + run] === "1") run += 1;
    const x = (quietZone + index) * moduleWidth;
    bars.push(`<rect x="${x}" y="0" width="${run * moduleWidth}" height="${height}"/>`);
    index += run;
  }

  const label = title ? `<title>${title.replace(/[<>&]/g, "")}</title>` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" role="img" shape-rendering="crispEdges" fill="#000">` +
    `${label}${bars.join("")}</svg>`
  );
}
