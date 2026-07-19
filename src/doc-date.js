/**
 * Doc date entry — text dates (not <input type=date>) so Tab leaves in one key.
 * Allowed chars: digits and / - .
 * Partial MM/DD uses the year nearest to "today" by month distance.
 */

const ALLOWED_RE = /[0-9/\-.]/g;

/**
 * Strip disallowed characters from a date field value.
 * @param {unknown} raw
 * @returns {string}
 */
export function filterDateInputValue(raw) {
  return String(raw ?? "").replace(/[^0-9/\-.]/g, "");
}

/**
 * @param {string} ch single character (or empty)
 * @returns {boolean}
 */
export function isAllowedDateInputChar(ch) {
  if (!ch || ch.length !== 1) return false;
  return /[0-9/\-.]/.test(ch);
}

/**
 * @param {number} y
 * @param {number} m 1–12
 * @param {number} d
 */
function daysInMonth(y, m) {
  return new Date(y, m, 0).getDate();
}

/**
 * Absolute month distance between two calendar dates (day ignored for ranking).
 * @param {Date} a
 * @param {Date} b
 */
export function monthDistance(a, b) {
  return Math.abs(a.getFullYear() * 12 + a.getMonth() - (b.getFullYear() * 12 + b.getMonth()));
}

/**
 * Pick year for month/day so the date is nearest to `today` in months.
 * @param {number} month 1–12
 * @param {number} day
 * @param {Date} [today]
 * @returns {number} year
 */
export function nearestYearForMonthDay(month, day, today = new Date()) {
  const y0 = today.getFullYear();
  let bestY = y0;
  let bestDist = Infinity;
  for (const y of [y0 - 1, y0, y0 + 1]) {
    const dim = daysInMonth(y, month);
    if (day < 1 || day > dim) continue;
    const cand = new Date(y, month - 1, day);
    const dist = monthDistance(today, cand);
    if (dist < bestDist) {
      bestDist = dist;
      bestY = y;
    }
  }
  return bestY;
}

/**
 * @param {number} y
 * @param {number} m 1–12
 * @param {number} d
 * @returns {string} YYYY-MM-DD
 */
export function toIsoDate(y, m, d) {
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

/**
 * @param {string} iso YYYY-MM-DD
 * @returns {string} MM/DD/YYYY or ""
 */
export function formatDocDateDisplay(iso) {
  const s = String(iso || "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  return `${m[2]}/${m[3]}/${m[1]}`;
}

/**
 * Parse user date text → ERP ISO date.
 * Accepts YYYY-MM-DD, MM/DD/YYYY, MM-DD-YYYY, MM/DD, MM-DD (nearest year).
 *
 * @param {unknown} input
 * @param {Date} [today]
 * @returns {{ ok: true, iso: string, display: string } | { ok: false, reason: string }}
 */
export function parseDocDate(input, today = new Date()) {
  const raw = filterDateInputValue(input).trim();
  if (!raw) return { ok: false, reason: "empty" };

  let y;
  let mo;
  let d;

  const iso = /^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/.exec(raw);
  if (iso) {
    y = Number(iso[1]);
    mo = Number(iso[2]);
    d = Number(iso[3]);
  } else {
    const full = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(raw);
    if (full) {
      mo = Number(full[1]);
      d = Number(full[2]);
      y = Number(full[3]);
      if (y < 100) y += y >= 70 ? 1900 : 2000;
    } else {
      const partial = /^(\d{1,2})[/\-.](\d{1,2})$/.exec(raw);
      if (!partial) return { ok: false, reason: "Unrecognized date" };
      mo = Number(partial[1]);
      d = Number(partial[2]);
      y = nearestYearForMonthDay(mo, d, today);
    }
  }

  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) {
    return { ok: false, reason: "Invalid date" };
  }
  if (mo < 1 || mo > 12) return { ok: false, reason: "Invalid month" };
  if (d < 1 || d > daysInMonth(y, mo)) return { ok: false, reason: "Invalid day" };

  const isoOut = toIsoDate(y, mo, d);
  return { ok: true, iso: isoOut, display: formatDocDateDisplay(isoOut) };
}
