import { test } from "node:test";
import assert from "node:assert/strict";
import { cruftFindings, NAV_STATE_MAX_BYTES } from "../src/nav-cruft.js";
import { vanishedKey } from "../src/nav-prune.js";

const st = (pairs) => new Map(pairs.map(([dt, n, s]) => [vanishedKey(dt, n), s]));

test("cruftFindings: a clean session finds nothing", () => {
  assert.deepEqual(
    cruftFindings({
      shelved: [{ doctypeKey: "purchase-invoice", name: "A" }],
      recent: [{ route: "/app/purchase-invoice/A" }, { route: "/app/supplier/X" }, { route: "/app/purchase-invoice/new-purchase-invoice-q" }],
      submitted: [{ doctypeKey: "purchase-invoice", name: "S" }],
      docstatus: st([["purchase-invoice", "A", 0], ["purchase-invoice", "S", 1], ["supplier", "X", 0]]),
      atHome: true,
      peekStack: null,
      navStateBytes: 2000,
    }),
    [],
  );
});

test("cruftFindings: deleted, submitted and cancelled drafts, and duplicates, each name their rule", () => {
  const f = cruftFindings({
    shelved: [
      { doctypeKey: "purchase-invoice", name: "GONE" },
      { doctypeKey: "purchase-invoice", name: "SUB" },
      { doctypeKey: "purchase-invoice", name: "CAN" },
      { doctypeKey: "purchase-invoice", name: "A" },
      { doctypeKey: "purchase-invoice", name: "A" },
    ],
    recent: [{ route: "/app/purchase-invoice/GONE" }, { route: "/app/purchase-invoice/A" }, { route: "/app/purchase-invoice/A?x=1" }],
    submitted: [{ doctypeKey: "purchase-invoice", name: "GONE" }],
    docstatus: st([["purchase-invoice", "GONE", null], ["purchase-invoice", "SUB", 1], ["purchase-invoice", "CAN", 2], ["purchase-invoice", "A", 0]]),
  });
  assert.deepEqual(
    f.map((x) => `${x.rule} ${x.row}`),
    [
      "drafts-exist purchase-invoice/GONE",
      "drafts-are-drafts purchase-invoice/SUB",
      "drafts-are-drafts purchase-invoice/CAN",
      "drafts-once purchase-invoice/A",
      "recent-exist purchase-invoice/GONE",
      "recent-once /app/purchase-invoice/A",
      "submitted-exist purchase-invoice/GONE",
    ],
  );
  assert.match(f[2].why, /cancelled/);
});

test("cruftFindings: a record ERPNext was not asked about is not judged", () => {
  assert.deepEqual(cruftFindings({ shelved: [{ doctypeKey: "purchase-invoice", name: "X" }], docstatus: new Map() }), []);
});

test("cruftFindings: a peek or park left open at Home, and an unbounded nav-state", () => {
  const f = cruftFindings({ atHome: true, peekStack: { parent: {} }, parked: { route: "/x" }, navStateBytes: NAV_STATE_MAX_BYTES + 1 });
  assert.deepEqual(f.map((x) => x.rule), ["home-no-peek", "home-no-park", "nav-state-bounded"]);
  assert.deepEqual(cruftFindings({ atHome: false, peekStack: { parent: {} } }), []);
});

test("cruft lines round-trip into the nav:check section", async () => {
  const { cruftLine, parseCruftLines, cruftMarkdown } = await import("../src/nav-cruft.js");
  const log = [
    "x",
    cruftLine("after the day", [{ rule: "drafts-exist", list: "drafts", row: "purchase-invoice/D1", why: "deleted in ERPNext, still on the Drafts list" }], { drafts: 4 }),
    cruftLine("after a restart", [], { drafts: 3 }),
    "NAVCRUFT {torn",
  ].join("\n");
  const checks = parseCruftLines(log);
  assert.equal(checks.length, 2);
  const md = cruftMarkdown(checks);
  assert.match(md, /\*\*after the day\*\* \(drafts 4\): 1 finding/);
  assert.match(md, /`drafts-exist` purchase-invoice\/D1/);
  assert.match(md, /\*\*after a restart\*\* \(drafts 3\): clean/);
  assert.equal(cruftMarkdown([]), "");
});
