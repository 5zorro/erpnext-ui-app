/**
 * The coverage map (plan 2026-10-03 stage C): which part of the architecture each file belongs to,
 * which e2e specs and dogfood papers exercise it — so a change can say what to test and what to
 * dogfood, instead of "dogfood the whole app" (5zorro 2026-10-03: "Right now I don't want to have
 * to dogfood the whole entire app except for when I do some possibly breaking changes").
 *
 * One row per **family**. A family owns:
 *   - `modules` — `src/` modules, by exact name ("bill-map") or prefix ("bill-*"); an exact name
 *     wins over any prefix, and a module matching two families is an error;
 *   - `paths`   — other files it owns (Electron pages, preloads, ops scripts), by exact path or a
 *     trailing "/" for a folder;
 *   - `e2e`     — the layer-3 specs that drive it;
 *   - `breaking` — a change here can break pages it does not own (the navigation spine): it asks
 *     for a broad round, not only its own papers;
 *   - `noPaper` — why it has no dogfood paper yet, when it has none.
 * Unit tests are **not** listed: `tests/architecture-families.test.js` and
 * `scripts/dogfood-for-change.js` work them out from what each test file imports, so they cannot
 * go stale. Papers name their families with `touches` (plus defaults by `kind`, `PAPER_KIND_FAMILIES`).
 *
 * The test fails when a `src/` module, an Electron file or an e2e spec belongs to no family, or a
 * paper names a family that does not exist.
 */

/** @typedef {{ id: string, label: string, modules: string[], paths?: string[], e2e?: string[], breaking?: boolean, noPaper?: string }} ArchitectureFamily */

