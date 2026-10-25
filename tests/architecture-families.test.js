/**
 * Keeps the coverage map (src/architecture-families.js) honest against the tree: a new module,
 * page, spec or test that belongs to no family fails here, and so does a paper naming a family
 * that does not exist. Plan 2026-10-03 stage C.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ARCHITECTURE_FAMILIES, PAPER_KIND_FAMILIES, familyOfModule, familiesOfPath, paperFamilies, planForChange,
} from "../src/architecture-families.js";
import { DOGFOOD_SOURCES } from "../src/sample-data/dogfood-ap-sources.js";
import { testImportsFor } from "../scripts/dogfood-for-change.js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const ids = new Set(ARCHITECTURE_FAMILIES.map((f) => f.id));

describe("the coverage map covers the tree", () => {
  it("every src/ module belongs to exactly one family", () => {
    const strays = walk("src").filter((p) => p.endsWith(".js")).map((p) => p.slice(4, -3))
      .map((m) => [m, familyOfModule(m)]).filter(([, r]) => !r.ok).map(([m, r]) => `${m}: ${r.reason} ${r.candidates.join(",")}`);
    assert.deepEqual(strays, []);
  });
  it("every Electron page, preload and style belongs to a family", () => {
    const strays = walk("electron").filter((p) => !familiesOfPath(p).length);
    assert.deepEqual(strays, []);
  });
  it("every e2e spec belongs to a family, and every listed spec exists", () => {
    const specs = fs.readdirSync(path.join(ROOT, "e2e")).filter((f) => f.endsWith(".spec.js"));
    assert.deepEqual(specs.filter((s) => !familiesOfPath(`e2e/${s}`).length), []);
    const listed = ARCHITECTURE_FAMILIES.flatMap((f) => f.e2e || []);
    assert.deepEqual(listed.filter((s) => !specs.includes(s)), []);
  });
  it("every unit test reaches a family through what it imports or names", () => {
    const strays = fs.readdirSync(path.join(ROOT, "tests")).filter((f) => f.endsWith(".test.js"))
      .filter((t) => !familiesOfPath(`tests/${t}`, { testImports: testImportsFor(path.join(ROOT, "tests", t), ROOT) }).length);
    assert.deepEqual(strays, []);
  });
  it("names no module or path twice", () => {
    const seen = new Map();
    for (const f of ARCHITECTURE_FAMILIES) for (const p of f.paths || []) {
      assert.ok(!seen.has(p), `${p} is owned by ${seen.get(p)} and ${f.id}`);
      seen.set(p, f.id);
    }
  });
});

describe("the dogfood papers name real families", () => {
  it("every paper's kind has default families, and every `touches` is a family", () => {
    for (const d of DOGFOOD_SOURCES) {
      assert.ok(PAPER_KIND_FAMILIES[d.kind], `${d.id}: kind ${d.kind}`);
      for (const t of d.touches || []) assert.ok(ids.has(t), `${d.id} touches unknown family ${t}`);
    }
  });
  it("every family has a paper, or says why not", () => {
    const covered = new Set(DOGFOOD_SOURCES.flatMap(paperFamilies));
    const silent = ARCHITECTURE_FAMILIES.filter((f) => !covered.has(f.id) && !f.noPaper).map((f) => f.id);
    assert.deepEqual(silent, []);
  });
});

describe("planForChange", () => {
  const testImports = {
    "tests/payment-timeline.test.js": ["src/payment-timeline.js", "src/check-run-schedule.js"],
    "tests/peek-stack.test.js": ["src/peek-stack.js"],
  };
  it("a change to the statement's timeline asks for the trace papers and its own tests, not the whole pack", () => {
    const p = planForChange({ changed: ["src/payment-timeline.js"], testImports, papers: DOGFOOD_SOURCES });
    assert.deepEqual(p.families.map((f) => f.id), ["trace"]);
    assert.deepEqual(p.families[0].tests, ["tests/payment-timeline.test.js"]);
    assert.ok(p.families[0].papers.every((x) => x.id.startsWith("DF-25")));
    assert.equal(p.broad, false);
  });
  it("a change to the navigation spine asks for a broad round", () => {
    const p = planForChange({ changed: ["src/peek-stack.js"], testImports, papers: DOGFOOD_SOURCES });
    assert.equal(p.broad, true);
  });
  it("runs a changed test without dogfooding everything it imports", () => {
    const p = planForChange({ changed: ["tests/payment-timeline.test.js"], testImports, papers: DOGFOOD_SOURCES });
    assert.deepEqual(p.families, []);
    assert.deepEqual(p.testsChanged, ["tests/payment-timeline.test.js"]);
  });
  it("lists a changed file no family owns, and ignores docs", () => {
    const p = planForChange({ changed: ["docs/x.md", "somewhere/new.js"], testImports, papers: [] });
    assert.deepEqual(p.unmapped, ["somewhere/new.js"]);
  });
});
