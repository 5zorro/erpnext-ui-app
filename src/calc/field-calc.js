/**
 * Pure keystroke reducer for in-field calculator JIT (Packet C1/C2).
 * Bill / PO / IR wires this; no DOM here.
 */
import {
  DIALECT_EXCEL,
  createCalcSession,
  seedExcelWithValue,
  feedCalcKey,
  calcFootingText,
  calcPreview,
  formatCalcResult,
  formatCalcDisplay,
  formatCalcOperand,
  isCalcOp,
  parseCalcNumber,
  decimalsForCalcField,
} from "./calc-engine.js";
import { roundByConvention, roundingRemainder, remainderNote } from "./site-rounding.js";

/** @typedef {"idle"|"active"} FieldCalcMode */

/**
 * @typedef {{
 *   mode: FieldCalcMode,
 *   dialect: string,
 *   priorValue: string,
 *   session: import("./calc-engine.js").CalcSession|null,
 *   decimals: number|null,
 *   rounding?: { precision: number, method?: string } | null,
 * }} FieldCalcState
 */

/**
 * @typedef {{
 *   state: FieldCalcState,
 *   action: "none"|"ignore"|"prevent"|"commit"|"cancel",
 *   commitValue?: string,
 *   expression?: string,
 *   preview?: string,
 *   allowDefault?: boolean,
 *   remainder?: string,
 *   exact?: string,
 * }} FieldCalcResult
 *   exact = the result before rounding (what ↩ resumes from, 5zorro 2026-10-25)
 */

/**
 * @param {string} [priorValue] field text at focus / before calc
 * @param {string} [dialect]
 * @param {{ decimals?: number|null, kind?: string, rounding?: { precision: number, method?: string } | null }} [opts]
 *   rounding = the places the box keeps and the site's method (site-rounding.js); without it the
 *   result goes in unrounded and ERPNext rounds it unseen.
 * @returns {FieldCalcState}
 */
export function createFieldCalcState(priorValue = "", dialect = DIALECT_EXCEL, opts = {}) {
  let decimals = opts.decimals != null && Number.isFinite(opts.decimals) ? opts.decimals : null;
  if (decimals == null && opts.kind) {
    decimals = decimalsForCalcField(opts.kind, priorValue);
  }
  return {
    mode: "idle",
    dialect: dialect === "standalone" ? "standalone" : DIALECT_EXCEL,
    priorValue: priorValue == null ? "" : String(priorValue),
    session: null,
    decimals,
    rounding: opts.rounding || null,
  };
}

/**
 * Reset when switching docs / skins / focus leaves without calc.
 * @param {FieldCalcState|null|undefined} state
 * @param {string} [priorValue]
 * @returns {FieldCalcState}
 */
export function resetFieldCalc(state, priorValue) {
  const dialect = state && state.dialect ? state.dialect : DIALECT_EXCEL;
  return createFieldCalcState(
    priorValue != null ? priorValue : state ? state.priorValue : "",
    dialect,
    { decimals: state && state.decimals != null ? state.decimals : null, rounding: state ? state.rounding : null },
  );
}

/**
 * Normalize a KeyboardEvent-like key to an engine feed token.
 * @param {string} key
 * @returns {string|null} null = not a calc key
 */
export function mapFieldCalcKey(key) {
  if (key == null) return null;
  const k = String(key);
  if (/^[0-9]$/.test(k)) return k;
  if (k === ".") return ".";
  if (k === "Decimal") return ".";
  if (isCalcOp(k)) return k;
  if (k === "=") return "=";
  if (k === "Enter") return "=";
  if (k === "Escape") return "Escape";
  if (k === "Backspace") return "Backspace";
  if (k === "Tab") return "Tab";
  if (k === "Clear" || k === "c" || k === "C") return "Clear";
  if (k === "Add") return "+";
  if (k === "Subtract") return "-";
  if (k === "Multiply") return "*";
  if (k === "Divide") return "/";
  return null;
}

/**
 * Finalize active calc (same as =). Used for Tab, click-away, and Enter.
 * @param {FieldCalcState} state
 * @returns {FieldCalcResult}
 */