/** @type {ArchitectureFamily[]} */
export const ARCHITECTURE_FAMILIES = [
  {
    id: "nav",
    label: "Navigation spine — doors, peeks, detours, Recent / Drafts / Submitted, lenses, focus",
    breaking: true,
    modules: ["route-info", "history", "history-nav", "history-copy-ref", "peek-stack", "peek-return-focus", "nav-*", "erp-nav-intent", "erp-route-hop",
      "erp-unload-guard", "shell-detour", "shell-surfaces", "shell-relayout", "doc-doors", "dirty-gate", "stale-focus-guard", "user-move-guard", "chrome-state",
      "lens-prefs", "lens-context", "doctype-labels", "submitted-docs", "shelved-drafts", "doc-resume", "focus-*"],
    paths: ["electron/history.html", "electron/history-preload.cjs", "electron/submitted-dropdown.html", "electron/submitted-preload.cjs",
      "electron/nav-incident-dialog.html", "electron/nav-incident-preload.cjs", "electron/focus-incident-dialog.html",
      "electron/focus-incident-preload.cjs", "electron/erp-preload.cjs"],
    e2e: ["scaffold-peek-parent.spec.js", "scaffold-detour.spec.js", "scaffold-unload-resume.spec.js", "scaffold-pure-wiring.spec.js", "scaffold-chrome.spec.js", "scaffold-peek-return-focus.spec.js"],
  },
  {
    id: "wiring",
    label: "electron/main.js — wires every family (read the changed handlers to narrow it)",
    breaking: true,
    modules: [],
    paths: ["electron/main.js"],
    e2e: ["scaffold-views.spec.js", "scaffold-pure-wiring.spec.js"],
    noPaper: "main.js wires every family: dogfood-for-change prints its changed functions so the right families can be picked",
  },
  {
    id: "chrome",
    label: "Toolbar, health / login, diagnose, feedback, shell plumbing",
    modules: ["config", "health", "health-remediation", "diagnose", "feedback-url", "ui-icons", "erp-http-list", "frappe-error", "html-reachability",
      "web-contents-listener-budget"],
    paths: ["electron/chrome.html", "electron/preload.cjs", "electron/diagnose-dropdown.html", "electron/diagnose-preload.cjs", "electron/assets/"],
    e2e: ["health-indicator.spec.js", "scaffold-url-api.spec.js", "scaffold-window-fit.spec.js", "scaffold-chrome.spec.js"],
    noPaper: "toolbar and health are covered by layer-3 smoke; the Log in button was proven by hand 2026-09-29",
  },
  {
    id: "home",
    label: "Doc Workflow Home — tiles, swimlanes, the desk hatch and doc washes",
    modules: ["home-tiles", "vendor-process-flow", "customer-process-flow", "doc-wash"],
    paths: ["electron/home.html", "electron/home-preload.cjs", "electron/doc-wash.css"],
    e2e: ["scaffold-views.spec.js"],
  },
  {
    id: "find",
    label: "Find pages (Find Bills, POs, receipts, Sales Orders, …) and the prefill into them",
    modules: ["find-*", "bill-find-prefill", "po-find-prefill"],
    paths: ["electron/find-doc.html", "electron/find-doc-preload.cjs"],
    e2e: ["scaffold-find-doc.spec.js"],
  },
  {
    id: "doc-form",
    label: "Doc skin machinery shared by every form — layout, line tables, pickers, addresses, dates, numbers",
    modules: ["doc-form-*", "doc-skin-registry", "doc-chrome", "doc-caps", "doc-caps-ui", "doc-commit-gate-ui", "doc-date", "doc-address", "address-*",
      "link-*", "vendor-activity", "field-loading", "mapped-header-fields", "item-*", "doc-item-sort", "doc-number-*", "doc-terms", "doc-terms-fields",
      "doc-source-terms", "doc-source-terms-dom", "doc-shell-kind", "erp-form-bridge", "account-company"],
    paths: ["electron/doc-form.html", "electron/doc-form.head.html", "electron/doc-form.footer.html", "electron/doc-form-body.fragment.html",
      "electron/doc-chrome.fragment.html", "electron/doc-form-preload.cjs", "electron/doc-skin.css", "electron/doc-fields.css",
      "electron/erp-form-bridge-page.js", "scripts/assemble-doc-form-html.js"],
    e2e: ["scaffold-typed-dates.spec.js"],
  },
  {
    id: "sources",
    label: "Select PO / source — the source modal shared by Bill and Item Receipt",
    modules: ["source-*", "doc-source-flow"],
    e2e: ["scaffold-bill.spec.js"],
  },
  {
    id: "bill-skin",
    label: "Bill Doc skin — taxes, payment terms, receive-with-bill, credits",
    modules: ["bill-*", "credit-memo", "jit-po-bridge", "jit-receipt", "tax-default-why"],
    paths: ["electron/bill-shell.fragment.html", "electron/bill-dashboard.css", "electron/bill.html.old"],
    e2e: ["scaffold-bill.spec.js", "scaffold-receive-gate.spec.js", "scaffold-bill-taxes.spec.js", "scaffold-jit-receipt.spec.js"],
  },
  {
    id: "po-ir",
    label: "Purchase Order and Item Receipt Doc skins",
    modules: ["po-map", "po-source", "receipt-map", "receipt-source", "so-picker"],
    e2e: [],
  },
  {
    id: "ar",
    label: "A/R Doc skins — Estimate, Sales Order, Invoice, Receive Payment",
    modules: ["estimate-map", "sales-*", "so-create-*", "so-line-*", "receive-payment-map"],
    e2e: ["scaffold-ar-doc-skins.spec.js"],
  },
  {
    id: "edit-submitted",
    label: "Editing a submitted document — void and amend, method change, payment re-link",
    modules: ["doc-actions", "doc-action-flow", "void-amend-flow", "mode-change-plan", "payment-relink"],
    e2e: [],
  },
  {
    id: "pay",
    label: "Pay Outstanding board, check page, payment terms and dates, draft payments",
    modules: ["outstanding-bills", "payment-*", "check-run-schedule", "bank-business-days", "pay-flow-*", "flow-node-density", "delay-calendar",
      "check-doc-*", "check-drawer-height"],
    paths: ["electron/pay-outstanding.html", "electron/pay-outstanding.src.html", "electron/pay-outstanding-preload.cjs", "electron/payment-doc.html",
      "electron/payment-doc.src.html", "electron/payment-doc-preload.cjs", "electron/check-doc.fragment.html", "electron/check-doc.css",
      "scripts/assemble-pay-outstanding-html.js", "scripts/assemble-payment-doc-html.js"],
    e2e: ["scaffold-pay-outstanding.spec.js", "scaffold-detour.spec.js"],
  },
  {
    id: "printing",
    label: "Printing — in place, the queue, printer healing",
    modules: ["print-*"],
    paths: ["electron/print-raster.html"],
    e2e: ["scaffold-print.spec.js"],
    noPaper: "printer output, healing and paper size were proven live by hand (plan 2026-09-26 Printing); a paper would print one",
  },
  {
    id: "papers",
    label: "Papers — the compare pane, attachments, ZIP / one PDF",
    modules: ["compare-*", "attachment-*", "sheet-preview", "zip-store"],
    e2e: [],
    noPaper: "attach-and-compare is not on any paper yet — a candidate for the next DF round",
  },
  {
    id: "simplified",
    label: "Simplified lens — field assumptions injected into Vanilla forms",
    modules: ["assume-*", "simplified-seed-profiles", "simplified-seed-profiles.generated", "simplified-seed-rule"],
    e2e: [],
    noPaper: "the Simplified lens is in progress (plan 2026-09-06 decision) and not part of the dogfood rounds",
  },
  {
    id: "calc",
    label: "In-field calculator and money helpers",
    modules: ["calc/*", "money"],
    paths: ["electron/calc-history-dropdown.html", "electron/calc-history-preload.cjs"],
    e2e: [],
    noPaper: "the calculator rides along on every amount typed; no paper is about it",
  },
  {
    id: "trace",
    label: "The trace — document links, lifecycle, statement timeline, bowtie, Gantt (plan 2026-10-03)",
    modules: ["trace-*", "payment-timeline"],
    paths: ["ops/trace/"],
    e2e: [],
  },
  {
    id: "repo",
    label: "Repo process — the coverage map itself, the commit-attribution hook",
    modules: ["architecture-families"],
    paths: ["scripts/check-commit-attribution.sh", "scripts/dogfood-for-change.js", "package.json", "package-lock.json", "playwright.config.js"],
    e2e: [],
    noPaper: "process, not product",
  },
  {
    id: "sample-data",
    label: "Sample data and the dogfood paper pack",
    modules: ["sample-data/*"],
    paths: ["ops/sample-data/"],
    e2e: [],
    noPaper: "it is the paper",
  },
  {
    id: "receiving",
    label: "Receiving scanner (phone pages) — parked 2026-09-25",
    modules: ["receiving/*"],
    paths: ["pwa/receiving/", "ops/receiving-proxy/"],
    e2e: [],
    noPaper: "parked (plan 2026-09-21)",
  },
  {
    id: "dev",
    label: "Measurement and stress tools — input count, field inventories, chaos lag",
    modules: ["input-count", "interactable-scrape", "inventories/*", "erp-chaos-lag"],
    paths: ["ops/input-count/"],
    e2e: [],
    noPaper: "developer tools, not something a clerk types into",
  },
];

