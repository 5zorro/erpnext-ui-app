import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

// The service worker is a classic browser script, so it is loaded into a sandbox with just enough
// of a browser around it: the events it listens for, a cache store, and a network that can fail.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = readFileSync(join(ROOT, "pwa/receiving/sw.js"), "utf8");
const SCOPE = "https://192.168.1.50:8443/receiving/";

function load({ network }) {
  const listeners = {};
  const stores = new Map();
  const store = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name);
    return {
      addAll: async (urls) => urls.forEach((u) => entries.set(new URL(u, SCOPE).href, `saved ${u}`)),
      put: async (request, response) => entries.set(request.url, response.body),
    };
  };
  const caches = {
    open: async (name) => store(name),
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    match: async (request) => {
      for (const entries of stores.values()) if (entries.has(request.url)) return { body: entries.get(request.url) };
      return undefined;
    },
  };
  const fetched = [];
  const context = {
    self: {
      addEventListener: (type, fn) => (listeners[type] = fn),
      registration: { scope: SCOPE },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
    caches,
    fetch: (request) => {
      fetched.push(request.url);
      return network(request);
    },
    URL,
    setTimeout,
    clearTimeout,
    Promise,
  };
  vm.runInNewContext(SOURCE, context);
  return { listeners, stores, fetched };
}

function fire(listeners, type, request) {
  let responded = null;
  let waited = null;
  listeners[type]({
    request,
    respondWith: (p) => (responded = p),
    waitUntil: (p) => (waited = p),
  });
  return { responded, waited };
}

const get = (path) => ({ method: "GET", url: new URL(path, SCOPE).href });
const online = async (request) => ({ ok: true, body: `fresh ${request.url}`, clone() { return this; } });
const offline = async () => {
  throw new TypeError("Failed to fetch");
};

test("every file the worker saves exists, so installing cannot fail on a missing file", () => {
  const list = SOURCE.match(/const SHELL = \[([\s\S]*?)\];/)[1];
  const files = [...list.matchAll(/"\.\/([^"]*)"/g)].map((m) => m[1]).filter(Boolean);
  assert.ok(files.length >= 10);
  for (const file of files) {
    const onDisk = file.startsWith("lib/")
      ? join(ROOT, "src/receiving", file.slice("lib/".length))
      : join(ROOT, "pwa/receiving", file);
    assert.ok(existsSync(onDisk), `${file} is listed but ${onDisk} does not exist`);
  }
});

test("ERPNext's answers are never intercepted or stored", () => {
  const { listeners } = load({ network: online });
  for (const request of [
    { method: "GET", url: "https://192.168.1.50:8443/api/resource/Purchase%20Order/PO-1" },
    { method: "GET", url: "https://192.168.1.50:8443/app/purchase-order" },
    { method: "GET", url: "https://192.168.1.50:8443/receiving/api/method/anything" },
    { method: "POST", url: `${SCOPE}index.html` },
    { method: "GET", url: "https://elsewhere.example/receiving/index.html" },
  ]) {
    assert.equal(fire(listeners, "fetch", request).responded, null, `${request.method} ${request.url}`);
  }
});

test("while online, the page gets the network's copy and the saved copy is refreshed", async () => {
  const { listeners, stores } = load({ network: online });
  const response = await fire(listeners, "fetch", get("index.js")).responded;
  assert.equal(response.body, `fresh ${SCOPE}index.js`);
  const [saved] = stores.values();
  assert.equal(saved.get(`${SCOPE}index.js`), `fresh ${SCOPE}index.js`);
});

test("in a dead zone, the saved copy opens the app", async () => {
  const { listeners } = load({ network: offline });
  await fire(listeners, "install").waited;
  const response = await fire(listeners, "fetch", get("index.html")).responded;
  assert.equal(response.body, "saved ./index.html");
});

test("in a dead zone, a file that was never saved fails rather than inventing an answer", async () => {
  const { listeners } = load({ network: offline });
  await assert.rejects(fire(listeners, "fetch", get("not-saved.js")).responded, /Failed to fetch/);
});

test("a new version clears the old saved copies, and nothing else in the cache store", async () => {
  const { listeners, stores } = load({ network: online });
  stores.set("receiving-shell-2026-01-01-1", new Map());
  stores.set("someone-elses-cache", new Map());
  await fire(listeners, "install").waited;
  await fire(listeners, "activate").waited;
  const names = [...stores.keys()];
  assert.equal(names.includes("receiving-shell-2026-01-01-1"), false);
  assert.equal(names.includes("someone-elses-cache"), true);
  assert.equal(names.filter((n) => n.startsWith("receiving-shell-")).length, 1);
});
