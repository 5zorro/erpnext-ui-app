/**
 * Bill credit memo (AP return / debit note) — pure classification + synthetic Sales Order link.
 * `is_return` / `return_against` are real ERPNext Purchase Invoice fields (OI-082 / OI-147).
 * The Sales Order bridge (OI-165) has no native ERPNext field, so it rides as a token line
 * inside `remarks` — visible in Vanilla too, not just this shell (2026-09-06 decision).
 */

export const CREDIT_MEMO_LABEL = "Vendor Credit";

/**
 * @param {object|null|undefined} doc
 * @returns {boolean}
 */
export function isCreditMemoBill(doc) {
  return !!(doc && Number(doc.is_return) === 1);
}

/**
 * @param {object|null|undefined} doc
 * @returns {string}
 */
export function creditMemoReturnAgainst(doc) {
  const v = doc && doc.return_against != null ? String(doc.return_against).trim() : "";
  return v;
}

/**
 * The failure mode this app's own dogfood reproduced (2026-09-06, ACC-PINV-2026-00232):
 * `is_return` set with no `return_against` — ERPNext silently posts to an accrual placeholder
 * GL account instead of the item's real expense account, with no error. See museum OI-147.
 * @param {object|null|undefined} doc
 * @returns {boolean}
 */
export function creditMemoOrphaned(doc) {
  return isCreditMemoBill(doc) && !creditMemoReturnAgainst(doc);
}

/**
 * Has the clerk actually typed lines onto this draft yet? A brand-new Purchase Invoice
 * arrives with one blank child row, which is *not* work worth protecting.
 * @param {object|null|undefined} doc
 * @returns {boolean}
 */
export function draftHasEnteredLines(doc) {
  const rows = doc && Array.isArray(doc.items) ? doc.items : [];
  // A missing numeric is "nothing entered", not NaN — Number(undefined) !== 0 is true, which
  // would call every blank row entered work and disable the native path outright.
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  return rows.some((r) => {
    if (!r || typeof r !== "object") return false;
    if (r.item_code != null && String(r.item_code).trim()) return true;
    const desc = r.description != null ? String(r.description).replace(/<[^>]*>/g, "").trim() : "";
    if (desc) return true;
    return num(r.qty) !== 0 || num(r.rate) !== 0 || num(r.amount) !== 0;
  });
}

/** @typedef {"native"|"informal"|"blocked"} CreditMemoSourcePlan */

/**
 * Which write path "pick the source Bill" should take when the clerk flips
 * **Credit memo? → Yes** on a Bill they started from scratch (OI-147).
 *
 * The two paths are not interchangeable:
 *
 * - **native** — ERPNext's own `make_debit_note` mapper. Sets the *real* `return_against`,
 *   carries the source items' `po_detail`/`pr_detail` links through, and therefore posts to
 *   the item's real expense account. But it rebuilds the form from the source Bill, so
 *   anything already typed on this draft is gone.
 * - **informal** — a `Linked Bill:` token in Remarks only. Keeps what the clerk typed, but
 *   leaves `return_against` empty, so the orphan warning (and the accrual-placeholder GL
 *   risk this module exists to flag) stays in force.
 *
 * Rule: never silently destroy entered lines. An untouched draft has nothing to lose and
 * gets the correct-GL native path; a draft with lines on it gets the informal path, and the
 * caller is expected to say why.
 *
 * @param {object|null|undefined} doc
 * @returns {CreditMemoSourcePlan}
 */
export function planCreditMemoSource(doc) {
  if (!doc || typeof doc !== "object") return "blocked";
  const ds = doc.docstatus;
  // Draft test mirrors bill-map.js isDraftBillDoc (new forms often omit docstatus).
  const isDraft = ds == null || ds === "" || Number(ds) === 0;
  if (!isDraft) return "blocked";
  return draftHasEnteredLines(doc) ? "informal" : "native";
}

/** @typedef {"bill"|"so"|"billRef"} InformalLinkKind */

/** @type {Record<InformalLinkKind, string>} */
const LINK_LABELS = {
  bill: "Linked Bill",
  so: "Linked Sales Order",
  // The returned Bill's own Supplier Invoice No. It lives here rather than in the credit
  // memo's `bill_no` field because a credit memo has its **own** Ref No — the vendor's credit
  // note number — and pre-filling that with the invoice being credited reads as an answer when
  // it is really a different document's number (5zorro 2026-09-09).
  billRef: "Ref No on returned Bill",
};

/**
 * Value shapes differ by kind: `bill` / `so` hold ERP document names, which never contain
 * whitespace, so the strict pattern keeps a malformed line from parsing as a link. A vendor's
 * invoice number is free text and routinely does contain spaces.
 * @type {Record<InformalLinkKind, string>}
 */
