/**
 * Pure calculator engine (Packet C / OI-018).
 * No DOM. Dialects share left-to-right running-total math (10-key / QB muscle memory),
 * not spreadsheet operator precedence.
 *
 * - excel: infix start — type `100+25=` (number before first operator).
 * - standalone: optional leading operator — `+1-2=` (adding-machine style).
 */

export const DIALECT_EXCEL = "excel";
export const DIALECT_STANDALONE = "standalone";

/** @typedef {"excel"|"standalone"} CalcDialect */
/** @typedef {"+"|"-"|"*"|"/"} CalcOp */

export const CALC_OPS = Object.freeze(["+", "-", "*", "/"]);

/**
 * @param {string} ch
 * @returns {ch is CalcOp}
 */
export function isCalcOp(ch) {
  return ch === "+" || ch === "-" || ch === "*" || ch === "/";
}

/**
 * @param {number} a
 * @param {CalcOp} op
 * @param {number} b
 * @returns {number}
 */
export function applyOp(a, op, b) {
  switch (op) {
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "*":
      return a * b;
    case "/":
      if (b === 0) return NaN;
      return a / b;
    default:
      return NaN;
  }
}

/**
 * @param {unknown} raw
 * @returns {number|null}
 */
export function parseCalcNumber(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = String(raw).replace(/[\s,]/g, "").trim();
  if (s === "" || s === "-" || s === "." || s === "-.") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Format a finite result for field commit (trim trailing zeros sensibly).
 * @param {number} n
 * @returns {string}
 */
export function formatCalcResult(n) {
  if (!Number.isFinite(n)) return "";
  const rounded = Math.round(n * 1e10) / 1e10;
  if (Object.is(rounded, -0)) return "0";
  const s = String(rounded);
  if (!s.includes("e") && !s.includes("E")) return s;
  return rounded.toFixed(10).replace(/\.?0+$/, "");
}

/**
 * Display format for tape / preview while on a Doc field.
 * @param {number} n
 * @param {number|null|undefined} decimals fixed places when set (money → 2)
 * @returns {string}
 */
export function formatCalcDisplay(n, decimals) {
  if (!Number.isFinite(n)) return "";
  if (decimals == null || !Number.isFinite(decimals)) return formatCalcResult(n);
  const d = Math.max(0, Math.min(8, Math.floor(decimals)));
  const factor = 10 ** d;
  const rounded = Math.round(n * factor) / factor;
  if (Object.is(rounded, -0)) return (0).toFixed(d);
  return rounded.toFixed(d);
}

/**
 * Infer fraction digits from a typed/sample value; null if none.
 * @param {unknown} sample
 * @returns {number|null}
 */
export function fractionDigitsFromSample(sample) {
  if (sample == null || sample === "") return null;
  const s = String(sample).replace(/,/g, "").trim();
  const m = /\.(\d+)/.exec(s);
  return m ? m[1].length : null;
}

/**
 * Default tape precision for a Doc calc field kind.
 * Money-like fields stay at 2 while on-page; qty follows the sample.
 * @param {string} kind
 * @param {unknown} [sampleValue]
 * @returns {number|null}
 */
export function decimalsForCalcField(kind, sampleValue) {
  if (kind === "amountDue" || kind === "rate" || kind === "amount") return 2;
  if (kind === "qty") {
    const d = fractionDigitsFromSample(sampleValue);
    return d == null ? 0 : d;
  }
  return fractionDigitsFromSample(sampleValue);
}

/**
 * @typedef {{
 *   dialect: CalcDialect,
 *   total: number|null,
 *   pendingOp: CalcOp|null,
 *   entry: string,
 *   parts: string[],
 *   decimals: number|null,
 * }} CalcSession
 */

/**
 * @param {CalcDialect} [dialect]
 * @param {{ decimals?: number|null }} [opts]
 * @returns {CalcSession}
 */
export function createCalcSession(dialect = DIALECT_EXCEL, opts = {}) {
  const d = dialect === DIALECT_STANDALONE ? DIALECT_STANDALONE : DIALECT_EXCEL;
  return {
    dialect: d,
    total: null,
    pendingOp: null,
    entry: "",
    parts: [],
    decimals: opts.decimals != null && Number.isFinite(opts.decimals) ? opts.decimals : null,
  };
}

/**
 * Seed Excel session from the number already in the field when the first op is pressed.
 * @param {CalcSession} session
 * @param {number} value
 * @param {CalcOp} op
 * @returns {CalcSession}
 */
export function seedExcelWithValue(session, value, op) {
  const n = Number(value);
  if (!Number.isFinite(n) || !isCalcOp(op)) return session;
  const decimals = session.decimals;
  return {
    ...session,
    dialect: DIALECT_EXCEL,
    total: n,
    pendingOp: op,
    entry: "",
    parts: [formatCalcDisplay(n, decimals), op],
  };
}

/**
 * Human-readable expression for overlay — horizontal (tests / compact).
 * @param {CalcSession} session
 * @returns {string}
 */
export function calcExpression(session) {
  if (!session) return "";
  const bits = session.parts.slice();
  if (session.entry !== "") bits.push(session.entry);
  return bits.join(" ");
}

/**
 * Vertical footing lines (spreadsheet / 10-key tape), e.g.
 *   10+
 *   4110+
 *   300
 * Result stays separate (below / in the field).
 * @param {CalcSession} session
 * @returns {string[]}
 */
export function calcFootingLines(session) {
  if (!session) return [];
  /** @type {string[]} */
  const lines = [];
  const parts = session.parts || [];
  let i = 0;
  while (i < parts.length) {
    const bit = String(parts[i]);
    if (isCalcOp(bit)) {
      if (lines.length === 0) lines.push(bit);
      else lines[lines.length - 1] = `${lines[lines.length - 1]}${bit}`;
      i += 1;
      continue;
    }
    const next = i + 1 < parts.length ? String(parts[i + 1]) : "";
    if (next && isCalcOp(next)) {
      lines.push(`${bit}${next}`);
      i += 2;
    } else {
      lines.push(bit);
      i += 1;
    }
  }
  if (session.entry !== "") {
    lines.push(formatEntryForTape(session.entry, session.decimals));
  }
  return lines;
}

/**
 * @param {CalcSession} session
 * @returns {string} newline-joined footing (decimal-aligned)
 */
export function calcFootingText(session) {
  return alignDecimalFooting(calcFootingLines(session));
}

/**
 * Format the live entry for the footing tape.
 * Keep raw digits while typing so Backspace matches what the clerk sees;
 * completed operands in `parts` are already display-formatted when an op lands.
 * @param {string} entry
 * @param {number|null|undefined} _decimals unused (kept for call-site stability)
 * @returns {string}
 */
export function formatEntryForTape(entry, _decimals) {
  const e = entry == null ? "" : String(entry);
  return e;
}

/**
 * Value shown as “running” answer while typing the current entry.
 * Live entry stays raw (Backspace-editable). Empty entry after an op → blank
 * (not the prior total), so the field is ready for the next number.
 * @param {CalcSession} session
 * @returns {string}
 */
export function calcPreview(session) {
  if (!session) return "";
  if (session.entry !== "") {
    return session.entry;
  }
  // Mid-chord waiting for the next operand — don't paint the prior total into the field.
  if (session.pendingOp != null) return "";
  if (session.total != null) return formatCalcDisplay(session.total, session.decimals);
  return "";
}

/**
 * Align footing lines on the decimal point (monospace pad).
 * Trailing ops stay in a fixed-width suffix column (`104.00+`) so every line
 * has the same length — decimals stay aligned with text-align left *or* right.
 * @param {string[]} lines
 * @returns {string}
 */
export function alignDecimalFooting(lines) {
  const list = Array.isArray(lines) ? lines : [];
  const metrics = footingAlignMetrics(list);
  return list.map((line) => formatAlignedFootingLine(line, metrics)).join("\n");
}

/**
 * @typedef {{
 *   maxInt: number,
 *   maxFrac: number,
 *   maxSuffix: number,
 *   showDot: boolean,
 *   width: number,
 * }} FootingAlignMetrics
 */

/**
 * Measure int / frac / suffix columns for a set of footing lines.
 * @param {string[]} lines
 * @returns {FootingAlignMetrics}
 */
export function footingAlignMetrics(lines) {
  const list = Array.isArray(lines) ? lines : [];
  let maxInt = 0;
  let maxFrac = 0;
  let maxSuffix = 0;
  let showDot = false;
  for (const line of list) {
    const p = parseFootingLine(line);
    if (p.kind !== "num") continue;
    maxInt = Math.max(maxInt, p.int.length);
    if (p.hasDot) {
      showDot = true;
      maxFrac = Math.max(maxFrac, p.frac.length);
    }
    maxSuffix = Math.max(maxSuffix, p.suffix.length);
  }
  const width = maxInt + (showDot ? 1 + maxFrac : 0) + maxSuffix;
  return { maxInt, maxFrac, maxSuffix, showDot, width };
}

/**
 * @param {string} line
 * @returns {{
 *   kind: "raw"|"num",
 *   text?: string,
 *   int?: string,
 *   frac?: string,
 *   hasDot?: boolean,
 *   suffix?: string,
 * }}
 */
export function parseFootingLine(line) {
  const s = String(line ?? "");
  // Allow trailing dot while typing (`206.`) and glued ops (`104.00+`, `1=`).
  const m = /^(-?\d+)(?:(\.)(\d*))?([+\-*/=]*)$/.exec(s.trim());
  if (!m) return { kind: "raw", text: s };
  return {
    kind: "num",
    int: m[1],
    hasDot: !!m[2],
    frac: m[3] != null ? m[3] : "",
    suffix: m[4] || "",
  };
}

/**
 * @param {string} line
 * @param {FootingAlignMetrics} metrics
 * @returns {string}
 */
export function formatAlignedFootingLine(line, metrics) {
  const p = parseFootingLine(line);
  const width = metrics.width || 0;
  if (p.kind === "raw") {
    return String(p.text ?? "").padStart(width, " ");
  }
  const intPad = String(p.int).padStart(metrics.maxInt, " ");
  let body = intPad;
  if (metrics.showDot) {
    const openDot =
      p.hasDot && p.frac === "" && String(line).trim().replace(/[+\-*/=]+$/, "").endsWith(".");
    // Pad with spaces (not zeros) so live entries like 206.5 stay Backspace-faithful
    // under completed 104.00 operands — zeros only exist if already in the source text.
    const frac = openDot
      ? "".padEnd(metrics.maxFrac, " ")
      : (p.hasDot ? p.frac : "").padEnd(metrics.maxFrac, " ");
    body = `${intPad}.${frac}`;
  }
  const suffixPad = String(p.suffix).padEnd(metrics.maxSuffix, " ");
  return body + suffixPad;
}

/**
 * Pad a display number (preview / field) to the footing’s decimal column.
 * Does not invent a suffix — field usually shows the bare total/entry.
 * @param {string|number|null|undefined} display
 * @param {string} footingText already-aligned or raw newline footing
 * @returns {string}
 */
export function padDisplayToFooting(display, footingText) {
  const raw = display == null ? "" : String(display);
  if (raw.trim() === "") return "";
  const footingLines = String(footingText || "")
    .split("\n")
    .filter((l) => l.trim() !== "");
  // Metrics from unpadded logical lines when possible
  const logical = footingLines.map((l) => l.trim());
  const metrics = footingAlignMetrics(logical.length ? logical : [raw.trim()]);
  // Include the display itself so a short result still pads to tall operands above.
  const withSelf = footingAlignMetrics([...logical, raw.trim()]);
  const m = {
    maxInt: Math.max(metrics.maxInt, withSelf.maxInt),
    maxFrac: Math.max(metrics.maxFrac, withSelf.maxFrac),
    maxSuffix: 0,
    showDot: metrics.showDot || withSelf.showDot,
    width: 0,
  };
  m.width = m.maxInt + (m.showDot ? 1 + m.maxFrac : 0);
  return formatAlignedFootingLine(raw.trim(), m).trimEnd();
}

/**
 * Strip calc display padding before commit / parse.
 * @param {string|null|undefined} s
 * @returns {string}
 */
export function stripCalcDisplayPad(s) {
  return String(s ?? "").replace(/\s+/g, "").trim();
}

/**
 * @param {CalcSession} session
 * @param {string} key single key: digit, `.`, op, `=`, `Backspace`, `Clear`
 * @returns {{
 *   session: CalcSession,
 *   done?: boolean,
 *   result?: number,
 *   error?: string,
 * }}
 */
export function feedCalcKey(session, key) {
  if (!session) return { session: createCalcSession(), error: "no session" };
  const k = String(key);

  if (k === "Clear" || k === "c" || k === "C") {
    return { session: createCalcSession(session.dialect, { decimals: session.decimals }) };
  }

  if (k === "Backspace") {
    if (session.entry.length) {
      return { session: { ...session, entry: session.entry.slice(0, -1) } };
    }
    return { session };
  }

  if (k === "=") {
    return finalizeCalc(session);
  }

  if (/^[0-9]$/.test(k)) {
    return { session: appendEntry(session, k) };
  }

  if (k === ".") {
    if (session.entry.includes(".")) return { session };
    return { session: appendEntry(session, session.entry === "" || session.entry === "-" ? "0." : ".") };
  }

  if (isCalcOp(k)) {
    return applyOperatorKey(session, k);
  }

  return { session };
}

/**
 * Evaluate a chord string for fixtures, e.g. `100+25=` or `+1-2=`.
 * @param {string} chord
 * @param {CalcDialect} [dialect]
 * @returns {{ ok: boolean, result?: number, formatted?: string, error?: string, session: CalcSession }}
 */
export function evaluateChord(chord, dialect = DIALECT_EXCEL) {
  let session = createCalcSession(dialect);
  const raw = String(chord || "");
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (/\s/.test(ch)) continue;
    const out = feedCalcKey(session, ch === "×" ? "*" : ch === "÷" ? "/" : ch === "−" ? "-" : ch);
    session = out.session;
    if (out.error && !out.done) {
      return { ok: false, error: out.error, session };
    }
    if (out.done) {
      if (!Number.isFinite(out.result)) {
        return { ok: false, error: out.error || "Invalid calculation", session };
      }
      return {
        ok: true,
        result: out.result,
        formatted: formatCalcResult(out.result),
        session,
      };
    }
  }
  // No equals — return preview if possible
  const preview = parseCalcNumber(calcPreview(session));
  if (preview != null && session.pendingOp == null && session.entry !== "") {
    return { ok: true, result: preview, formatted: formatCalcResult(preview), session };
  }
  return { ok: false, error: "Incomplete expression", session };
}

