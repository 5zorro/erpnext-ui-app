// Receiving home (phase 1): the phone check, the phone's name, and a camera test.
// Every piece of text is set with textContent — never by writing HTML — because this page shares
// ERPNext's signed-in session (plan P2, "What the proxy does and does not add").
import { assessPhone, guessPlatform } from "./lib/phone-check.js";
import { normaliseDeviceName } from "./lib/device-name.js";

const NAME_KEY = "receiving.deviceName";
const CAMERA_TEST_MS = 4000;

function readName() {
  try {
    return localStorage.getItem(NAME_KEY);
  } catch {
    return null;
  }
}

function writeName(name) {
  try {
    localStorage.setItem(NAME_KEY, name);
    return true;
  } catch {
    return false;
  }
}

const facts = {
  secure: window.isSecureContext === true,
  camera: Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
  cameraAllowed: null,
  barcodeFormats: null,
  installed:
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true,
  offlineReady: Boolean(navigator.serviceWorker && navigator.serviceWorker.controller),
  deviceName: readName(),
  platform: guessPlatform(navigator.userAgent),
};

function render() {
  const { ready, checks } = assessPhone(facts);
  const list = document.getElementById("checks");
  list.replaceChildren(
    ...checks.map((check) => {
      const item = document.createElement("li");
      item.className = check.ok ? "ok" : "bad";
      const mark = document.createElement("span");
      mark.className = "mark";
      mark.textContent = check.ok ? "✓" : "✗";
      item.append(mark, document.createTextNode(check.label));
      if (!check.ok && check.fix) {
        const fix = document.createElement("span");
        fix.className = "fix";
        fix.textContent = check.fix;
        item.append(fix);
      }
      return item;
    }),
  );
  document.getElementById("summary").textContent = ready
    ? "This phone is ready to receive."
    : "Not ready yet — each ✗ below says what to do.";
}

async function detectReader() {
  if (!("BarcodeDetector" in window)) return;
  try {
    facts.barcodeFormats = await window.BarcodeDetector.getSupportedFormats();
  } catch {
    facts.barcodeFormats = null;
  }
}

function wireName() {
  const input = document.getElementById("name");
  const message = document.getElementById("name-message");
  if (facts.deviceName) input.value = facts.deviceName;
  document.getElementById("name-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const result = normaliseDeviceName(input.value);
    if (!result.ok) {
      message.textContent = result.reason;
      return;
    }
    input.value = result.name;
    if (!writeName(result.name)) {
      message.textContent = "This browser would not save the name. Private browsing mode can cause this.";
      return;
    }
    message.textContent = "";
    facts.deviceName = result.name;
    render();
  });
}

function wireCamera() {
  const button = document.getElementById("camera");
  const video = document.getElementById("preview");
  button.addEventListener("click", async () => {
    if (!facts.camera) {
      facts.cameraAllowed = false;
      render();
      return;
    }
    button.disabled = true;
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      facts.cameraAllowed = true;
      video.srcObject = stream;
      video.hidden = false;
      await video.play();
      await new Promise((resolve) => setTimeout(resolve, CAMERA_TEST_MS));
    } catch {
      facts.cameraAllowed = false;
    } finally {
      if (stream) for (const track of stream.getTracks()) track.stop();
      video.srcObject = null;
      video.hidden = true;
      button.disabled = false;
      render();
    }
  });
}

async function start() {
  wireName();
  wireCamera();
  render();
  if ("serviceWorker" in navigator && facts.secure) {
    // On the very first visit the worker takes charge of the page a moment after it loads.
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      facts.offlineReady = true;
      render();
    });
    try {
      await navigator.serviceWorker.register("sw.js");
      await navigator.serviceWorker.ready;
    } catch {
      // Reported by the "Opens without signal" check; nothing else depends on it yet.
    }
  }
  await detectReader();
  render();
}

start();
