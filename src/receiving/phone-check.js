/**
 * "Is this phone ready to receive?" — turns what the browser reports into a checklist a receiver
 * or supervisor can act on, each failure with the fix in plain words. Pure: the page gathers the
 * facts, this decides what they mean.
 *
 * Phase 1 is technical validation, so this doubles as the record of what each test phone can do —
 * in particular whether it has a built-in barcode reader, which plan P5a says to check on the real
 * phones before designing around it.
 */

/** Best guess at the platform from the user-agent string, only to pick which instructions to show. */
export function guessPlatform(userAgent = "") {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  // iPadOS asks for desktop sites and reports itself as a Mac with a touch screen.
  if (/Macintosh/i.test(userAgent) && /Mobile\//i.test(userAgent)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "other";
}

/**
 * facts: {
 *   secure: boolean            — window.isSecureContext
 *   camera: boolean            — navigator.mediaDevices?.getUserMedia exists
 *   cameraAllowed: boolean|null — a real camera request succeeded (null = not tried yet)
 *   barcodeFormats: string[]|null — BarcodeDetector.getSupportedFormats(), null if no detector
 *   installed: boolean         — opened from the home-screen icon
 *   offlineReady: boolean      — the service worker controls this page
 *   deviceName: string|null
 *   platform: "ios"|"android"|"other"
 * }
 * Returns { ready, checks: [{ id, ok, label, fix }] }. `ready` means everything a receiver needs;
 * the built-in reader is reported but never blocks, because the fallback reader covers it.
 */
export function assessPhone(facts) {
  const f = facts || {};
  const addToHome =
    f.platform === "ios"
      ? "In Safari, tap the Share button, then “Add to Home Screen”, then open it from the new icon."
      : "Open the browser menu (⋮) and choose “Install app” or “Add to Home screen”, then open it from the new icon.";

  const checks = [
    {
      id: "secure",
      ok: f.secure === true,
      label: "Secure connection",
      fix: "This phone does not trust the receiving certificate yet. Follow step 1 on the setup card, then reopen this page.",
    },
    {
      id: "camera",
      ok: f.camera === true && f.cameraAllowed !== false,
      label: "Camera",
      fix:
        f.camera !== true
          ? "The browser offers no camera here. It needs the secure connection first; if that is fine, try the phone’s own browser (Safari on iPhone, Chrome on Android)."
          : "The camera was refused. Allow camera access for this site in the browser’s site settings, then try again.",
    },
    {
      id: "installed",
      ok: f.installed === true,
      label: "Saved to the home screen",
      fix: addToHome,
    },
    {
      id: "offline",
      ok: f.offlineReady === true,
      label: "Opens without signal",
      fix: "Open the app once more while connected to the Wi-Fi; it finishes saving itself for dead zones.",
    },
    {
      id: "name",
      ok: typeof f.deviceName === "string" && f.deviceName.length > 0,
      label: "Phone named",
      fix: "Give this phone a name below, so receipts show which phone filed them.",
    },
  ];

  const reader = Array.isArray(f.barcodeFormats) && f.barcodeFormats.includes("code_128");
  checks.push({
    id: "reader",
    ok: true,
    label: reader ? "Built-in barcode reader" : "Barcode reader: the app’s own (this phone has no built-in one)",
    fix: "",
  });

  return { ready: checks.every((c) => c.ok), checks };
}