/**
 * @param {CalcSession} session
 * @param {string} ch
 * @returns {CalcSession}
 */
function appendEntry(session, ch) {
  let entry = session.entry;
  if (ch === "0." && entry === "-") entry = "-0.";
  else entry = entry + ch;
  return { ...session, entry };
}

/**
 * @param {CalcSession} session
 * @param {CalcOp} op
 */
function applyOperatorKey(session, op) {
  // Unary minus to start a negative entry
  if (op === "-" && session.entry === "" && session.pendingOp != null) {
    return { session: { ...session, entry: "-" } };
  }
  if (op === "-" && session.entry === "" && session.total == null && session.parts.length === 0) {
    if (session.dialect === DIALECT_STANDALONE) {
      return {
        session: {
          ...session,
          total: 0,
          pendingOp: "-",
          entry: "",
          parts: [formatCalcDisplay(0, session.decimals), "-"],
        },
      };
    }
    return { session: { ...session, entry: "-" } };
  }

  if (session.dialect === DIALECT_STANDALONE && session.total == null && session.entry === "") {
    // Leading operator: start from 0
    return {
      session: {
        ...session,
        total: 0,
        pendingOp: op,
        entry: "",
        parts: [formatCalcDisplay(0, session.decimals), op],
      },
    };
  }

  const entryNum = parseCalcNumber(session.entry);
  const fmt = (n) => formatCalcDisplay(n, session.decimals);

  if (session.total == null) {
    // Excel: need a number before first op
    if (entryNum == null) {
      if (session.dialect === DIALECT_STANDALONE) {
        return {
          session: {
            ...session,
            total: 0,
            pendingOp: op,
            entry: "",
            parts: [fmt(0), op],
          },
        };
      }
      return { session };
    }
    return {
      session: {
        ...session,
        total: entryNum,
        pendingOp: op,
        entry: "",
        parts: [fmt(entryNum), op],
      },
    };
  }

  if (session.pendingOp && entryNum != null) {
    const next = applyOp(session.total, session.pendingOp, entryNum);
    if (!Number.isFinite(next)) {
      return { session, error: "Division by zero" };
    }
    return {
      session: {
        ...session,
        total: next,
        pendingOp: op,
        entry: "",
        parts: [...session.parts, fmt(entryNum), op],
      },
    };
  }

  // Replace pending op when entry empty (e.g. typed + then *)
  if (session.entry === "" || session.entry === "-") {
    const parts = session.parts.slice();
    if (parts.length && isCalcOp(parts[parts.length - 1])) {
      parts[parts.length - 1] = op;
    } else {
      parts.push(op);
    }
    return {
      session: {
        ...session,
        pendingOp: op,
        entry: "",
        parts,
      },
    };
  }

  return { session };
}

/**
 * @param {CalcSession} session
 */
function finalizeCalc(session) {
  const fmt = (n) => formatCalcDisplay(n, session.decimals);
  if (session.total == null && session.entry !== "") {
    const n = parseCalcNumber(session.entry);
    if (n == null) return { session, done: true, result: NaN, error: "Not a number" };
    return {
      session: { ...session, total: n, pendingOp: null, entry: "", parts: [fmt(n)] },
      done: true,
      result: n,
    };
  }

  if (session.total == null) {
    return { session, done: true, result: NaN, error: "Empty calculation" };
  }

  if (!session.pendingOp) {
    return { session, done: true, result: session.total };
  }

  let b = parseCalcNumber(session.entry);
  if (b == null) {
    // Trailing operator then = → treat missing operand as 0 (standalone `+1+2-` =)
    b = 0;
  }
  const result = applyOp(session.total, session.pendingOp, b);
  if (!Number.isFinite(result)) {
    return { session, done: true, result: NaN, error: "Division by zero" };
  }
  return {
    session: {
      ...session,
      total: result,
      pendingOp: null,
      entry: "",
      parts: [...session.parts, fmt(b)],
    },
    done: true,
    result,
  };
}
