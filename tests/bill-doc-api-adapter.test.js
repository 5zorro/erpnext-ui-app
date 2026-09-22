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

  it("forwards void-and-amend through to the preload", async () => {
    const record = [];
    const adapter = billApiFromErpDoc(stubErpDoc(record));

    await adapter.voidAmendFacts("ACC-PINV-2026-00232");
    await adapter.voidAndAmend("ACC-PINV-2026-00232");

    assert.deepEqual(
      record.map((r) => [r.method, r.args[0]]),
      [
        ["voidAmendFacts", "ACC-PINV-2026-00232"],
        ["voidAndAmend", "ACC-PINV-2026-00232"],
      ],
    );
  });

  // An older preload (a shell that was not restarted after an update) has neither method. Saying
  // so beats throwing a TypeError out of a click handler.
  it("answers honestly when the preload predates the feature", async () => {
    const adapter = billApiFromErpDoc({ ...stubErpDoc(), voidAmendFacts: undefined, voidAndAmend: undefined });
    const facts = await adapter.voidAmendFacts("X");
    const run = await adapter.voidAndAmend("X");
    assert.equal(facts.ok, false);
    assert.match(facts.reason, /not wired/i);
    assert.equal(run.ok, false);
    assert.equal(run.cancelled, false, "nothing was cancelled, and the caller must not think otherwise");
  });
});
