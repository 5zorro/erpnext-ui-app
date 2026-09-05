#!/usr/bin/env node
/**
 * Print PO or Item Receipt input-count dogfood report.
 * Usage: node ops/input-count/report-doc-form.js po|receipt
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PO_DOC_CURATED,
  PO_DOC_INVENTORY_META,
  RECEIPT_DOC_CURATED,
  RECEIPT_DOC_INVENTORY_META,
} from "../../src/inventories/doc-form-inventory.js";
import { printInputCountReport } from "./report-shared.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const docFormHtml = join(root, "electron/doc-form.html");

/** @type {Record<string, { title: string, meta: typeof PO_DOC_INVENTORY_META, curated: typeof PO_DOC_CURATED, vanilla: string }>} */
const PROFILES = {
  po: {
    title: "Purchase Order input-count dogfood report",
    meta: PO_DOC_INVENTORY_META,
    curated: PO_DOC_CURATED,
    vanilla: join(root, "tests/fixtures/po-vanilla-form.fixture.html"),
  },
  receipt: {
    title: "Item Receipt input-count dogfood report",
    meta: RECEIPT_DOC_INVENTORY_META,
    curated: RECEIPT_DOC_CURATED,
    vanilla: join(root, "tests/fixtures/receipt-vanilla-form.fixture.html"),
  },
};

const profileId = (process.argv[2] || "").toLowerCase();
const cfg = PROFILES[profileId];
if (!cfg) {
  console.error("Usage: node ops/input-count/report-doc-form.js po|receipt");
  process.exit(1);
}

printInputCountReport({
  title: cfg.title,
  meta: cfg.meta,
  docCurated: cfg.curated,
  docHtmlPath: docFormHtml,
  vanillaFixturePath: cfg.vanilla,
});
