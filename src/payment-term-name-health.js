/**
 * Diagnostics for a Payment Term **name** (Packet C7).
 *
 * Two independent checks, both advisory, neither able to move a number:
 *
 * 1. `classifyPaymentTermName` — does the name's grace suffix satisfy the A2g grammar, refuse it,
 *    or make no claim at all? Feeds C4's chip and pre-fills C6's modal.
 * 2. `checkTermNameArithmetic` — does the name's own arithmetic agree with the term's `credit_days`?
 *    `NET_30_DAYS (POSTAL) +16` should be a 46-day term. A mismatch means someone edited one and
 *    not the other.
 *
 * 🔴 **Both are advisory and that is a deliberate downgrade.** Before the 2026-09-09 reversal, a
 * name the parser refused produced a wrong payment date and a wrong batch group, so C7 was specced
 * with a severity ranking, a float-stake table and a cancel-and-amend remedy. Grace now folds into
 * `credit_days` and ERPNext computes the due date, so the engine is correct either way and none of
 * that is warranted. What survives is a legibility problem: a name that says one thing while the
 * term does another will mislead the human reading it.
 *
 * 🔴 **The grammar lives in `payment-term-grace.js` and is imported, never restated.** A diagnostic
 * that can drift from the parser it diagnoses is worse than none, because a "your name is fine"
 * verdict from a second, subtly different grammar is believed. Same rule `explainPayByDate` follows
 * against `effectivePayByDate`.
 *
 * 🔴 **The false positive is the one that kills this feature.** Plenty of terms legitimately claim
 * no grace — `NET 45` is a real term, so is `NET_30_DAYS (ACH)`. Warning on those trains a clerk to
 * ignore the chip, and then the one that mattered is ignored with it. Every rule below is written
 * to stay silent when in doubt, and the tests carry an explicit negative-control list.
 */

import { parsePaymentTermGrace, stripGraceSuffix, withGraceSuffix } from "./payment-term-grace.js";

/**
 * The credit-period token in a term name: the number attached to `NET`.
 *
 * Accepts `_`, `-`, or a space as the separator, and tolerates an ordinal or unit tail, so all of
 * `NET_30_DAYS`, `NET 45`, `NET-45` and `NET_10TH` yield their number. Anchored on `NET` because
 * that is the only period word the convention uses; a name with no `NET` simply makes no arithmetic
 * claim, which is a legitimate state and not an error.
 *
 * `2%_10_NET_30` resolves to **30**, not 10 — the discount validity is not the credit period, and
 * matching on `NET` is what keeps the two apart.
 */
const CONTRACT_RE = /NET[-_ ]?(\d+)/i;

/** A signed integer standing as its own whitespace-delimited token. */
const SIGNED_TOKEN_RE = /(?:^|\s)([+-]\d+)(?=\s|$)/g;

/** A `+n` glued to the end of a word, e.g. `NET_30_DAYS+7`. */
const GLUED_PLUS_RE = /\S\+(\d+)/;

/** A `-n` glued to the end of a word, e.g. `NET_30_DAYS-3`. */
const GLUED_MINUS_RE = /\S-(\d+)/g;

/** A bare unsigned integer at the very end of the name, e.g. `NET_30_DAYS 7`. */
const TRAILING_BARE_INT_RE = /\s(\d+)\s*$/;

/**
 * @typedef {"parsed"|"no-claim"|"malformed"} PaymentTermNameState
 * @typedef {{
 *   state: PaymentTermNameState,
 *   confidence: "high"|"medium"|"low",
 *   reason: string,            // one sentence, renderable as-is in a chip balloon
 *   graceDays?: number,        // present only when state is "parsed" — what the engine reads
 *   intent?: number,           // present only when a malformed name has ONE evident reading
 *   proposedName?: string,     // present only alongside `intent` — the convention-shaped rewrite
 * }} PaymentTermNameHealth
 */

/**
 * Classify a Payment Term name against the `CREDIT_PERIOD (METHOD) ±GRACE` convention.
 *
 * Three states, and only one of them is a warning:
 *
 * | State | Example | Meaning |
 * |---|---|---|
 * | `parsed` | `NET_30_DAYS (POSTAL) -3` | the grammar read a grace suffix |
 * | `no-claim` | `NET 45`, `NET_30_DAYS (ACH)` | the name states no grace. **Silence here is a legitimate statement**, not an omission |
 * | `malformed` | `NET_30_DAYS -3 (POSTAL)` | a plausible grace token sits where the grammar refuses it, so the name reads as claiming something it does not |
 *
 * @param {string|null|undefined} termName
 * @returns {PaymentTermNameHealth}
 */
