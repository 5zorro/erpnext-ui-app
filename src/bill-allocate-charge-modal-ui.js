/**
 * The Bill's *Allocate into items* dialog (OI-140; plan 2026-10-25 R6a-2): move an Add charge
 * (freight) into the item costs, by price, by qty or custom $ / %, with an offset Deduct so the
 * grand total stays. The split is pure (src/bill-charge-allocate.js); this module owns the dialog.
 * While it is open the taxes table's delete buttons are frozen (the page's `onFrozen`), and Enter
 * or Space behind the dialog does nothing.
 */
import { chargeAllocItems, planChargeToStockAllocation, allocateDoneStatus } from "./bill-charge-allocate.js";
import { formatUsdAmountHtml, parseMoney } from "./money.js";
import { createRepeatPressGuard, repeatPressToast } from "./bill-repeat-press.js";

const MODAL_ID = "alloc-charge-modal";

function escapeHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The open dialog's hooks, so close and the key guard reach them; null when closed. */
let openDialog = null;

/** Close the dialog if it is open, and unfreeze the tax deletes. */
export function closeAllocateChargeModal() {
  const node = document.getElementById(MODAL_ID);
  if (node) node.remove();
  const was = openDialog;
  openDialog = null;
  if (was) was.onFrozen(false);
  document.removeEventListener("keydown", onKeydown, true);
}

function onKeydown(ev) {
  if (!openDialog) return;
  if (ev.key === "Escape") {
    ev.preventDefault();
    ev.stopPropagation();
    const { setStatus } = openDialog;
    closeAllocateChargeModal();
    setStatus("Allocate cancelled.");
    return;
  }
  // While open, ignore Enter/Space on tax × / → Stock behind the dialog.
  const t = /** @type {HTMLElement|null} */ (ev.target);
  if (t && t.closest && t.closest(`#${MODAL_ID}`)) return;
  if (ev.key === "Enter" || ev.key === " ") {
    ev.preventDefault();
    ev.stopPropagation();
  }
}

/**
 * @param {{
 *   api: any,
 *   doc: any,
 *   taxRowIndex: number,
 *   setStatus: (text: string, tone?: string) => void,
 *   onFrozen: (frozen: boolean) => void,
 *   onApplied: (res: any) => void,
 *   repaint: (doc: any) => void,
 *   toast: (text: string, onClick: () => void) => void,
 *   clearToast: () => void,
 * }} deps
 *   `doc` — the Bill, with an allocatable charge at `taxRowIndex` (the page checks); `onFrozen` —
 *   freeze or unfreeze the tax deletes; `onApplied` — ERPNext took it, repaint; `repaint` — it
 *   refused but sent the document back; `toast` / `clearToast` — a clickable notice over the
 *   dialog, for a second Apply held back (src/bill-repeat-press.js)
 */
