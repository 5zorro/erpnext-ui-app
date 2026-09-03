#!/usr/bin/env node
/**
 * Print Bill input-count dogfood report (Doc curated + static scrape vs Vanilla fixture).
 * Usage: node ops/input-count/report-bill.js
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BILL_DOC_CURATED,
  BILL_DOC_INVENTORY_META,
} from "../../src/inventories/bill-doc-inventory.js";
import { printInputCountReport } from "./report-shared.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const billSurfaceHtml =
  readFileSync(join(root, "electron/doc-chrome.fragment.html"), "utf8") +
  "\n" +
  readFileSync(join(root, "electron/bill-shell.fragment.html"), "utf8");

printInputCountReport({
  title: "Bill input-count dogfood report",
  meta: BILL_DOC_INVENTORY_META,
  docCurated: BILL_DOC_CURATED,
  docHtml: billSurfaceHtml,
  vanillaFixturePath: join(root, "tests/fixtures/bill-vanilla-form.fixture.html"),
});
