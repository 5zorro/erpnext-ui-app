#!/usr/bin/env node
/**
 * Assemble electron/pay-outstanding.html from its source shell + the shared check-doc fragment.
 * SSoT: pay-outstanding.src.html (page chrome + flow view), check-doc.fragment.html (the document
 * the drawer here, and later payment-doc.html, both mount -- Packet 4b "one fragment, two mounts").
 * `tests/pay-outstanding-assembled.test.js` fails when the committed page is not this output.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const electronDir = join(root, "electron");

const MARKER = "<!-- inject: check-doc.fragment.html -->";

/** @returns {string} the page as it should be, or throws when the marker is gone */
export function assemblePayOutstandingHtml() {
  const src = readFileSync(join(electronDir, "pay-outstanding.src.html"), "utf8");
  const fragment = readFileSync(join(electronDir, "check-doc.fragment.html"), "utf8");
  if (!src.includes(MARKER)) throw new Error(`pay-outstanding.src.html is missing "${MARKER}"`);
  return src.replace(MARKER, fragment.trimEnd());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    writeFileSync(join(electronDir, "pay-outstanding.html"), assemblePayOutstandingHtml());
    console.log("Wrote electron/pay-outstanding.html");
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
