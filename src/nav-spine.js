/**
 * The navigation spine (plan 2026-10-24): every way to move, as a matrix of cells — where the clerk
 * starts from × the document's state × the move — and what each cell must show. Pure; the probes in
 * `tests/probes/nav-spine-*.probe.js` drive the app and record what they saw, this module judges it,
 * and `npm run nav:check` prints the matrix.
 *
 * Every cell is judged on four things:
 * - **lands** — the move ends on the surface and document it names;
 * - **typing** — unsaved typing is never lost silently: a move that leaves the document asks first
 *   (and Stay keeps the typing), a move that keeps it (lens, errand, peek) carries the typing there
 *   and back, and a clean document is never asked about;
 * - **back** — the way back (Esc, the Doc tab, the Recent row) returns to the document as it was,
 *   or, after a discard, as ERPNext has it (never the stale typing);
 * - **focus** — after an errand or a peek, the cursor is back where it was left.
 */

export const STARTS = ["home", "lens", "rail", "drafts", "erp-link", "find", "board"];
export const STATES = ["new-typed", "draft-clean", "draft-typed", "submitted"];
export const MOVES = ["desk", "lens", "errand-abandoned", "errand-saved", "peek", "other", "reload"];

/** What each start means, for the matrix's readers. */
export const START_LABELS = {
  home: "Home tile",
  lens: "Toolbar lens (Default-skin → Document-skin)",
  rail: "Recent rail row",
  drafts: "Drafts list row",
  "erp-link": "A link inside the ERPNext page",
  find: "Find page row",
  board: "Pay Outstanding board (a bill a payment pays)",
};

/** Which states a start can reach, and why the others are not cells. */
const START_STATES = {
  home: { states: ["new-typed"], why: "a Home tile opens a new document" },
  lens: { states: STATES, why: "" },
  rail: { states: ["draft-clean", "draft-typed", "submitted"], why: "a new document has no Recent row to come back to" },
  drafts: { states: ["draft-clean", "draft-typed"], why: "the Drafts list holds saved drafts only" },
  "erp-link": { states: ["draft-clean", "draft-typed", "submitted"], why: "a link names a saved document" },
  find: { states: ["draft-clean", "draft-typed", "submitted"], why: "a Find page lists saved documents" },
  board: { states: ["submitted"], why: "the board opens the submitted bills its payments pay" },
};

/** @param {string} state */
export const isTyped = (state) => state === "new-typed" || state === "draft-typed";
/** @param {string} state */
export const isNew = (state) => state === "new-typed";

/**
 * Every cell of the matrix, with the skipped ones and why.
 * @param {{ starts?: string[] }} [opts]
 * @returns {Array<{ id: string, start: string, state: string, move: string, skip: string }>}
 */
export function spineCells(opts = {}) {
  const starts = opts.starts && opts.starts.length ? opts.starts : STARTS;
  const out = [];
  for (const start of starts) {
    const reach = START_STATES[start];
    if (!reach) continue;
    for (const state of STATES) {
      for (const move of MOVES) {
        let skip = "";
        if (!reach.states.includes(state)) skip = reach.why;
        else if (state === "submitted" && move.startsWith("errand")) skip = "a submitted document's lines are read-only";
        out.push({ id: `${start}/${state}/${move}`, start, state, move, skip });
      }
    }
  }
  return out;
}

/** Moves that leave the document (the gate must ask about unsaved typing). */
const LEAVES = new Set(["desk", "other"]);

/**
 * @typedef {{ surface?: string, name?: string, doctype?: string, route?: string }} Place
 * @typedef {{
 *   arrived?: Place & { ok?: boolean },
 *   mark?: string,
 *   typedLanded?: boolean,
 *   asked?: boolean,
 *   stayKept?: boolean | null,
 *   landed?: Place,
 *   carried?: boolean | null,
 *   back?: (Place & { ref?: string, savedRef?: string }) | null,
 *   focus?: { field?: string, row?: string } | null,
 *   focusWant?: { field: string, row?: string } | null,
 *   backNa?: string,
 *   gateOffersSave?: boolean,
 *   savedDraft?: string,
 *   errandWant?: string,
 *   errandItem?: string | null,
 *   reload?: { docName?: string, erpName?: string, docRef?: string, erpRef?: string, status?: string, notice?: boolean } | null,
 *   error?: string,
 * }} Seen
 */

/** @param {string} name */
const isNewName = (name) => /^new-/.test(String(name || ""));

/**
 * Judge one cell from what the probe saw.
 * @param {{ start: string, state: string, move: string }} cell
 * @param {Seen} seen
 * @param {{ other?: string }} [ctx] the "another document" the move opens
 * @returns {{ lands: Verdict, typing: Verdict, back: Verdict, focus: Verdict }}
 * @typedef {{ ok: boolean | null, why: string }} Verdict  ok null = not judged here
 */
