/**
 * Steps every probe needs (README.md here). Launch and `__erpE2e` come from `e2e/helpers.js`.
 */
import { expect } from "@playwright/test";
import { e2eCall, e2eGet, launchShell } from "../../e2e/helpers.js";
import { noteWait, timed } from "../../e2e/test-timing.js";

/** A deliberate pause: counted on the test's timing as its own wait, not the app's work. */
export const sleep = (ms) => {
  noteWait(ms);
  return new Promise((r) => setTimeout(r, ms));
};

/**
 * A person's reaction time (5zorro, plan 10-25 3b finding 7): how long the Doc page must stay
 * quiet before a probe acts again, and the pause after a wait that already saw what it needs.
 */
export const SETTLE_MS = 300;
export const settle = () => sleep(SETTLE_MS);

/**
 * Wait until the Doc page is quiet: no call to the main process waiting for its answer
 * (`erpDoc.inFlight()`), no pick list search pending (`data-search-pending`), ERPNext with no request out (`frappe.request.ajax_count`), and no repaint
 * for `quietMs` — all three held for `quietMs`. What a fixed `sleep` after an action was guessing
 * at. Not for proving that nothing happens later (a timer the app sets is not "in flight"): those
 * windows stay sleeps. Returns how long it waited.
 * @param {{ quietMs?: number, timeout?: number }} [o]
 */
