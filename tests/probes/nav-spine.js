/**
 * The navigation spine's driver (plan 2026-10-24 build step 2): reaches a Bill from one start, puts
 * it in a state, makes a move the way a clerk does (the real Home tiles, toolbar tabs, Recent and
 * Drafts rows, Find rows, the board's door), and records what it saw. `src/nav-spine.js` judges
 * each cell and prints the matrix; `npm run nav:check` runs every `nav-spine-*` probe.
 *
 * Fresh state: each launch starts from an empty `nav-state.json` (no Drafts, no Submitted list) —
 * run only through `npm run probe`, which backs up and restores the prefs (the driver refuses
 * otherwise). A cell that fails relaunches the app so one failure does not spill into the next.
 * Records: two draft Bills `ZZ-NAV-A` / `ZZ-NAV-B` (made if missing, deleted at the end); a
 * submitted bill is only read. Nothing is ever saved by a cell: typing is discarded.
 * The shell's own "Unsaved changes" box is stubbed (a real one would block the probe): it records
 * each ask and answers Stay, or Leave while a cell is being cleared away.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect } from "@playwright/test";
import { launchShell, waitForE2eApi, e2eCall, e2eGet } from "../../e2e/helpers.js";
import { sleep, inDoc, inErp, inBoard, inFind, keys, report, closeSourcePickers, repaintDoc } from "./probe-helpers.js";
import { billCompareTotal } from "../../src/bill-map.js";
import { spineCells, judgeCell, cellLine, cellPassed, isTyped, isNew } from "../../src/nav-spine.js";

const VENDOR = "ALPINE SUPPLY CO";
const ITEM = "SAMPLE-SKU-01";
const REF_A = "ZZ-NAV-A";
const REF_B = "ZZ-NAV-B";
const PI = "/app/purchase-invoice";
/** Per run, so a typed ref never matches a leftover from an earlier run. */
const RUN = String(Date.now() % 100000);

/** A poll's read that a page mid-load can throw from ("Script failed to execute"): read as null, poll again. */
const soft = (p) => Promise.resolve(p).catch(() => null);
const inChrome = (app, js) => e2eCall(app, "execInView", "chrome", js);
const inHome = (app, js) => e2eCall(app, "execInView", "home", js);
const inHist = (app, js) => e2eCall(app, "execInView", "hist", js);
const surface = (app) => e2eGet(app, "surfaceMode");
const click = (testid) => `(() => { const b = document.querySelector('[data-testid=${JSON.stringify(testid)}]'); if (!b) return false; b.click(); return true; })()`;

const ERP_FORM = `(() => { const f = window.cur_frm; return f && f.doc ? { doctype: f.doctype, name: f.doc.name, ref: f.doc.bill_no || "", supplier: f.doc.supplier || "" } : null; })()`;
const DOC_PAGE = `(async () => { const s = await window.erpDoc.getSnapshot(); const r = document.getElementById("f-billno"); const st = (document.getElementById("status") || {}).textContent || "";
  return { name: s && s.doc ? s.doc.name : "", supplier: s && s.doc ? s.doc.supplier || "" : "", ref: r ? r.value : null, status: st }; })()`;
const ACTIVE = `(() => { const a = document.activeElement; return a && a.dataset && a.dataset.field ? { field: a.dataset.field, row: a.dataset.row } : null; })()`;
const GATE = `(() => { const g = document.querySelector('[data-testid="doc-commit-gate"]'); return !!(g && !g.hidden); })()`;

/** Empty `nav-state.json` before a launch — only when run-probe has backed the prefs up. */
function freshNavState() {
  if (!process.env.ERP_PROBE_PREFS_BACKUP) throw new Error("run through `npm run probe` (it backs up the prefs this empties)");
  fs.rmSync(path.join(os.homedir(), ".config", "erpnext-ui-app", "nav-state.json"), { force: true });
}

