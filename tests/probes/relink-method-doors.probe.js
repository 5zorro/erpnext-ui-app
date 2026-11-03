/**
 * Payment re-link and method change, every door the sandbox allows without making records (plan
 * 10-25 R2-5, when they moved out of main.js): the pending reviews read; a vendor's re-link facts
 * (two vendors with open bills, and no vendor); a re-link refused for missing fields and for a
 * pairing ERPNext does not offer; the auto re-link (the board already runs it for every vendor on
 * load); a review close refused for no payment and for a payment that does not exist; the
 * method-change facts (none, then the vendors' open bills); a method change with nothing to change,
 * then one whose first bill does not exist, so it stops and the second (also made up, so a broken
 * stop rule cannot void a real bill) is "not attempted", with the progress events the page gets. Prints one `PROBE` line per door, so a run on the code before a
 * change and one after can be diffed line for line. Acts as the AP clerk.
 *
 * Not driven: a re-link that posts (the sandbox has no loose payment, and posting one is a
 * write), so the reconcile call, the review flag and the provenance comment are reached only as far
 * as their refusals; a method change that voids a real bill (the leaves-records probes cover it).
 */
import { test } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../e2e/helpers.js";
import { docQuiet, inBoard, openBoard, openNewDoc, report } from "./probe-helpers.js";
import { loginAsProbeUser, AP_CLERK } from "./probe-user.js";

/** ERPNext names each unsaved row `new-<doctype>-<random>`; blanked so two runs diff line for line. */
const scrub = (o) => JSON.parse(JSON.stringify(o ?? null).replace(/"new-([a-z-]+)-[a-z0-9]{10}"/g, '"new-$1-<random>"'));
const api = async (app, call) =>
  scrub(await inBoard(app, `(async () => { try { return await window.erpPayOutstanding.${call}; } catch (e) { return { threw: String(e && e.message || e) }; } })()`));
const VENDORS = ["ALPINE SUPPLY CO", "SUMMIT TRADERS"];
const NO_BILL = "ACC-PINV-ZZ-NO-SUCH-1";

test("payment re-link and method change: every door that writes nothing", async () => {
  test.setTimeout(300_000);
  const app = await launchShell();
  let clerk = null;
  try {
    await waitForE2eApi(app);
    await openNewDoc(app, "bill", "/app/purchase-invoice/new"); // the ERPNext page is logged in and ready
    clerk = await loginAsProbeUser(app, AP_CLERK.roles, { as: AP_CLERK.name });
    await openBoard(app, { cards: false }); // the board's API is what is driven, not its cards
    await docQuiet(app);

    report("reviews", await api(app, "relinkReviews()"));
    report("facts-none", await api(app, `paymentRelinkFacts("")`));
    const bills = [];
    for (const v of VENDORS) {
      const f = await api(app, `paymentRelinkFacts(${JSON.stringify(v)})`);
      report(`facts ${v}`, f);
      for (const i of (f && f.invoices) || []) bills.push(i.invoice_number);
    }
    bills.sort();
    report("relink-missing", await api(app, "relinkPayment({})"));
    report(
      "relink-not-offered",
      await api(app, `relinkPayment(${JSON.stringify({ supplier: VENDORS[0], payment: "ACC-PAY-ZZ-NO-SUCH", invoice: bills[0] || NO_BILL, amount: 1 })})`),
    );
    for (const v of VENDORS) report(`auto ${v}`, await api(app, `autoRelink(${JSON.stringify(v)})`));
    report("close-none", await api(app, `closeRelinkReview("")`));
    report("close-no-such", await api(app, `closeRelinkReview("ACC-PAY-ZZ-NO-SUCH")`));

    report("mode-facts-none", await api(app, "modeChangeFacts([])"));
    report("mode-facts", await api(app, `modeChangeFacts(${JSON.stringify(bills)})`));
    report("mode-run-empty", await api(app, "runModeChange([])"));
    const stop = await inBoard(
      app,
      `(async () => {
        const seen = [];
        const off = window.erpPayOutstanding.onModeChangeProgress((p) => seen.push(p));
        try {
          const res = await window.erpPayOutstanding.runModeChange([
            { invoice: ${JSON.stringify(NO_BILL)}, patch: { mode_of_payment: "ZZ PAY PATHS" } },
            { invoice: ${JSON.stringify(NO_BILL + "-B")}, patch: { mode_of_payment: "ZZ PAY PATHS" } },
          ]);
          return { res, seen };
        } catch (e) { return { threw: String(e && e.message || e), seen }; } finally { if (typeof off === "function") off(); }
      })()`,
    );
    report("mode-run-stops", stop);
  } finally {
    if (clerk) await clerk.retire().catch((e) => report("retire-failed", String(e)));
    await app.close().catch(() => {});
  }
});
