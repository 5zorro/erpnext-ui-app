/**
 * Unified doc-form shell boot — routes Bill vs PO/IR controllers (tranche 10+).
 * Shared chrome (#doc-chrome) is SSoT; profile bodies are swapped at boot.
 */

import { bootDocFormPage } from "./doc-form-page.js";
import { bootBillFormPage } from "./bill-form-page.js";
import { billApiFromErpDoc } from "./bill-doc-api-adapter.js";
import { scrollbarGutterPx } from "./item-table-layout.js";

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
 * Packet T A1 — publish the scrollbar gutter so full-bleed line sections can
 * subtract it. `100vw` includes the scrollbar on platforms that reserve a
 * gutter, so without this the bleed overflows by exactly that much and summons
 * a horizontal scrollbar on the whole page.
 */
function syncBleedGutter() {
  try {
    const px = scrollbarGutterPx(window.innerWidth, document.documentElement.clientWidth);
    document.documentElement.style.setProperty("--doc-bleed-gutter", `${px}px`);
  } catch {
    /* leave the 0px stylesheet default in place */
  }
}

function watchBleedGutter() {
  syncBleedGutter();
  try {
    window.addEventListener("resize", syncBleedGutter, { passive: true });
  } catch {
    /* ignore */
  }
}

watchBleedGutter();

boot().catch((err) => {
  console.error("doc-form boot failed", err);
  const status = document.getElementById("status");
  if (status) {
    status.textContent = `Doc shell failed to start: ${err && err.message ? err.message : err}`;
    status.classList.add("err");
  }
});
