import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  COL_WIDTH_STORAGE_KEY,
  DENSITIES,
  DENSITY_STORAGE_KEY,
  DEFAULT_DENSITY,
  MAX_COL_WIDTH_PX,
  MIN_COL_WIDTH_PX,
  autoFitWidthPx,
  clampColWidthPx,
  draggedColWidthPx,
  normalizeDensity,
  normalizeTableKey,
  readColWidthPrefs,
  readDensity,
  scrollbarGutterPx,
  writeColWidthPref,
  writeDensity,
} from "../src/item-table-layout.js";

/** Minimal in-memory storage double (same shape doc-wash.js injects). */
function fakeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
  };
}

describe("scrollbarGutterPx (Packet T A1 — scrollbar-safe full bleed)", () => {
  it("returns the gutter when a scrollbar is reserved", () => {
    assert.equal(scrollbarGutterPx(1600, 1585), 15);
  });

  it("returns 0 for overlay scrollbars (no reserved gutter)", () => {
    assert.equal(scrollbarGutterPx(1600, 1600), 0);
  });

  it("never returns a negative gutter", () => {
    assert.equal(scrollbarGutterPx(1200, 1400), 0);
  });

  it("refuses an implausibly wide gutter rather than shifting the page", () => {
    // A >40px 'gutter' means the caller measured something else (zoom, devtools
    // docked, a mid-layout read). Bleeding by that much would visibly misalign
    // every line section, so 0 is the safe answer.
    assert.equal(scrollbarGutterPx(1600, 1000), 0);
  });

  it("is total on junk input", () => {
    assert.equal(scrollbarGutterPx(undefined, undefined), 0);
    assert.equal(scrollbarGutterPx(NaN, 100), 0);
    assert.equal(scrollbarGutterPx("wide", "narrow"), 0);
  });
});

describe("clampColWidthPx", () => {
  it("clamps below the minimum a header label needs", () => {
    assert.equal(clampColWidthPx(5), MIN_COL_WIDTH_PX);
  });

  it("clamps above the width that would starve other columns", () => {
    assert.equal(clampColWidthPx(5000), MAX_COL_WIDTH_PX);
  });

  it("passes a sane width through, rounded", () => {
    assert.equal(clampColWidthPx(180.4), 180);
  });

  it("honours caller-supplied bounds", () => {
    assert.equal(clampColWidthPx(30, { min: 20, max: 60 }), 30);
    assert.equal(clampColWidthPx(90, { min: 20, max: 60 }), 60);
  });

  it("tolerates inverted bounds instead of producing nonsense", () => {
    assert.equal(clampColWidthPx(50, { min: 100, max: 20 }), 50);
  });

  it("returns null on junk", () => {
    assert.equal(clampColWidthPx("wide"), null);
    assert.equal(clampColWidthPx(null), null);
  });
});

describe("autoFitWidthPx (double-click a resize handle)", () => {
  it("adds cell padding to the measured text width", () => {
    assert.equal(autoFitWidthPx(200), 216);
  });

  it("respects a custom pad", () => {
    assert.equal(autoFitWidthPx(200, { padPx: 40 }), 240);
  });

  it("still clamps — an enormous value cannot starve the table", () => {
    assert.equal(autoFitWidthPx(9999), MAX_COL_WIDTH_PX);
  });

  it("floors at the minimum for an empty column", () => {
    assert.equal(autoFitWidthPx(0), MIN_COL_WIDTH_PX);
  });

  it("returns null on junk or negative measurements", () => {
    assert.equal(autoFitWidthPx(-5), null);
    assert.equal(autoFitWidthPx("x"), null);
  });
});

describe("draggedColWidthPx", () => {
  it("adds the pointer delta to the start width", () => {
    assert.equal(draggedColWidthPx(120, 45), 165);
  });

  it("shrinks on a negative delta", () => {
    assert.equal(draggedColWidthPx(120, -30), 90);
  });

  it("cannot be dragged below the minimum", () => {
    assert.equal(draggedColWidthPx(60, -500), MIN_COL_WIDTH_PX);
  });

  it("returns null on junk", () => {
    assert.equal(draggedColWidthPx(NaN, 10), null);
  });
});

describe("normalizeTableKey", () => {
  it("slugifies doctype titles and ids the same way", () => {
    assert.equal(normalizeTableKey("Purchase Invoice"), "purchase-invoice");
    assert.equal(normalizeTableKey("purchase_invoice"), "purchase-invoice");
    assert.equal(normalizeTableKey("  Purchase   Order "), "purchase-order");
  });

  it("returns empty for unusable input", () => {
    assert.equal(normalizeTableKey(""), "");
    assert.equal(normalizeTableKey(null), "");
    assert.equal(normalizeTableKey(42), "");
  });
});

