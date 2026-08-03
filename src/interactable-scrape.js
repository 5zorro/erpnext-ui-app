/**
 * Interactable scraper for HTML fixtures / Doc skin pages (OI-086 / plan B0.3).
 * Pure string parse — no DOM, no runtime scrape in production.
 *
 * Production warm-load uses curated inventories; this module runs in unit/CI
 * (and optional authoring) against golden HTML.
 */

/** @typedef {'none'|'tenkey'|'date'} ModeSwitch */
/**
 * @typedef {{
 *   id: string,
 *   tag: string,
 *   kind: string,
 *   field: string|null,
 *   testId: string|null,
 *   readOnly: boolean,
 *   disabled: boolean,
 *   inputMode: string|null,
 *   modeSwitch: ModeSwitch,
 * }} Interactable
 */

const VOIDISH = new Set(["input", "img", "br", "hr", "meta", "link"]);

/**
 * Remove comments, script/style bodies, and subtrees marked hidden.
 * @param {string} html
 * @returns {string}
 */
export function preprocessHtmlForScrape(html) {
  let s = String(html || "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style\b[\s\S]*?<\/style>/gi, "");
  // Commit-gate / overlays: drop whole blocks with [hidden] on the opening tag.
  s = stripElementsWithAttr(s, "hidden");
  return s;
}

/**
 * Drop elements whose opening tag includes a given boolean-ish attribute (and their contents).
 * Best-effort for static fixtures — not a full HTML parser.
 * @param {string} html
 * @param {string} attrName
 */
function stripElementsWithAttr(html, attrName) {
  const re = new RegExp(
    `<([a-zA-Z][\\w:-]*)\\b([^>]*\\s${attrName}\\b[^>]*)>`,
    "gi",
  );
  let out = html;
  let guard = 0;
  while (guard++ < 200) {
    re.lastIndex = 0;
    const m = re.exec(out);
    if (!m) break;
    const tag = m[1].toLowerCase();
    const start = m.index;
    const openEnd = m.index + m[0].length;
    if (VOIDISH.has(tag) || /\/\s*$/.test(m[0])) {
      out = out.slice(0, start) + out.slice(openEnd);
      continue;
    }
    const close = findMatchingClose(out, tag, openEnd);
    out = out.slice(0, start) + out.slice(close);
  }
  return out;
}

/**
 * @param {string} html
 * @param {string} tag
 * @param {number} from
 */
function findMatchingClose(html, tag, from) {
  const openRe = new RegExp(`<${tag}\\b[^>]*>`, "gi");
  const closeRe = new RegExp(`</${tag}\\s*>`, "gi");
  let depth = 1;
  let i = from;
  while (depth > 0 && i < html.length) {
    openRe.lastIndex = i;
    closeRe.lastIndex = i;
    const o = openRe.exec(html);
    const c = closeRe.exec(html);
    if (!c) return html.length;
    if (o && o.index < c.index) {
      depth += 1;
      i = o.index + o[0].length;
    } else {
      depth -= 1;
      i = c.index + c[0].length;
      if (depth === 0) return i;
    }
  }
  return html.length;
}

/**
 * @param {string} attrChunk
 * @returns {Record<string, string>}
 */
export function parseAttrs(attrChunk) {
  /** @type {Record<string, string>} */
  const attrs = {};
  const s = String(attrChunk || "");
  const re =
    /([:@]?[A-Za-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(s))) {
    const name = m[1].toLowerCase();
    const val = m[2] ?? m[3] ?? m[4] ?? "";
    attrs[name] = val;
  }
  return attrs;
}

/**
 * @param {Record<string, string>} attrs
 * @param {string} tag
 * @returns {ModeSwitch}
 */
export function inferModeSwitch(attrs, tag) {
  const inputmode = (attrs.inputmode || "").toLowerCase();
  const cls = attrs.class || "";
  const type = (attrs.type || "text").toLowerCase();
  const field = attrs["data-field"] || "";
  const testId = attrs["data-testid"] || "";
  const blob = `${field} ${testId}`;
  if (
    type === "date" ||
    /(^|[_-])date\b|due_date|posting_date|bill-date|due-date/.test(blob)
  ) {
    return "date";
  }
  if (
    inputmode === "decimal" ||
    /\bmoney-/.test(cls) ||
    field === "qty" ||
    field === "rate" ||
    field === "tax_amount" ||
    /amount-due|tax-amount|cell-qty|cell-rate/.test(testId)
  ) {
    return "tenkey";
  }
  if (inputmode === "numeric" || (tag === "input" && type === "number")) {
    return "tenkey";
  }
  return "none";
}

/**
 * @param {string} tag
 * @param {Record<string, string>} attrs
 * @returns {string}
 */
function inferKind(tag, attrs) {
  const type = (attrs.type || "text").toLowerCase();
  const role = (attrs.role || "").toLowerCase();
  if (tag === "button" || role === "button" || type === "button" || type === "submit") {
    return role === "tab" || attrs["data-tab"] != null ? "tab" : "button";
  }
  if (tag === "textarea") return "textarea";
  if (tag === "select") return "select";
  if (tag === "summary" || tag === "details") return "disclosure";
  if (tag === "a") return "link";
  if (inferModeSwitch(attrs, tag) === "tenkey") return "money";
  if (inferModeSwitch(attrs, tag) === "date") return "date";
  if (type === "checkbox" || type === "radio") return type;
  return "text";
}

/**
 * Stable id for curated matching.
 * @param {string} tag
 * @param {Record<string, string>} attrs
 * @param {number} ordinal
 */
export function interactableId(tag, attrs, ordinal) {
  if (attrs["data-testid"]) return attrs["data-testid"];
  if (attrs.id) return attrs.id;
  if (attrs["data-field"]) return `field:${attrs["data-field"]}`;
  if (attrs.name) return `name:${attrs.name}`;
  if (attrs["data-gate"]) return `gate:${attrs["data-gate"]}`;
  return `${tag}#${ordinal}`;
}

/**
 * @param {string} tag
 * @param {Record<string, string>} attrs
 * @returns {boolean}
 */
function isInteractableTag(tag, attrs) {
  const t = tag.toLowerCase();
  const type = (attrs.type || "text").toLowerCase();
  const role = (attrs.role || "").toLowerCase();
  if (t === "input") {
    if (type === "hidden") return false;
    return true;
  }
  if (t === "textarea" || t === "select" || t === "button") {
    return true;
  }
  // Prefer the details element (testid) over nested summary.
  if (t === "details" && (attrs["data-testid"] || attrs.id)) {
    return true;
  }
  if (t === "a" && attrs.href != null && attrs.href !== "" && attrs.href !== "#") {
    return true;
  }
  if (attrs.contenteditable === "true" || attrs.contenteditable === "") return true;
  if (
    role === "button" ||
    role === "tab" ||
    role === "textbox" ||
    role === "combobox" ||
    role === "searchbox" ||
    role === "checkbox" ||
    role === "menuitem"
  ) {
    return true;
  }
  return false;
}

/**
 * @param {string} tag
 * @param {Record<string, string>} attrs
 * @param {{ includeReadonly?: boolean, includeTabIndexNegative?: boolean }} opts
 */
function shouldKeep(tag, attrs, opts) {
  if (attrs.disabled != null && attrs.disabled !== "false") return false;
  const ro = attrs.readonly != null && attrs.readonly !== "false";
  if (ro && !opts.includeReadonly) return false;
  const ti = attrs.tabindex;
  if (ti === "-1" && !opts.includeTabIndexNegative && tag !== "button") {
    // Skip focus-stealing-excluded readouts (e.g. address projector).
    if (ro || tag === "input" || tag === "textarea") return false;
  }
  return true;
}

/**
 * Scrape interactables from an HTML string.
 * @param {string} html
 * @param {{
 *   includeReadonly?: boolean,
 *   includeTabIndexNegative?: boolean,
 *   preprocess?: boolean,
 * }} [options]
 * @returns {{ items: Interactable[], count: number }}
 */
export function scrapeInteractables(html, options = {}) {
  const opts = {
    includeReadonly: false,
    includeTabIndexNegative: false,
    preprocess: true,
    ...options,
  };
  const src = opts.preprocess ? preprocessHtmlForScrape(html) : String(html || "");
  const tagRe = /<\s*([a-zA-Z][\w:-]*)\b([^>]*)>/g;
  /** @type {Interactable[]} */
  const items = [];
  let ordinal = 0;
  let m;
  while ((m = tagRe.exec(src))) {
    const rawTag = m[1];
    const tag = rawTag.toLowerCase();
    if (tag === "script" || tag === "style") continue;
    const attrs = parseAttrs(m[2]);
    if (!isInteractableTag(tag, attrs)) continue;
    if (!shouldKeep(tag, attrs, opts)) continue;
    ordinal += 1;
    const id = interactableId(tag, attrs, ordinal);
    items.push({
      id,
      tag,
      kind: inferKind(tag, attrs),
      field: attrs["data-field"] || null,
      testId: attrs["data-testid"] || null,
      readOnly: attrs.readonly != null && attrs.readonly !== "false",
      disabled: attrs.disabled != null && attrs.disabled !== "false",
      inputMode: attrs.inputmode || null,
      modeSwitch: inferModeSwitch(attrs, tag),
    });
  }
  return { items, count: items.length };
}

/**
 * IDs found by scrape that are missing from curated.
 * @param {Iterable<{ id: string }>} scraped
 * @param {Iterable<{ id: string }>} curated
 * @returns {string[]}
 */
export function curatedMissingIds(scraped, curated) {
  const have = new Set([...curated].map((x) => x.id));
  /** @type {string[]} */
  const missing = [];
  for (const s of scraped) {
    if (!have.has(s.id)) missing.push(s.id);
  }
  return missing.sort();
}
