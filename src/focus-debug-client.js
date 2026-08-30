/**
 * Renderer-side focus trail — sends to main when erpFocusDebug preload is present.
 */

import { summarizeActiveElement } from "./focus-debug.js";

/** @type {string} */
let lastFocusRingKey = "";

/**
 * @param {string} event
 * @param {string} [detail]
 * @param {{ target?: Element|null }} [opts]
 */
export function logFocus(event, detail = "", opts = {}) {
  const target =
    opts.target != null
      ? opts.target
      : typeof document !== "undefined"
        ? document.activeElement
        : null;
  const active = summarizeActiveElement(target);
  const bridge =
    typeof globalThis !== "undefined" && globalThis.erpFocusDebug
      ? globalThis.erpFocusDebug
      : null;
  if (bridge && typeof bridge.log === "function") {
    bridge.log(String(event || "focus"), detail != null ? String(detail) : "", active);
  }
}

/**
 * Log meaningful focus moves (modal, link dropdown, header fields).
 * @returns {() => void} uninstall
 */
export function installFocusRing() {
  if (typeof document === "undefined") return () => {};
  const handler = (ev) => {
    const t = ev.target;
    if (!(t instanceof Element)) return;
    const inModal = t.closest(".src-back");
    const inLink = t.closest(".link-dd");
    const field = t.getAttribute && t.getAttribute("data-field");
    if (!inModal && !inLink && !field && t.tagName !== "BODY") return;
    const summary = summarizeActiveElement(t);
    const key = summary && summary.summary ? summary.summary : t.tagName;
    if (key === lastFocusRingKey) return;
    lastFocusRingKey = key;
    logFocus("focusin", key, { target: t });
  };
  document.addEventListener("focusin", handler, true);
  return () => document.removeEventListener("focusin", handler, true);
}