describe("column width prefs — only explicit overrides persist", () => {
  it("reads nothing when storage is empty or missing", () => {
    assert.deepEqual(readColWidthPrefs(fakeStorage(), "purchase-invoice"), {});
    assert.deepEqual(readColWidthPrefs(null, "purchase-invoice"), {});
  });

  it("round-trips a dragged width", () => {
    const storage = fakeStorage();
    writeColWidthPref(storage, "Purchase Invoice", "item_code", 220);
    assert.deepEqual(readColWidthPrefs(storage, "purchase-invoice"), { item_code: 220 });
  });

  it("keys by normalized doctype, so title and slug agree", () => {
    const storage = fakeStorage();
    writeColWidthPref(storage, "Purchase Invoice", "item_code", 220);
    assert.deepEqual(readColWidthPrefs(storage, "purchase_invoice"), { item_code: 220 });
  });

  it("keeps doctypes independent", () => {
    const storage = fakeStorage();
    writeColWidthPref(storage, "purchase-invoice", "item_code", 220);
    writeColWidthPref(storage, "purchase-order", "item_code", 300);
    assert.deepEqual(readColWidthPrefs(storage, "purchase-invoice"), { item_code: 220 });
    assert.deepEqual(readColWidthPrefs(storage, "purchase-order"), { item_code: 300 });
  });

  it("clears an override back to auto with null", () => {
    const storage = fakeStorage();
    writeColWidthPref(storage, "purchase-invoice", "item_code", 220);
    writeColWidthPref(storage, "purchase-invoice", "description", 400);
    writeColWidthPref(storage, "purchase-invoice", "item_code", null);
    assert.deepEqual(readColWidthPrefs(storage, "purchase-invoice"), { description: 400 });
  });

  it("drops the doctype entry entirely once its last override is cleared", () => {
    const storage = fakeStorage();
    writeColWidthPref(storage, "purchase-invoice", "item_code", 220);
    writeColWidthPref(storage, "purchase-invoice", "item_code", null);
    const raw = JSON.parse(storage.getItem(COL_WIDTH_STORAGE_KEY));
    assert.deepEqual(raw, {});
  });

  it("clamps a persisted width on the way in, not just on the way out", () => {
    const storage = fakeStorage();
    writeColWidthPref(storage, "purchase-invoice", "item_code", 99999);
    assert.deepEqual(readColWidthPrefs(storage, "purchase-invoice"), { item_code: MAX_COL_WIDTH_PX });
  });

  it("survives corrupt stored JSON without throwing", () => {
    const storage = fakeStorage({ [COL_WIDTH_STORAGE_KEY]: "{not json" });
    assert.deepEqual(readColWidthPrefs(storage, "purchase-invoice"), {});
  });

  it("ignores non-object and array-shaped stored values", () => {
    assert.deepEqual(
      readColWidthPrefs(fakeStorage({ [COL_WIDTH_STORAGE_KEY]: "[1,2,3]" }), "purchase-invoice"),
      {},
    );
    assert.deepEqual(
      readColWidthPrefs(fakeStorage({ [COL_WIDTH_STORAGE_KEY]: '{"purchase-invoice":7}' }), "purchase-invoice"),
      {},
    );
  });

  it("drops individual unusable widths but keeps the good ones", () => {
    const storage = fakeStorage({
      [COL_WIDTH_STORAGE_KEY]: '{"purchase-invoice":{"item_code":"wide","description":300}}',
    });
    assert.deepEqual(readColWidthPrefs(storage, "purchase-invoice"), { description: 300 });
  });

  it("does not throw when storage rejects the write (quota / private mode)", () => {
    const hostile = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    assert.doesNotThrow(() => writeColWidthPref(hostile, "purchase-invoice", "item_code", 220));
  });

  it("is a no-op for a missing doctype or field", () => {
    const storage = fakeStorage();
    writeColWidthPref(storage, "", "item_code", 220);
    writeColWidthPref(storage, "purchase-invoice", "", 220);
    assert.equal(storage.getItem(COL_WIDTH_STORAGE_KEY), null);
  });
});

describe("density pref (the one legitimate toggle)", () => {
  it("defaults to standard", () => {
    assert.equal(readDensity(fakeStorage()), DEFAULT_DENSITY);
    assert.equal(readDensity(null), DEFAULT_DENSITY);
  });

  it("round-trips each supported density", () => {
    for (const d of DENSITIES) {
      const storage = fakeStorage();
      writeDensity(storage, d);
      assert.equal(readDensity(storage), d);
      assert.equal(storage.getItem(DENSITY_STORAGE_KEY), d);
    }
  });

  it("falls back to standard for an unknown stored value", () => {
    assert.equal(readDensity(fakeStorage({ [DENSITY_STORAGE_KEY]: "enormous" })), DEFAULT_DENSITY);
    assert.equal(normalizeDensity(null), DEFAULT_DENSITY);
  });

  it("returns the density it actually stored", () => {
    assert.equal(writeDensity(fakeStorage(), "compact"), "compact");
    assert.equal(writeDensity(fakeStorage(), "nonsense"), DEFAULT_DENSITY);
  });
});

describe("numeric coercion is strict (regression: Number(null) === 0)", () => {
  // A stored `null`/""/[] width must read as "no value", not as 0 -> clamped to
  // the 40px minimum. Otherwise a corrupt pref silently becomes a real, unusably
  // narrow column -- exactly the "a saved width can never make the table
  // unreadable" promise this module exists to keep.
  it("rejects the falsy values Number() turns into 0", () => {
    for (const junk of [null, undefined, "", "   ", [], {}, false, true, NaN]) {
      assert.equal(clampColWidthPx(junk), null, `clamp accepted ${JSON.stringify(junk)}`);
      assert.equal(autoFitWidthPx(junk), null, `autoFit accepted ${JSON.stringify(junk)}`);
    }
  });

  it("drops a null stored width instead of persisting a 40px column", () => {
    const storage = fakeStorage({
      [COL_WIDTH_STORAGE_KEY]: '{"purchase-invoice":{"item_code":null,"description":300}}',
    });
    assert.deepEqual(readColWidthPrefs(storage, "purchase-invoice"), { description: 300 });
  });

  it("still accepts numeric strings, which storage round-trips can produce", () => {
    assert.equal(clampColWidthPx("220"), 220);
  });
});