export function judgeCell(cell, seen, ctx = {}) {
  const s = seen || {};
  const na = (why) => ({ ok: null, why });
  const pass = (why = "") => ({ ok: true, why });
  const fail = (why) => ({ ok: false, why });
  if (s.error) {
    const f = fail(`probe step failed: ${s.error}`);
    return { lands: f, typing: f, back: f, focus: f };
  }
  const arrived = s.arrived || {};
  if (!arrived.ok) {
    const f = fail(`did not arrive on the document from ${cell.start} (${arrived.surface || "?"} ${arrived.name || ""})`.trim());
    return { lands: f, typing: na("not reached"), back: na("not reached"), focus: na("not reached") };
  }
  const typed = isTyped(cell.state);
  const landed = s.landed || {};
  const back = s.back || null;

  // lands
  let lands;
  const want = {
    desk: () => landed.surface === "erp" && /^\/(app|desk)\/?$/.test(String(landed.route || "")),
    // A typed new document is saved as a draft first, and Vanilla opens that draft (plan answer 3).
    lens: () =>
      landed.surface === "erp" &&
      landed.doctype === "Purchase Invoice" &&
      (isNew(cell.state) ? (typed ? !!s.savedDraft && landed.name === s.savedDraft : isNewName(landed.name)) : landed.name === arrived.name),
    "errand-abandoned": () => landed.surface === "erp" && landed.doctype === "Item",
    "errand-saved": () => landed.surface === "erp" && landed.doctype === "Item",
    peek: () => landed.surface === "erp" && landed.doctype === "Supplier",
    other: () => landed.surface === "doc" && landed.name === ctx.other,
    reload: () => landed.surface === "doc" && (isNew(cell.state) ? isNewName(landed.name) : landed.name === arrived.name),
  }[cell.move];
  lands = want && want() ? pass() : fail(`landed on ${landed.surface || "?"} ${landed.doctype || ""} ${landed.name || landed.route || ""}`.replace(/\s+/g, " ").trim());

  // typing
  let typing;
  if (typed && s.typedLanded === false) {
    typing = fail("the typing never reached ERPNext's form");
  } else if (cell.move === "reload") {
    const r = s.reload || {};
    const stale = r.docRef !== r.erpRef || (r.docName && r.erpName && r.docName !== r.erpName);
    if (stale) typing = fail(`the Doc page shows what ERPNext no longer has (page ${r.docName}/${JSON.stringify(r.docRef)}, ERPNext ${r.erpName}/${JSON.stringify(r.erpRef)})`);
    else if (typed && !s.asked && !r.notice) typing = fail("the typing was lost on the reload without a question or a word");
    else typing = pass(typed ? (s.asked ? "asked" : "said so after") : "");
  } else if (!typed) {
    typing = s.asked ? fail("asked about unsaved changes on a clean document") : pass();
  } else if (LEAVES.has(cell.move)) {
    if (!s.asked) typing = fail("left the document with unsaved typing and asked nothing");
    else if (s.stayKept === false) typing = fail("asked, but Stay lost the typing");
    else typing = pass("asked; Stay kept it");
  } else if (cell.move === "lens" && isNew(cell.state)) {
    if (!s.asked) typing = fail("switched lens on an unsaved new document and asked nothing");
    else if (s.stayKept === false) typing = fail("asked, but Stay lost the typing");
    else if (!s.gateOffersSave) typing = fail("the gate does not offer Save, so the new document cannot reach Vanilla as a draft");
    else if (!s.savedDraft) typing = fail("Save did not open a saved draft in Vanilla");
    else if (s.carried === false) typing = fail("the saved draft in Vanilla does not have the typing");
    else typing = pass("asked; saved as a draft, opened in Vanilla");
  } else if (s.asked) {
    typing = s.stayKept === false ? fail("asked, but Stay lost the typing") : pass("asked before the move");
  } else if (cell.move === "lens" && s.carried === false) {
    typing = fail("the typing is not on the form in the other lens");
  } else if (back && back.ref !== s.mark) {
    typing = fail(`the typing is gone after coming back (${JSON.stringify(back.ref)})`);
  } else {
    typing = pass("carried there and back");
  }

  // back
  let backV;
  if (cell.move === "reload") backV = na("no way back from a reload");
  else if (s.backNa) backV = na(s.backNa);
  else if (!back) backV = isNew(cell.state) && LEAVES.has(cell.move) ? na("a discarded new document has no way back") : fail("did not come back");
  else if (back.surface !== "doc") backV = fail(`came back to ${back.surface || "?"}`);
  else if (!isNew(cell.state) && back.name !== arrived.name) backV = fail(`came back to ${back.name}, not ${arrived.name}`);
  else if (isNew(cell.state) && cell.move === "lens" && typed) backV = back.name === s.savedDraft ? pass() : fail(`came back to ${back.name}, not the saved draft ${s.savedDraft || "(none)"}`);
  else if (isNew(cell.state) && !isNewName(back.name)) backV = fail(`came back to ${back.name}, not the new document`);
  else if (s.errandWant && s.errandItem !== s.errandWant) backV = fail(`the line holds ${JSON.stringify(s.errandItem)}, not the saved Item ${s.errandWant}`);
  else if (LEAVES.has(cell.move) && typed && back.ref !== back.savedRef) backV = fail(`after a discard the page shows ${JSON.stringify(back.ref)}, ERPNext has ${JSON.stringify(back.savedRef)}`);
  else backV = pass();

  // focus
  let focus;
  if (!s.focusWant) focus = na("not a move that returns the cursor");
  else if (!s.focus) focus = fail("nothing focused after coming back");
  else if (s.focus.field !== s.focusWant.field || (s.focusWant.row != null && String(s.focus.row) !== String(s.focusWant.row))) {
    focus = fail(`cursor on ${s.focus.field || "?"}${s.focus.row != null ? ` row ${s.focus.row}` : ""}, not ${s.focusWant.field}${s.focusWant.row != null ? ` row ${s.focusWant.row}` : ""}`);
  } else focus = pass();

  return { lands, typing, back: backV, focus };
}

