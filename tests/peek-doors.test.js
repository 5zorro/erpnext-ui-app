import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DOC_DOORS, IN_PLACE_ACTIONS, doorFor, isDoorChannel } from "../src/doc-doors.js";

const main = readFileSync(fileURLToPath(new URL("../electron/main.js", import.meta.url)), "utf8");

/** Every `ipcMain.on|handle("<name>", …)` handler body. */
function handlers() {
  const out = [];
  // One-line handlers end on their own line; multi-line ones at the first `});` / `);` at column 0.
  const re = /^ipcMain\.(?:on|handle)\("([^"]+)"(?:[^\n]*\);$|[\s\S]*?^\}?\);$)/gm;
  let m;
  while ((m = re.exec(main))) out.push({ name: m[1], body: m[0] });
  return out;
}
const all = handlers();
const doors = all.filter((h) => isDoorChannel(h.name));

// Plan 2026-09-26 "Doors: peek or navigate" (5zorro 2026-10-02). Born of nav incident 2026-10-03:
// "Go to Vendor add…" navigated away while Payment Terms add next to it peeked, so the Bill was lost.
describe("Doc-skin doors follow one convention (src/doc-doors.js)", () => {
  it("finds the doors (so this cannot pass by matching nothing)", () => {
    for (const n of ["bill-open-vendor-add", "bill-attach-file", "bill-find", "bill-open-vanilla", "shell-detour-open"]) {
      assert.ok(doors.some((d) => d.name === n), `${n} not found`);
    }
  });

  it("every door-shaped handler in main is in the table", () => {
    const missing = doors.map((d) => d.name).filter((n) => !doorFor(n));
    assert.deepEqual(missing, [], "add these to src/doc-doors.js with their kind and reason");
  });

  it("every door in the table exists in main", () => {
    const names = new Set(all.map((h) => h.name));
    assert.deepEqual(Object.keys(DOC_DOORS).filter((n) => !names.has(n)), []);
  });

  for (const d of doors) {
    const door = doorFor(d.name);
    if (!door || door.pending) continue;
    it(`${d.name} is a ${door.kind}`, () => {
      if (door.kind === "peek") {
        assert.match(d.body, /softPeekErp\(/, "a peek parks the page: softPeekErp");
        assert.doesNotMatch(d.body, /showErp\(|loadErpUrl\(/, "a peek never hard-navigates");
      } else if (door.kind === "navigate") {
        assert.doesNotMatch(d.body, /softPeekErp\(/, "other work is not a peek");
      } else if (door.kind === "lens") {
        assert.match(d.body, /showErp\(/);
      } else if (door.kind === "detour") {
        assert.match(d.body, /openDetourFromShell\(/);
      }
    });
  }

  it("no door but a lens click changes the remembered lens", () => {
    // Landed Cost and Attach used to set the Bill lens to Vanilla as a side effect.
    for (const d of doors) {
      const door = doorFor(d.name);
      if (door && door.kind !== "lens") assert.doesNotMatch(d.body, /rememberLens\(/, d.name);
    }
  });

  // Printing convention (plan 2026-09-26 "Printing"): print never leaves the page.
  it("in-place actions never navigate and never open a window", () => {
    for (const name of Object.keys(IN_PLACE_ACTIONS)) {
      const h = all.find((x) => x.name === name);
      assert.ok(h, `${name} not found in main`);
      assert.doesNotMatch(h.body, /showErp\(|softPeekErp\(|loadErpUrl\(|openRoutePreferred\(|showDocForm\(/, name);
    }
  });

  it("a pending door says why", () => {
    for (const [n, door] of Object.entries(DOC_DOORS)) {
      if (door.pending) assert.ok(door.pending.length > 10, n);
    }
  });
});