export function classifyPaymentTermName(termName) {
  const name = termName == null ? "" : String(termName).trim();
  if (!name) {
    return { state: "no-claim", confidence: "high", reason: "No Payment Term recorded." };
  }

  const parsed = parsePaymentTermGrace(name);
  if (parsed !== undefined) return classifyParsed(name, parsed);

  // Ordered most-confident first: the first rule that fires wins, so a name matching two patterns
  // is reported under the reading we are surest of rather than the last one checked.
  return (
    misplacedSignedToken(name) ||
    gluedPlus(name) ||
    gluedMinusAfterContract(name) ||
    trailingBareInteger(name) || {
      state: "no-claim",
      confidence: "high",
      reason: "This term states no grace period, which is a normal thing for a term to do.",
    }
  );
}

/**
 * The `parsed` verdict, plus the one caveat a passing name can still carry.
 *
 * `NET_30 +2 -3` satisfies the grammar — the suffix regex is end-anchored, so it reads `-3` and
 * ignores `+2`. The plan's original table wanted this refused as ambiguous, but the classifier
 * does **not** get to disagree with the parser: reporting "malformed" for a name the engine reads
 * fine would be the diagnostic drifting from the grammar, which is the failure this module exists
 * to avoid. So it reports what the engine actually did, and lowers confidence to say the name is
 * still worth a human's attention.
 *
 * @param {string} name @param {number} grace
 * @returns {PaymentTermNameHealth}
 */
function classifyParsed(name, grace) {
  const signedTokens = allMatches(SIGNED_TOKEN_RE, name);
  if (signedTokens.length > 1) {
    return {
      state: "parsed",
      confidence: "low",
      graceDays: grace,
      reason:
        `This name carries ${signedTokens.length} signed numbers (${signedTokens.map((m) => m[1]).join(", ")}). ` +
        `Only the last one counts as grace, so the engine reads ${signed(grace)}; the rest are decoration.`,
    };
  }
  return {
    state: "parsed",
    confidence: "high",
    graceDays: grace,
    reason: `Grace of ${signed(grace)} days, read from the end of the name.`,
  };
}

/**
 * `NET_30_DAYS -3 (POSTAL)` — the exact mistake the A2g grammar decision created, and the reason
 * 5zorro chose grace-last over grace-middle. High confidence: a whitespace-delimited signed integer
 * is not something a credit period ever contains, so its presence is deliberate and its position is
 * simply wrong.
 * @param {string} name
 * @returns {PaymentTermNameHealth|null}
 */
function misplacedSignedToken(name) {
  const tokens = allMatches(SIGNED_TOKEN_RE, name);
  if (!tokens.length) return null;
  if (tokens.length > 1) {
    return {
      state: "malformed",
      confidence: "medium",
      reason:
        `This name carries ${tokens.length} signed numbers (${tokens.map((m) => m[1]).join(", ")}) and none of ` +
        `them is last, so none is read as grace. Two readings are equally defensible, so nothing is proposed — ` +
        `decide which one is the grace period.`,
    };
  }
  const intent = Number(tokens[0][1]);
  const stripped = name.replace(tokens[0][0], tokens[0][0].startsWith(" ") ? " " : "");
  return {
    state: "malformed",
    confidence: "high",
    intent,
    proposedName: withGraceSuffix(collapseSpaces(stripped), intent),
    reason:
      `\`${tokens[0][1]}\` looks like a grace period but does not sit at the end of the name, so it is not read ` +
      `as one. Grace goes last, after the method.`,
  };
}

/**
 * `NET_30_DAYS+7`. A `+` never appears inside a credit period, so a glued one is unambiguous.
 * @param {string} name
 * @returns {PaymentTermNameHealth|null}
 */
function gluedPlus(name) {
  const m = GLUED_PLUS_RE.exec(name);
  if (!m) return null;
  const intent = Number(m[1]);
  return {
    state: "malformed",
    confidence: "high",
    intent,
    proposedName: withGraceSuffix(collapseSpaces(name.replace(`+${m[1]}`, "")), intent),
    reason:
      `\`+${m[1]}\` is joined to the word before it, so it is not read as grace — the grammar needs a space ` +
      `before the sign, or \`NET-45\` would read as a grace of −45.`,
  };
}

/**
 * `NET_30_DAYS-3` — a glued minus, but **only when it comes after the credit-period token**.
 *
 * 🔴 This asymmetry with `gluedPlus` is the single most important false-positive guard in the
 * module. A hyphen is an ordinary separator inside a period name: `NET-45` is a legitimate,
 * grace-free term whose hyphen-number **is** the credit period. Flagging it would mean warning on a
 * correct name, which is exactly the noise that gets the whole chip ignored. So a glued minus only
 * counts when a `NET<n>` token already appeared earlier in the name and the minus-number is a
 * *second* number after it. Confidence stays medium even then.
 * @param {string} name
 * @returns {PaymentTermNameHealth|null}
 */
function gluedMinusAfterContract(name) {
  const contract = CONTRACT_RE.exec(name);
  if (!contract) return null;
  const contractEnd = contract.index + contract[0].length;
  for (const m of allMatches(GLUED_MINUS_RE, name)) {
    if (m.index < contractEnd - 1) continue; // this IS the period token (`NET-45`), not grace
    const intent = -Number(m[1]);
    return {
      state: "malformed",
      confidence: "medium",
      intent,
      proposedName: withGraceSuffix(collapseSpaces(name.replace(`-${m[1]}`, "")), intent),
      reason:
        `\`-${m[1]}\` is joined to the word before it, so it is not read as grace. If it is meant as a grace ` +
        `period it needs a space before the sign.`,
    };
  }
  return null;
}

