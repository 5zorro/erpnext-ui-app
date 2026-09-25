import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Plan 2026-09-21 P2 calls the page's security rules "rules, not checkboxes". These tests are what
// makes them rules: each fails if someone later loosens the proxy or the pages without meaning to.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(ROOT, path), "utf8");
const CADDY = read("ops/receiving-proxy/Caddyfile");
const COMPOSE = read("ops/receiving-proxy/compose.yml");
const PWA = "pwa/receiving";

/** The body of the site block that starts with `label`, braces balanced. */
function siteBlock(label) {
  const start = CADDY.indexOf(`${label} {`);
  assert.ok(start >= 0, `no site block for ${label}`);
  let depth = 0;
  // Start after the label: `{$RECEIVING_HOST}` in it has braces of its own.
  for (let i = start + label.length; i < CADDY.length; i += 1) {
    if (CADDY[i] === "{") depth += 1;
    if (CADDY[i] === "}" && --depth === 0) return CADDY.slice(start, i + 1);
  }
  throw new Error("unbalanced braces");
}

const csp = () => CADDY.match(/Content-Security-Policy "([^"]+)"/)[1];

test("certificates come from the local authority only — nothing is asked of the internet", () => {
  assert.match(CADDY, /^\s*local_certs\s*$/m);
  assert.match(siteBlock("https://{$RECEIVING_HOST}:8443"), /tls internal/);
});

test("scanner pages may run only their own scripts, and nothing may frame them", () => {
  const policy = csp();
  assert.match(policy, /script-src 'self'(;|$)/);
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval|\*/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /connect-src 'self'/);
});

test("no folder is ever listed", () => {
  assert.doesNotMatch(CADDY, /\bbrowse\b/);
});

test("only .js files are served from the shared logic folder", () => {
  assert.match(CADDY, /@libScript path \/receiving\/lib\/\*\.js/);
  assert.match(CADDY, /handle @lib \{\s*respond 404\s*\}/);
});

test("the plain-HTTP door hands out the certificate and never reaches ERPNext", () => {
  const plain = siteBlock("http://:8081");
  assert.doesNotMatch(plain, /reverse_proxy/);
  assert.match(plain, /receiving-ca\.crt/);
});

test("ERPNext is reached through its own web server, not around it", () => {
  assert.match(siteBlock("https://{$RECEIVING_HOST}:8443"), /reverse_proxy frontend:8080/);
});

test("the proxy can read the app's files but never change them", () => {
  for (const line of COMPOSE.split("\n").filter((l) => /\.\.\/\.\.\//.test(l))) {
    assert.match(line, /:ro\s*$/, line.trim());
  }
  assert.doesNotMatch(COMPOSE, /network_mode:\s*host/);
});

const pages = readdirSync(join(ROOT, PWA)).filter((f) => f.endsWith(".html"));
const scripts = [
  ...readdirSync(join(ROOT, PWA)).filter((f) => f.endsWith(".js")).map((f) => `${PWA}/${f}`),
  ...readdirSync(join(ROOT, "src/receiving")).filter((f) => f.endsWith(".js")).map((f) => `src/receiving/${f}`),
];

test("pages carry no inline script or inline event handlers — the policy would block them anyway", () => {
  assert.ok(pages.length >= 2);
  for (const page of pages) {
    const html = read(`${PWA}/${page}`);
    for (const tag of html.match(/<script\b[^>]*>/g) || []) assert.match(tag, /\ssrc="/, `${page}: ${tag}`);
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i, `${page} has an inline handler`);
  }
});

test("no scanner script builds HTML from strings", () => {
  // The page shares ERPNext's signed-in session; text from the server goes in via textContent.
  for (const file of scripts) {
    assert.doesNotMatch(read(file), /\.innerHTML|\.outerHTML|insertAdjacentHTML|document\.write/, file);
  }
});
