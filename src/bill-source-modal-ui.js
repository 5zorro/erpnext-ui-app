/**
 * The Bill's source picker (plan 2026-10-25 R6a-2): what the shared source modal
 * (src/source-modal-ui.js, also the Item Receipt's) does on a Bill — its Credit memo switch and
 * what a pick pulls. The slices stream through src/source-picker-flow.js; a pick's meaning is pure
 * (src/bill-source-flow.js `billSourceChoiceAction`, src/source-modal-credit-mode.js
 * `classifyCreditSourceChoice`). The Bill page decides whether the picker may open (vendor, open
 * session, a run already going) and hands over the rest as `deps`.
 *
 * OI-166 — the modal asks one question, "where does this Bill come from?", and the foot switch
 * changes which list answers it: open Purchase Orders / Item Receipts, or the submitted Bill this
 * credit is against. 5zorro's flow is vendor → source in one breath, so the decision belongs here
 * rather than behind a second dialog opened later. A Bill that is already a credit opens the modal
 * already switched.
 */
import { showSourceModal } from "./source-modal-ui.js";
import {
  buildCreditSourceGroups,
  buildCreditSourceLoadingGroups,
  buildCreditSourceErrorGroups,
  classifyCreditSourceChoice,
} from "./source-modal-credit-mode.js";
import { runSourcePickerFlow } from "./source-picker-flow.js";
import { billSourceChoiceAction, billSourcePulledStatus } from "./bill-source-flow.js";

/**
 * @typedef {{
 *   api: any,
 *   supplier: string,
 *   trigger: "link_pick"|"blur"|"toolbar"|"unknown",
 *   creditOn: boolean,
 *   isOpenRef: { current: boolean },
 *   setStatus: (text: string, tone?: string) => void,
 *   log: (event: string, detail?: string) => void,
 *   mayOpen: (vendor: string, trigger: string) => { ok: boolean, reason?: string },
 *   onUserClose: (kind: string) => void,
 *   searchBills: () => Promise<Array<{ value: string, description?: string }>>,
 *   currentName: string,
 *   chooseCreditSource: (name: string) => Promise<unknown>,
 *   beforePull: () => void,
 *   onPulled: (merged: any) => void,
 *   refresh: () => Promise<unknown>,
 * }} BillSourceModalDeps
 *   `creditOn` — the Bill is already a credit memo; `searchBills` — this vendor's submitted Bills,
 *   this Bill left out; `chooseCreditSource` — the credit side's pick (the page's
 *   `commitCreditSource`, shared with the informal link dialog); `beforePull` — the pull is about
 *   to start (focus moves on to the invoice date); `onPulled` — ERPNext took the pull, repaint;
 *   `refresh` — it refused, reload the Bill
 */

/** @param {BillSourceModalDeps} deps */
export function runBillSourceModal(deps) {
  const { api, supplier: sup, setStatus } = deps;
  let creditOn = deps.creditOn;
  /** Latest PO/IR corpus, kept warm so flipping back is instant and complete. */
  let sourceGroups = null;
  /** @type {import("./source-modal-ui.js").SourceModalController|null} */
  let modalCtl = null;
  let creditLoadToken = 0;

  async function switchCreditMode(next) {
    if (!modalCtl) return;
    creditOn = !!next;
    if (!creditOn) {
      // Slices that landed while the switch was on were accumulated, not painted.
      modalCtl.setCreditMode(false, sourceGroups || undefined);
      setStatus("Back to Purchase Orders and Item Receipts — Space to check · Enter to pull.");
      return;
    }
    const token = ++creditLoadToken;
    modalCtl.setCreditMode(true, buildCreditSourceLoadingGroups(sup));
    setStatus(`Loading submitted Bills for ${sup}…`);
    let rows = null;
    let failure = "";
    try {
      rows = await deps.searchBills();
    } catch (err) {
      failure = String(err && err.message ? err.message : err);
    }
    // A stale fetch must never repaint a list the clerk has already switched away from.
    if (token !== creditLoadToken || !creditOn || !deps.isOpenRef.current) return;
    if (failure) {
      modalCtl.setCreditMode(true, buildCreditSourceErrorGroups(failure, sup));
      setStatus(`Could not load Bills: ${failure}`, "err");
      return;
    }
    modalCtl.setCreditMode(true, buildCreditSourceGroups(rows, { supplier: sup, exclude: deps.currentName }));
    setStatus("Pick the Bill this credit is against (or decide later).");
  }

  async function chooseCredit(choice) {
    const verdict = classifyCreditSourceChoice(choice);
    if (verdict.action === "decline") {
      setStatus("Credit memo left with no Bill behind it — the Return Against warning stays up until you link one.", "warn");
      return;
    }
    if (verdict.action !== "link") {
      setStatus("Pick the Bill this credit is against, or decide later.", "warn");
      return;
    }
    await deps.chooseCreditSource(verdict.name);
  }

  async function pull(choice) {
    const next = billSourceChoiceAction(choice);
    if (next.action === "nic") {
      setStatus("No source — enter lines manually.");
      return;
    }
    if (next.action === "warn") {
      setStatus("Pick at least one source (Space to check), or NIC.", "warn");
      return;
    }
    const { payload } = next;
    setStatus(`Pulling from ${next.labels}…`);
    deps.beforePull();
    const merged = payload.length === 1 ? await api.mergeSource(payload[0].kind, payload[0].name) : await api.mergeSource(payload);
    if (merged && merged.ok) {
      deps.onPulled(merged);
      setStatus(billSourcePulledStatus(payload));
    } else {
      setStatus((merged && merged.reason) || "Could not pull source.", "err");
      await deps.refresh();
    }
  }

  setStatus(creditOn ? "Loading submitted Bills…" : "Loading open PO / Item Receipts…");

  return runSourcePickerFlow({
    supplier: sup,
    trigger: deps.trigger,
    mode: "multi",
    listSourceSlice: (vendor, sliceId) => api.listSourceSlice(vendor, sliceId),
    onGroups: (groups) => {
      sourceGroups = groups;
    },
    applySlices: () => !creditOn,
    log: deps.log,
    mayOpen: deps.mayOpen,
    onUserClose: deps.onUserClose,
    onStreamComplete: ({ errors }) => {
      // Credit mode owns the status line while it is on — the PO/IR stream is still running
      // underneath it and must not narrate over the question the clerk is actually answering.
      if (creditOn || !deps.isOpenRef.current) return;
      if (errors.length) setStatus(`Some sources failed to load (${errors.length}) — NIC still ok.`, "warn");
      else setStatus("Sources loaded — Space to check · Enter to pull (or NIC).");
    },
    showModal: (flowOpts) =>
      showSourceModal({
        ...flowOpts,
        testId: "bill-source-modal",
        pickButtonTestId: "bill-source-pull",
        isOpenRef: deps.isOpenRef,
        setStatus,
        creditToggle: {
          label: "Credit memo?",
          checked: creditOn,
          testId: "bill-source-credit-toggle",
          onChange: (next) => {
            void switchCreditMode(next);
          },
        },
        onController: (c) => {
          modalCtl = c;
          if (flowOpts.onController) flowOpts.onController(c);
          // Opened on a Bill that is already a credit: fetch its list straight away.
          if (creditOn) void switchCreditMode(true);
        },
        focusSurface: () => {
          if (api && api.focusBillSurface) api.focusBillSurface();
        },
        onChoose: (choice) => (creditOn ? chooseCredit(choice) : pull(choice)),
      }),
  });
}