const LINK_VALUE_PATTERNS = { bill: "\\S+", so: "\\S+", billRef: ".+?" };

/** @param {string} s @returns {string} */
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** @param {InformalLinkKind} kind @returns {RegExp} */
function linkLineRe(kind) {
  const label = LINK_LABELS[kind];
  const value = LINK_VALUE_PATTERNS[kind] || "\\S+";
  return new RegExp(`^${escapeRe(label)}:\\s*(${value})\\s*$`, "m");
}

/**
 * @param {InformalLinkKind} kind
 * @param {string|null|undefined} name
 * @returns {string} e.g. "Linked Sales Order: SAL-ORD-2026-00123" (empty if no name given)
 */
export function buildLinkToken(kind, name) {
  const label = LINK_LABELS[kind];
  const n = name != null ? String(name).trim() : "";
  return label && n ? `${label}: ${n}` : "";
}

/**
 * @param {string|null|undefined} remarksText
 * @param {InformalLinkKind} kind
 * @returns {string} linked doc name, or "" if no token present
 */
export function parseLinkToken(remarksText, kind) {
  const label = LINK_LABELS[kind];
  if (!label) return "";
  const text = remarksText != null ? String(remarksText) : "";
  const m = text.match(linkLineRe(kind));
  return m ? m[1] : "";
}

/**
 * Remarks with one kind's token line removed — the other kind's token (if any) is untouched.
 * @param {string|null|undefined} remarksText
 * @param {InformalLinkKind} kind
 * @returns {string}
 */
export function stripLinkToken(remarksText, kind) {
  const label = LINK_LABELS[kind];
  const text = remarksText != null ? String(remarksText) : "";
  if (!label) return text;
  const re = linkLineRe(kind);
  return text
    .split("\n")
    .filter((line) => !re.test(line))
    .join("\n")
    .trim();
}

/**
 * Add (or replace) one kind's token line without disturbing the rest of the memo (incl. the
 * other kind's token, if present).
 * @param {string|null|undefined} remarksText
 * @param {InformalLinkKind} kind
 * @param {string|null|undefined} name
 * @returns {string}
 */
export function withLinkToken(remarksText, kind, name) {
  const clean = stripLinkToken(remarksText, kind);
  const token = buildLinkToken(kind, name);
  if (!token) return clean;
  return clean ? `${clean}\n${token}` : token;
}

// --- Sales Order (OI-165) — original names kept for callers/tests already using them ---

/** @param {string|null|undefined} soName @returns {string} */
export function buildSoLinkToken(soName) {
  return buildLinkToken("so", soName);
}
/** @param {string|null|undefined} remarksText @returns {string} */
export function parseSoLinkToken(remarksText) {
  return parseLinkToken(remarksText, "so");
}
/** @param {string|null|undefined} remarksText @returns {string} */
export function stripSoLinkToken(remarksText) {
  return stripLinkToken(remarksText, "so");
}
/** @param {string|null|undefined} remarksText @param {string|null|undefined} soName @returns {string} */
export function withSoLinkToken(remarksText, soName) {
  return withLinkToken(remarksText, "so", soName);
}

// --- Returned Bill's Ref No (5zorro 2026-09-09) — a note, never the credit's own bill_no ---

/** @param {string|null|undefined} refNo @returns {string} */
export function buildBillRefToken(refNo) {
  return buildLinkToken("billRef", refNo);
}
/** @param {string|null|undefined} remarksText @returns {string} */
export function parseBillRefToken(remarksText) {
  return parseLinkToken(remarksText, "billRef");
}
/** @param {string|null|undefined} remarksText @returns {string} */
export function stripBillRefToken(remarksText) {
  return stripLinkToken(remarksText, "billRef");
}
/** @param {string|null|undefined} remarksText @param {string|null|undefined} refNo @returns {string} */
export function withBillRefToken(remarksText, refNo) {
  return withLinkToken(remarksText, "billRef", refNo);
}

// --- Bill (OI-147/164 informal trace — "create a credit from nothing" then link it later) ---

/** @param {string|null|undefined} billName @returns {string} */
export function buildBillLinkToken(billName) {
  return buildLinkToken("bill", billName);
}
/** @param {string|null|undefined} remarksText @returns {string} */
export function parseBillLinkToken(remarksText) {
  return parseLinkToken(remarksText, "bill");
}
/** @param {string|null|undefined} remarksText @returns {string} */
export function stripBillLinkToken(remarksText) {
  return stripLinkToken(remarksText, "bill");
}
/** @param {string|null|undefined} remarksText @param {string|null|undefined} billName @returns {string} */
export function withBillLinkToken(remarksText, billName) {
  return withLinkToken(remarksText, "bill", billName);
}
