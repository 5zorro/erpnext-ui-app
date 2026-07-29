import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditProductionHtmlReachability,
  productionHtmlReachReason,
  PRODUCTION_HTML_ALLOWLIST,
  PRODUCTION_HTML_ENTRYPOINTS,
} from "../src/html-reachability.js";

const electronDir = join(dirname(fileURLToPath(import.meta.url)), "..", "electron");

describe("OI-067 production HTML reachability", () => {
  it("lists every electron/*.html with an entrypoint or allowlist reason", () => {
    const files = readdirSync(electronDir).filter((f) => f.endsWith(".html"));
    assert.ok(files.length >= 5, "expected production HTML under electron/");
    const audit = auditProductionHtmlReachability(files);
    assert.deepEqual(audit.missing, [], `unreachable HTML: ${audit.missing.join(", ")}`);
    for (const f of files) {
      assert.ok(productionHtmlReachReason(f), f);
    }
  });

  it("keeps allowlist + entrypoints disjoint", () => {
    for (const name of Object.keys(PRODUCTION_HTML_ALLOWLIST)) {
      assert.equal(PRODUCTION_HTML_ENTRYPOINTS[name], undefined, name);
    }
  });
});
