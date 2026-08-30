/**
 * Shared address picker modal — Bill today; doc-form when features.addressPicker is on.
 */

/** @typedef {import("./doc-address.js").AddressRoleMeta} AddressRoleMeta */

/**
 * @typedef {{
 *   name: string,
 *   headline: string,
 *   body?: string,
 *   meta?: string,
 * }} AddressPickerRow
 */

/**
 * @typedef {{
 *   meta: AddressRoleMeta,
 *   rows: AddressPickerRow[],
 *   current?: string,
 *   testId?: string,
 *   optTestId?: string,
 *   applyTestId?: string,
 *   editVendorTestId?: string,
 *   isOpenRef?: { current: boolean },
 *   setStatus?: (text: string, cls?: string) => void,
 *   focusSurface?: () => void,
 *   onApply: (linkField: string, addressName: string) => void|Promise<void>,
 *   onEditVendor?: () => void|Promise<void>,
 * }} AddressPickerModalOptions
 */

/** @param {string} s */
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {string} [testId]
 */
export function closeAddressPickerModal(testId) {
  const id = testId || "doc-addr-modal";
  const node = document.getElementById(id);
  if (node) node.remove();
  document.removeEventListener("keydown", onAddressPickerKeydown, true);
  if (addressPickerKeydownRef.openRef) {
    addressPickerKeydownRef.openRef.current = false;
  }
}

/** @type {{ openRef?: { current: boolean }, testId?: string, setStatus?: (t: string, c?: string) => void }} */
const addressPickerKeydownRef = {};

function onAddressPickerKeydown(ev) {
  if (!addressPickerKeydownRef.openRef?.current) return;
  if (ev.key === "Escape") {
    ev.preventDefault();
    ev.stopPropagation();
    closeAddressPickerModal(addressPickerKeydownRef.testId);
    addressPickerKeydownRef.setStatus?.("Address pick cancelled.");
  }
}

/**
 * @param {AddressPickerModalOptions} opts
 * @returns {boolean} false when already open
 */