export async function docQuiet(app, { quietMs = SETTLE_MS, timeout = 30_000 } = {}) {
  const t0 = Date.now();
  let calmSince = 0;
  for (;;) {
    const page = await inDoc(
      app,
      `(() => ({ busy: (window.erpDoc && window.erpDoc.inFlight ? window.erpDoc.inFlight() : 0) + document.querySelectorAll("[data-search-pending]").length, painted: window.__docPaintedAt || 0, now: Date.now() }))()`,
    ).catch(() => "TIMEOUT");
    // A read that throws (a page mid-reload) counts as "not calm yet", not a failed probe.
    const ajax = await inErp(app, `(window.frappe && frappe.request && frappe.request.ajax_count) || 0`).catch(() => "TIMEOUT");
    const now = Date.now();
    const calm =
      page && page !== "TIMEOUT" && page.busy === 0 && ajax === 0 && page.now - page.painted >= quietMs;
    if (calm) {
      if (!calmSince) calmSince = now;
      if (now - calmSince >= quietMs) return now - t0;
    } else {
      calmSince = 0;
    }
    if (now - t0 > timeout) throw new Error(`docQuiet: the Doc page stayed busy ${timeout} ms (${JSON.stringify({ page, ajax })})`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

/**
 * Wait until no pick list search is pending on the Doc page (`data-search-pending`): the list for
 * what was typed is showing. For a probe that types while something else is meant to be still in
 * flight, where `docQuiet` would wait for that too.
 */
export const searchDone = (app, timeout = 15_000) =>
  expect
    .poll(() => inDoc(app, `document.querySelectorAll("[data-search-pending]").length`), { timeout, intervals: [50] })
    .toBe(0);

/**
 * Launch the app under chaos lag (each ERPNext call `ms` late, `pct` % of the time), unless the run
 * already set its own. The setting is for this launch only: the next probe in the same run does not
 * inherit it (two probes once set it and never put it back).
 * @param {{ ms?: string, pct?: string }} [chaos]
 */
export async function launchWithChaos({ ms = "250", pct = "45" } = {}) {
  const before = { ERP_CHAOS_LAG_MS: process.env.ERP_CHAOS_LAG_MS, ERP_CHAOS_LAG_PCT: process.env.ERP_CHAOS_LAG_PCT };
  process.env.ERP_CHAOS_LAG_MS = before.ERP_CHAOS_LAG_MS || ms;
  process.env.ERP_CHAOS_LAG_PCT = before.ERP_CHAOS_LAG_PCT || pct;
  try {
    return await launchShell();
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/**
 * Wait until the warm pick-list copies for `doctypes` are loaded. Main loads them on its own 2 s
 * after a Doc page opens, so `docQuiet` (the page and ERPNext) cannot see them; a probe that types
 * with ERPNext's live search refused needs them first.
 */
export const warmCopies = (app, doctypes = ["Supplier", "Item"], timeout = 30_000) =>
  expect
    .poll(async () => {
      const have = await e2eCall(app, "linkListsLoaded");
      return doctypes.every((d) => have.includes(d));
    }, { timeout, intervals: [100] })
    .toBe(true);

/** Run `js` in a view, giving up after `ms` (a stalled ERPNext page must not hang the probe). */
function inView(app, view, js, ms = 8000) {
  return Promise.race([
    e2eCall(app, "execInView", view, js),
    new Promise((r) => setTimeout(() => r("TIMEOUT"), ms)),
  ]);
}
/** In the Doc page (Bill / PO / IR). */
export const inDoc = (app, js, ms) => inView(app, "docForm", js, ms);
/** In the ERPNext page (Vanilla) — `frappe.xcall` there, never `frappe.db.*` (G19). */
export const inErp = (app, js, ms) => inView(app, "erp", js, ms);

/**
 * Real keystrokes into the Doc page (e2e/GOTCHAS.md #15: a value set from script fires no
 * `change`, so nothing is committed). "\t" Tab, "\n" Enter, "\x1b" Escape.
 */
export async function keys(app, text) {
  await app.evaluate(({ webContents }, text) => {
    const wc = webContents.getAllWebContents().find((w) => /doc-form\.html/.test(w.getURL()));
    for (const c of text) {
      const k = c === "\t" ? "Tab" : c === "\n" ? "Enter" : c === "\x1b" ? "Escape" : c;
      wc.sendInputEvent({ type: "keyDown", keyCode: k });
      if (k === c) wc.sendInputEvent({ type: "char", keyCode: k });
      wc.sendInputEvent({ type: "keyUp", keyCode: k });
    }
  }, text);
}

/** Esc in a peek (Create Vendor…, a source's form): the same call the ERPNext page's Esc makes. */
export const escPeek = (app) => app.evaluate(({ ipcMain }) => ipcMain.emit("soft-peek-esc"));

/** Focus a Doc-page box by its `data-testid` and select its text. */
export const focusTestId = (app, testid) =>
  inDoc(app, `(() => { const i = document.querySelector('[data-testid=${JSON.stringify(testid)}]'); if (!i) return false; i.focus(); i.select && i.select(); return true; })()`);

/**
 * Open a Doc skin and wait until the page has ERPNext's form.
 * @param {"bill"|"po"|"receipt"} skin
 */
export async function openNewDoc(app, skin, route) {
  return timed("formLoaded", () => openNewDocUntimed(app, skin, route));
}

async function openNewDocUntimed(app, skin, route) {
  const opener = { bill: "openBill", po: "openPo", receipt: "openReceipt" }[skin];
  await e2eCall(app, opener, route);
  await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 20_000 }).toBe("doc");
  await expect
    .poll(async () => inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); return !!(s && s.ok && s.doc); })()`), { timeout: 40_000 })
    .toBe(true);
}

/** Does the ERPNext page still answer? (R5b-4: a stuck call left every later one waiting.) */
export const erpAnswers = async (app, ms = 8000) =>
  (await inErp(app, `(async () => (await frappe.xcall("frappe.auth.get_logged_user")) || "?")()`, ms)) !== "TIMEOUT";

/** Delete every sandbox Supplier named `ZZ…` (a probe's own); returns how many it found. */
export const deleteZzSuppliers = (app) =>
  inErp(app, `(async () => { try { const n = await frappe.xcall("frappe.client.get_list", { doctype: "Supplier", filters: { supplier_name: ["like", "ZZ%"] }, fields: ["name"] }); for (const r of n) await frappe.xcall("frappe.client.delete", { doctype: "Supplier", name: r.name }); return n.length; } catch (e) { return "ERR " + (e && e.message); } })()`, 20_000);

/** The Doc page's state a vendor probe reads. */
export const docState = (app) =>
  inDoc(
    app,
    `(async () => { const s = await window.erpDoc.getSnapshot(); const v = document.querySelector('[data-testid="doc-supplier"], [data-testid="bill-vendor"]'); const b = document.getElementById("doc-missing-vendor"); const a = document.activeElement; return { snapOk: !!(s && s.ok), erpSupplier: (s && s.doc && s.doc.supplier) || "", box: v ? v.value : null, banner: b && !b.hidden ? b.textContent : null, sourceModal: !!document.querySelector(".src-back:not([hidden])"), focus: a ? (a.dataset && a.dataset.field) || a.tagName : "" }; })()`,
    15_000,
  );

/** What a probe saw, on one line a later reader can grep for. */
export const report = (label, obj) => console.log(`PROBE ${label} ${JSON.stringify(obj)}`);

/**
 * For probes in `leaves-records/`: refuse to write unless every company on the site looks like the
 * sandbox ("sandbox" in its name). Throws, so the probe stops before making anything.
 */
export async function assertSandboxSite(app) {
  const cos = await inErp(app, `(async () => (await frappe.xcall("frappe.client.get_list", { doctype: "Company", fields: ["name"], limit_page_length: 0 })).map((c) => c.name))()`, 15_000);
  if (!Array.isArray(cos) || !cos.length || !cos.every((c) => /sandbox/i.test(c))) {
    throw new Error(`not the sandbox (companies: ${JSON.stringify(cos)}) — this probe leaves records and will not run here`);
  }
  return cos;
}

/** In the Pay Outstanding board. */
export const inBoard = (app, js, ms) => inView(app, "payOutstanding", js, ms);

/** Open Pay Outstanding from Home (its Doc lens) and wait for vendor cards (`{ cards: false }`: for the page only). */
/** A Home tile was clicked: wait until the shell has left Home (the board, or Vanilla's page). */
export const leftHome = async (app) => {
  await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 15_000 }).not.toBe("home");
  await settle();
};

export async function openBoard(app, { cards = true } = {}) {
  await e2eCall(app, "execInView", "home", `document.querySelector('[data-testid="tile-pay-bills"]').click(); true`);
  await leftHome(app);
  if ((await e2eGet(app, "surfaceMode")) !== "pay-outstanding") {
    await e2eCall(app, "execInView", "chrome", `document.querySelector('[data-testid="lens-doc"]').click(); true`);
  }
  await expect.poll(async () => e2eGet(app, "surfaceMode"), { timeout: 15_000 }).toBe("pay-outstanding");
  if (cards) await expect.poll(async () => inBoard(app, `document.querySelectorAll('[data-testid="vendor-card"]').length`), { timeout: 30_000 }).toBeGreaterThan(0);
}

/** `DOGFOOD_KEEP=1` (`npm run dogfood:setup`, or by hand): a probe leaves its scene for 5zorro. */
export const keepScene = () => process.env.DOGFOOD_KEEP === "1";

/**
 * "ERPNext stops" without stopping Docker: the app's session refuses every request whose URL
 * contains `part` (or any of a list) (the ERPNext page and the main process share it; the app sets no request hooks of
 * its own). `erpUp` lifts it. Always call `erpUp` in `finally`.
 */
export const erpDown = (app, part) =>
  app.evaluate(({ session }, parts) => {
    session.defaultSession.webRequest.onBeforeRequest((d, cb) => cb({ cancel: parts.some((p) => d.url.includes(p)) }));
  }, [].concat(part));
/** As `erpDown`, but the first `n` matching requests still go through ("stops part way"). */
export const erpDownAfter = (app, part, n) =>
  app.evaluate(({ session }, [p, k]) => {
    let seen = 0;
    session.defaultSession.webRequest.onBeforeRequest((d, cb) => cb({ cancel: d.url.includes(p) && ++seen > k }));
  }, [part, n]);
export const erpUp = (app) => app.evaluate(({ session }) => session.defaultSession.webRequest.onBeforeRequest(null));

/**
 * A held reply: every request to ERPNext whose URL contains `urlPart` and whose body (decoded)
 * contains `bodyPart` is held in flight, not refused, until `releaseHeld`; everything else goes
 * through. Lag makes edges common (5zorro): this puts the clerk's next move inside a reply's wait
 * every run. `heldCount` says how many wait. Like `erpDown`, it replaces the session's request
 * hook: call `releaseHeld`, then `erpUp`, in `finally`. Example: `vendor-pick-left-bill.probe.js`.
 */
export const holdRequests = (app, urlPart, bodyPart) =>
  app.evaluate(({ session }, [u, b]) => {
    globalThis.__probeHeld = [];
    session.defaultSession.webRequest.onBeforeRequest((d, cb) => {
      if (d.url.includes(u)) {
        const body = (d.uploadData || []).map((x) => (x.bytes ? Buffer.from(x.bytes).toString("utf8") : "")).join("");
        let text = body;
        try {
          text = decodeURIComponent(body.replace(/\+/g, " "));
        } catch {
          /* keep it raw */
        }
        if (text.includes(b)) {
          globalThis.__probeHeld.push(cb);
          return;
        }
      }
      cb({});
    });
  }, [urlPart, bodyPart]);
export const heldCount = (app) => app.evaluate(() => (globalThis.__probeHeld || []).length);
export const releaseHeld = (app) =>
  app.evaluate(() => {
    for (const cb of (globalThis.__probeHeld || []).splice(0)) cb({});
  });

/** In a Find page. */
export const inFind = (app, js, ms) => inView(app, "findDoc", js, ms);

/** Close any source picker open on the Doc page (a vendor pick opens one). */
export const closeSourcePickers = (app) =>
  inDoc(app, `(() => { for (const b of document.querySelectorAll(".src-back")) { const c = b.querySelector('[data-act="cancel"], [data-act="close"], .src-close'); if (c) c.click(); } return true; })()`);

/**
 * Repaint the Doc page from ERPNext's document, as a snapshot from main does — the page's own API
 * writes (`window.erpDoc.setItem`) do not repaint it. Returns the snapshot.
 */
export async function repaintDoc(app) {
  const snap = await inDoc(app, `(async () => { const s = await window.erpDoc.getSnapshot(); return { doc: s.doc }; })()`);
  await app.evaluate(({ webContents }, s) => webContents.getAllWebContents().find((w) => /doc-form\.html/.test(w.getURL())).send("doc-snapshot", s), snap);
  return snap;
}