export function commitFieldCalc(state) {
  const st = state || createFieldCalcState();
  if (st.mode !== "active" || !st.session) {
    return { state: st, action: "none" };
  }
  const out = feedCalcKey(st.session, "=");
  if (out.done && Number.isFinite(out.result)) {
    // What goes in is what ERPNext will store (R13-1); what rounding dropped is said, not hidden.
    const r = st.rounding;
    const kept = r ? roundByConvention(out.result, r) : out.result;
    const commitValue = formatCalcResult(kept);
    const dropped = r ? roundingRemainder(out.result, r) : null;
    return {
      state: createFieldCalcState(commitValue, st.dialect, { decimals: st.decimals, rounding: r }),
      action: "commit",
      commitValue,
      expression: calcFootingText(out.session),
      preview: r ? formatCalcDisplay(kept, st.decimals, r) : commitValue,
      exact: formatCalcResult(out.result),
      ...(dropped ? { remainder: remainderNote(dropped, r.precision) } : {}),
    };
  }
  return {
    state: { ...st, session: out.session },
    action: "prevent",
    expression: calcFootingText(out.session),
    preview: calcPreview(out.session),
  };
}

/**
 * Reduce one key while focused on an eligible numeric field.
 *
 * @param {FieldCalcState} state
 * @param {{ key: string, fieldValue: string }} ev
 *   fieldValue = input value *before* this key is applied by the browser
 * @returns {FieldCalcResult}
 */
export function reduceFieldCalc(state, ev) {
  const st = state || createFieldCalcState();
  const mapped = mapFieldCalcKey(ev && ev.key);
  const fieldValue = ev && ev.fieldValue != null ? String(ev.fieldValue) : "";

  if (mapped == null) {
    return { state: st, action: "none" };
  }

  // Idle: only operators start JIT (after a number is present or empty→0).
  if (st.mode === "idle") {
    if (mapped === "Escape" || mapped === "Tab") {
      return { state: st, action: "none" };
    }
    if (mapped === "=" && ev.key === "=") {
      // `=` opens the tape on the box's number, so a past calculation can be resumed (↩).
      // Enter maps to `=` too, but at rest it stays the page's Enter.
      return openTape(st, fieldValue);
    }
    if (mapped === "=" || mapped === "Enter") {
      return { state: st, action: "none" };
    }
    if (mapped === "Backspace" || mapped === "Clear" || /^[0-9.]$/.test(mapped)) {
      return { state: st, action: "none" };
    }
    if (isCalcOp(mapped)) {
      return startCalc(st, fieldValue, mapped);
    }
    return { state: st, action: "none" };
  }

  // Active: Esc only cancels. Tab / = / Enter commit.
  if (mapped === "Escape") {
    return {
      state: createFieldCalcState(st.priorValue, st.dialect, { decimals: st.decimals, rounding: st.rounding }),
      action: "cancel",
      commitValue: st.priorValue,
    };
  }

  if (mapped === "Tab") {
    const r = commitFieldCalc(st);
    if (r.action === "commit") return { ...r, allowDefault: true };
    return r;
  }

  if (mapped === "=") {
    return commitFieldCalc(st);
  }

  // Backspace edits only the live entry (before + / − / × / ÷ / = finalizes it).
  if (mapped === "Backspace") {
    const entry = st.session && st.session.entry != null ? String(st.session.entry) : "";
    if (!entry.length) {
      // Nothing to delete on this operand — keep tape; do not touch prior finalized lines.
      return {
        state: st,
        action: "prevent",
        expression: calcFootingText(st.session),
        preview: calcPreview(st.session),
      };
    }
    const out = feedCalcKey(st.session, "Backspace");
    const next = { ...st, session: out.session };
    return {
      state: next,
      action: "prevent",
      expression: calcFootingText(out.session),
      preview: calcPreview(out.session),
    };
  }

  const out = feedCalcKey(st.session, mapped);
  const next = { ...st, session: out.session };
  return {
    state: next,
    action: "prevent",
    expression: calcFootingText(out.session),
    preview: calcPreview(out.session),
  };
}

/**
 * @param {FieldCalcState} st
 * @param {string} fieldValue
 * @param {import("./calc-engine.js").CalcOp} op
 * @returns {FieldCalcResult}
 */
