/**
 * @dogfood D3
 * Plan 10-19 dogfood row D3 (warm lists' D3, G20): under chaos (250 ms late, 45 % of calls), a
 * vendor typed and Tabbed on a new Bill. Questions: does the page stay responsive meanwhile (a
 * trivial script in the page answers within half a second, every time, while the vendor settles),
 * and does the vendor's source picker open within ~10 s? The *feel* is 5zorro's. Makes no records.
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "../../e2e/helpers.js";
import { sleep, keys, focusTestId, inDoc, inErp, openNewDoc, report } from "./probe-helpers.js";

test("D3: setting a vendor under chaos leaves the page responsive and opens its sources", async () => {
  process.env.ERP_CHAOS_LAG_MS = process.env.ERP_CHAOS_LAG_MS || "250";
  process.env.ERP_CHAOS_LAG_PCT = process.env.ERP_CHAOS_LAG_PCT || "45";
  const app = await launchShell();
  try {
    await waitForE2eApi(app);
    await openNewDoc(app, "bill", "/app/purchase-invoice/new");
    await sleep(4000);
    await focusTestId(app, "bill-vendor");
    await keys(app, "ALPINE SUPPLY CO");
    await sleep(600);
    await keys(app, "\t");
    const t0 = Date.now();
    const pings = [];
    const erpPings = [];
    let opened = null;
    while (Date.now() - t0 < 12_000) {
      const p0 = Date.now();
      const open = await inDoc(app, `!!document.querySelector(".src-back:not([hidden])")`, 5_000);
      pings.push(Date.now() - p0);
      const e0 = Date.now();
      await inErp(app, `1`, 5_000);
      erpPings.push(Date.now() - e0);
      if (open === true && opened == null) opened = Date.now() - t0;
      await sleep(200);
    }
    const worst = Math.max(...pings);
    const worstErp = Math.max(...erpPings);
    report("d3", { sourcesOpenedMs: opened, pings: pings.length, worstPingMs: worst, worstErpPingMs: worstErp });
    expect(worst).toBeLessThan(500);
    expect(worstErp).toBeLessThan(500);
    expect(opened).not.toBeNull();
    expect(opened).toBeLessThan(10_000);
  } finally {
    await app.close().catch(() => {});
  }
});
