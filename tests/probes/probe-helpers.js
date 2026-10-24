/**
 * Steps every probe needs (README.md here). Launch and `__erpE2e` come from `e2e/helpers.js`.
 */
import { expect } from "@playwright/test";
import { e2eCall, e2eGet } from "../../e2e/helpers.js";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
export async function openBoard(app, { cards = true } = {}) {
  await e2eCall(app, "execInView", "home", `document.querySelector('[data-testid="tile-pay-bills"]').click(); true`);
  await sleep(3000);
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

/** In a Find page. */
export const inFind = (app, js, ms) => inView(app, "findDoc", js, ms);
