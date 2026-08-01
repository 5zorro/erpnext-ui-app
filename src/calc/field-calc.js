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
  isCalcOp,
  parseCalcNumber,
  decimalsForCalcField,
} from "./calc-engine.js";

/** @typedef {"idle"|"active"} FieldCalcMode */

/**
 * @typedef {{
 *   mode: FieldCalcMode,
 *   dialect: string,
 *   priorValue: string,
 *   session: import("./calc-engine.js").CalcSession|null,
 *   decimals: number|null,
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
 * }} FieldCalcResult
 */

/**
 * @param {string} [priorValue] field text at focus / before calc
 * @param {string} [dialect]
 * @param {{ decimals?: number|null, kind?: string }} [opts]
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
    { decimals: state && state.decimals != null ? state.decimals : null },
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
    const commitValue = formatCalcResult(out.result);
    return {
      state: createFieldCalcState(commitValue, st.dialect, { decimals: st.decimals }),
      action: "commit",
      commitValue,
      expression: calcFootingText(out.session),
      preview: commitValue,
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
      state: createFieldCalcState(st.priorValue, st.dialect, { decimals: st.decimals }),
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

  let session = createCalcSession(st.dialect, { decimals: st.decimals });
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
    },
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
