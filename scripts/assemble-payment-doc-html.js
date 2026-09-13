#!/usr/bin/env node
/**
 * Assemble electron/payment-doc.html from its source shell + the shared check-doc fragment.
 * SSoT: payment-doc.src.html (page chrome), check-doc.fragment.html (the document this page's
 * read-only mount and pay-outstanding.html's drawer both mount -- Packet 4b "one fragment, two
 * mounts"). Same small marker-replace shape as assemble-pay-outstanding-html.js; not merged into
 * one shared script since each is a ~20-line generator with only one caller.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const electronDir = join(root, "electron");

const MARKER = "<!-- inject: check-doc.fragment.html -->";

const src = readFileSync(join(electronDir, "payment-doc.src.html"), "utf8");
const fragment = readFileSync(join(electronDir, "check-doc.fragment.html"), "utf8");

if (!src.includes(MARKER)) {
  console.error(`payment-doc.src.html is missing "${MARKER}"`);
  process.exitCode = 1;
} else {
  const html = src.replace(MARKER, fragment.trimEnd());
  writeFileSync(join(electronDir, "payment-doc.html"), html);
  console.log("Wrote electron/payment-doc.html");
}
