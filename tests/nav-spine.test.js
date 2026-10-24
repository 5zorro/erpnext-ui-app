import { test } from "node:test";
import assert from "node:assert/strict";
import {
  spineCells,
  judgeCell,
  cellLine,
  parseCellLines,
  cellPassed,
  matrixMarkdown,
  STARTS,
  STATES,
  MOVES,
} from "../src/nav-spine.js";

const draft = { ok: true, surface: "doc", name: "ACC-PINV-2026-00040" };
const fresh = { ok: true, surface: "doc", name: "new-purchase-invoice-abc" };

test("spineCells: every start × state × move, the unreachable ones skipped with a reason", () => {
  const cells = spineCells();
  assert.equal(cells.length, STARTS.length * STATES.length * MOVES.length);
  const home = cells.filter((c) => c.start === "home" && !c.skip);
  assert.deepEqual([...new Set(home.map((c) => c.state))], ["new-typed"]);
  const errandOnSubmitted = cells.find((c) => c.id === "lens/submitted/errand-saved");
  assert.match(errandOnSubmitted.skip, /read-only/);
  assert.match(cells.find((c) => c.id === "drafts/submitted/desk").skip, /saved drafts only/);
  assert.equal(cells.find((c) => c.id === "board/submitted/peek").skip, "");
  assert.deepEqual(
    spineCells({ starts: ["rail"] }).map((c) => c.start).filter((s, i, a) => a.indexOf(s) === i),
    ["rail"],
  );
});

test("judgeCell: leaving a typed draft must ask, Stay must keep it, and back shows what ERPNext has", () => {
  const cell = { start: "rail", state: "draft-typed", move: "desk" };
  const seen = {
    arrived: draft,
    mark: "ZZNAV1",
    typedLanded: true,
    asked: true,
    stayKept: true,
    landed: { surface: "erp", route: "/desk" },
    back: { surface: "doc", name: draft.name, ref: "ZZ-NAV-A", savedRef: "ZZ-NAV-A" },
  };
  const v = judgeCell(cell, seen);
  assert.equal(cellPassed(v), true);
  assert.equal(v.focus.ok, null);

  const silent = judgeCell(cell, { ...seen, asked: false });
  assert.equal(silent.typing.ok, false);
  assert.match(silent.typing.why, /asked nothing/);

  const stale = judgeCell(cell, { ...seen, back: { ...seen.back, ref: "ZZNAV1" } });
  assert.equal(stale.back.ok, false);
  assert.match(stale.back.why, /after a discard/);
});

test("judgeCell: a way back the rail does not offer is not judged, with the reason", () => {
  const v = judgeCell(
    { start: "find", state: "submitted", move: "other" },
    { arrived: draft, landed: { surface: "doc", name: "B" }, back: null, backNa: "no row of its own" },
    { other: "B" },
  );
  assert.deepEqual(v.back, { ok: null, why: "no row of its own" });
  assert.equal(cellPassed(v), true);
});

test("judgeCell: a clean document is never asked about", () => {
  const v = judgeCell(
    { start: "find", state: "draft-clean", move: "other" },
    { arrived: draft, asked: true, landed: { surface: "doc", name: "ACC-PINV-2026-00041" }, back: { surface: "doc", name: draft.name } },
    { other: "ACC-PINV-2026-00041" },
  );
  assert.equal(v.typing.ok, false);
  assert.match(v.typing.why, /clean document/);
  assert.equal(v.lands.ok, true);
});

test("judgeCell: a lens switch carries the typing there and back", () => {
  const cell = { start: "lens", state: "new-typed", move: "lens" };
  const ok = judgeCell(cell, {
    arrived: fresh,
    mark: "ZZNAV2",
    typedLanded: true,
    landed: { surface: "erp", doctype: "Purchase Invoice", name: "new-purchase-invoice-abc" },
    carried: true,
    back: { surface: "doc", name: "new-purchase-invoice-abc", ref: "ZZNAV2" },
  });
  assert.equal(cellPassed(ok), true);
  const lost = judgeCell(cell, {
    arrived: fresh,
    mark: "ZZNAV2",
    typedLanded: true,
    landed: { surface: "erp", doctype: "Purchase Invoice", name: "new-purchase-invoice-abc" },
    carried: false,
    back: { surface: "doc", name: "new-purchase-invoice-abc", ref: "" },
  });
  assert.equal(lost.typing.ok, false);
});

