/**
 * The check-run cutoff (Packet C8): which suggested payments belong to the run being prepared,
 * which cannot wait for it, and which are only a preview of a later run. Pure — dates in, labels out.
 *
 * The rule is the one the large ERPs use for payment runs (SAP's automatic payment program asks
 * for the *next* run date; Oracle and Dynamics work from a pay-through date): **a run pays
 * everything that would be late if it waited for the run after it.** Credit terms never need
 * watching per vendor — they have already set each bill's pay-by date — so the whole input is a
 * schedule: the next run date and how many days apart runs are.
 *
 * 5zorro 2026-09-14: *"it probably is some arbitrary 'yeah every 2 weeks sounds good' or a 'yeah,
 * once a month sounds good', and then the accountants will do a firedrill check run whenever an odd
 * vendor has terms that violate that schedule."* The fire drill is what `off-cycle` names, and it is
 * found per payment, the moment it exists, rather than by keeping a list of awkward vendors.
 *
 * For a run on `runDate`, with runs `intervalDays` apart (`cutoff = runDate + intervalDays`):
 *
 * | placement   | pay-by date                                        | meaning                            |
 * |-------------|----------------------------------------------------|------------------------------------|
 * | `off-cycle` | before `runDate` — only while the run is still ahead | cannot wait for the run: cut by hand |
 * | `this-run`  | before `cutoff`                                    | the run pays it                    |
 * | `later`     | on or after `cutoff`                               | a later run pays it; grouping provisional |
 *
 * Deliberately NOT modelled:
 *
 * - **Mail / transit time.** It is already inside the pay-by date: a vendor that needs ten days to
 *   receive a cheque carries negative grace on its payment term, and grace folds into
 *   `credit_days` (5zorro 2026-09-14: *"it is in the model. It is captured by negative grace."*).
 *   A transit step here would count it twice.
 * - **Bills still sitting in an inbox.** A check run is done once the receivers inbox and the bills
 *   inbox are both processed completely — anyone who has run more than one works that way — so on
 *   run day the outstanding set is taken as complete. Nothing here tries to detect an unentered
 *   bill, and the chrome deliberately does not mention it (5zorro: *"I don't think we need to call
 *   it out in the chrome"*).
 */

/**
 * @typedef {{
 *   state: "off"|"upcoming"|"run-day",
 *   reason: ""|"no-today"|"no-date"|"no-interval",  // why it is off; "" when it is on
 *   today: string,
 *   runDate: string,       // the run being prepared ("" when off)
 *   cutoff: string,        // runDate + intervalDays: the run after it
 *   intervalDays: number,
 *   early: boolean,        // "Do this run today" is in force
 *   rolledFrom: string,    // the entered date, when it had passed and was rolled forward
 * }} CheckRun
 *
 * @typedef {"off-cycle"|"this-run"|"later"} RunPlacementKind
 */

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** @param {unknown} value @returns {value is string} a real calendar date as "YYYY-MM-DD" */
export function isIsoDate(value) {
  if (typeof value !== "string") return false;
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

/** @param {string} iso @param {number} days */
function addDays(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** @param {string} fromIso @param {string} toIso */
function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86400000);
}

/**
 * Where the schedule stands today. Answers 5zorro's three questions (2026-09-14):
 *
 * - **No run date ever entered** → `off`. Nothing is shaded, nothing is flagged, and the engine is
 *   called with no boundaries — the dashboard reads exactly as it did before the cutoff existed.
 * - **The date has passed** → it rolls forward by the interval to the first run on or after today,
 *   on the assumption that the runs in between happened. `rolledFrom` keeps the entered date so the
 *   panel can say it moved. A late clerk loses nothing by this: pressing "Do this run today" turns
 *   today into the run.
 * - **The date is still ahead, but the run is being done now** → `runEarlyOn` set to today makes
 *   today the run day for that run: nothing is off-cycle, and the cutoff stays where that run's
 *   would have been. It is stored as a date, so it expires on its own tomorrow rather than
 *   quietly leaving every later day looking like a run day.
 *
 * @param {{ nextRunDate?: unknown, runIntervalDays?: unknown, runEarlyOn?: unknown }|null|undefined} prefs
 * @param {string} today "YYYY-MM-DD", the clerk's local date
 * @returns {CheckRun}
 */
export function resolveCheckRun(prefs, today) {
  const p = prefs || {};
  /** @type {CheckRun} */
  const off = {
    state: "off",
    reason: "",
    today: isIsoDate(today) ? today : "",
    runDate: "",
    cutoff: "",
    intervalDays: 0,
    early: false,
    rolledFrom: "",
  };
  if (!off.today) return { ...off, reason: "no-today" };
  const entered = typeof p.nextRunDate === "string" ? p.nextRunDate.trim() : "";
  if (!isIsoDate(entered)) return { ...off, reason: "no-date" };
  const interval = Number(p.runIntervalDays);
  if (!Number.isInteger(interval) || interval < 1) return { ...off, reason: "no-interval" };

  let runDate = entered;
  if (runDate < today) {
    runDate = addDays(runDate, Math.ceil(daysBetween(runDate, today) / interval) * interval);
  }
  const early = p.runEarlyOn === today && runDate > today;
  return {
    state: runDate === today || early ? "run-day" : "upcoming",
    reason: "",
    today,
    runDate,
    cutoff: addDays(runDate, interval),
    intervalDays: interval,
    early,
    rolledFrom: runDate === entered ? "" : entered,
  };
}

