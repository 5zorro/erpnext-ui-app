/**
 * Postal address display helpers (Bill / PO Doc skins).
 * Pure — no DOM. ERPNext *_address_display HTML → USA-style multiline blocks.
 */

/** Countries treated as “home” — omit trailing country line (implied). */
const HOME_COUNTRY_ALIASES = new Set([
  "us",
  "usa",
  "u.s",
  "u.s.a",
  "u.s.a.",
  "united states",
  "united states of america",
]);

/**
 * @param {string} country
 * @returns {boolean}
 */
export function isHomeCountry(country) {
  const n = String(country || "")
    .trim()
    .toLowerCase()
    .replace(/\./g, "");
  return HOME_COUNTRY_ALIASES.has(n);
}

/**
 * Decode a few HTML entities common in Frappe address HTML.
 * @param {string} s
 */
function decodeBasicEntities(s) {
  return String(s || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"');
}

/**
 * Turn ERP address_display HTML into trimmed non-empty lines (preserves row breaks).
 * @param {string|null|undefined} html
 * @returns {string[]}
 */
export function addressHtmlToLines(html) {
  let s = String(html || "");
  s = s.replace(/<\s*br\s*\/?\s*>/gi, "\n");
  s = s.replace(/<\s*\/\s*p\s*>/gi, "\n");
  s = s.replace(/<\s*p\b[^>]*>/gi, "");
  s = s.replace(/<\s*\/?\s*div\b[^>]*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = decodeBasicEntities(s);
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return s
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
}

/**
 * USA-oriented block: keep multi-row body; drop trailing home-country line;
 * keep non-US country as its own visibility row.
 * @param {string[]} lines
 * @returns {string}
 */
export function formatAddressLines(lines) {
  const out = Array.isArray(lines) ? lines.map((l) => String(l).trim()).filter(Boolean) : [];
  if (out.length && isHomeCountry(out[out.length - 1])) {
    out.pop();
  }
  return out.join("\n");
}

/**
 * ERP HTML display → multiline plain text for Doc textarea projectors.
 * @param {string|null|undefined} html
 * @returns {string}
 */
export function formatAddressDisplay(html) {
  return formatAddressLines(addressHtmlToLines(html));
}

/**
 * Structured Address-like parts → USA multi-row block (for future Link snapshots).
 * Rows: title · attn · street(s) · City, ST ZIP · country if not USA.
 *
 * @param {{
 *   title?: string,
 *   attention?: string,
 *   line1?: string,
 *   line2?: string,
 *   city?: string,
 *   state?: string,
 *   pincode?: string,
 *   country?: string,
 * }} parts
 * @returns {string}
 */
export function formatUsAddressBlock(parts) {
  const p = parts && typeof parts === "object" ? parts : {};
  /** @type {string[]} */
  const lines = [];
  if (p.title && String(p.title).trim()) lines.push(String(p.title).trim());
  if (p.attention && String(p.attention).trim()) {
    const attn = String(p.attention).trim();
    lines.push(/^attn:/i.test(attn) ? attn : `attn:${attn}`);
  }
  if (p.line1 && String(p.line1).trim()) lines.push(String(p.line1).trim());
  if (p.line2 && String(p.line2).trim()) lines.push(String(p.line2).trim());
  const city = p.city != null ? String(p.city).trim() : "";
  const state = p.state != null ? String(p.state).trim() : "";
  const zip = p.pincode != null ? String(p.pincode).trim() : "";
  const cityLine = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  if (cityLine) lines.push(cityLine);
  if (p.country && String(p.country).trim() && !isHomeCountry(p.country)) {
    lines.push(String(p.country).trim());
  }
  return lines.join("\n");
}

/**
 * Suggested textarea rows: base 4; +1 when a non-home country line is present.
 * @param {string} formatted
 * @returns {number}
 */
export function addressTextareaRows(formatted) {
  const n = String(formatted || "")
    .split("\n")
    .filter((l) => l.trim()).length;
  return Math.max(4, Math.min(8, n || 4));
}