export function openAllocateChargeModal(deps) {
  closeAllocateChargeModal();
  const { api, doc, taxRowIndex, setStatus } = deps;
  const tax = doc.taxes[taxRowIndex];
  const items = chargeAllocItems(doc.items);
  const chargeAmt = Number(tax.tax_amount);
  const backdrop = document.createElement("div");
  backdrop.className = "alloc-modal-backdrop";
  backdrop.id = MODAL_ID;
  backdrop.dataset.testid = "bill-alloc-modal";
  backdrop.innerHTML = `
    <div class="alloc-modal" role="dialog" aria-modal="true" aria-labelledby="alloc-title">
      <h2 id="alloc-title">Allocate charge to stock cost</h2>
      <p style="margin:0;font-size:13px;color:#475569;line-height:1.4">
        ${escapeHtml(tax.description || tax.account_head || "Charge")} ·
        ${formatUsdAmountHtml(chargeAmt) || escapeHtml(String(chargeAmt))}.
        Item costs rise; a Deduct offset keeps grand total unchanged.
      </p>
      <div class="alloc-modes" role="radiogroup" aria-label="Allocation mode">
        <label><input type="radio" name="alloc-mode" value="amount" checked /> By price (amount)</label>
        <label><input type="radio" name="alloc-mode" value="qty" /> By qty</label>
        <label><input type="radio" name="alloc-mode" value="custom" /> Custom $ / %</label>
      </div>
      <table>
        <thead>
          <tr>
            <th>Item Code</th>
            <th class="num">Qty</th>
            <th class="num">Cost</th>
            <th class="num">Amount</th>
            <th class="num">Alloc $</th>
            <th class="num">Alloc %</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (it) => `<tr data-alloc-row="${it.rowIndex}">
                <td>${escapeHtml(it.item_code || `#${it.rowIndex + 1}`)}</td>
                <td class="num">${escapeHtml(String(it.qty ?? ""))}</td>
                <td class="num">${formatUsdAmountHtml(it.rate) || ""}</td>
                <td class="num">${formatUsdAmountHtml(it.amount) || ""}</td>
                <td class="num"><input type="text" inputmode="decimal" data-alloc-dollars="${it.rowIndex}" class="money-cost" disabled /></td>
                <td class="num"><input type="text" inputmode="decimal" data-alloc-percent="${it.rowIndex}" class="money-cost" disabled /></td>
              </tr>`,
            )
            .join("")}
        </tbody>
      </table>
      <div class="alloc-modal-actions">
        <button type="button" data-alloc-cancel>Cancel</button>
        <button type="button" class="primary" data-alloc-apply data-testid="bill-alloc-apply">Apply to items</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  openDialog = { onFrozen: deps.onFrozen, setStatus };
  deps.onFrozen(true);
  document.addEventListener("keydown", onKeydown, true);
  const applyBtn = backdrop.querySelector("[data-alloc-apply]");
  const currentMode = () => (backdrop.querySelector('input[name="alloc-mode"]:checked') || {}).value || "amount";
  const syncCustomEnabled = () => {
    const custom = currentMode() === "custom";
    backdrop.querySelectorAll("[data-alloc-dollars], [data-alloc-percent]").forEach((inp) => {
      inp.disabled = !custom;
    });
  };
  backdrop.querySelectorAll('input[name="alloc-mode"]').forEach((r) => {
    r.addEventListener("change", syncCustomEnabled);
  });
  syncCustomEnabled();
  const cancel = () => {
    closeAllocateChargeModal();
    setStatus("Allocate cancelled.");
  };
  backdrop.querySelector("[data-alloc-cancel]").onclick = cancel;
  backdrop.addEventListener("click", (ev) => {
    if (ev.target === backdrop) cancel();
  });

  const runApply = async () => {
    if (!api || !api.allocateCharge) {
      setStatus("Allocate API missing — restart the shell.", "err");
      return;
    }
    const mode = currentMode();
    /** @type {Array<{ rowIndex: number, dollars?: number, percent?: number }>} */
    const custom = [];
    if (mode === "custom") {
      for (const it of items) {
        const dInp = backdrop.querySelector(`[data-alloc-dollars="${it.rowIndex}"]`);
        const pInp = backdrop.querySelector(`[data-alloc-percent="${it.rowIndex}"]`);
        const dollars = dInp ? parseMoney(dInp.value) : null;
        const percent = pInp ? parseMoney(pInp.value) : null;
        if (dollars != null || percent != null) {
          custom.push({
            rowIndex: it.rowIndex,
            dollars: dollars != null ? dollars : undefined,
            percent: percent != null ? percent : undefined,
          });
        }
      }
      const preview = planChargeToStockAllocation({
        items,
        chargeAmount: chargeAmt,
        mode: "custom",
        custom,
        chargeAccount: tax.account_head,
        chargeDescription: tax.description,
      });
      if (!preview.ok) {
        setStatus(preview.reason || "Custom allocation invalid.", "err");
        return;
      }
    }
    setStatus("Allocating charge into item costs…");
    const res = await api.allocateCharge(taxRowIndex, mode, custom);
    closeAllocateChargeModal();
    if (res && res.ok) {
      deps.onApplied(res);
      const done = allocateDoneStatus(res);
      setStatus(done.text, done.tone);
    } else {
      setStatus((res && res.reason) || "Allocate failed.", "err");
      if (res && res.doc) deps.repaint(res.doc);
    }
  };
  // A second Apply while the first works put the charge in twice (a second Deduct; the bill total
  // fell by the charge): held back and said, with the toast to run it anyway (review S1).
  const applyGuard = createRepeatPressGuard({
    onRepeat: (runAgain) => deps.toast(repeatPressToast("Apply to items"), () => void runAgain()),
    onIdle: deps.clearToast,
  });
  if (applyBtn) applyBtn.onclick = () => void applyGuard.press(runApply);
  // Delay focus past the Enter/Space that opened the dialog (same class as source modal).
  const focusApply = () => {
    try {
      if (api && api.focusBillSurface) api.focusBillSurface();
    } catch {
      /* ignore */
    }
    try {
      if (applyBtn) applyBtn.focus();
    } catch {
      /* ignore */
    }
  };
  requestAnimationFrame(focusApply);
  setTimeout(focusApply, 30);
  setStatus("Enter = Apply to items · Esc = cancel. Tax row delete is frozen while this is open.");
}
