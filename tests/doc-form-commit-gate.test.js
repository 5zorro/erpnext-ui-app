/**
 * Plan 2026-10-25, R6a-1 step 2: the commit gate's flow written once (`src/doc-form-commit-gate-ui.js`),
 * driven here with stand-in elements and a stand-in api; the last block checks that both pages
 * use it and keep none of their own.
 *
 * @covers src/bill-form-page.js src/doc-form-page.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createCommitGate } from "../src/doc-form-commit-gate-ui.js";

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const settle = () => new Promise((r) => setTimeout(r, 0));

// The DOM helpers list blockers as <li> and focus Cancel on the next frame.
globalThis.requestAnimationFrame = (fn) => fn();
globalThis.document = /** @type {any} */ ({ createElement: () => ({ textContent: "" }) });

function button(choice) {
  return { disabled: false, hidden: false, title: "", textContent: "", getAttribute: () => choice, focus() {} };
}

function setup(over = {}) {
  const buttons = Object.fromEntries(["cancel", "discard", "save", "submit"].map((c) => [c, button(c)]));
  const els = {
    commitGate: {
      hidden: true,
      dataset: {},
      querySelector: (sel) => buttons[(sel.match(/data-gate='(\w+)'/) || [])[1]] || null,
      querySelectorAll: () => Object.values(buttons),
    },
    commitGateTitle: { textContent: "" },
    commitGateValidation: { className: "" },
    commitGateValidationTitle: { textContent: "" },
    commitGateBlockers: { hidden: true, items: [], replaceChildren(...items) { this.items = items; } },
    commitGateHint: { textContent: "", className: "" },
  };
  const calls = [];
  const state = { userEdited: true, doc: { name: "ACC-PINV-1" }, blockers: [], meta: [], saveRes: { ok: true }, discardRes: { ok: true, doc: { name: "ACC-PINV-1" } } };
  const api = {
    resolveNavGate: (token, proceed) => calls.push(["nav", token, proceed]),
    revertUnsaved: async () => state.discardRes,
  };
  const deps = {
    els: () => els,
    api: () => api,
    lastDoc: () => state.doc,
    userEdited: () => state.userEdited,
    setStatus: (text, cls) => calls.push(["status", text, cls]),
    focusSurface: () => {},
    saveBlockers: () => [...state.blockers, ...state.meta],
    setMetaBlockers: (b) => (state.meta = b),
    preflight: { can: () => false, read: async () => null, apply: () => {} },
    save: async (submit) => (calls.push(["save", submit]), state.saveRes),
    afterDiscard: (res, trigger) => calls.push(["afterDiscard", trigger.kind]),
    runAction: async (action, trigger) => calls.push(["run", action, trigger && trigger.findPrefill]),
    announceBlocker: (text) => calls.push(["blocked", text]),
    text: {
      title: () => "Bill",
      triggerLabel: (t) => (t.kind === "nav" ? t.label || "leaving this Bill" : `${t.action}…`),
      readyTitle: () => "Doc Bill + live ERP meta preflight passed",
      cancelHint: () => "Choose Cancel to return to the Bill and fix these fields.",
      saveWarning: () => "",
      erpFailureView: (reason) => ({ title: "ERPNext rejected the save:", blockers: [reason], blocked: true, hint: "x" }),
    },
    ...over,
  };
  return { gate: createCommitGate(deps), els, calls, state, buttons };
}

