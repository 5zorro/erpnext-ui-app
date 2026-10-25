/**
 * Review 10-19 R7-5 (G19): no script the shell runs in the ERPNext page calls `frappe.db.*`.
 * `frappe.db.get_list` wraps its call in a promise that only ever resolves, so a list a clerk may
 * not read never settles and the page waits for good (R7-4 was one: "Still loading…" for a
 * Purchase User). The scripts use `xList` / `xValue` (`ERP_LIST_JS`), which go through
 * `frappe.xcall` and reject with the reason.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ERP_LIST_JS, PE_REASON_FROM_JS } from "../src/erp-refusal-reason.js";

const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const main = read("electron/main.js");
const bridge = read("electron/erp-form-bridge-page.js");

/** Code lines only: comments say "frappe.db" on purpose. */
const codeCalls = (src) =>
  src
    .split("\n")
    .map((l, i) => ({ l, n: i + 1 }))
    .filter(({ l }) => /frappe\.db\.\w+/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l));

describe("no frappe.db.* in the ERPNext-page scripts (R7-5)", () => {
  for (const [name, src] of [["electron/main.js", main], ["electron/erp-form-bridge-page.js", bridge]]) {
    it(`${name} calls none`, () => {
      assert.deepEqual(codeCalls(src).map(({ n, l }) => `${n}: ${l.trim()}`), []);
    });
  }

  it("nor does any page or src module", () => {
    const dirs = ["electron", "src"];
    const hits = [];
    for (const d of dirs) {
      for (const f of fs.readdirSync(new URL(`../${d}`, import.meta.url))) {
        if (!/\.(js|cjs|html)$/.test(f) || f === "main.js" || f === "erp-form-bridge-page.js") continue;
        for (const h of codeCalls(read(`${d}/${f}`))) hits.push(`${d}/${f}:${h.n}`);
      }
    }
    assert.deepEqual(hits, []);
  });

  it("every main.js script using xList / xValue carries the helpers, and reasonFrom where it reads a reason", () => {
    const starts = [...main.matchAll(/`\(async \(\) => \{/g)].map((m) => m.index);
    let checked = 0;
    for (const st of starts) {
      const end = main.indexOf("})()`", st);
      const t = main.slice(st, end);
      if (/\bxList\(|\bxValue\(/.test(t)) {
        checked++;
        assert.ok(t.includes("${ERP_LIST_JS}"), `script at ${main.slice(0, st).split("\n").length} lacks ERP_LIST_JS`);
      }
      if (/\breasonFrom\(/.test(t)) assert.ok(t.includes("${PE_REASON_FROM_JS}"), `script at ${main.slice(0, st).split("\n").length} lacks reasonFrom`);
    }
    assert.ok(checked >= 14, `found ${checked} scripts`);
  });

  it("the bridge's copy of the helpers is the shared one, word for word", () => {
    const norm = (t) => t.replace(/\s+/g, " ").trim();
    assert.ok(norm(bridge).includes(norm(ERP_LIST_JS)));
  });

  it("a child table's rows name their parent (or ERPNext refuses all but Administrator)", () => {
    for (const src of [main, bridge]) {
      for (const m of src.matchAll(/xList\("((?:Purchase Order|Purchase Receipt|Sales Order) Item|Payment Entry Reference)", \{([^}]*)/g)) {
        assert.match(m[2], /parent_doctype: "/, `xList("${m[1]}") has no parent_doctype`);
      }
    }
  });
});

describe("ERP_LIST_JS — frappe.db's defaults, through frappe.xcall", () => {
  function load(xcall) {
    const frappe = { xcall };
    return new Function("frappe", `${ERP_LIST_JS}; return { xList, xValue };`)(frappe);
  }

  it("asks reportview.get_list with fields ['name'] and limit 20 unless given", async () => {
    const asked = [];
    const { xList } = load(async (method, args) => (asked.push({ method, args }), []));
    await xList("Sales Order", { filters: [["customer", "=", "X"]] });
    await xList("Account", { fields: ["name", "company"], limit: 7, parent_doctype: "P" });
    assert.deepEqual(asked[0], { method: "frappe.desk.reportview.get_list", args: { filters: [["customer", "=", "X"]], doctype: "Sales Order", fields: ["name"], limit: 20 } });
    assert.deepEqual(asked[1].args, { fields: ["name", "company"], limit: 7, parent_doctype: "P", doctype: "Account" });
  });

  it("a refusal rejects (frappe.db.get_list never settled)", async () => {
    const { xList, xValue } = load(async () => { throw undefined; });
    await assert.rejects(xList("Sales Order", {}));
    await assert.rejects(xValue("Item", "X", ["item_name"]));
  });

  it("xValue asks frappe.client.get_value and gives back its message", async () => {
    const { xValue } = load(async (method, args) => ({ method, args }));
    assert.deepEqual(await xValue("Fiscal Year", "2026", "year_start_date"), {
      method: "frappe.client.get_value",
      args: { doctype: "Fiscal Year", filters: "2026", fieldname: "year_start_date" },
    });
  });

  it("reasonFrom still reads an xcall refusal", () => {
    assert.ok(PE_REASON_FROM_JS.startsWith("function reasonFrom("));
  });
});