/**
 * Families a paper touches by its kind, before its own `touches` are added. A vendor invoice is
 * typed into the Bill skin; a packing list into the Item Receipt skin through Select PO / source.
 */
export const PAPER_KIND_FAMILIES = Object.freeze({
  purchase_order: ["po-ir"],
  packing_list: ["po-ir", "sources"],
  vendor_invoice: ["bill-skin"],
  vendor_statement: ["pay"],
  customer_rfq: ["ar"],
  customer_po: ["ar"],
  billing_instruction: ["ar"],
  customer_remittance: ["ar", "pay"],
});

const byId = new Map(ARCHITECTURE_FAMILIES.map((f) => [f.id, f]));

/** @param {string} id */
export function familyById(id) {
  return byId.get(id) || null;
}

/**
 * The family a `src/` module belongs to. `module` is its path under src/ without ".js"
 * ("bill-map", "calc/calc-engine"). An exact name wins; otherwise the one matching prefix.
 * @param {string} module
 * @returns {{ ok: true, id: string } | { ok: false, reason: string, candidates: string[] }}
 */
export function familyOfModule(module) {
  const exact = ARCHITECTURE_FAMILIES.filter((f) => f.modules.includes(module)).map((f) => f.id);
  if (exact.length === 1) return { ok: true, id: exact[0] };
  if (exact.length > 1) return { ok: false, reason: "listed by name in two families", candidates: exact };
  const prefix = ARCHITECTURE_FAMILIES.filter((f) => f.modules.some((m) => m.endsWith("*") && module.startsWith(m.slice(0, -1)))).map((f) => f.id);
  if (prefix.length === 1) return { ok: true, id: prefix[0] };
  return { ok: false, reason: prefix.length ? "matches prefixes of two families" : "belongs to no family", candidates: prefix };
}

