import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { billApiFromErpDoc } from "../src/bill-doc-api-adapter.js";

/**
 * A Proxy that answers every call, so the adapter can be built without a real preload and every
 * delegation can be recorded.
 */
function stubErpDoc(record = []) {
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") return undefined; // not a thenable
        return (...args) => {
          record.push({ method: String(prop), args });
          return Promise.resolve({ ok: true });
        };
      },
      has: () => true,
    },
  );
}

describe("billApiFromErpDoc — the allow-list between preload and page", () => {
  /**
   * 🔴 The guard that would have caught the 2026-09-22 void-and-amend dogfood failure.
   *
   * This adapter names every method it forwards. A method added to `erpDoc` (the preload) but not
   * added here is not an error anywhere — it is simply `undefined` on the page, and the page's own
   * "is it wired?" check then reports something misleading, in that case telling the clerk to
   * restart the shell over a wiring bug a restart could never fix.
   *
   * So: read what the page actually calls on `api`, and assert the adapter provides it. Static, but
   * it fails for the right reason and names the missing method.
   */
  it("provides every api.* method the Bill page calls", () => {
    const pageSrc = readFileSync(
      fileURLToPath(new URL("../src/bill-form-page.js", import.meta.url)),
      "utf8",
    );
    const called = new Set();
    // `api.foo(` and `api.foo ?` / `api.foo &&` (the guarded-call idiom the page uses a lot).
    for (const m of pageSrc.matchAll(/\bapi\s*&&\s*api\.([A-Za-z_$][\w$]*)/g)) called.add(m[1]);
    for (const m of pageSrc.matchAll(/\bapi\.([A-Za-z_$][\w$]*)\s*\(/g)) called.add(m[1]);

    const adapter = billApiFromErpDoc(stubErpDoc());
    const missing = [...called].filter((name) => typeof adapter[name] !== "function").sort();

    assert.deepEqual(
      missing,
      [],
      `bill-form-page.js calls these on api, but bill-doc-api-adapter.js does not provide them: ${missing.join(", ")}`,
    );
  });

  it("forwards void-and-amend through to the preload, doctype and all", async () => {
    const record = [];
    const adapter = billApiFromErpDoc(stubErpDoc(record));

    await adapter.voidAmendFacts("purchase-invoice", "ACC-PINV-2026-00232");
    await adapter.voidAndAmend("purchase-invoice", "ACC-PINV-2026-00232");

    assert.deepEqual(
      record.map((r) => [r.method, ...r.args]),
      [
        ["voidAmendFacts", "purchase-invoice", "ACC-PINV-2026-00232"],
        ["voidAndAmend", "purchase-invoice", "ACC-PINV-2026-00232"],
      ],
      "the doctype must survive the hop — stage 2 shares one channel across four doctypes",
    );
  });

  // An older preload (a shell that was not restarted after an update) has neither method. Saying
  // so beats throwing a TypeError out of a click handler.
  it("answers honestly when the preload predates the feature", async () => {
    const adapter = billApiFromErpDoc({ ...stubErpDoc(), voidAmendFacts: undefined, voidAndAmend: undefined });
    const facts = await adapter.voidAmendFacts("purchase-invoice", "X");
    const run = await adapter.voidAndAmend("purchase-invoice", "X");
    assert.equal(facts.ok, false);
    assert.match(facts.reason, /not wired/i);
    assert.equal(run.ok, false);
    assert.equal(run.cancelled, false, "nothing was cancelled, and the caller must not think otherwise");
  });

  /**
   * 🔴 Stage 2 spread the same wiring across three more surfaces, so the same gap can now open in
   * three more places. The PO / Item Receipt skin takes the preload **raw** (no allow-list), and
   * the Payment Entry page has its own small preload — so for those two the thing to check is the
   * preload itself, not an adapter.
   */
  it("every surface's provider supplies what its page calls on api", () => {
    /** @param {string} src */
    const callsOnApi = (src) => {
      const called = new Set();
      for (const m of src.matchAll(/\bapi\s*&&\s*api\.([A-Za-z_$][\w$]*)/g)) called.add(m[1]);
      for (const m of src.matchAll(/\bapi\.([A-Za-z_$][\w$]*)\s*\(/g)) called.add(m[1]);
      called.delete("then");
      // 🔴 A page that hands `api` to runVoidAndAmend never writes `api.voidAndAmend(` anywhere,
      // so the call-site scan alone would go quiet on exactly the methods whose absence caused the
      // 2026-09-22 failure. The flow's contract is part of what the page calls.
      if (/runVoidAndAmend/.test(src)) {
        called.add("voidAmendFacts");
        called.add("voidAndAmend");
      }
      return called;
    };
    /** Keys `contextBridge.exposeInMainWorld` actually hands the page. */
    const exposedBy = (src) => {
      const keys = new Set();
      for (const m of src.matchAll(/^\s{2}([A-Za-z_$][\w$]*):\s/gm)) keys.add(m[1]);
      return keys;
    };
    const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
    const adapterKeys = new Set(Object.keys(billApiFromErpDoc(stubErpDoc())));

    for (const [pageRel, providerRel, provided] of [
      ["../src/bill-form-page.js", "bill-doc-api-adapter.js", adapterKeys],
      ["../src/doc-form-page.js", "../electron/doc-form-preload.cjs", exposedBy(read("../electron/doc-form-preload.cjs"))],
      [
        "../electron/payment-doc.src.html",
        "../electron/payment-doc-preload.cjs",
        exposedBy(read("../electron/payment-doc-preload.cjs")),
      ],
    ]) {
      const missing = [...callsOnApi(read(pageRel))].filter((n) => !provided.has(n)).sort();
      assert.deepEqual(
        missing,
        [],
        `${pageRel} needs these on api, but ${providerRel} does not provide them: ${missing.join(", ")}`,
      );
    }
  });
});