/**
 * The dates no batch may cross, for `paymentBatchEconomics({ runBreaks })`. A bill whose pay-by
 * date is on or after a boundary is never combined with one before it.
 *
 * The cutoff is always a boundary: combining a this-run bill with a later one would finalize the
 * later bill now, and it is exactly those bills that pick up credits and corrections before their
 * own run (C8's rework argument). While the run is still ahead, the run date is a boundary too: an
 * off-cycle cheque goes out now by hand, and the bills the run will pay should not be dragged into it.
 *
 * @param {CheckRun|null|undefined} run
 * @returns {string[]}
 */
export function checkRunSplits(run) {
  if (!run || run.state === "off") return [];
  return run.state === "upcoming" ? [run.runDate, run.cutoff] : [run.cutoff];
}

/**
 * @param {string} payOn a suggested payment's pay-by date
 * @param {CheckRun|null|undefined} run
 * @returns {RunPlacementKind|null} null while no run is set
 */
export function classifyForRun(payOn, run) {
  if (!run || run.state === "off" || !isIsoDate(payOn)) return null;
  if (payOn >= run.cutoff) return "later";
  if (run.state === "upcoming" && payOn < run.runDate) return "off-cycle";
  return "this-run";
}

/**
 * The chip and the one-line explanation for a placement. `chip` is "" for `this-run`: the run's
 * own payments are the normal case and carry no mark.
 *
 * @param {RunPlacementKind|null} kind
 * @param {CheckRun} run
 * @param {{ payOn?: string, reason?: string }} [group]
 * @returns {{ kind: RunPlacementKind, chip: string, line: string }|null}
 */
export function describeRunPlacement(kind, run, group = {}) {
  if (!kind || !run || run.state === "off") return null;
  const payOn = group.payOn || "";

  if (kind === "off-cycle") {
    let line;
    if (payOn && payOn < run.today) {
      line = `Off-cycle: its ${payOn} payment date has already passed, and the next check run is not until ${run.runDate}. Cut it by hand now.`;
    } else if (group.reason === "discount-capture") {
      line = `Off-cycle: the discount needs payment by ${payOn}, before the ${run.runDate} check run. Cut it by hand, or the discount is lost.`;
    } else {
      line = `Off-cycle: it has to go out by ${payOn}, before the ${run.runDate} check run. Cut it by hand, or it will be late.`;
    }
    return { kind, chip: "Off-cycle", line };
  }

  if (kind === "later") {
    return {
      kind,
      chip: "Later run",
      line: `Later run: payable on or after ${run.cutoff}, so a run after this one picks it up. Its grouping can still change — bills and credits that arrive before then will be weighed with it.`,
    };
  }

  let line;
  if (run.early) line = `In the check run being done today (scheduled for ${run.runDate}).`;
  else if (run.state === "run-day") line = "In today's check run.";
  else line = `In the ${run.runDate} check run.`;
  return { kind, chip: "", line };
}

/**
 * The schedule in one sentence, for the run strip and the assumptions panel.
 * @param {CheckRun} run
 * @returns {string}
 */
export function describeCheckRun(run) {
  if (!run || run.state === "off") {
    return run && run.reason === "no-interval"
      ? "Set how many days apart check runs are to turn the cutoff on."
      : "No check run set, so every suggested payment is shown as ready to act on.";
  }
  if (run.early) return `Doing the ${run.runDate} check run today — it pays everything due before ${run.cutoff}.`;
  if (run.state === "run-day") return `Check run today pays everything due before ${run.cutoff}.`;
  const rolled = run.rolledFrom
    ? ` Rolled forward from ${run.rolledFrom}, assuming the runs in between happened.`
    : "";
  return `Next check run ${run.runDate} pays everything due before ${run.cutoff}.${rolled}`;
}

/**
 * How many suggested payments, and how much money, fall in each placement.
 * @param {Array<{ payOn: string, totalAmount?: number }>} groups
 * @param {CheckRun} run
 */
export function summarizeCheckRun(groups, run) {
  const out = {
    offCycle: { count: 0, amount: 0 },
    thisRun: { count: 0, amount: 0 },
    later: { count: 0, amount: 0 },
  };
  const key = { "off-cycle": "offCycle", "this-run": "thisRun", later: "later" };
  for (const g of Array.isArray(groups) ? groups : []) {
    const kind = classifyForRun(g && g.payOn, run);
    if (!kind) continue;
    const bucket = out[/** @type {"offCycle"|"thisRun"|"later"} */ (key[kind])];
    bucket.count += 1;
    bucket.amount = Math.round((bucket.amount + (Number(g.totalAmount) || 0)) * 100) / 100;
  }
  return out;
}
