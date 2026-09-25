/**
 * The internal label payload: a short company prefix, the item number exactly as it already
 * exists, and a trailing check character. Pure — no DOM, no network.
 *
 * Spec §4A.2 keeps the item number and the label payload as separate concepts: the item number is
 * the business identifier and never changes, the payload around it may change freely. Nothing here
 * rewrites an item number.
 */

/**
 * The 43 characters a label may carry, in the order that gives each its value: Code 39's set with
 * the space replaced by an underscore. Real item numbers are capitals, digits, dashes and
 * underscores (5zorro, R5, 2026-09-24). The space had to go twice over: no item number uses one,
 * and as a check character it would print as nothing and be trimmed from any text box it was
 * typed into. Code 128, which prints the label, carries every one of these as an ordinary
 * character, so nothing is escaped or rewritten.
 */
export const LABEL_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-._$/+%";

/** Why a scanned string was not accepted. The app says something different for each. */
export const REJECTED = Object.freeze({
  EMPTY: "empty",
  NOT_OURS: "not-ours",
  TOO_SHORT: "too-short",
  BAD_CHARACTER: "bad-character",
  CHECK_FAILED: "check-failed",
});

function requirePrefix(prefix) {
  if (typeof prefix !== "string" || prefix.length === 0) {
    throw new Error("label payload: a company prefix is required");
  }
  return prefix;
}

/**
 * The check character for a body of text, or null if the body is not encodable.
 *
 * Each character's value is weighted by its position, the way Code 128 weights its own check, and
 * the sum is taken mod 43. Because 43 is prime and no weight is a multiple of it, changing any one
 * character always changes the result, and so does swapping any two different characters — the two
 * mistakes people make typing a code. §4A.2 asked for Luhn, which does the same job for digits only.
 */
export function labelCheckCharacter(body) {
  const modulus = LABEL_CHARSET.length;
  let sum = 0;
  let position = 0;
  for (const ch of body) {
    const value = LABEL_CHARSET.indexOf(ch);
    if (value < 0) return null;
    sum += value * ((position % (modulus - 1)) + 1);
    position += 1;
  }
  return LABEL_CHARSET[sum % modulus];
}

/**
 * Is this usable as the company prefix? Returns `{ ok: true, prefix }` or `{ ok: false, reason }`.
 * Kept short on purpose: every character of it is printed on every label (plan P1e).
 */
export function checkLabelPrefix(input) {
  const prefix = String(input ?? "").trim().toUpperCase();
  if (!prefix) return { ok: false, reason: "Enter the label prefix." };
  if (prefix.length > 4) return { ok: false, reason: "Keep the label prefix to 4 characters or fewer." };
  if ([...prefix].some((ch) => !LABEL_CHARSET.includes(ch))) {
    return { ok: false, reason: "The label prefix can use capital letters, digits and - . _ $ / + % only." };
  }
  return { ok: true, prefix };
}

/** prefix + item number + check character. Throws if the item number cannot be carried. */
export function buildLabelPayload(itemNumber, { prefix } = {}) {
  requirePrefix(prefix);
  if (typeof itemNumber !== "string" || itemNumber.length === 0) {
    throw new Error("label payload: nothing to encode");
  }
  const body = prefix + itemNumber;
  const check = labelCheckCharacter(body);
  if (check === null) {
    throw new Error(`label payload: ${JSON.stringify(itemNumber)} has a character no label can carry`);
  }
  return body + check;
}

/**
 * Take a scanned or typed string apart.
 *
 * Returns `{ ok: true, itemNumber }`, or `{ ok: false, reason }` using one of REJECTED. The two
 * failures the receiver sees most are deliberately distinct: NOT_OURS means they scanned a vendor's
 * own label and should scan the sheet instead, while CHECK_FAILED means a misread or a typo on the
 * same label and they should try again.
 */
export function parseLabelPayload(payload, { prefix } = {}) {
  requirePrefix(prefix);
  if (typeof payload !== "string" || payload.length === 0) {
    return { ok: false, reason: REJECTED.EMPTY };
  }
  if (!payload.startsWith(prefix)) {
    return { ok: false, reason: REJECTED.NOT_OURS };
  }
  if (payload.length < prefix.length + 2) {
    return { ok: false, reason: REJECTED.TOO_SHORT };
  }

  const body = payload.slice(0, -1);
  const check = labelCheckCharacter(body);
  if (check === null) {
    return { ok: false, reason: REJECTED.BAD_CHARACTER };
  }
  if (check !== payload.slice(-1)) {
    return { ok: false, reason: REJECTED.CHECK_FAILED };
  }
  return { ok: true, itemNumber: body.slice(prefix.length) };
}
