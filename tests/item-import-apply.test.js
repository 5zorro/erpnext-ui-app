import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyImportedItemRows, importStoppedText, wireItemImportButton } from "../src/item-import-ui.js";

/** Review 10-19 R5b-2: an import that stops part way says what landed and hands back the form. */

/**
 * A form whose setItem refuses one line's item code. Like ERPNext, an item code write fills the
 * line's name and unit — except from line `silentFrom` on, where ERPNext has stopped answering.
 */
function fakeForm({ refuseLine = 0, start = 0, silentFrom = 0 } = {}) {
  const doc = { items: Array.from({ length: start }, () => ({})) };
  const snap = () => ({ items: doc.items.map((r) => ({ ...r })) });
  return {
    doc,
    api: {
      addItem: async () => {
        doc.items.push({});
        return { ok: true, doc: snap() };
      },
      deleteItem: async (i) => {
        doc.items.splice(i, 1);
        return { ok: true, doc: snap() };
      },
      setItem: async (ri, field, value) => {
        if (ri + 1 === refuseLine && field === "item_code") return { ok: false, reason: "Item NOPE not found" };
        doc.items[ri][field] = value;
        if (field === "item_code" && !(silentFrom && ri + 1 >= silentFrom)) Object.assign(doc.items[ri], { item_name: `Name of ${value}`, uom: "Nos" });
        return { ok: true, doc: snap() };
      },
    },
  };
}

const rows = (n) => Array.from({ length: n }, (_v, i) => ({ item_code: `SKU-${i + 1}`, qty: "1" }));

describe("applyImportedItemRows: stopping part way", () => {
  it("returns the form as it now is and how many lines landed", async () => {
    const f = fakeForm({ refuseLine: 3 });
    const res = await applyImportedItemRows(f.api, rows(5));
    assert.equal(res.ok, false);
    assert.equal(res.linesDone, 2);
    assert.equal(res.doc.items.length, 3, "lines 1–2 plus the half-written line 3");
    assert.equal(res.reason, "Import stopped at line 3 of 5: Item NOPE not found. Lines 1–2 are on the form. Check line 3.");
  });

  it("an item code ERPNext never filled in stops the import there (dogfood probe R5b-2, DC-3)", async () => {
    const res = await applyImportedItemRows(fakeForm({ silentFrom: 5 }).api, rows(12));
    assert.equal(res.ok, false);
    assert.equal(res.linesDone, 4);
    assert.equal(
      res.reason,
      "Import stopped at line 5 of 12: ERPNext did not fill in SKU-5 (no name or unit came back — it may have stopped answering). Lines 1–4 are on the form. Check line 5.",
    );
  });

  it("a refusal on the first line says nothing landed", async () => {
    const res = await applyImportedItemRows(fakeForm({ refuseLine: 1 }).api, rows(2));
    assert.equal(res.linesDone, 0);
    assert.equal(res.reason, "Import stopped at line 1 of 2: Item NOPE not found. Check line 1.");
  });

  it("a call that throws (not refuses) stops the same way, with the form as it was", async () => {
    const f = fakeForm();
    const setItem = f.api.setItem;
    f.api.setItem = async (ri, field, value) => {
      if (ri === 1 && field === "qty") throw new Error("IPC channel closed");
      return setItem(ri, field, value);
    };
    const res = await applyImportedItemRows(f.api, rows(3));
    assert.equal(res.ok, false);
    assert.equal(res.linesDone, 1);
    assert.equal(res.doc.items[0].item_code, "SKU-1");
    assert.equal(res.reason, "Import stopped at line 2 of 3: IPC channel closed. Line 1 is on the form. Check line 2.");
  });

  it("a whole import still answers ok with the last form", async () => {
    const res = await applyImportedItemRows(fakeForm().api, rows(3));
    assert.equal(res.ok, true);
    assert.equal(res.doc.items.length, 3);
  });
});

describe("importStoppedText", () => {
  it("one landed line reads in the singular; a failed line removal names what was removed", () => {
    assert.equal(
      importStoppedText({ lineNo: 2, total: 4, linesDone: 1, rowTouched: false, reason: "Server down." }),
      "Import stopped at line 2 of 4: Server down. Line 1 is on the form.",
    );
    assert.equal(
      importStoppedText({ linesDone: 0, removed: 2, reason: "Locked" }),
      "Import stopped before any line was written: Locked. 2 extra line(s) were already removed.",
    );
  });
});

describe("wireItemImportButton: one import at a time, lines locked while it runs", () => {
  it("ignores a second click and makes the line table inert until the import ends", async () => {
    // The modal needs a DOM; this checks the guard and the lock through the source instead.
    const src = (await import("node:fs")).readFileSync(new URL("../src/item-import-ui.js", import.meta.url), "utf8");
    const body = src.slice(src.indexOf("export function wireItemImportButton("));
    assert.match(body, /if \(running\) return;/);
    assert.match(body, /lock\(true\);[\s\S]*finally \{[\s\S]*lock\(false\);/);
    assert.match(body, /if \(applied\.doc\) opts\.onApplied\(applied\);/);
    assert.equal(typeof wireItemImportButton, "function");
  });
});

describe("both Doc pages lock their line table during an import", () => {
  it("doc-form and the Bill pass the items body and Add line", async () => {
    const fs = await import("node:fs");
    for (const page of ["../src/doc-form-page.js", "../src/bill-form-page.js"]) {
      const src = fs.readFileSync(new URL(page, import.meta.url), "utf8");
      assert.match(src, /lockWhileRunning: \[el\.items, document\.getElementById\("btn-add-line"\)\]/, page);
    }
  });
});
