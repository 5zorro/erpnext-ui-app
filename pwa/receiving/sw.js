/*
 * Receiving scanner — service worker (plan 2026-09-21, P2b).
 *
 * One job in phase 1: keep the app's own files on the phone, so the home-screen icon opens in a
 * warehouse dead zone. It never stores anything ERPNext sends: only GET requests for files under
 * this folder are touched, and /api/ is excluded even there. Holding scans while offline is a
 * separate piece of work (P4c) and does not live here.
 *
 * Files are fetched fresh whenever the network answers, so a phone never runs a stale copy while
 * connected; the saved copy is used only when the network does not answer in time.
 */

const VERSION = "receiving-shell-2026-09-24-1";
const NETWORK_WAIT_MS = 3000;

/** Every file the app needs to open. A test checks each one exists, so this list cannot drift. */
const SHELL = [
  "./",
  "./index.html",
  "./install.html",
  "./app.css",
  "./index.js",
  "./install.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./lib/device-name.js",
  "./lib/phone-check.js",
];

function isShellRequest(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin) return false;
  if (!url.pathname.startsWith(scope.pathname)) return false;
  return !url.pathname.includes("/api/");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith("receiving-shell-") && key !== VERSION).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function networkWithin(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("network too slow")), ms);
    fetch(request).then(
      (response) => {
        clearTimeout(timer);
        resolve(response);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function freshOrSaved(request) {
  try {
    const response = await networkWithin(request, NETWORK_WAIT_MS);
    if (response.ok) {
      const cache = await caches.open(VERSION);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const saved = await caches.match(request, { ignoreSearch: true });
    if (saved) return saved;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  if (!isShellRequest(event.request)) return;
  event.respondWith(freshOrSaved(event.request));
});
