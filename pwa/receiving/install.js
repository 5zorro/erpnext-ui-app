// Setup page: show the steps for this phone's platform, and offer Android's install prompt
// when the browser provides one. iPhones have no such prompt; their steps say so.
import { guessPlatform } from "./lib/phone-check.js";

const platform = guessPlatform(navigator.userAgent);
for (const section of document.querySelectorAll(".platform")) {
  section.hidden = section.dataset.platform !== platform;
}

const installButton = document.getElementById("install");
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
  installButton.hidden = false;
});
installButton.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installButton.hidden = true;
});

if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
