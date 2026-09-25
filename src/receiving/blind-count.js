/**
 * A blind counting session: what the receiver has scanned and counted so far against one blind
 * sheet. Pure — every function takes a session and returns a new one; no DOM, no clock, no network.
 *
 * Built from the sheet model (`blind-po-sheet.js`), never from a raw Purchase Order, and it copies
 * only the fields it names, so the ordered quantity has no way in (spec §5, §7.4).
 *
 * The rules that are easy to get wrong (spec §7.4):
 *  - A line's count starts **blank, never 1**. A defaulted 1 gets accepted without looking.
 *  - Scanning the line already on screen adds one — the convenience path for scanning each unit.
 *    The first scan only selects the line, so the second one counts it too: five stickers scanned
 *    make five, while a single scan still leaves the count blank for the keypad. The spec says
 *    "rapid" re-scan; this deliberately has no clock, because a slow receiver's re-scan silently
 *    doing nothing is worse than none. Dropping the camera's repeat reads of one label is the
 *    camera layer's job (plan P5), not this module's.
 *  - Once a count has been typed, scanning that line again changes nothing and says so, so a habit
 *    re-scan cannot turn 12 into 13.
 *  - Anything that does not resolve to exactly one line stops the receiver with a reason. Nothing
 *    fails silently.
 */

import { parseLabelPayload } from "./label-payload.js";

/** What a scan did. The page gives each a distinct sound and message. */
export const SCAN = Object.freeze({
  SELECTED: "selected",
  ADDED_ONE: "added-one",
  ALREADY_KEYED: "already-keyed",
  CHOOSE_LINE: "choose-line",
  NOT_ON_ORDER: "not-on-order",
  REJECTED: "rejected",
});

/** Start counting against a sheet built by buildBlindPoSheet. */
export function startCount(sheet) {
  if (!sheet || !Array.isArray(sheet.lines)) throw new Error("blind count: start from a blind sheet");
  return {
    orderNumber: sheet.orderNumber,
    supplier: sheet.supplier,
    lineCount: sheet.lines.length,
    lines: sheet.lines.map((line) => ({
      lineNumber: line.lineNumber,
      itemNumber: line.itemNumber,
      description: line.description,
      unit: line.unit,
      counted: null,
      source: null,
    })),
    active: null,
    choosing: null,
  };
}

function withLine(session, lineNumber, change) {
  return {
    ...session,
    lines: session.lines.map((line) => (line.lineNumber === lineNumber ? { ...line, ...change } : line)),
  };
}

function lineAt(session, lineNumber) {
  const line = session.lines.find((l) => l.lineNumber === lineNumber);
  if (!line) throw new Error(`blind count: there is no line ${lineNumber} on ${session.orderNumber}`);
  return line;
}

function addOne(session, line) {
  if (line.source === "keyed") {
    return { session, outcome: { kind: SCAN.ALREADY_KEYED, lineNumber: line.lineNumber } };
  }
  const counted = line.counted === null ? 2 : line.counted + 1;
  return {
    session: withLine(session, line.lineNumber, { counted, source: "scan" }),
    outcome: { kind: SCAN.ADDED_ONE, lineNumber: line.lineNumber, counted },
  };
}

/**
 * Apply one scanned string. Returns `{ session, outcome }`; `outcome.kind` is one of SCAN.
 * A rejected or unmatched scan leaves the session exactly as it was.
 */
export function scan(session, payload, { prefix } = {}) {
  const parsed = parseLabelPayload(payload, { prefix });
  if (!parsed.ok) return { session, outcome: { kind: SCAN.REJECTED, reason: parsed.reason } };

  const matches = session.lines.filter((l) => l.itemNumber === parsed.itemNumber);
  if (matches.length === 0) {
    return { session, outcome: { kind: SCAN.NOT_ON_ORDER, itemNumber: parsed.itemNumber } };
  }

  const active = matches.find((l) => l.lineNumber === session.active);
  if (active) return addOne({ ...session, choosing: null }, active);

  if (matches.length > 1) {
    const lineNumbers = matches.map((l) => l.lineNumber);
    return {
      session: { ...session, choosing: { itemNumber: parsed.itemNumber, lineNumbers } },
      outcome: { kind: SCAN.CHOOSE_LINE, itemNumber: parsed.itemNumber, lineNumbers },
    };
  }

  const [line] = matches;
  return {
    session: { ...session, active: line.lineNumber, choosing: null },
    outcome: { kind: SCAN.SELECTED, lineNumber: line.lineNumber, counted: line.counted },
  };
}

/** Make a line the one on screen: after "which line?", or when tapped in the counted list. */
export function selectLine(session, lineNumber) {
  lineAt(session, lineNumber);
  if (session.choosing && !session.choosing.lineNumbers.includes(lineNumber)) {
    throw new Error(`blind count: line ${lineNumber} is not one of the lines being chosen between`);
  }
  return { ...session, active: lineNumber, choosing: null };
}

/**
 * Type a count on the keypad, for the line on screen unless another is named. Zero is a real
 * answer — nothing of that line arrived — and is kept distinct from blank.
 */
export function keyCount(session, value, { lineNumber = session.active } = {}) {
  if (lineNumber === null) throw new Error("blind count: no line is selected");
  lineAt(session, lineNumber);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`blind count: a count is a whole number of zero or more, not ${JSON.stringify(value)}`);
  }
  return withLine(session, lineNumber, { counted: value, source: "keyed" });
}

/** Put a line back to blank, as if it had never been counted. */
export function clearCount(session, lineNumber) {
  lineAt(session, lineNumber);
  return withLine(session, lineNumber, { counted: null, source: null });
}

/** "Lines counted / lines on the order" for the context bar, and whether Submit is allowed. */
export function progress(session) {
  const counted = session.lines.filter((l) => l.counted !== null).length;
  return { counted, lines: session.lineCount, canSubmit: counted > 0 };
}
