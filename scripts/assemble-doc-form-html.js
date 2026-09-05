#!/usr/bin/env node
/**
 * Assemble electron/doc-form.html from shared chrome + profile body fragments.
 * SSoT: doc-chrome.fragment.html, bill-shell.fragment.html (Bill body),
 * doc-form-body.fragment.html (PO/IR body).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const electronDir = join(root, "electron");

/** @param {string} text @param {number} spaces */
function indent(text, spaces) {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => (line.length ? pad + line : line))
    .join("\n");
}

const head = readFileSync(join(electronDir, "doc-form.head.html"), "utf8");
const chrome = readFileSync(join(electronDir, "doc-chrome.fragment.html"), "utf8");
const billBody = readFileSync(join(electronDir, "bill-shell.fragment.html"), "utf8");
const docBody = readFileSync(join(electronDir, "doc-form-body.fragment.html"), "utf8");
const footer = readFileSync(join(electronDir, "doc-form.footer.html"), "utf8");

const html = [
  head.trimEnd(),
  "<body>",
  "  <!-- assembled: doc-chrome.fragment.html -->",
  indent(chrome.trimEnd(), 2),
  "",
  '  <div id="bill-body" class="doc-profile-body" hidden data-testid="bill-body">',
  indent(billBody.trimEnd(), 4),
  "  </div>",
  "",
  '  <div id="doc-form-body" class="doc-profile-body" data-testid="doc-form-body">',
  indent(docBody.trimEnd(), 4),
  "  </div>",
  indent(footer.trimEnd(), 2),
  "",
].join("\n");

writeFileSync(join(electronDir, "doc-form.html"), html);
console.log("Wrote electron/doc-form.html");

const chromeIds = [...chrome.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
let bad = false;
for (const id of chromeIds) {
  const count = (html.match(new RegExp(`\\bid="${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "g")) || [])
    .length;
  if (count !== 1) {
    console.warn(`Chrome id "${id}" appears ${count} times (expected 1)`);
    bad = true;
  }
}
if (bad) process.exitCode = 1;
