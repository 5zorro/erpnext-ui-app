import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Review 10-19 session 2 (R9, R10c, R6c): the fixes that live in main.js wiring, where a pure test
 * cannot reach. Each test pins one rule; the reason is in the finding row of
 * docs/implementation-plan-2026-10-19.md (closed 2026-10-25; in git history — HANDOFF § Reviewing
 * what was built says how to find it).
 */

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const main = read("../electron/main.js");
const preload = read("../electron/pay-outstanding-preload.cjs");
const board = read("../electron/pay-outstanding.src.html");

/** The body of `async function <name>(` or `function <name>(`, by matching braces. */
function fnBody(src, name) {
  const at = src.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(at >= 0, `${name} not found`);
  let i = src.indexOf("{", src.indexOf(")", at));
  const start = i;
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) break;
  }
  return src.slice(start, i + 1);
}

/** The handler body registered for one IPC channel. */
function handlerBody(src, channel) {
  const at = src.indexOf(`ipcMain.handle("${channel}"`);
  assert.ok(at >= 0, `${channel} not found`);
  const next = src.indexOf("\nipcMain.", at + 10);
  return src.slice(at, next < 0 ? undefined : next);
}

describe("R9-2: a failure before anything was sent is labelled, so nothing else reads as 'nothing changed'", () => {
  it("erpEval marks the not-ready view and erpExec's off-ERPNext refusal as notRun", () => {
    const body = fnBody(main, "erpEval");
    assert.match(body, /notRun: true, reason: "ERP view not ready"/);
    assert.match(body, /notRun: !!\(e && .*\.notRun\)/);
    assert.match(fnBody(main, "erpExec"), /\.notRun = true/);
  });

  it("voidAndAmendDoc reads its result through voidAmendOutcome, not by hand", () => {
    assert.match(fnBody(main, "voidAndAmendDocOnce"), /return voidAmendOutcome\(raw, nm,/);
  });
});

describe("R9-3: one void-and-amend per document at a time, in main too", () => {
  it("a second start for the same document is refused before anything runs", () => {
    const body = fnBody(main, "voidAndAmendDoc");
    assert.match(body, /voidingDocs\.has\(busyKey\)/);
    assert.match(body, /notRun: true/);
    assert.match(body, /finally \{\s*voidingDocs\.delete\(busyKey\)/);
  });
});

describe("Batch method change: stop at the first bill that did not go as asked; chips move as it runs", () => {
  const body = handlerBody(main, "run-mode-change");
  it("stops by modeChangeShouldStop, not only at a stranded bill", () => {
    assert.match(body, /if \(modeChangeShouldStop\(one\)\) stopped = item\.invoice;/);
    assert.doesNotMatch(body, /r\.cancelled && !r\.amendedName\) stopped/);
  });
  it("reports progress before and after each bill, and marks the rest not attempted", () => {
    assert.match(body, /progress\(\{ invoice: item\.invoice, phase: "working" \}\)/);
    assert.match(body, /progress\(one\)/);
    assert.match(body, /notAttempted: true/);
    assert.match(body, /e\.sender\.send\("mode-change-progress"/);
  });
  it("the board subscribes to the progress and offers Try again on the remainder", () => {
    assert.match(preload, /onModeChangeProgress:/);
    assert.match(preload, /removeListener\("mode-change-progress"/);
    assert.match(board, /api\.onModeChangeProgress\(/);
    assert.match(board, /modeChangeRemainder\(work, results\)/);
    assert.match(board, /method-panel-retry/);
  });
});

describe("R6c-1: a Bill's source limits are stored under the bill they were fetched for", () => {
  const body = fnBody(main, "enrichBillLineContext");
  it("takes the key before the fetch, and drops the answer if another bill is open", () => {
    const keyAt = body.indexOf("const key = doc && doc.name ? String(doc.name) : currentBillDocKey();");
    const fetchAt = body.indexOf("await fetchBillPoLineMeta(doc)");
    assert.ok(keyAt >= 0 && fetchAt > keyAt, "key must be computed before the await");
    assert.match(body, /if \(currentBillDocKey\(\) !== key\)[\s\S]*stale: true/);
  });
  it("the background loop ignores a stale answer", () => {
    assert.match(fnBody(main, "scheduleBillEnrichBackground"), /!enrichRaw\.stale/);
  });
});

describe("R6c-2: the background retry says when it gives up", () => {
  it("pushes one last snapshot with enrichPending.gaveUp at max rounds", () => {
    const body = fnBody(main, "scheduleBillEnrichBackground");
    const maxAt = body.indexOf("round >= BILL_ENRICH_MAX_ROUNDS");
    assert.ok(maxAt >= 0);
    assert.match(body.slice(maxAt, maxAt + 1200), /enrichPending: \{ \.\.\.enrichPending, gaveUp: true \}/);
  });
});

describe("R6c-3: the settle wait and bridge wait are only on the path that reads through the form", () => {
  it("the HTTP answer returns before any bridge wait or sleep", () => {
    const body = fnBody(main, "fetchBillPoLineMeta");
    const httpReturn = body.indexOf("return http;");
    const bridge = body.indexOf("await ensureErpFormBridge();");
    const settle = body.indexOf("await sleep(BILL_LINE_CONTEXT_SETTLE_MS);");
    assert.ok(httpReturn >= 0 && bridge > httpReturn && settle > httpReturn);
    assert.doesNotMatch(fnBody(main, "enrichBillSnapshotExtrasInner"), /BILL_LINE_CONTEXT_SETTLE_MS/);
  });
  it("PO titles come from the PO documents when the HTTP path answered", () => {
    assert.match(fnBody(main, "enrichBillSnapshotExtrasInner"), /linkedPurchaseOrdersForBill\(doc, enrichRaw\.poTitles\)/);
  });
});

describe("R10c-2 / R9-4: payment, term and re-link writes leave a trail on both sides", () => {
  for (const [channel, tag] of [
    ["create-batch-payment-entry", "payment-create-batch"],
    ["create-blank-payment-entry", "payment-create-blank"],
    ["create-payment-term", "payment-term-create"],
  ]) {
    it(`${channel} logs a start line and an outcome line`, () => {
      const body = handlerBody(main, channel);
      const lines = body.match(new RegExp(`navDebug\\(\\s*"${tag}"`, "g")) || [];
      assert.equal(lines.length, 2, `${channel}: expected 2 navDebug("${tag}") lines`);
      assert.match(body, /start /);
    });
  }
  it("the just-in-time payment at bill submit logs both sides", () => {
    const at = main.indexOf("const pe = await createJitPaymentEntryForBill(raw.doc.name, jitIntent);");
    const around = main.slice(at - 200, at + 200);
    assert.equal((around.match(/navDebug\("payment-create-jit"/g) || []).length, 2);
  });
  it("auto re-link logs its reason, and whether each link got its provenance and review flag", () => {
    assert.match(handlerBody(main, "auto-relink"), /reason=\$\{out\.reason\}/);
    assert.match(fnBody(main, "autoRelinkForSupplier"), /provenance=.*flagged=/);
    assert.match(handlerBody(main, "payment-relink"), /provenance=/);
  });
});

describe("R6c-4: a just-in-time receipt whose submit is refused is not left behind as a draft", () => {
  it("inserts and submits separately, and deletes the refused draft", () => {
    const body = handlerBody(main, "bill-jit-receipts");
    assert.match(body, /step: "insert"/);
    assert.match(body, /frappe\.client\.delete", args: \{ doctype: "Purchase Receipt", name: draft \}/);
    assert.match(body, /draftDeleted: false/);
    assert.match(body, /could not be removed — delete it in ERPNext/);
  });
});

describe("Review of the fixes: the payment insert and the JIT receipt read a mid-way death as uncertain", () => {
  it("insertAndSubmitPaymentEntry maps a missing or catch-all step to 'uncertain'", () => {
    // Up to the function's closing line: its injected script holds braces the matcher would miscount.
    const at = main.indexOf("async function insertAndSubmitPaymentEntry(");
    const body = main.slice(at, main.indexOf("\n}\n", at));
    assert.match(body, /const finished = !!r\.step && r\.step !== "unknown";/);
    assert.match(body, /"uncertain"/);
  });
  it("bill-jit-receipts says the receipt may already have been made", () => {
    assert.match(handlerBody(main, "bill-jit-receipts"), /the receipt may already have been made/);
  });
});
