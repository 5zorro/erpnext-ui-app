/**
 * Unified doc-form shell boot — routes Bill vs PO/IR controllers (tranche 10+).
 * Shared chrome (#doc-chrome) is SSoT; profile bodies are swapped at boot.
 */

import { bootDocFormPage } from "./doc-form-page.js";
import { bootBillFormPage } from "./bill-form-page.js";
import { billApiFromErpDoc } from "./bill-doc-api-adapter.js";

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
  if (selectPo) selectPo.hidden = true;
  if (selectSource) selectSource.hidden = true;
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

boot().catch((err) => {
  console.error("doc-form boot failed", err);
  const status = document.getElementById("status");
  if (status) {
    status.textContent = `Doc shell failed to start: ${err && err.message ? err.message : err}`;
    status.classList.add("err");
  }
});
