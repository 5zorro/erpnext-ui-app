/**
 * The internal label payload: a short company prefix, the item number exactly as it already
 * exists, and a trailing check character. Pure — no DOM, no network.
 *
 * Spec §4A.2 keeps the item number and the label payload as separate concepts: the item number is
 * the business identifier and never changes, the payload around it may change freely. Nothing here
 * rewrites an item number.
 */

/**
 * The 43 characters a check character can be computed over (the Code 39 set, in its standard
 * order). §4A.2 suggested mod-10 (Luhn), which is defined over digits only; mod-43 is the same
 * idea over a set that can also carry letters, and it behaves identically on an all-digit item
 * number — so it is the choice that does not have to be revisited once the real item numbers are
 * known. See open question R5 in the 2026-09-21 plan.
 *
 * TODO(R5, answered 2026-09-24): real item numbers are capitals, digits, dashes **and
 * underscores**. `_` is not in this set, so buildLabelPayload refuses any item number containing
 * one. Decide before printing labels: map `_` to a spare character, or compute the check over a
 * wider alphabet. Code 128 itself carries `_` fine; only the check character is the limit.
 */
export const LABEL_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%";

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

/** The mod-43 check character for a body of text, or null if the body is not encodable. */
export function labelCheckCharacter(body) {
  let sum = 0;
  for (const ch of body) {
    const value = LABEL_CHARSET.indexOf(ch);
    if (value < 0) return null;
    sum += value;
  }
  return LABEL_CHARSET[sum % 43];
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
