#!/usr/bin/env node
/**
 * Print Bill input-count dogfood report (Doc curated + static scrape vs Vanilla fixture).
 * Usage: node ops/input-count/report-bill.js
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BILL_DOC_CURATED,
  BILL_DOC_INVENTORY_META,
} from "../../src/inventories/bill-doc-inventory.js";
import { printInputCountReport } from "./report-shared.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

printInputCountReport({
  title: "Bill input-count dogfood report",
  meta: BILL_DOC_INVENTORY_META,
  docCurated: BILL_DOC_CURATED,
  docHtmlPath: join(root, "electron/bill-shell.fragment.html"),
  vanillaFixturePath: join(root, "tests/fixtures/bill-vanilla-form.fixture.html"),
});