/**
 * `NET_30_DAYS 7` — a bare trailing integer, only suspicious when the name **already** stated its
 * credit period, so this second number has no other job. `NET 45` is excluded by that test: its
 * trailing integer is the period itself.
 *
 * No `intent` and no `proposedName`: `7` could mean `+7` or `-7`, and those are opposite
 * instructions — one pays a week late, the other a week early. Guessing between them is precisely
 * the silent wrong number the signed-token rule exists to prevent.
 * @param {string} name
 * @returns {PaymentTermNameHealth|null}
 */
function trailingBareInteger(name) {
  const m = TRAILING_BARE_INT_RE.exec(name);
  if (!m) return null;
  const contract = CONTRACT_RE.exec(name);
  if (!contract) return null;
  const trailingStart = name.length - m[0].length;
  if (trailingStart < contract.index + contract[0].length - 1) return null; // it IS the period
  return {
    state: "malformed",
    confidence: "low",
    reason:
      `\`${m[1]}\` trails the name with no sign, so it is not read as grace. Grace must say which direction it ` +
      `goes: \`+${m[1]}\` pays ${m[1]} days after the due date, \`-${m[1]}\` pays ${m[1]} days before it.`,
  };
}

/**
 * @typedef {{
 *   state: "agree"|"disagree"|"unknown",
 *   reason: string,
 *   nameImpliesDays?: number,  // contract + grace, read off the name
 *   creditDays?: number,       // what the term/schedule row actually carries
 *   deltaDays?: number,        // creditDays - nameImpliesDays
 * }} TermArithmeticCheck
 */

/**
 * Does the name's own arithmetic agree with the term's `credit_days`? (C7's surviving scope.)
 *
 * The convention folds grace into the credit period — `NET_30_DAYS (POSTAL) +16` is a **46-day
 * term** — so the name carries a checkable claim: `contract + grace === credit_days`. When they
 * disagree, somebody edited one and not the other.
 *
 * 🔴 **Advisory, and the engine is right either way.** ERPNext computes the due date from
 * `credit_days`; the name is a label. This check cannot and must not change a date. It exists
 * because a term whose name says 30 while it behaves as 46 will mislead every human who reads it,
 * and because it is the cheapest possible detector for a half-finished edit.
 *
 * Returns `unknown` — never `disagree` — whenever either side is missing. A name with no `NET`
 * token makes no claim to contradict.
 *
 * @param {{ paymentTerm?: string, creditDays?: number }|null|undefined} row a bill row or term
 * @returns {TermArithmeticCheck}
 */
export function checkTermNameArithmetic(row) {
  const r = row || {};
  const name = r.paymentTerm == null ? "" : String(r.paymentTerm).trim();
  const creditDays = Number(r.creditDays);

  if (!name) return { state: "unknown", reason: "No Payment Term recorded on this bill." };
  if (!Number.isFinite(creditDays)) {
    return { state: "unknown", reason: `\`${name}\` states no credit period to check the name against.` };
  }

  const contract = CONTRACT_RE.exec(name);
  if (!contract) {
    return {
      state: "unknown",
      creditDays,
      reason: `\`${name}\` does not name a credit period, so there is no arithmetic in it to check.`,
    };
  }

  const grace = parsePaymentTermGrace(name) ?? 0;
  const nameImpliesDays = Number(contract[1]) + grace;
  const deltaDays = creditDays - nameImpliesDays;

  if (deltaDays === 0) {
    return {
      state: "agree",
      nameImpliesDays,
      creditDays,
      deltaDays,
      reason: `\`${name}\` means ${contract[1]}${grace ? ` ${signed(grace)}` : ""} = ${nameImpliesDays} days, and the term is set to ${creditDays}.`,
    };
  }

  return {
    state: "disagree",
    nameImpliesDays,
    creditDays,
    deltaDays,
    reason:
      `\`${name}\` reads as ${contract[1]}${grace ? ` ${signed(grace)}` : ""} = ${nameImpliesDays} days, but the term is set to ` +
      `${creditDays} (${signed(deltaDays)}). The ${creditDays}-day figure is what ERPNext used for the due date; ` +
      `the name is the part that is wrong.`,
  };
}

/** Every match of a global regex, without leaving `lastIndex` set on the shared literal. */
function allMatches(re, s) {
  re.lastIndex = 0;
  const out = [];
  let m;
  while ((m = re.exec(s)) !== null) {
    out.push(m);
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  re.lastIndex = 0;
  return out;
}

/** @param {string} s */
function collapseSpaces(s) {
  return s.replace(/\s+/g, " ").trim();
}

/** @param {number} n */
function signed(n) {
  return n < 0 ? String(n) : `+${n}`;
}