describe("the commit gate: toolbar actions", () => {
  it("on a clean page Find runs straight away, with its prefill; no gate", async () => {
    const { gate, els, calls, state } = setup();
    state.userEdited = false;
    await gate.requestToolbarAction("find", { findPrefill: { billNo: "7" } });
    assert.equal(els.commitGate.hidden, true);
    assert.deepEqual(calls, [["run", "find", { billNo: "7" }]]);
  });

  it("on unsaved work the gate opens, titled for the action; Cancel closes it and runs nothing", async () => {
    const { gate, els, calls } = setup();
    await gate.requestToolbarAction("find");
    assert.equal(els.commitGate.hidden, false);
    assert.equal(els.commitGateTitle.textContent, "Unsaved changes — before find…");
    assert.equal(els.commitGateValidationTitle.textContent, "Doc Bill + live ERP meta preflight passed");
    gate.cancelFromOutside();
    await settle();
    assert.equal(els.commitGate.hidden, true);
    assert.deepEqual(calls, []);
  });

  it("Discard reverts, lets the page repaint, closes the gate and runs the action", async () => {
    const { gate, els, calls } = setup();
    await gate.requestToolbarAction("new");
    await gate.resolve("discard");
    assert.equal(els.commitGate.hidden, true);
    assert.deepEqual(calls.map((c) => c[0]), ["status", "afterDiscard", "run"]);
  });

  it("a failed discard keeps the gate open and says why", async () => {
    const { gate, els, calls, state } = setup();
    state.discardRes = { ok: false, reason: "ERPNext is down." };
    await gate.requestToolbarAction("new");
    await gate.resolve("discard");
    assert.equal(els.commitGate.hidden, false);
    assert.deepEqual(calls.at(-1), ["status", "ERPNext is down.", "err"]);
  });

  it("Print after discarding a brand-new document is refused: nothing would be left to print", async () => {
    const { gate, els, calls, state } = setup();
    state.doc = { name: "new-purchase-invoice-1" };
    await gate.requestToolbarAction("print");
    await gate.resolve("discard");
    assert.equal(els.commitGate.hidden, false);
    assert.equal(calls.at(-1)[2], "warn");
  });
});

describe("the commit gate: saving from it", () => {
  it("Save while blocked is not tried: the page announces the first blocker, the gate stays", async () => {
    const { gate, els, calls, state, buttons } = setup();
    state.blockers = ["Vendor (Supplier) is required."];
    await gate.requestToolbarAction("find");
    assert.equal(buttons.save.disabled, true);
    await gate.resolve("save");
    assert.deepEqual(calls, [["blocked", "Vendor (Supplier) is required."]]);
    assert.equal(els.commitGate.hidden, false);
  });

  it("a save ERPNext refuses with blockers shows them all, keeps the gate, runs nothing", async () => {
    const refused = [];
    const { gate, els, calls, state } = setup({ afterSaveRefused: (reason, b) => refused.push([reason, b]) });
    state.saveRes = { ok: false, reason: "Mandatory", blockers: ["Due Date is required."] };
    await gate.requestToolbarAction("find");
    await gate.resolve("submit");
    assert.deepEqual(calls, [["save", true]]);
    assert.deepEqual(state.meta, ["Due Date is required."]);
    assert.equal(els.commitGateBlockers.items.length, 1);
    assert.equal(els.commitGateHint.textContent, "Choose Cancel to return to the Bill and fix these fields.");
    assert.deepEqual(refused, [["Mandatory", ["Due Date is required."]]]);
    assert.equal(els.commitGate.hidden, false);
  });

  it("a save refused without blockers shows ERPNext's reason", async () => {
    const { gate, els, state } = setup();
    state.saveRes = { ok: false, reason: "Timed out" };
    await gate.requestToolbarAction("find");
    await gate.resolve("save");
    assert.equal(els.commitGateValidationTitle.textContent, "ERPNext rejected the save:");
  });
});

describe("the commit gate: navigation", () => {
  it("a clean page proceeds at once; unsaved work asks, and Save then proceeds", async () => {
    const { gate, calls, state } = setup();
    state.userEdited = false;
    gate.navRequested("t1", "Home");
    assert.deepEqual(calls, [["nav", "t1", true]]);
    state.userEdited = true;
    gate.navRequested("t2", "Home");
    await gate.resolve("save");
    assert.deepEqual(calls.slice(1), [["save", false], ["nav", "t2", true]]);
  });

  it("a second navigation releases the first one's waiter; a withdrawn one closes only its own gate", async () => {
    const { gate, els, calls } = setup();
    gate.navRequested("t1", "Home");
    gate.navRequested("t2", "Recent");
    assert.deepEqual(calls, [["nav", "t1", false]]);
    gate.navCancelled("t1");
    assert.equal(els.commitGate.hidden, false);
    gate.navCancelled("t2");
    assert.equal(els.commitGate.hidden, true);
  });

  it("Cancel on a navigation tells main to stay", async () => {
    const { gate, calls } = setup();
    gate.navRequested("t1");
    await gate.resolve("cancel");
    assert.deepEqual(calls, [["nav", "t1", false]]);
  });
});

