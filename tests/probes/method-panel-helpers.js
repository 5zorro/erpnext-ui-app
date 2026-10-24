/**
 * Driving Pay Outstanding's Method… panel (the batch method change) from a probe: open it on one
 * vendor's card, change every bill to a method, and read the chips, status and outcome back.
 */
import { inBoard } from "./probe-helpers.js";

/** The vendor's card, as page source. */
export const cardOf = (vendor) =>
  `[...document.querySelectorAll('[data-testid="vendor-card"]')].find((c) => { const n = c.querySelector(".vendor-head .name"); return n && n.textContent === ${JSON.stringify(vendor)}; })`;

/** Open the panel on `vendor`, choose `mode`, Apply — answering yes to its confirm. */
export const applyMethod = (app, vendor, mode) =>
  inBoard(
    app,
    `(() => { window.confirm = () => true; const c = ${cardOf(vendor)}; if (!c) return false;
      c.querySelector('[data-testid="vendor-change-method"]').click();
      const p = c.querySelector('[data-testid="method-panel"]'); p.querySelector('[data-testid="method-panel-mode"]').value = ${JSON.stringify(mode)};
      p.querySelector('[data-testid="method-panel-apply"]').click(); return true; })()`,
  );

/** What the panel shows: chips by bill, the status line, Try again's text (null when hidden), the outcome list. */
export const panelState = (app, vendor) =>
  inBoard(
    app,
    `(() => { const c = ${cardOf(vendor)}; if (!c) return null; const p = c.querySelector('[data-testid="method-panel"]');
      return { open: !p.hidden, status: p.querySelector('[data-testid="method-panel-status"]').textContent,
        chips: Object.fromEntries([...p.querySelectorAll('[data-testid="method-panel-row"]')].map((r) => [r.querySelector("strong").textContent, r.querySelector('[data-testid="method-panel-chip"]').textContent])),
        retry: (() => { const b = p.querySelector('[data-testid="method-panel-retry"]'); return b.hidden || b.closest("[hidden]") ? null : b.textContent; })(),
        done: (() => { const b = p.querySelector('[data-testid="method-panel-done"]'); return !(b.hidden || b.closest("[hidden]")); })(),
        outcome: [...p.querySelectorAll('[data-testid="method-panel-outcome"] li')].map((l) => l.textContent) }; })()`,
  );

/** Click a panel button by test id. */
export const clickPanel = (app, vendor, testid) =>
  inBoard(app, `(() => { const c = ${cardOf(vendor)}; const b = c && c.querySelector('[data-testid=${JSON.stringify(testid)}]'); if (!b) return false; b.click(); return true; })()`);