test("judgeCell: a reload under typing must ask or say so, and never leave stale typing", () => {
  const cell = { start: "home", state: "new-typed", move: "reload" };
  const silent = judgeCell(cell, {
    arrived: fresh,
    mark: "ZZNAV3",
    typedLanded: true,
    landed: { surface: "doc", name: "new-purchase-invoice-xyz" },
    reload: { docName: "new-purchase-invoice-xyz", erpName: "new-purchase-invoice-xyz", docRef: "", erpRef: "", notice: false },
  });
  assert.equal(silent.typing.ok, false);
  assert.match(silent.typing.why, /without a question/);
  assert.equal(silent.back.ok, null);

  const said = judgeCell(cell, {
    arrived: fresh,
    mark: "ZZNAV3",
    typedLanded: true,
    landed: { surface: "doc", name: "new-purchase-invoice-xyz" },
    reload: { docName: "new-purchase-invoice-xyz", erpName: "new-purchase-invoice-xyz", docRef: "", erpRef: "", notice: true },
  });
  assert.equal(said.typing.ok, true);

  const stale = judgeCell(
    { start: "rail", state: "draft-clean", move: "reload" },
    {
      arrived: draft,
      landed: { surface: "doc", name: draft.name },
      reload: { docName: draft.name, erpName: draft.name, docRef: "ZZNAV9", erpRef: "ZZ-NAV-A" },
    },
  );
  assert.equal(stale.typing.ok, false);
  assert.match(stale.typing.why, /no longer has/);
});

test("judgeCell: errand and peek return the cursor where it was", () => {
  const cell = { start: "drafts", state: "draft-clean", move: "peek" };
  const base = {
    arrived: draft,
    landed: { surface: "erp", doctype: "Supplier" },
    back: { surface: "doc", name: draft.name },
    focusWant: { field: "bill_no" },
  };
  assert.equal(judgeCell(cell, { ...base, focus: { field: "bill_no" } }).focus.ok, true);
  const lost = judgeCell(cell, { ...base, focus: null });
  assert.equal(lost.focus.ok, false);
  const wrongRow = judgeCell(
    { ...cell, move: "errand-abandoned" },
    { ...base, landed: { surface: "erp", doctype: "Item" }, focusWant: { field: "item_code", row: "1" }, focus: { field: "item_code", row: "0" } },
  );
  assert.match(wrongRow.focus.why, /row 0, not item_code row 1/);
});

test("judgeCell: a saved errand comes back with the new record in its line", () => {
  const cell = { start: "drafts", state: "draft-clean", move: "errand-saved" };
  const seen = {
    arrived: draft,
    landed: { surface: "erp", doctype: "Item" },
    back: { surface: "doc", name: draft.name },
    errandWant: "SKU-1",
    focusWant: { field: "item_code", row: "1" },
    focus: { field: "item_code", row: "1" },
  };
  assert.equal(cellPassed(judgeCell(cell, { ...seen, errandItem: "SKU-1" })), true);
  assert.match(judgeCell(cell, { ...seen, errandItem: "ZZ-NO-SUCH" }).back.why, /not the saved Item SKU-1/);
});

test("judgeCell: not arriving, or a probe error, fails the cell with the reason", () => {
  const cell = { start: "find", state: "submitted", move: "desk" };
  const v = judgeCell(cell, { arrived: { ok: false, surface: "find-doc" } });
  assert.equal(v.lands.ok, false);
  assert.match(v.lands.why, /did not arrive/);
  assert.equal(v.typing.ok, null);
  const e = judgeCell(cell, { error: "timeout" });
  assert.equal(cellPassed(e), false);
});

test("cell lines round-trip, and the matrix counts pass / FAIL / skipped / not run", () => {
  const passV = judgeCell(
    { start: "board", state: "submitted", move: "peek" },
    { arrived: draft, landed: { surface: "erp", doctype: "Supplier" }, back: { surface: "doc", name: draft.name }, focusWant: null },
  );
  const failV = judgeCell({ start: "board", state: "submitted", move: "desk" }, { arrived: { ok: false } });
  const log = [
    "noise",
    `PROBE x ${cellLine({ id: "board/submitted/peek" }, passV)}`,
    cellLine({ id: "board/submitted/desk" }, failV),
    cellLine({ id: "board/submitted/lens" }, null, "no open bill on the board"),
    `${"NAVCELL "}{torn`,
  ].join("\n");
  const results = parseCellLines(log);
  assert.equal(Object.keys(results).length, 3);
  const { counts, markdown } = matrixMarkdown(results, { starts: ["board"] });
  assert.deepEqual(counts, { pass: 1, fail: 1, skipped: 1, notRun: 2 });
  assert.match(markdown, /\| submitted \| \*\*FAIL\*\* \| skipped \| · \| · \| pass \| not run \| not run \|/);
  assert.match(markdown, /`board\/submitted\/desk` — lands: did not arrive/);
  assert.match(markdown, /no open bill on the board/);
  assert.doesNotMatch(markdown, /\| new-typed \|/);
});