/**
 * The families a repo file belongs to (a `src/` module, an owned path, or a test by what it
 * imports — the caller passes `testImports` for tests).
 * @param {string} path repo-relative
 * @param {{ testImports?: string[] }} [opts] for a test: the repo-relative files it imports or names
 * @returns {string[]}
 */
export function familiesOfPath(path, opts = {}) {
  const p = path.replace(/^\.\//, "");
  if (p.startsWith("src/") && p.endsWith(".js")) {
    const r = familyOfModule(p.slice(4, -3));
    return r.ok ? [r.id] : [];
  }
  const owned = ARCHITECTURE_FAMILIES.filter((f) => (f.paths || []).some((x) => (x.endsWith("/") ? p.startsWith(x) : p === x))).map((f) => f.id);
  if (owned.length) return owned;
  if (p.startsWith("e2e/") && p.endsWith(".spec.js")) {
    const spec = p.slice(4);
    return ARCHITECTURE_FAMILIES.filter((f) => (f.e2e || []).includes(spec)).map((f) => f.id);
  }
  if (p.startsWith("tests/") && opts.testImports) {
    return [...new Set(opts.testImports.flatMap((x) => familiesOfPath(x)))];
  }
  return [];
}

/**
 * The families a dogfood paper exercises: its kind's defaults plus its own `touches`.
 * @param {{ kind: string, touches?: string[] }} paper
 */
export function paperFamilies(paper) {
  return [...new Set([...(PAPER_KIND_FAMILIES[paper.kind] || []), ...(paper.touches || [])])];
}

/**
 * What to run for a set of changed files: the families they belong to, and for each the unit tests,
 * e2e specs and papers that exercise it. A `breaking` family asks for a broad round.
 * @param {object} input
 * @param {string[]} input.changed repo-relative paths
 * @param {Record<string, string[]>} input.testImports test path → files it imports or names
 * @param {Array<{ id: string, kind: string, scenario: string, touches?: string[] }>} input.papers
 */
export function planForChange({ changed, testImports, papers }) {
  const families = new Map();
  const unmapped = [];
  // A changed test is run, not dogfooded: it would otherwise pull in every family it imports from.
  // A changed fixture means the tests that read it.
  const testsChanged = [...new Set(changed.filter((p) => p.startsWith("tests/")).flatMap((p) => (p.endsWith(".test.js") ? [p]
    : Object.entries(testImports).filter(([, imps]) => imps.includes(p)).map(([t]) => t))))];
  for (const path of changed) {
    if (path.startsWith("tests/")) continue;
    const ids = familiesOfPath(path);
    if (!ids.length) { if (!/^(docs\/|README|HANDOFF|CHANGELOG|AGENT_CONVENTIONS|\.)/.test(path)) unmapped.push(path); continue; }
    for (const id of ids) { if (!families.has(id)) families.set(id, []); families.get(id).push(path); }
  }
  const out = [...families.entries()].map(([id, files]) => {
    const f = familyById(id);
    return {
      id, label: f.label, breaking: !!f.breaking, files,
      tests: Object.entries(testImports).filter(([, imps]) => imps.some((x) => familiesOfPath(x).includes(id))).map(([t]) => t).sort(),
      e2e: f.e2e || [],
      papers: papers.filter((p) => paperFamilies(p).includes(id)).map((p) => ({ id: p.id, scenario: p.scenario })),
      noPaper: f.noPaper || "",
    };
  });
  return { families: out, testsChanged, unmapped, broad: out.some((f) => f.breaking) };
}