describe("the commit gate: the live preflight", () => {
  it("only the newest read is applied, and the open gate's list refreshes from it", async () => {
    const answers = [];
    const applied = [];
    const { gate, els, state } = setup({
      preflight: {
        can: () => true,
        read: () => new Promise((r) => answers.push(r)),
        apply: (res) => {
          applied.push(res);
          state.meta = res ? res.blockers : [];
        },
      },
    });
    await gate.requestToolbarAction("find"); // opens → read 1
    void gate.refreshPreflight(); // read 2
    answers[1]({ blockers: ["Company is required."] });
    answers[0]({ blockers: ["stale"] });
    await settle();
    assert.deepEqual(applied, [{ blockers: ["Company is required."] }]);
    assert.equal(els.commitGateValidationTitle.textContent, "Save is blocked by:");
  });

  it("a read that fails clears the blockers (apply(null))", async () => {
    const applied = [];
    const { gate } = setup({
      preflight: { can: () => true, read: async () => Promise.reject(new Error("down")), apply: (r) => applied.push(r) },
    });
    await gate.refreshPreflight();
    assert.deepEqual(applied, [null]);
  });
});

describe("the commit gate: direct save (doc-form)", () => {
  it("shows why a Submit was refused; Save & submit from it closes it once it works", async () => {
    const copy = { textContent: "" };
    const { gate, els, buttons, calls } = setup({ directSave: { copyEl: () => copy } });
    gate.openDirectSaveBlocked(["Supplier is required."], { submit: true });
    assert.equal(els.commitGateTitle.textContent, "Cannot submit yet");
    assert.equal(buttons.discard.hidden, true);
    assert.equal(buttons.save.hidden, true);
    await gate.resolve("submit");
    assert.deepEqual(calls, [["save", true]]);
    assert.equal(els.commitGate.hidden, true);
    assert.equal(buttons.discard.hidden, false);
    assert.equal(copy.textContent, "This decision must be resolved before you can continue.");
  });

  it("a page without it (the Bill) never opens it", () => {
    const { gate, els } = setup();
    gate.openDirectSaveBlocked(["x"], {});
    assert.equal(els.commitGate.hidden, true);
  });
});

describe("both pages use the shared gate and keep none of their own", () => {
  for (const page of ["../src/bill-form-page.js", "../src/doc-form-page.js"]) {
    it(page.slice(7), () => {
      const src = read(page);
      assert.match(src, /const commitGate = createCommitGate\(\{/);
      assert.match(src, /onResolveChoice: \(choice\) => commitGate\.resolve\(choice\)/);
      assert.match(src, /api\.onOpenNavGate\(\(payload\) =>\s*commitGate\.navRequested\(/);
      assert.match(src, /api\.onCancelNavGate\(\(token\) => commitGate\.navCancelled\(token\)\)/);
      for (const gone of ["pendingGate", "function openGate", "function resolveCommitGate", "function refreshMetaPreflight", "function hideCommitGate", "function setGateBusy"]) {
        assert.ok(!src.includes(gone), `${gone} is still in ${page}`);
      }
    });
  }
  it("the doc-form page has the direct-save gate; the Bill does not", () => {
    assert.match(read("../src/doc-form-page.js"), /directSave: \{ copyEl:/);
    assert.doesNotMatch(read("../src/bill-form-page.js"), /directSave:/);
  });
});
