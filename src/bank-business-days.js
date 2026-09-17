/**
 * "Not a processing day" calendar for payment scheduling (OI-161 Packet 1b).
 *
 * Deliberately loose scope (5zorro 2026-09-05): not a regulated-bank-grade calendar — weekends,
 * the 11 US federal holidays (same list the Federal Reserve uses for ACH/wire processing), and a
 * **bridge day** rule for the lone workday stranded between a holiday and a weekend. No external
 * data, no per-year maintenance — everything is computed algorithmically.
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
 * A **bridge day**: the lone workday stranded between a holiday and a weekend, when staff take the
 * long weekend rather than come in for one day.
 *
 * 🔴 **Corrected 2026-09-11 (plan B3).** The shipped rule was wrong in both directions. It fired on
 * *any* Friday next to a holiday long weekend, which
 *
 * - included the **Friday before a Monday holiday** — a case 5zorro never asked for, and which is
 *   not a bridge day at all: nobody is off yet, the long weekend has not started; and
 * - missed the **Monday before a Tuesday holiday** entirely, which is a bridge day by exactly the
 *   same logic as the day after Thanksgiving.
 *
 * 5zorro 2026-09-08, in his own words: *"If there is a holiday on a thurs, then treat friday as a
 * holiday too. If a holiday is on a tue, then treat monday as a holiday too."* That is the rule
 * below, and it is the whole rule.
 *
 * 🔴 This is still only a **suggestion** in the model B3 describes: the algorithm proposes and the
 * user ratifies. `delay-calendar.js` owns that layer. Until it is wired, this fires directly —
 * which is the pre-existing behaviour, now at least computing the right dates.
 *
 * @param {string} isoDate
 */
export function isBridgeDay(isoDate) {
  const d = parseIso(isoDate);
  const dow = d.getUTCDay();
  // Friday after a Thursday holiday (the day after Thanksgiving is the canonical case).
  if (dow === 5) return isFederalHoliday(formatYmd(addDaysUtc(d, -1)));
  // Monday before a Tuesday holiday — the mirror image, and the case the old rule did not have.
  if (dow === 1) return isFederalHoliday(formatYmd(addDaysUtc(d, 1)));
  return false;
}

/**
 * @typedef {{ date: string, reasons: Array<"weekend"|"holiday"|"bridge"> }} SkippedDay
 * @typedef {{
 *   from: string,          // the date we were asked about
 *   date: string,          // the payable date we landed on
 *   skipped: SkippedDay[], // every day walked past, in the order they were walked (latest first)
 *   exhausted: boolean,    // true when the 30-day guard ran out — never seen in practice
 * }} PayByDateWalk
 */

/**
 * `effectivePayByDate` with its reasoning kept instead of discarded (Packet C5).
 *
 * 5zorro 2026-09-09: *"It is difficult for me to audit the grouping bumps… was it 2 weekend days,
 * 1 blur day, 1 holiday, and 1 user entry OR was it exactly on time."* That question was
 * unanswerable because the loop below threw away every day it walked past and returned a bare
 * string. It now records them.
 *
 * 🔴 **This is the implementation; `effectivePayByDate` is a thin wrapper over it.** The two must
 * never be separate walks — an audit trail that can disagree with the engine it audits is worse
 * than no audit trail, because it is believed. Same rule `payment-term-name-health.js` follows
 * against the grammar it diagnoses.
 *
 * A day can be skipped for more than one reason at once (a Saturday that is also an observed
 * holiday), so `reasons` is a list and not a single label. They are recorded in a fixed order —
 * weekend, holiday, bridge — so a caller rendering "why" never sees the same day explained two
 * different ways on two renders.
 *
 * @param {string} isoDate
 * @param {{ includeBridge?: boolean }} [opts] includeBridge default true
 * @returns {PayByDateWalk}
 */
export function explainPayByDate(isoDate, opts = {}) {
  const includeBridge = opts.includeBridge !== false;
  const from = formatYmd(parseIso(isoDate));
  /** @type {SkippedDay[]} */
  const skipped = [];
  let d = parseIso(isoDate);
  for (let i = 0; i < 30; i++) {
    const iso = formatYmd(d);
    /** @type {Array<"weekend"|"holiday"|"bridge">} */
    const reasons = [];
    if (isWeekend(iso)) reasons.push("weekend");
    if (isFederalHoliday(iso)) reasons.push("holiday");
    if (includeBridge && isBridgeDay(iso)) reasons.push("bridge");
    if (!reasons.length) return { from, date: iso, skipped, exhausted: false };
    skipped.push({ date: iso, reasons });
    d = addDaysUtc(d, -1);
  }
  return { from, date: formatYmd(d), skipped, exhausted: true };
}

/**
 * Last valid processing day on or before `isoDate`. Already-payable dates are returned unchanged.
 * Defaults to earlier, always (5zorro 2026-09-05) — see module doc for why. `opts` is intentionally
 * open for a future per-vendor override; nothing beyond `includeBridge` is built yet.
 * @param {string} isoDate
 * @param {{ includeBridge?: boolean }} [opts] includeBridge default true
 * @returns {string} ISO date
 */
export function effectivePayByDate(isoDate, opts = {}) {
  return explainPayByDate(isoDate, opts).date;
}
