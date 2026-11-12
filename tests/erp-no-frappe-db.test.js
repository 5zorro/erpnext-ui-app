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
import { mainProcessSource } from "./main-process-source.js";

const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
/** main.js and the electron/ipc/ modules split from it, as one text (line numbers count through it). */
const main = mainProcessSource();
const bridge = read("electron/erp-form-bridge-page.js");

/** Code lines only: comments say "frappe.db" on purpose. */
const codeCalls = (src) =>
  src
    .split("\n")
    .map((l, i) => ({ l, n: i + 1 }))
    .filter(({ l }) => /frappe\.db\.\w+/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l));

describe("no frappe.db.* in the ERPNext-page scripts (R7-5)", () => {
  for (const [name, src] of [["electron/main.js + electron/ipc/", main], ["electron/erp-form-bridge-page.js", bridge]]) {
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

describe("a refused read is pending, not empty (the Bill's background loading, R7-5 follow-up)", () => {
  // Before the sweep a refused frappe.db.get_list hung, timed out, and the enrich loop retried it
  // until "Couldn't load — press Refresh". xList fails at once; reading that as "no POs" / "no
  // limits" left the Bill at "still loading" with no retry (dogfood R6c-2 caught it, 2026-10-25).
  it("the three loaders return { failed } on a refusal, not an empty answer", () => {
    assert.match(main, /if \(!raw \|\| !raw\.ok\) return \{ failed: \(raw && raw\.reason\) \|\| "no answer" \};\s*return linkedPurchaseOrdersForBill/);
    assert.match(main, /if \(!raw \|\| !raw\.ok\) return \{ failed: \(raw && raw\.reason\) \|\| "no answer" \}; \/\/ pending, not "none"\s*return linkedPurchaseReceiptsForBill/);
    assert.match(main, /if \(!raw \|\| raw\.ok === false\) return \{ meta, poTitles: null, failed:/);
    assert.match(main, /const \{ meta: poLineMeta, poTitles, failed \} = await fetchBillPoLineMeta\(doc\);\s*if \(failed\) return \{ failed \};/);
  });
  it("a round where a read failed at once waits as long as a timed-out round did (~2 min to give up)", () => {
    assert.match(main, /const BILL_ENRICH_FAILED_GAP_MS = 8000;/);
    assert.match(main, /await sleep\(failedFast \? BILL_ENRICH_FAILED_GAP_MS : BILL_ENRICH_RETRY_GAP_MS\);/);
    assert.equal((main.match(/failedFast = true;/g) || []).length, 3);
  });
  it("the open path and the retry loop keep a failed slice pending", () => {
    for (const what of ["lineContext failed round", "linkedPos failed round", "linkedReceipts failed round"]) assert.ok(main.includes(what), what);
    for (const what of ["source line enrich: ${enrichRaw.failed}", "linked PO titles: ${linkedRaw.failed}", "linked Item Receipt refs: ${linkedPrRaw.failed}"]) assert.ok(main.includes(what), what);
  });
});


/**
 * The end of the call that opens at `src[open]` (a "("), skipping strings, comments and `${…}`.
 * @returns {number} the index of its ")"
 */
function callEnd(src, open) {
  const close = { "(": ")", "[": "]", "{": "}" };
  const stack = [];
  for (let j = open; j < src.length; j += 1) {
    const c = src[j];
    if (c === "/" && src[j + 1] === "/") j = src.indexOf("\n", j);
    else if (c === "/" && src[j + 1] === "*") j = src.indexOf("*/", j) + 1;
    else if (c === '"' || c === "'") {
      for (j += 1; j < src.length && src[j] !== c; j += 1) if (src[j] === "\\") j += 1;
    } else if (c === "$" && src[j + 1] === "{") {
      stack.push("}");
      j += 1;
    } else if (close[c]) stack.push(close[c]);
    else if (c === ")" || c === "]" || c === "}") {
      assert.equal(stack.pop(), c, `unbalanced near ${src.slice(open, open + 80)}`);
      if (!stack.length) return j;
    }
  }
  throw new Error(`no end for ${src.slice(open, open + 80)}`);
}

describe("the shell's own calls in the ERPNext page are silent (gotchas G27)", () => {
  // A refused call otherwise leaves ERPNext's message box in the (hidden) ERPNext page.
  const sources = [
    ["electron/main.js + electron/ipc/", main],
    ["electron/erp-form-bridge-page.js", bridge],
    ["src/erp-refusal-reason.js", read("src/erp-refusal-reason.js")],
  ];
  for (const [name, src] of sources) {
    it(`${name}: every frappe.call / frappe.xcall passes silent: true`, () => {
      const loud = [];
      let checked = 0;
      for (const m of src.matchAll(/frappe\.(x?call)\(/g)) {
        const open = m.index + m[0].length - 1;
        const call = src.slice(m.index, callEnd(src, open) + 1);
        checked += 1;
        // The bridge's save reads ERPNext's refusal, closes the box itself, and reads the box when
        // the refusal has no text.
        if (/savedocs/.test(call)) continue;
        if (!/silent: true/.test(call)) loud.push(call.replace(/\s+/g, " ").slice(0, 100));
      }
      assert.ok(checked > 0, "no calls found");
      assert.deepEqual(loud, []);
    });
  }
});