async function launch() {
  freshNavState();
  const app = await launchShell();
  await waitForE2eApi(app);
  await expect.poll(() => e2eCall(app, "getErpUrl"), { timeout: 30_000 }).toMatch(/\/(app|desk)\b/);
  await app.evaluate(({ dialog }) => {
    globalThis.__navAsks = 0;
    globalThis.__navAnswer = 0;
    dialog.showMessageBoxSync = () => {
      globalThis.__navAsks += 1;
      return globalThis.__navAnswer;
    };
  });
  // Playwright answers a page's own "leave?" prompt and throws when Electron answered it first (G23).
  const quiet = (p) => p.on("dialog", (d) => d.dismiss().catch(() => {}));
  app.context().pages().forEach(quiet);
  app.context().on("page", quiet);
  await e2eCall(app, "setLensPref", "purchase-invoice", "doc");
  return app;
}
const asks = (app) => app.evaluate(() => globalThis.__navAsks);
const answer = (app, a) => app.evaluate((_e, v) => { globalThis.__navAnswer = v; }, a);

/** Back to Home with nothing left open; unsaved typing is discarded. */
async function goHomeClean(app) {
  await answer(app, 1);
  try {
    if ((await surface(app)) === "home") return;
    await inChrome(app, click("btn-home"));
    for (let i = 0; i < 20 && (await surface(app)) !== "home"; i += 1) {
      await sleep(500);
      if ((await inDoc(app, GATE)) === true) await inDoc(app, click("doc-gate-discard"));
    }
    await expect.poll(() => surface(app), { timeout: 15_000 }).toBe("home");
  } finally {
    await answer(app, 0);
  }
}

/** The two ZZ-NAV drafts (made if missing) and a submitted bill with a vendor's ref. */
async function findOrMakeDocs(app) {
  const r = await inErp(
    app,
    `(async () => {
      const one = async (ref) => {
        const got = await frappe.xcall("frappe.client.get_list", { doctype: "Purchase Invoice", filters: { bill_no: ref, docstatus: 0 }, fields: ["name"], limit_page_length: 1 });
        if (got[0]) return got[0].name;
        const d = await frappe.xcall("frappe.client.insert", { doc: { doctype: "Purchase Invoice", supplier: ${JSON.stringify(VENDOR)}, bill_no: ref, items: [{ item_code: ${JSON.stringify(ITEM)}, qty: 1, rate: 10 }] } });
        return d.name;
      };
      const s = await frappe.xcall("frappe.client.get_list", { doctype: "Purchase Invoice", filters: { docstatus: 1, bill_no: ["is", "set"] }, fields: ["name", "bill_no", "supplier"], order_by: "modified desc", limit_page_length: 1 });
      return { A: await one(${JSON.stringify(REF_A)}), B: await one(${JSON.stringify(REF_B)}), S: s[0] ? s[0].name : "", sRef: s[0] ? s[0].bill_no : "" };
    })()`,
    40_000,
  );
  if (!r || r === "TIMEOUT" || !r.A || !r.B) throw new Error(`could not find or make the ZZ-NAV drafts: ${JSON.stringify(r)}`);
  return { ...r, refs: { [r.A]: REF_A, [r.B]: REF_B, [r.S]: r.sRef }, made: [] };
}