function startCalc(st, fieldValue, op) {
  let n = parseCalcNumber(fieldValue);
  if (n == null) {
    const trimmed = String(fieldValue).trim();
    if (trimmed === "") n = 0;
    else {
      return { state: st, action: "none" };
    }
  }

  let session = createCalcSession(st.dialect, { decimals: st.decimals, rounding: st.rounding });
  if (st.dialect === DIALECT_EXCEL) {
    session = seedExcelWithValue(session, n, op);
  } else {
    session = seedExcelWithValue(
      { ...session, dialect: "standalone" },
      n,
      op,
    );
    session = { ...session, dialect: "standalone" };
  }

  return {
    state: {
      mode: "active",
      dialect: st.dialect,
      priorValue: st.priorValue,
      session,
      decimals: st.decimals,
      rounding: st.rounding,
    },
    action: "prevent",
    expression: calcFootingText(session),
    preview: calcPreview(session),
  };
}

/**
 * `=` on a box at rest: the tape opens on its number, nothing pending. Enter puts it back as it was;
 * an operator carries on from it; ↩ on a past calculation replaces it ({@link resumeFieldCalc}).
 * @param {FieldCalcState} st
 * @param {string} fieldValue
 * @returns {FieldCalcResult}
 */
function openTape(st, fieldValue) {
  const trimmed = String(fieldValue).trim();
  const n = trimmed === "" ? 0 : parseCalcNumber(fieldValue);
  if (n == null) return { state: st, action: "none" };
  const session = {
    ...createCalcSession(st.dialect, { decimals: st.decimals, rounding: st.rounding }),
    total: n,
    parts: [formatCalcOperand(n, st.decimals)],
  };
  return {
    state: { ...st, mode: "active", session },
    action: "prevent",
    expression: calcFootingText(session),
    preview: calcPreview(session),
  };
}

/**
 * ↩ on a past calculation in the tape's history (5zorro 2026-10-25): carry on from its result
 * **before rounding**, in place of the rounded number the box holds. An operator already typed
 * stays pending; the past tape is not replayed, only its exact result.
 * @param {FieldCalcState} st an active calculation
 * @param {string} exactText the past calculation's unrounded result
 * @returns {FieldCalcResult}
 */
export function resumeFieldCalc(st, exactText) {
  const n = parseCalcNumber(exactText);
  if (!st || st.mode !== "active" || !st.session || n == null) return { state: st, action: "none" };
  const op = st.session.pendingOp;
  const session = {
    ...st.session,
    total: n,
    entry: "",
    parts: op ? [formatCalcResult(n), op] : [formatCalcResult(n)],
  };
  return {
    state: { ...st, session },
    action: "prevent",
    expression: calcFootingText(session),
    preview: calcPreview(session),
  };
}

/**
 * Whether a Doc field should offer JIT calc.
 * @param {string|null|undefined} kind "amountDue" | "qty" | "rate" | "amount" (back-in) | other
 */
export function isCalcEligibleField(kind) {
  return kind === "amountDue" || kind === "qty" || kind === "rate" || kind === "amount";
}

/**
 * A sum typed into a box the calculator never saw — pasted, or typed before the calculator was on
 * that box (5zorro 2026-10-11: `169.00*1.0845` in the taxes Amount, then Add did nothing). Same
 * engine and same left-to-right math as the calculator. Commas, spaces and `$` are ignored.
 * @param {string|null|undefined} text
 * @returns {number|null} null = not a sum (a plain number is not a sum either: parse it as money)
 */
export function evaluateTypedSum(text) {
  const s = String(text ?? "").replace(/[\s,$]/g, "");
  if (!/^[0-9.+\-*/]+$/.test(s) || !/[0-9.][+\-*/]/.test(s) || !/[0-9.]$/.test(s)) return null;
  let session = createCalcSession(DIALECT_EXCEL);
  for (const ch of s) {
    const out = feedCalcKey(session, ch);
    if (out.error) return null;
    session = out.session;
  }
  const end = feedCalcKey(session, "=");
  return end.done && Number.isFinite(end.result) ? end.result : null;
}
