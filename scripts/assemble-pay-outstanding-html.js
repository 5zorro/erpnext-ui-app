#!/usr/bin/env node
/**
 * Assemble electron/pay-outstanding.html from its source shell + the shared check-doc fragment.
 * SSoT: pay-outstanding.src.html (page chrome + flow view), check-doc.fragment.html (the document
 * the drawer here, and later payment-doc.html, both mount -- Packet 4b "one fragment, two mounts").
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const electronDir = join(root, "electron");

const MARKER = "<!-- inject: check-doc.fragment.html -->";

const src = readFileSync(join(electronDir, "pay-outstanding.src.html"), "utf8");
const fragment = readFileSync(join(electronDir, "check-doc.fragment.html"), "utf8");

if (!src.includes(MARKER)) {
  console.error(`pay-outstanding.src.html is missing "${MARKER}"`);
  process.exitCode = 1;
} else {
  const html = src.replace(MARKER, fragment.trimEnd());
  writeFileSync(join(electronDir, "pay-outstanding.html"), html);
  console.log("Wrote electron/pay-outstanding.html");
}
