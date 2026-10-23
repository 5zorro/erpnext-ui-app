/**
 * Review 10-19 R10b-4: the app loads the generated electron/pay-outstanding.html, so a change to
 * pay-outstanding.src.html or check-doc.fragment.html that was not re-assembled ships the old board
 * with every other test green.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assemblePayOutstandingHtml } from "../scripts/assemble-pay-outstanding-html.js";

describe("pay-outstanding.html is assembled from its sources", () => {
  it("matches what the script would write — run `node scripts/assemble-pay-outstanding-html.js`", () => {
    const committed = readFileSync(fileURLToPath(new URL("../electron/pay-outstanding.html", import.meta.url)), "utf8");
    assert.ok(committed === assemblePayOutstandingHtml(), "electron/pay-outstanding.html is stale — run node scripts/assemble-pay-outstanding-html.js");
  });
});
