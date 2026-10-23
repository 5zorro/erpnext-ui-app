import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Review 10-19 session 3 (R2, R3, R4): the fixes that live in main.js and page wiring, where a pure
 * test cannot reach. Each test pins one rule; the reason is in the finding row of
 * docs/implementation-plan-2026-10-19.md.
 */

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const main = read("../electron/main.js");
const docPage = read("../src/doc-form-page.js");
const billPage = read("../src/bill-form-page.js");
const findPage = read("../electron/find-doc.html");

/** From `async function <name>(` / `function <name>(` up to its closing line (template-safe). */
function fnText(src, name) {
  const at = src.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(at >= 0, `${name} not found`);
  return src.slice(at, src.indexOf("\n}\n", at));
}

/** The handler registered for one IPC channel, up to its closing `});`. */
function handlerText(src, channel) {
  const at = src.search(new RegExp(`ipcMain\\.(?:handle|on)\\("${channel}"`));
  assert.ok(at >= 0, `${channel} not found`);
  return src.slice(at, src.indexOf("\n});\n", at) + 4);
}

describe("R2-1: a script in a page that reloads or crashes is ended, not left pending", () => {
  it("erpEval registers every call and removes it when it settles", () => {
    const body = fnText(main, "erpEval");
    assert.match(body, /pendingErpEvals\.add\(interrupt\)/);
    assert.match(body, /pendingErpEvals\.delete\(interrupt\)/);
  });
  it("the interruption carries no notRun, so a write reads it as 'may already be done'", () => {
    const body = fnText(main, "erpEval");
    const line = body.slice(body.indexOf("const interrupt ="), body.indexOf("pendingErpEvals.add"));
    assert.doesNotMatch(line, /notRun/);
  });
  it("a committed load, a crash and a closed view end every pending call", () => {
    assert.match(main, /erp\.webContents\.on\("render-process-gone"[^\n]*interruptPendingErpEvals/);
    assert.match(main, /erp\.webContents\.on\("destroyed"[^\n]*interruptPendingErpEvals/);
    const nav = main.slice(main.indexOf('erp.webContents.on("did-navigate", (_e, url) => {'));
    assert.match(nav.slice(0, 200), /interruptPendingErpEvals\("reloaded"\)/);
  });
});

describe("R2-2: a Bill line's bridge Purchase Order is never lost silently", () => {
  const body = handlerText(main, "bill-apply-line-allocation");
  it("inserts and submits as separate steps, and deletes a draft whose submit was refused", () => {
    assert.match(body, /step: "insert"/);
    assert.match(body, /step: "submit", draft: saved\.name, draftDeleted: true/);
    assert.match(body, /frappe\.client\.delete", args: \{ doctype: "Purchase Order", name: saved\.name \}/);
  });
  it("says when the PO was not made, and logs both sides", () => {
    assert.match(body, /bridgeFailure = bridgePoFailureText\(bridge\)/);
    assert.match(body, /bridgeFailure: bridgeFailure \|\| undefined/);
    assert.ok((body.match(/navDebug\(\s*"bill-bridge-po"/g) || []).length >= 3);
    assert.match(billPage, /if \(res\.bridgeFailure\) setStatus\(/);
  });
});

describe("R2-3: the unused bill-so-bridge-po write path is gone", () => {
  it("no handler, preload or adapter entry remains", () => {
    assert.doesNotMatch(main, /bill-so-bridge-po/);
    assert.doesNotMatch(read("../electron/doc-form-preload.cjs"), /bridgeSalesOrderToPo/);
    assert.doesNotMatch(read("../src/bill-doc-api-adapter.js"), /bridgeSalesOrderToPo/);
  });
});

describe("R2-4: the Bill and doc-form channels share one body per action", () => {
  for (const [bill, doc, fn] of [
    ["bill-clear-all-qty", "doc-clear-all-qty", "clearAllQtyAction"],
    ["bill-set-tax", "doc-set-tax", "setTaxRowAction"],
    ["bill-add-tax", "doc-add-tax", "addTaxRowAction"],
    ["bill-delete-tax", "doc-delete-tax", "deleteTaxRowAction"],
    ["bill-revert-unsaved", "doc-revert-unsaved", "revertUnsavedAction"],
  ]) {
    it(`${bill} and ${doc} both call ${fn}`, () => {
      const bodyBill = main.slice(main.indexOf(`ipcMain.handle("${bill}"`)).split("\nipcMain.")[0];
      const bodyDoc = main.slice(main.indexOf(`ipcMain.handle("${doc}"`)).split("\nipcMain.")[0];
      assert.match(bodyBill, new RegExp(`${fn}\\(`));
      assert.match(bodyDoc, new RegExp(`${fn}\\(`));
      assert.doesNotMatch(bodyBill + bodyDoc, /bridgeCall\(|erpEval\(/, "the work is in the shared function");
    });
  }
  it("the doc-form tax channels keep the Item-Receipt-only gate", () => {
    for (const ch of ["doc-set-tax", "doc-add-tax", "doc-delete-tax"]) {
      const body = main.slice(main.indexOf(`ipcMain.handle("${ch}"`)).split("\nipcMain.")[0];
      assert.match(body, /docFormTaxesRefusal\(\) \|\|/);
    }
  });
});

describe("R2-6: the dogfood logs are rotated at startup", () => {
  it("rotateDebugLogs runs before the window is made, over all four logs", () => {
    const ready = main.slice(main.indexOf("app.whenReady().then(() => {"));
    assert.ok(ready.indexOf("rotateDebugLogs();") < ready.indexOf("createWindow();"));
    const body = fnText(main, "rotateDebugLogs");
    for (const p of ["navDebugLogPath", "focusDebugLogPath", "navIncidentLogPath", "focusIncidentLogPath"]) {
      assert.match(body, new RegExp(`${p}\\(\\)`));
    }
  });
});

describe("R2-7: a charge allocation that fails part way puts the raised rates back", () => {
  const body = handlerText(main, "bill-allocate-charge");
  it("every failure path goes through the undo, which answers with the form as it now is", () => {
    // Three since R6b-3: a rate refused, the lines not rising in ERPNext, the offset refused.
    assert.equal((body.match(/return undoRaised\(/g) || []).length, 3);
    assert.match(body, /tax_amount: actual\.allocatedTotal/);
    assert.match(body, /doc: dirtyState\.doc, reason: `\$\{why\} Nothing was changed\.`/);
    assert.match(body, /partial: true/);
  });
});

describe("R3-1: focus put back after a wait is taken where the clerk is, not where they were", () => {
  it("the doc-form header paths repaint with keepFocus, and no anchor is taken before the await", () => {
    const at = docPage.indexOf("async function onHeaderBlur(input) {");
    const body = docPage.slice(at, docPage.indexOf("async function flushDateExpectedFromInput()", at));
    assert.doesNotMatch(body, /captureFocusAnchor\(\)/);
    assert.equal((body.match(/keepFocus: true/g) || []).length, 4);
  });
  it("paint takes the anchor at its start and restores only when the repaint dropped focus", () => {
    const body = docPage.slice(docPage.indexOf("function paint(doc, snapScratch, opts = {}) {"));
    assert.match(body.slice(0, 600), /const focusAnchor = opts\.keepFocus \? captureFocusAnchor\(\) : null;/);
    assert.match(body, /if \(focusAnchor && \(!now \|\| now === document\.body\)\) restoreFocusAnchor\(focusAnchor\);/);
  });
  it("the Bill's Invoice-date retries stop once the clerk moved or is already there", () => {
    const at = billPage.indexOf("function scheduleFocusInvoiceDateField() {");
    const body = billPage.slice(at, billPage.indexOf("function focusInvoiceDateField()", at));
    assert.match(body, /const moveMark = userMoves\.mark\(\);/);
    assert.match(body, /if \(userMoves\.movedSince\(moveMark\) \|\| \(el\.date && document\.activeElement === el\.date\)\) return;/);
  });
});

describe("R4-1: the login question is asked on events, never on the health beat", () => {
  it("tickHealth asks only when the server's state changed", () => {
    const body = fnText(main, "tickHealth");
    assert.match(body, /if \(loginCheckOnHealthChange\(prevHealth, result\.status\)\) \{/);
    assert.equal((body.match(/tickLogin\(/g) || []).length, 1);
  });
  it("window focus, a refused signed-in read and an ERP load ask", () => {
    assert.match(main, /win\.on\("focus", \(\) => \{\s*if \(lastHealth === "ok"\) tickLogin\("focus"\)/);
    assert.match(fnText(main, "erpSessionFetchImpl"), /loginCheckAfterRefusal\(res && res\.status, url\)\) tickLogin\("refused"\)/);
    assert.match(main, /tickLogin\("navigate"\)/);
  });
  it("one question at a time, and an ask during one runs once more after it", () => {
    const body = fnText(main, "tickLogin");
    assert.match(body, /if \(tickLoginInflight\) \{\s*tickLoginAgain = why;/);
    assert.match(body, /if \(again\) tickLogin\(/);
  });
  it("nothing else in main sets a timer that asks", () => {
    assert.doesNotMatch(main, /setInterval\(tickLogin/);
  });
});

describe("R4-2: a failed Show more keeps the rows already read", () => {
  it("an append failure goes to moreError, leaving rows and error alone", () => {
    const at = findPage.indexOf("async function runQuery(");
    const body = findPage.slice(at, findPage.indexOf("function paintSummary()", at));
    assert.match(body, /if \(append && failed\) \{[\s\S]*state\.moreError = failed;\s*\} else \{/);
    assert.match(findPage, /data-testid="find-doc-more-error"/);
  });
});
