/**
 * "Not a processing day" calendar for payment scheduling (OI-161 Packet 1b).
 *
 * Deliberately loose scope (5zorro 2026-09-05): not a regulated-bank-grade calendar — weekends,
 * the 11 US federal holidays (same list the Federal Reserve uses for ACH/wire processing), and a
 * "blur" heuristic for the Friday next to a holiday long weekend. No external data, no per-year
 * maintenance — everything is computed algorithmically.
 *
 * Confirmed via Vanilla ERPNext's own data model (2026-09-05, read-only MariaDB): there is no
 * structured per-vendor postage-buffer or "next business day after" field anywhere (Payment Term's
 * due_date_based_on is pure calendar-day/month arithmetic; Purchase Invoice.terms is unstructured
 * print boilerplate). So this module has one calendar for every vendor — that's not a shortcut,
 * it's the only option Vanilla's data gives us. A per-vendor override is a real future extension
 * point (see effectivePayByDate's `opts`), not built here.
 */

/** @param {string} isoDate "YYYY-MM-DD" @returns {Date} UTC midnight */
function parseIso(isoDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate).trim());
  if (!m) throw new Error(`Invalid ISO date: ${isoDate}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** @param {Date} d */
function formatYmd(d) {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

/** @param {Date} d @param {number} n */
function addDaysUtc(d, n) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
}

/**
 * nth (1-based) occurrence of `weekday` (0=Sun..6=Sat) in `month` (0-indexed) of `year`.
 * @param {number} year @param {number} month @param {number} weekday @param {number} n
 */
function nthWeekdayOfMonth(year, month, weekday, n) {
  const first = new Date(Date.UTC(year, month, 1));
  const firstWeekday = first.getUTCDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  const day = 1 + offset + (n - 1) * 7;
  return new Date(Date.UTC(year, month, day));
}

/** Last occurrence of `weekday` (0=Sun..6=Sat) in `month` (0-indexed) of `year`. */
function lastWeekdayOfMonth(year, month, weekday) {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const last = new Date(Date.UTC(year, month, lastDay));
  const diff = (last.getUTCDay() - weekday + 7) % 7;
  return addDaysUtc(last, -diff);
}

/** Standard federal observed-date rule: Saturday → Friday, Sunday → Monday. */
function observed(d) {
  const dow = d.getUTCDay();
  if (dow === 6) return addDaysUtc(d, -1);
  if (dow === 0) return addDaysUtc(d, 1);
  return d;
}

/**
 * The 11 US federal holidays for `year`, observed-date shifted. A shift can spill into an
 * adjacent calendar year (e.g. Jan 1 on a Saturday is observed Dec 31 of `year - 1`) — that's
 * expected; callers checking a specific date should union a few adjacent years (see
 * `isFederalHoliday`), not call this for a single year in isolation.
 * @param {number} year
 * @returns {Set<string>} ISO dates
 */
export function usFederalHolidays(year) {
  const dates = [
    observed(new Date(Date.UTC(year, 0, 1))), // New Year's Day
    nthWeekdayOfMonth(year, 0, 1, 3), // MLK Day — 3rd Monday of January
    nthWeekdayOfMonth(year, 1, 1, 3), // Washington's Birthday — 3rd Monday of February
    lastWeekdayOfMonth(year, 4, 1), // Memorial Day — last Monday of May
    observed(new Date(Date.UTC(year, 5, 19))), // Juneteenth
    observed(new Date(Date.UTC(year, 6, 4))), // Independence Day
    nthWeekdayOfMonth(year, 8, 1, 1), // Labor Day — 1st Monday of September
    nthWeekdayOfMonth(year, 9, 1, 2), // Columbus Day — 2nd Monday of October
    observed(new Date(Date.UTC(year, 10, 11))), // Veterans Day
    nthWeekdayOfMonth(year, 10, 4, 4), // Thanksgiving — 4th Thursday of November
    observed(new Date(Date.UTC(year, 11, 25))), // Christmas Day
  ];
  return new Set(dates.map(formatYmd));
}

/** @param {number} year */
function holidaysNear(year) {
  const merged = new Set();
  for (const y of [year - 1, year, year + 1]) {
    for (const iso of usFederalHolidays(y)) merged.add(iso);
  }
  return merged;
}

/** @param {string} isoDate */
export function isWeekend(isoDate) {
  const dow = parseIso(isoDate).getUTCDay();
  return dow === 0 || dow === 6;
}

/** @param {string} isoDate */
export function isFederalHoliday(isoDate) {
  const year = parseIso(isoDate).getUTCFullYear();
  return holidaysNear(year).has(String(isoDate).trim());
}

/** Weekend OR federal holiday. @param {string} isoDate */
export function isBankHoliday(isoDate) {
  return isWeekend(isoDate) || isFederalHoliday(isoDate);
}

/**
 * A Friday adjacent to a holiday-created long weekend — the two cases 5zorro named: the Friday
 * before a Monday holiday, and the Friday after a Thursday holiday (e.g. day after Thanksgiving).
 * @param {string} isoDate
 */
export function isBlurDay(isoDate) {
  const d = parseIso(isoDate);
  if (d.getUTCDay() !== 5) return false;
  const nextMonday = formatYmd(addDaysUtc(d, 3));
  const prevThursday = formatYmd(addDaysUtc(d, -1));
  return isFederalHoliday(nextMonday) || isFederalHoliday(prevThursday);
}

/**
 * Last valid processing day on or before `isoDate`. Already-payable dates are returned unchanged.
 * Defaults to earlier, always (5zorro 2026-09-05) — see module doc for why. `opts` is intentionally
 * open for a future per-vendor override; nothing beyond `includeBlur` is built yet.
 * @param {string} isoDate
 * @param {{ includeBlur?: boolean }} [opts] includeBlur default true
 * @returns {string} ISO date
 */
export function effectivePayByDate(isoDate, opts = {}) {
  const includeBlur = opts.includeBlur !== false;
  let d = parseIso(isoDate);
  for (let i = 0; i < 30; i++) {
    const iso = formatYmd(d);
    if (!isBankHoliday(iso) && !(includeBlur && isBlurDay(iso))) return iso;
    d = addDaysUtc(d, -1);
  }
  return formatYmd(d);
}