async function waitDoc(app, name, ms = 40_000) {
  await expect
    .poll(async () => {
      if ((await soft(surface(app))) !== "doc") return "";
      const p = await soft(inDoc(app, DOC_PAGE, 10_000));
      return p && p.name ? p.name : "";
    }, { timeout: ms })
    .toMatch(name instanceof RegExp ? name : new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}$`));
}

async function waitErpForm(app, doctype, name) {
  await expect
    .poll(async () => {
      const f = await soft(inErp(app, ERP_FORM));
      return !!(f && f.doctype === doctype && (!name || f.name === name || (name === "new" && /^new-/.test(f.name))));
    }, { timeout: 40_000 })
    .toBe(true);
}

/** Put both drafts where the starts need them: on the Drafts list (a Vanilla save) and in Recent. */
async function setUp(app, docs) {
  for (const name of [docs.B, docs.A]) {
    await e2eCall(app, "openErp", `${PI}/${encodeURIComponent(name)}`);
    await waitErpForm(app, "Purchase Invoice", name);
    await inErp(app, `(async () => { cur_frm.dirty(); await cur_frm.save(); return true; })()`, 30_000);
    await expect.poll(async () => (await e2eCall(app, "getShelved")).some((d) => d.name === name), { timeout: 20_000 }).toBe(true);
    await e2eCall(app, "openBill", `${PI}/${encodeURIComponent(name)}`);
    await waitDoc(app, name);
    await goHomeClean(app);
  }
}

/** Click the Recent (or Drafts) row for `name`; false when there is none. */
const clickRow = (app, name, lists) =>
  inHist(
    app,
    `(() => { const b = [...document.querySelectorAll(${JSON.stringify(lists.map((l) => `#${l} button`).join(", "))})].find((x) => (x.title || "").endsWith("/" + ${JSON.stringify(encodeURIComponent(name))}) || (x.title || "").endsWith("/" + ${JSON.stringify(name)}));
      if (!b) return false; b.click(); return true; })()`,
  );
const RECENT = ["list-recent", "list-older"];
const railRows = (app) => inHist(app, `[...document.querySelectorAll("#list-recent button, #list-older button, #list-drafts button")].map((b) => b.title).join(" | ")`);
const DRAFTS = ["list-drafts", "list-drafts-older"];

/** Reach the Bill for `state` from `start`; returns where it landed. */
async function arrive(app, start, state, docs) {
  const name = isNew(state) ? "" : state === "submitted" ? docs.S : docs.A;
  const route = name ? `${PI}/${encodeURIComponent(name)}` : `${PI}/new`;
  const want = name || /^new-purchase-invoice-/;
  if (start === "home") {
    await inHome(app, click("tile-bill-new"));
  } else if (start === "lens") {
    await e2eCall(app, "openErp", route);
    await waitErpForm(app, "Purchase Invoice", name || "new");
    await inChrome(app, click("lens-doc"));
  } else if (start === "rail") {
    await e2eCall(app, "openBill", route);
    await waitDoc(app, want);
    await goHomeClean(app);
    if (!(await clickRow(app, name, RECENT))) return { ok: false, surface: "home", name: "no Recent row" };
  } else if (start === "drafts") {
    if (!(await clickRow(app, name, DRAFTS))) return { ok: false, surface: "home", name: "not on the Drafts list" };
  } else if (start === "erp-link") {
    await e2eCall(app, "openErp", PI);
    await expect.poll(() => soft(inErp(app, `(() => { const r = frappe.get_route(); return r[0] === "List" && r[1] === "Purchase Invoice"; })()`)), { timeout: 30_000 }).toBe(true);
    await sleep(1000);
    await inErp(app, `(() => { frappe.set_route("Form", "Purchase Invoice", ${JSON.stringify(name)}); return true; })()`);
  } else if (start === "find") {
    await e2eCall(app, "openErp", PI);
    await expect.poll(() => soft(inErp(app, `(() => frappe.get_route()[0] === "List")()`)), { timeout: 30_000 }).toBe(true);
    await sleep(1000);
    await inChrome(app, click("lens-doc"));
    await expect.poll(() => surface(app), { timeout: 15_000 }).toBe("find-doc");
    await inFind(app, `(() => { const i = document.querySelector('input[data-field="bill_no"]'); i.value = ${JSON.stringify(docs.refs[name])}; i.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
    await expect.poll(() => inFind(app, `!!document.querySelector('tr.row[data-name=${JSON.stringify(name)}]')`), { timeout: 30_000 }).toBe(true);
    await inFind(app, `(() => { document.querySelector('tr.row[data-name=${JSON.stringify(name)}]').click(); return true; })()`);
    await expect.poll(() => inFind(app, `(() => { const b = document.querySelector('[data-testid="find-doc-peek-open"]'); return !!(b && b.offsetParent); })()`), { timeout: 15_000 }).toBe(true);
    await inFind(app, click("find-doc-peek-open"));
  } else if (start === "board") {
    await inHome(app, click("tile-pay-bills"));
    await expect.poll(() => surface(app), { timeout: 20_000 }).toBe("pay-outstanding");
    await inBoard(app, `(() => { window.erpPayOutstanding.openDetour(${JSON.stringify(route)}); return true; })()`);
  }
  try {
    await waitDoc(app, want);
  } catch {
    const f = await inErp(app, ERP_FORM);
    return { ok: false, surface: await surface(app), name: f ? `${f.doctype} ${f.name}` : "" };
  }
  await sleep(2000);
  await closeSourcePickers(app);
  const p = await inDoc(app, DOC_PAGE);
  return { ok: true, surface: "doc", name: p.name, supplier: p.supplier };
}

/** Type `mark` into the vendor's ref box with real keys; true once ERPNext's form has it. */
async function typeMark(app, mark) {
  await inDoc(app, `(() => { const i = document.getElementById("f-billno"); i.focus(); i.select(); return true; })()`);
  await keys(app, `${mark}\t`);
  try {
    await expect.poll(async () => ((await inErp(app, ERP_FORM)) || {}).ref, { timeout: 10_000 }).toBe(mark);
    return true;
  } catch {
    return false;
  }
}

/**
 * After a move was started: did anything ask? Waits until the gate shows, the shell's box was
 * asked, or the surface became one of `until` (a function: until it says the move happened).
 */
async function askedOrMoved(app, asksBefore, until) {
  const moved = typeof until === "function" ? until : async () => until.includes(await surface(app));
  for (let i = 0; i < 30; i += 1) {
    if ((await inDoc(app, GATE)) === true) return { asked: true, how: "gate" };
    if ((await asks(app)) > asksBefore) return { asked: true, how: "box" };
    if (await moved()) return { asked: false };
    await sleep(500);
  }
  return { asked: false, stuck: await surface(app) };
}

/** The gate's buttons when the last Discard was clicked (a probe diagnostic). */
let gateButtons = "";
/** A gate is up: Stay, check the typing survived, then go again and Discard. */
async function stayThenDiscard(app, mark, redo) {
  await inDoc(app, click("doc-gate-cancel"));
  await sleep(1000);
  const p = await inDoc(app, DOC_PAGE);
  const stayKept = (await surface(app)) === "doc" && p.ref === mark;
  await redo();
  await expect.poll(() => inDoc(app, GATE), { timeout: 10_000 }).toBe(true);
  gateButtons = await inDoc(app, `[...document.querySelectorAll('[data-testid="doc-commit-gate"] [data-gate]')].map((b) => b.dataset.gate + (b.hidden ? ":hidden" : "") + (b.disabled ? ":disabled" : "")).join(" ")`);
  await inDoc(app, click("doc-gate-discard"));
  return stayKept;
}

/** Back to `name` by its rail row (Recent: the doctype's row, which reopens the last Bill); what the page and ERPNext then hold. */
async function backByRow(app, name, lists) {
  if (!(await clickRow(app, name, lists))) return { surface: await surface(app), name: `no row; rows: ${await railRows(app)}` };
  await waitDoc(app, name).catch(() => {});
  await sleep(1500);
  const p = await inDoc(app, DOC_PAGE);
  const saved = await inErp(app, `(async () => (await frappe.xcall("frappe.client.get_value", { doctype: "Purchase Invoice", filters: { name: ${JSON.stringify(name)} }, fieldname: "bill_no" })).bill_no || "")()`, 15_000);
  return { surface: await surface(app), name: p.name, ref: p.ref, savedRef: saved };
}

async function backHere(app) {
  const p = await inDoc(app, DOC_PAGE);
  return { surface: await surface(app), name: p.name, ref: p.ref };
}

/** One move from the document; fills `seen`. */
async function move(app, cell, docs, seen) {
  const typed = isTyped(cell.state);
  const mark = seen.mark;
  const before = await asks(app);
  if (cell.move === "desk" || cell.move === "other") {
    const go = async () => {
      if (cell.move === "desk") return inChrome(app, click("btn-home"));
      if (!(await clickRow(app, docs.B, DRAFTS))) throw new Error(`no Drafts row for ${docs.B}; rows: ${await railRows(app)}`);
      return true;
    };
    const until = cell.move === "desk" ? ["home"] : ["doc"];
    await go();
    const otherOpen = async () => (await surface(app)) === "doc" && ((await inDoc(app, DOC_PAGE)) || {}).name === docs.B;
    const r = await askedOrMoved(app, before, cell.move === "desk" ? until : otherOpen);
    seen.asked = r.asked;
    seen.step = r.how === "gate" ? "stay then discard" : "move";
    if (r.how === "gate") {
      seen.stayKept = await stayThenDiscard(app, mark, go);
      seen.gateButtons = gateButtons;
    } else if (r.how === "box") seen.stayKept = null;
    seen.step = "land";
    if (cell.move === "desk") {
      await expect.poll(() => surface(app), { timeout: 15_000 }).toBe("home");
      await inHome(app, click("tile-desk"));
      await expect.poll(() => surface(app), { timeout: 20_000 }).toBe("erp");
      await sleep(1500);
      seen.landed = { surface: await surface(app), route: await e2eCall(app, "currentRoute") };
    } else {
      await waitDoc(app, docs.B).catch(() => {});
      seen.landed = { surface: await surface(app), name: (await inDoc(app, DOC_PAGE)).name };
    }
    seen.step = "back";
    if (isNew(cell.state)) seen.back = null;
    else if (cell.move === "desk") seen.back = await backByRow(app, seen.arrived.name, RECENT);
    else if (cell.state === "submitted") seen.backNa = "Recent keeps one row per doctype, by design (5zorro 2026-10-24); a viewed submitted Bill is not on Submitted (only one submitted this session is) — nav-submitted-backtrack checks that way back";
    else seen.back = await backByRow(app, seen.arrived.name, DRAFTS);
    return;
  }
  if (cell.move === "lens") {
    const go = () => inChrome(app, click("lens-vanilla"));
    // 5zorro 2026-10-24 (plan answer 3): a typed new document is not carried across lenses — the
    // gate offers Save, and Vanilla opens that saved draft. So make it saveable first.
    const saveNew = isNew(cell.state);
    if (saveNew) {
      seen.step = "lens: make the new Bill saveable";
      await inDoc(app, `(async () => { const d = window.erpDoc; await d.setHeader("supplier", ${JSON.stringify(VENDOR)}); await d.setItem(0, "item_code", ${JSON.stringify(ITEM)}); await d.setItem(0, "qty", 1); await d.setItem(0, "rate", 10); return true; })()`, 60_000);
      await sleep(2500);
      const snap = await repaintDoc(app);
      await closeSourcePickers(app);
      // Save needs the vendor box and the amount due on the page (the API writes do not repaint it).
      const total = billCompareTotal(snap.doc);
      await inDoc(app, `(() => { document.querySelector('[data-testid="bill-vendor"]').value = ${JSON.stringify(VENDOR)}; const r = document.getElementById("f-billno"); if (r) r.value = ${JSON.stringify(mark)}; const a = document.querySelector('[data-testid="bill-amount-due"]'); a.focus(); a.value = ${JSON.stringify(String(total))}; a.dispatchEvent(new Event("input", { bubbles: true })); a.blur(); return true; })()`);
      await sleep(500);
      seen.step = "lens";
    }
    await go();
    const r = await askedOrMoved(app, before, ["erp"]);
    seen.asked = r.asked;
    if (r.how === "gate" && saveNew) {
      seen.step = "lens: Stay, then Save";
      await inDoc(app, click("doc-gate-cancel"));
      await sleep(1000);
      seen.stayKept = (await surface(app)) === "doc" && (await inDoc(app, DOC_PAGE)).ref === mark;
      await go();
      await expect.poll(() => inDoc(app, GATE), { timeout: 10_000 }).toBe(true);
      seen.gateOffersSave = await inDoc(app, `(() => { const b = document.querySelector('[data-testid="doc-gate-save"]'); return !!(b && b.offsetParent && !b.disabled); })()`);
      if (!seen.gateOffersSave) seen.gateSaid = await inDoc(app, `(() => { const h = document.querySelector('[data-testid="doc-commit-gate-hint"]'); const b = document.querySelector('[data-testid="doc-gate-blockers"]'); return [(h && h.textContent) || "", (b && b.textContent) || ""].join(" | ").trim(); })()`);
      if (seen.gateOffersSave) {
        await inDoc(app, click("doc-gate-save"));
        // A Bill's Save asks first whether the goods came with it: Bill only.
        for (let i = 0; i < 20 && (await surface(app)) === "doc"; i += 1) {
          if (await inDoc(app, `(() => { const b = document.querySelector('[data-testid="bill-receive-bill-only"]'); if (b && b.offsetParent) { b.click(); return true; } return false; })()`)) break;
          await sleep(500);
        }
        try {
          await expect.poll(() => surface(app), { timeout: 30_000 }).toBe("erp");
        } catch {
          seen.gateSaid = await inDoc(app, `(document.getElementById("status") || {}).textContent || ""`);
        }
        // The saved draft, whatever Vanilla opened (so the probe can delete it).
        const saved = await inErp(app, `(async () => { const r = await frappe.xcall("frappe.client.get_list", { doctype: "Purchase Invoice", filters: { bill_no: ${JSON.stringify(mark)}, docstatus: 0 }, fields: ["name"], limit_page_length: 1 }); return r[0] ? r[0].name : ""; })()`, 15_000);
        if (saved && saved !== "TIMEOUT") seen.savedDraft = saved;
      } else {
        await inDoc(app, click("doc-gate-discard"));
      }
    } else if (r.how === "gate") seen.stayKept = await stayThenDiscard(app, mark, go);
    await expect.poll(() => surface(app), { timeout: 15_000 }).toBe("erp");
    await sleep(1500);
    const f = (await inErp(app, ERP_FORM)) || {};
    seen.landed = { surface: await surface(app), doctype: f.doctype, name: f.name };
    seen.carried = typed ? f.ref === mark : null;
    await inChrome(app, click("lens-doc"));
    await expect.poll(() => surface(app), { timeout: 15_000 }).toBe("doc");
    await sleep(2000);
    seen.back = await backHere(app);
    return;
  }
  if (cell.move.startsWith("errand")) {
    seen.step = "errand: pick a line";
    // The clerk's Add line (the page's API add does not repaint the table); a blank last line is reused.
    const lastRow = `(() => { const c = [...document.querySelectorAll('input[data-field="item_code"][data-row]')]; const l = c[c.length - 1]; return l ? { row: Number(l.dataset.row), blank: !l.value } : { row: -1, blank: false }; })()`;
    let last = await inDoc(app, lastRow);
    if (!last.blank) {
      await inDoc(app, `(() => { const b = document.querySelector('[data-testid="bill-add-line"], [data-testid="doc-add-line"]'); b.click(); return true; })()`);
      await expect.poll(async () => (await inDoc(app, lastRow)).row, { timeout: 15_000 }).toBe(last.row + 1);
      last = await inDoc(app, lastRow);
    }
    const row = last.row;
    const cellSel = `document.querySelector('input[data-row="${row}"][data-field="item_code"]')`;
    await expect.poll(() => inDoc(app, `!!${cellSel}`), { timeout: 20_000 }).toBe(true);
    await inDoc(app, `(() => { const i = ${cellSel}; i.focus(); i.value = "ZZ-NO-SUCH-ITEM-NAV"; i.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
    seen.step = "errand: the create row";
    await expect.poll(() => inDoc(app, `!!document.querySelector('.link-dd:not([hidden]) [data-value="__doc_create_item__"]')`), { timeout: 15_000 }).toBe(true);
    await inDoc(app, `(() => { document.querySelector('.link-dd:not([hidden]) [data-value="__doc_create_item__"]').click(); return true; })()`);
    seen.step = "errand: the Item form";
    const r = await askedOrMoved(app, before, ["erp"]);
    seen.asked = r.asked;
    await waitErpForm(app, "Item");
    seen.landed = { surface: await surface(app), doctype: "Item" };
    if (cell.move === "errand-saved") {
      // Stand-in for Save on the new Item: Frappe then shows the saved Item (as scaffold-peek-return-focus).
      await inErp(app, `(() => { frappe.set_route("Form", "Item", ${JSON.stringify(ITEM)}); return true; })()`);
      await waitErpForm(app, "Item", ITEM);
      // The shell must have seen the hop to the saved Item before Esc (a real save takes a round trip;
      // the stand-in can open from Frappe's cache in under a second).
      await expect.poll(() => soft(e2eCall(app, "currentRoute")), { timeout: 15_000 }).toContain(`/item/${ITEM}`);
    }
    seen.step = "errand: Esc back";
    await inErp(app, `(() => { window.erpUiShell.softPeekEsc(); return true; })()`);
    await expect.poll(() => surface(app), { timeout: 20_000 }).toBe("doc");
    await sleep(2000);
    seen.back = await backHere(app);
    if (cell.move === "errand-saved") {
      seen.errandWant = ITEM;
      const itemNow = `(() => { const i = document.querySelector('input[data-row="${row}"][data-field="item_code"]'); return i ? i.value : null; })()`;
      // The line is filled after the return (as scaffold-peek-return-focus waits for it).
      await expect.poll(() => soft(inDoc(app, itemNow)), { timeout: 20_000 }).toBe(ITEM).catch(() => {});
      seen.errandItem = await inDoc(app, itemNow);
    }
    seen.focusWant = { field: "item_code", row: String(row) };
    seen.focus = await inDoc(app, ACTIVE);
    return;
  }
  if (cell.move === "peek") {
    await inDoc(app, `(() => { document.getElementById("f-billno").focus(); return true; })()`);
    const vendor = seen.arrived.supplier || VENDOR;
    await inDoc(app, `(() => { window.erpDoc.softPeekRoute(${JSON.stringify(`/app/supplier/${encodeURIComponent(vendor)}`)}); return true; })()`);
    const r = await askedOrMoved(app, before, ["erp"]);
    seen.asked = r.asked;
    await waitErpForm(app, "Supplier");
    seen.landed = { surface: await surface(app), doctype: "Supplier" };
    await inErp(app, `(() => { window.erpUiShell.softPeekEsc(); return true; })()`);
    await expect.poll(() => surface(app), { timeout: 20_000 }).toBe("doc");
    await sleep(2000);
    seen.back = await backHere(app);
    seen.focusWant = { field: "bill_no" };
    seen.focus = await inDoc(app, ACTIVE);
    return;
  }
  if (cell.move === "reload") {
    await e2eCall(app, "reloadErp");
    await sleep(3000);
    seen.asked = (await asks(app)) > before;
    await waitErpForm(app, "Purchase Invoice").catch(() => {});
    await sleep(6000);
    const p = await inDoc(app, DOC_PAGE);
    const f = (await inErp(app, ERP_FORM)) || {};
    const shown = /^(new-[a-z-]+-[a-z0-9]+|[A-Z][A-Z0-9-]+-\d+(?:-\d+)?)\b/.exec(String(p.status || "").trim());
    seen.landed = { surface: await surface(app), name: p.name };
    seen.reload = {
      docName: shown ? shown[1] : p.name,
      erpName: f.name,
      docRef: p.ref,
      erpRef: f.ref,
      status: p.status,
      notice: /never saved|ERPNext reloaded/i.test(p.status),
    };
  }
}

/** One cell, start to finish; never throws. */
async function runCell(app, cell, docs, n) {
  /** @type {import("../../src/nav-spine.js").Seen} */
  const seen = {};
  try {
    seen.step = "arrive";
    seen.arrived = await arrive(app, cell.start, cell.state, docs);
    if (!seen.arrived.ok) return seen;
    seen.step = "type";
    if (isTyped(cell.state)) {
      seen.mark = `ZZNAV${n}-${RUN}`;
      seen.typedLanded = await typeMark(app, seen.mark);
    }
    seen.step = "move";
    await move(app, cell, docs, seen);
    delete seen.step;
  } catch (e) {
    // eslint-disable-next-line no-control-regex
    const msg = String((e && e.message) || e).replace(/\x1b\[[0-9;]*m/g, "");
    const got = /Received: +(.*)/.exec(msg);
    seen.error = `${seen.step || "?"}: ${msg.split("\n")[0]}${got ? ` (got ${got[1]})` : ""}`.slice(0, 300);
  }
  return seen;
}

/**
 * Run every cell of one start (or the ids in `NAV_ONLY`, comma-separated). Prints a `NAVCELL`
 * line per cell; returns the ids that failed.
 * @param {string} start
 */
export async function runSpine(start) {
  const only = String(process.env.NAV_ONLY || "").split(",").map((s) => s.trim()).filter(Boolean);
  const cells = spineCells({ starts: [start] }).filter((c) => !c.skip && (!only.length || only.includes(c.id)));
  const failed = [];
  let app = await launch();
  let docs;
  try {
    docs = await findOrMakeDocs(app);
    report("docs", docs);
    await setUp(app, docs);
    for (const [i, cell] of cells.entries()) {
      if (cell.start === "board" && !docs.S) {
        console.log(cellLine(cell, null, "the sandbox has no submitted bill"));
        continue;
      }
      const seen = await runCell(app, cell, docs, i);
      if (seen.savedDraft) docs.made.push(seen.savedDraft);
      const verdict = judgeCell(cell, seen, { other: docs.B });
      report("seen", { id: cell.id, ...seen });
      console.log(cellLine(cell, verdict));
      let clean = true;
      try {
        await goHomeClean(app);
      } catch {
        clean = false;
      }
      if (!cellPassed(verdict)) failed.push(cell.id);
      if (!cellPassed(verdict) || !clean) {
        await app.close().catch(() => {});
        app = await launch();
        await setUp(app, docs);
      }
    }
  } finally {
    if (docs) {
      // The two drafts, and any draft a cell saved (its ref starts ZZNAV — only this probe types that).
      const gone = await inErp(app, `(async () => { const out = []; const typed = await frappe.xcall("frappe.client.get_list", { doctype: "Purchase Invoice", filters: { bill_no: ["like", "ZZNAV%"], docstatus: 0 }, fields: ["name"], limit_page_length: 0 });
        for (const n of [...new Set(${JSON.stringify([docs.A, docs.B, ...docs.made])}.concat(typed.map((r) => r.name)))]) { try { await frappe.xcall("frappe.client.delete", { doctype: "Purchase Invoice", name: n }); out.push(n); } catch (e) { out.push("kept " + n); } } return out; })()`, 60_000).catch(() => "ERR");
      report("cleanup", { deleted: gone });
    }
    await app.close().catch(() => {});
  }
  return { failed, ran: cells.length };
}
