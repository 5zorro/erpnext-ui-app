import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSimplifiedPayload } from "../src/assume-applier-payload.js";

/**
 * Review 10-19 session 6 (R7, R8, R12): the fixes that live in main.js, the ERPNext page bridge and
 * the Simplified payload, where a pure test cannot reach. Each test pins one rule; the reason is in
 * the finding row of docs/implementation-plan-2026-10-19.md.
 */

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const main = read("../electron/main.js");
const bridgePage = read("../electron/erp-form-bridge-page.js");
const createUi = read("../src/so-create-po-ui.js");

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

describe("R7-1: the Item Receipt lists POs still to receive", () => {
  const body = fnText(main, "fetchBillSourceSlice");
  it("po_to_receive filters on per_received, not per_billed", () => {
    const slice = body.slice(body.indexOf('sliceId === "po_to_receive"'), body.indexOf('sliceId === "pr_submitted"'));
    assert.match(slice, /per_received: \["<", 99\.99\]/);
    assert.doesNotMatch(slice, /per_billed/);
  });
  it("both PO slices leave out held and closed POs, and keep to the document's company", () => {
    assert.match(body, /const openPo = \["not in", \["Closed", "On Hold"\]\]/);
    for (const id of ["po_submitted", "po_to_receive"]) {
      const at = body.indexOf(`sliceId === "${id}"`);
      const slice = body.slice(at, body.indexOf("};", at));
      assert.match(slice, /onCompany\(\{[^}]*status: openPo/, id);
    }
  });
  it("a source that maps no lines is refused before the form is touched", () => {
    const h = handlerText(main, "doc-merge-source");
    const refuse = h.indexOf("emptySourceReason(");
    assert.ok(refuse > 0);
    assert.ok(refuse < h.indexOf('bridgeCall("mergeFromMapped"'));
    assert.match(bridgePage, /if \(!src \|\| !src\.items \|\| !src\.items\.length\) return/);
  });
});

describe("R7-2: the pre-streaming source path is gone", () => {
  it("no bill-list-sources / doc-list-sources handlers, and no page asks for them", () => {
    assert.doesNotMatch(main, /ipcMain\.handle\("(?:bill|doc)-list-sources"/);
    assert.doesNotMatch(read("../electron/doc-form-preload.cjs"), /list-sources"/);
  });
});

describe("R7-3: a receipt row names its PO from its own lines", () => {
  it("the receipt slices read the line's purchase_order through the receipt and roll it up", () => {
    const body = fnText(main, "fetchBillSourceSlice");
    assert.match(body, /tabPurchase Receipt Item\\`\.purchase_order as purchase_order/);
    assert.match(body, /rollUpReceiptRows\(raw\.lines\)/);
  });
  it("capped by receipts, not by lines: the lines are a second read for the receipts listed", () => {
    const body = fnText(main, "fetchBillSourceSlice");
    assert.match(body, /const receiptFields = \["name", "posting_date", "grand_total"\];/);
    assert.match(body, /filters: \[\["name", "in", rows\.map/);
  });
});

describe("R7-7: the Sales Orders slice is capped by orders, not by lines", () => {
  it("orders first (a page of 100), then only their lines; pages until 50 orders have a line to order", () => {
    const body = fnText(main, "fetchBillSourceSlice");
    assert.doesNotMatch(body, /limit: 500/);
    assert.match(body, /fields: \["name"\],\s*order_by: "transaction_date desc",\s*limit: 100,\s*orderLines:/);
    assert.match(body, /limit_start: \(p \+ 1\) \* \$\{spec\.limit\}/);
    assert.match(body, /Object\.keys\(due\)\.length >= 50/);
    assert.match(body, /salesOrdersToOrder\(raw\.rows\)\.slice\(0, 50\)/);
  });
});

describe("R7-4: a source slice the server refuses shows its error, never spins", () => {
  const body = fnText(main, "fetchBillSourceSlice");
  it("frappe.xcall, not frappe.db.get_list (G19)", () => {
    assert.match(body, /frappe\.xcall\("frappe\.client\.get_list"/);
    assert.doesNotMatch(body, /await frappe\.db\.get_list\(/);
  });
  it("and a deadline for a server that never answers", () => {
    assert.match(body, /Promise\.race\(\[/);
    assert.match(body, /sleep\(SOURCE_SLICE_DEADLINE_MS\)/);
  });
});

describe("R8-1: Create ▾ › Purchase Order never makes a second set", () => {
  const h = handlerText(main, "so-create-pos");
  it("one run per order at a time", () => {
    assert.match(h, /if \(soCreatePosRunning\.has\(so\)\)/);
    assert.match(h, /finally \{\s*soCreatePosRunning\.delete\(so\)/);
  });
  it("a run with no answer from the script is reported as uncertain", () => {
    const body = fnText(main, "soCreatePos");
    assert.match(body, /ran: true, saved: saved/);
    assert.match(body, /const uncertain = !res\.ok && !res\.ran && !res\.notRun/);
  });
  it("the dialog re-reads the drafts at Save, and closes on an uncertain result instead of offering Save again", () => {
    const save = createUi.slice(createUi.indexOf('save.addEventListener("click"'));
    assert.ok(save.indexOf("api.soCreatePoContext(") < save.indexOf("api.soCreatePos("));
    assert.match(save, /if \(res && res\.uncertain\) \{\s*\/\/[^\n]*\n\s*close\(\);/);
  });
});

describe("R8-3: the Sources column reads at once", () => {
  it("the six reads go through one Promise.all", () => {
    const h = handlerText(main, "so-line-sources");
    assert.match(h, /var reads = await Promise\.all\(\[/);
    assert.doesNotMatch(h, /out\.\w+ = await list\(/);
  });
});

describe("R12-1: leaving Simplified in-page leaves nothing behind, and a re-inject applies", () => {
  const payload = buildSimplifiedPayload();
  it("the refresh patch calls whichever skin is installed now, not its own closure's", () => {
    assert.match(payload, /var skin = window\.__simplifiedSkin;\s*if \(skin && typeof skin\.apply === "function"\) skin\.apply\(this\);/);
    assert.match(payload, /proto\.__ssRefreshPatched === 2/);
  });
  it("destroy gives every rewired form Frappe's own tab handlers and tab state back", () => {
    const destroy = payload.slice(payload.indexOf("function destroy()"));
    assert.match(destroy, /scrollNavForms\.forEach\(restoreScrollNav\)/);
    const restore = payload.slice(payload.indexOf("function restoreScrollNav("), payload.indexOf("function updateScrollNavActive("));
    assert.match(restore, /link\.off\("\.ssScrollNav"\)/);
    assert.match(restore, /tab\.setup_listeners\(\)/);
    assert.match(restore, /first\.set_active\(\)/);
  });
});

describe("R12-2: a Simplified skin that did not take is logged", () => {
  it("ensureSimplifiedSkin reads the version back", () => {
    const body = fnText(main, "ensureSimplifiedSkin");
    assert.match(body, /window\.__simplifiedSkin\.version/);
    assert.match(body, /navDebug\("simplified-skin-missing"/);
  });
});
