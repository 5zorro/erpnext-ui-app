import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const main = readFileSync(fileURLToPath(new URL("../electron/main.js", import.meta.url)), "utf8");

/** Every `ipcMain.on|handle("<name>", …)` handler body, up to its closing `});` at column 0. */
function handlers(pattern) {
  const out = [];
  const re = /^ipcMain\.(?:on|handle)\("([^"]+)"[\s\S]*?^\}\);/gm;
  let m;
  while ((m = re.exec(main))) if (pattern.test(m[1])) out.push({ name: m[1], body: m[0] });
  return out;
}

// Nav incident 2026-10-03: "Go to Vendor add…" was a hard navigation, so it dropped the Doc Bill
// and saving the new Supplier left no way back. A "create X…" door from a Doc skin is a peek.
describe("create doors from a Doc skin are soft peeks, never hard navigation", () => {
  const doors = handlers(/^(bill|doc)-open-[a-z-]+-add$/);

  it("finds the doors (so this test cannot pass by matching nothing)", () => {
    const names = doors.map((d) => d.name).sort();
    for (const n of ["bill-open-vendor-add", "bill-open-project-add", "bill-open-payment-terms-add", "doc-open-vendor-add"]) {
      assert.ok(names.includes(n), `${n} not found among ${names.join(", ")}`);
    }
  });

  for (const d of doors) {
    it(`${d.name} peeks (parks the Doc page; Esc returns)`, () => {
      assert.match(d.body, /softPeekErp\(/, `${d.name} must use softPeekErp`);
      assert.doesNotMatch(d.body, /showErp\(/, `${d.name} must not hard-navigate with showErp`);
    });
  }
});