export function showAddressPickerModal(opts) {
  const openRef = opts.isOpenRef || { current: false };
  if (openRef.current) return false;

  const meta = opts.meta;
  if (!meta || !meta.linkField) return false;

  openRef.current = true;
  addressPickerKeydownRef.openRef = openRef;
  addressPickerKeydownRef.testId = opts.testId || "doc-addr-modal";
  addressPickerKeydownRef.setStatus = opts.setStatus;

  const rows = Array.isArray(opts.rows) ? opts.rows : [];
  const current = String(opts.current || "").trim();
  let selected = current;
  const modalId = opts.testId || "doc-addr-modal";
  const optTestId = opts.optTestId || "doc-addr-opt";
  const applyTestId = opts.applyTestId || "doc-addr-apply";
  const editVendorTestId = opts.editVendorTestId || "doc-addr-edit-vendor";

  const backdrop = document.createElement("div");
  backdrop.className = "addr-modal-backdrop";
  backdrop.id = modalId;
  backdrop.dataset.testid = modalId;

  const listHtml = rows.length
    ? rows
        .map((r) => {
          const cur = r.name === current ? " is-current" : "";
          return `<button type="button" class="addr-modal-opt${cur}" data-addr-name="${escapeHtml(r.name)}" data-testid="${optTestId}">
            <div class="addr-head">${escapeHtml(r.headline)}</div>
            <div class="addr-body">${escapeHtml(r.body || "")}</div>
            ${r.meta ? `<div class="addr-meta">${escapeHtml(r.meta)}</div>` : ""}
          </button>`;
        })
        .join("")
    : `<p class="addr-modal-empty">No addresses linked to this ${
        meta.party === "company" ? "company" : "vendor"
      } yet. Add them in Vanilla Address, then try again.</p>`;

  backdrop.innerHTML = `
    <div class="addr-modal" role="dialog" aria-modal="true" aria-labelledby="addr-modal-title">
      <h2 id="addr-modal-title">${escapeHtml(meta.title || "Pick address")}</h2>
      <div class="addr-modal-list">${listHtml}</div>
      <div class="addr-modal-actions">
        <button type="button" data-addr-clear ${current ? "" : "disabled"}>Clear</button>
        <button type="button" data-addr-cancel>Cancel</button>
        <button type="button" class="primary" data-addr-apply data-testid="${applyTestId}">Apply address</button>
      </div>
      ${
        meta.party === "supplier" && opts.onEditVendor
          ? `<div class="addr-modal-foot">
        <button type="button" data-addr-edit-vendor data-testid="${editVendorTestId}">
          Discard draft and edit available addresses for this vendor
        </button>
      </div>`
          : ""
      }
    </div>`;

  document.body.appendChild(backdrop);
  document.addEventListener("keydown", onAddressPickerKeydown, true);

  const applyBtn = backdrop.querySelector("[data-addr-apply]");
  const clearBtn = backdrop.querySelector("[data-addr-clear]");
  const editVendorBtn = backdrop.querySelector("[data-addr-edit-vendor]");
  const setStatus = opts.setStatus || (() => {});

  const markSelected = () => {
    backdrop.querySelectorAll(".addr-modal-opt").forEach((btn) => {
      btn.classList.toggle(
        "is-current",
        btn.getAttribute("data-addr-name") === selected,
      );
    });
  };

  backdrop.querySelectorAll(".addr-modal-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      selected = btn.getAttribute("data-addr-name") || "";
      markSelected();
      try {
        applyBtn?.focus();
      } catch {
        /* ignore */
      }
    });
  });

  backdrop.querySelector("[data-addr-cancel]")?.addEventListener("click", () => {
    closeAddressPickerModal(modalId);
    setStatus("Address pick cancelled.");
  });

  backdrop.addEventListener("click", (ev) => {
    if (ev.target === backdrop) {
      closeAddressPickerModal(modalId);
      setStatus("Address pick cancelled.");
    }
  });

  clearBtn?.addEventListener("click", async () => {
    selected = "";
    await opts.onApply(meta.linkField, "");
    closeAddressPickerModal(modalId);
  });

  applyBtn?.addEventListener("click", async () => {
    if (!selected) {
      setStatus("Select an address (or Clear).", "warn");
      return;
    }
    await opts.onApply(meta.linkField, selected);
    closeAddressPickerModal(modalId);
  });

  editVendorBtn?.addEventListener("click", () => {
    closeAddressPickerModal(modalId);
    void opts.onEditVendor?.();
  });

  const focusApply = () => {
    try {
      opts.focusSurface?.();
    } catch {
      /* ignore */
    }
    try {
      applyBtn?.focus();
    } catch {
      /* ignore */
    }
  };
  requestAnimationFrame(focusApply);
  setTimeout(focusApply, 30);
  setStatus(
    rows.length ? "Pick an address · Enter = Apply · Esc = cancel." : "No linked addresses found.",
  );
  return true;
}

/**
 * Mouse-only open on readonly address textareas (Tab excluded).
 * @param {{
 *   nodes: Iterable<HTMLElement|null|undefined>,
 *   isEditable: () => boolean,
 *   onOpen: (role: string) => void,
 *   lockedMessage?: string,
 *   setStatus?: (text: string, cls?: string) => void,
 * }} opts
 */
export function wireAddressPickerFields(opts) {
  const lockedMessage = opts.lockedMessage || "Addresses are locked.";
  const setStatus = opts.setStatus || (() => {});

  for (const node of opts.nodes) {
    if (!node || node.dataset.addrWired === "1") continue;
    node.dataset.addrWired = "1";
    node.addEventListener("click", () => {
      if (!opts.isEditable() || node.classList.contains("is-locked")) {
        setStatus(lockedMessage, "warn");
        return;
      }
      const role = node.getAttribute("data-addr-role");
      if (role) opts.onOpen(role);
    });
    node.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      if (!opts.isEditable() || node.classList.contains("is-locked")) return;
      ev.preventDefault();
      const role = node.getAttribute("data-addr-role");
      if (role) opts.onOpen(role);
    });
  }
}

/**
 * @param {Iterable<HTMLElement|null|undefined>} nodes
 * @param {boolean} canEdit
 */
export function syncAddressPickerLock(nodes, canEdit) {
  for (const node of nodes) {
    if (!node) continue;
    node.readOnly = true;
    node.tabIndex = -1;
    node.classList.toggle("is-locked", !canEdit);
    node.setAttribute("aria-disabled", canEdit ? "false" : "true");
  }
}