/** One line a probe prints per cell; `nav:check` reads them back. */
export const CELL_PREFIX = "NAVCELL ";

/**
 * @param {{ id: string }} cell
 * @param {ReturnType<typeof judgeCell> | null} verdict null = skipped
 * @param {string} [skip]
 */
export function cellLine(cell, verdict, skip = "") {
  return CELL_PREFIX + JSON.stringify({ id: cell.id, skip: skip || undefined, verdict: verdict || undefined });
}

/**
 * The cells a probe log reports.
 * @param {string} log
 * @returns {Record<string, { skip?: string, verdict?: ReturnType<typeof judgeCell> }>}
 */
export function parseCellLines(log) {
  const out = {};
  for (const line of String(log || "").split(/\r?\n/)) {
    const at = line.indexOf(CELL_PREFIX);
    if (at < 0) continue;
    try {
      const r = JSON.parse(line.slice(at + CELL_PREFIX.length));
      if (r && r.id) out[r.id] = r;
    } catch {
      /* a torn line: the cell reads as not run */
    }
  }
  return out;
}

/** @param {ReturnType<typeof judgeCell>} v */
export function cellPassed(v) {
  return ["lands", "typing", "back", "focus"].every((k) => v[k].ok !== false);
}

/**
 * The matrix as Markdown: one table per start, a row per state, a column per move;
 * then each failure with its reasons.
 * @param {Record<string, { skip?: string, verdict?: ReturnType<typeof judgeCell> }>} results
 * @param {{ starts?: string[], prefix?: string }} [opts] prefix: the ongoing run's ids (`ongoing:`)
 */
export function matrixMarkdown(results, opts = {}) {
  const prefix = opts.prefix || "";
  const cells = spineCells(opts).map((c) => ({ ...c, id: prefix + c.id }));
  const counts = { pass: 0, fail: 0, skipped: 0, notRun: 0 };
  const lines = [];
  const failures = [];
  const starts = [...new Set(cells.map((c) => c.start))];
  for (const start of starts) {
    lines.push(`### From: ${START_LABELS[start] || start}`, "");
    lines.push(`| State | ${MOVES.join(" | ")} |`, `|---|${MOVES.map(() => "---").join("|")}|`);
    for (const state of STATES) {
      const row = MOVES.map((move) => {
        const c = cells.find((x) => x.start === start && x.state === state && x.move === move);
        if (c.skip) return "·";
        const r = results[c.id];
        if (!r) {
          counts.notRun += 1;
          return "not run";
        }
        if (r.skip) {
          counts.skipped += 1;
          return "skipped";
        }
        if (cellPassed(r.verdict)) {
          counts.pass += 1;
          return "pass";
        }
        counts.fail += 1;
        failures.push({ id: c.id, verdict: r.verdict });
        return "**FAIL**";
      });
      if (row.every((x) => x === "·")) continue;
      lines.push(`| ${state} | ${row.join(" | ")} |`);
    }
    lines.push("");
  }
  if (failures.length) {
    lines.push("### Failures", "");
    for (const f of failures) {
      const why = ["lands", "typing", "back", "focus"].filter((k) => f.verdict[k].ok === false).map((k) => `${k}: ${f.verdict[k].why}`);
      lines.push(`- \`${f.id}\` — ${why.join("; ")}`);
    }
    lines.push("");
  }
  const skippedRuns = Object.entries(results).filter(([id, r]) => r.skip && id.startsWith(prefix) && (prefix || !id.includes(":")));
  if (skippedRuns.length) {
    lines.push("### Skipped by the probe", "");
    for (const [id, r] of skippedRuns) lines.push(`- \`${id}\` — ${r.skip}`);
    lines.push("");
  }
  lines.push("`·` = not a cell (the start cannot reach that state, or the move does not apply).");
  return { counts, markdown: lines.join("\n") };
}
