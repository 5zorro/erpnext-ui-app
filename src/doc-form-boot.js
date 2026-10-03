/**
 * Unified doc-form shell boot — routes Bill vs PO/IR controllers (tranche 10+).
 * Shared chrome (#doc-chrome) is SSoT; profile bodies are swapped at boot.
 */

import { bootDocFormPage } from "./doc-form-page.js";
import { bootBillFormPage } from "./bill-form-page.js";
import { billApiFromErpDoc } from "./bill-doc-api-adapter.js";
import { shouldEscReturnFromDetour } from "./shell-detour.js";

/** @type {"bill"|"doc-form"|null} */
let activeShellKind = null;

function configureChromeForBill() {
  const selectPo = document.getElementById("btn-select-po");
  const selectSource = document.getElementById("btn-select-source");
  if (selectPo) selectPo.hidden = false;
  if (selectSource) selectSource.hidden = true;
}

function configureChromeForDocForm() {
  const selectPo = document.getElementById("btn-select-po");
  const selectSource = document.getElementById("btn-select-source");
  const creditMemo = document.getElementById("btn-credit-memo");
  if (selectPo) selectPo.hidden = true;
  if (selectSource) selectSource.hidden = true;
  // Credit memo (is_return / return_against) is a Purchase Invoice concept — Bill-only.
  if (creditMemo) creditMemo.hidden = true;
}

function activateBillShell() {
  document.getElementById("doc-form-body")?.remove();
  const body = document.getElementById("bill-body");
  if (body) body.hidden = false;
  configureChromeForBill();
  activeShellKind = "bill";
}

function activateDocFormShell() {
  document.getElementById("bill-body")?.remove();
  const body = document.getElementById("doc-form-body");
  if (body) body.hidden = false;
  configureChromeForDocForm();
  activeShellKind = "doc-form";
}

/**
 * @param {string} profileId
 */
async function bootForProfile(profileId) {
  const api = window.erpDoc;
  if (!api) {
    const status = document.getElementById("status");
    if (status) {
      status.textContent = "Doc API unavailable — preload missing.";
      status.classList.add("err");
    }
    return;
  }

  const kind = profileId === "bill" ? "bill" : "doc-form";
  if (activeShellKind && activeShellKind !== kind) {
    window.location.reload();
    return;
  }

  if (kind === "bill") {
    activateBillShell();
    await bootBillFormPage(billApiFromErpDoc(api));
  } else {
    activateDocFormShell();
    await bootDocFormPage(api);
  }
}

async function boot() {
  const api = window.erpDoc;
  if (!api?.getUi) return;

  const ui = await api.getUi();
  if (ui?.profileId) {
    await bootForProfile(ui.profileId);
    return;
  }

  let booted = false;
  const finish = async () => {
    if (booted) return;
    const cfg = await api.getUi();
    if (!cfg?.profileId) return;
    booted = true;
    unsub?.();
    await bootForProfile(cfg.profileId);
  };

  const unsub = api.onSnapshot?.(() => {
    finish().catch(() => {});
  });
  await finish();
}

/**
 * Doors rule, door 4: away on a detour from the payment board, Esc on this page leads back — but
 * only when the page is not using it (a dialog, a picker, a field being typed in). Bubble phase,
 * so every handler of the page's own runs first. Main ignores it when there is no detour.
 */
window.addEventListener("keydown", (ev) => {
  const t = /** @type {HTMLElement|null} */ (document.activeElement);
  const tag = t && t.tagName ? t.tagName.toLowerCase() : "";
  const editing =
    !!t &&
    (t.isContentEditable ||
      ((tag === "input" || tag === "textarea" || tag === "select") &&
        !(/** @type {HTMLInputElement} */ (t).readOnly) &&
        !(/** @type {HTMLInputElement} */ (t).disabled)));
  // Visible ones only: the commit gate's dialog lives in the page all the time, hidden.
  const dialogOpen = [...document.querySelectorAll('[aria-modal="true"], .addr-modal-backdrop, #calc-overlay')].some(
    (el) => !el.closest("[hidden]") && el.getClientRects().length > 0,
  );
  if (!shouldEscReturnFromDetour({ key: ev.key, defaultPrevented: ev.defaultPrevented, dialogOpen, editing })) return;
  try {
    window.erpDoc && window.erpDoc.detourBack && window.erpDoc.detourBack();
  } catch {
    /* ignore */
  }
});

boot().catch((err) => {
  console.error("doc-form boot failed", err);
  const status = document.getElementById("status");
  if (status) {
    status.textContent = `Doc shell failed to start: ${err && err.message ? err.message : err}`;
    status.classList.add("err");
  }
});
