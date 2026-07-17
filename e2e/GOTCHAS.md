/**
 * Playwright + Electron gotchas for *this* architecture
 * (toolbar chrome · src/ pure · WebContentsViews · URL/API).
 *
 * Sources: Playwright Electron docs; issues #39427 / #39507; local scaffold e2e work.
 *
 * 1. WebContentsView is not a reliable Playwright Page
 *    firstWindow() / windows() may miss chrome/home/hist/erp or order them arbitrarily.
 *    → Drive via main-process `globalThis.__erpE2e` when E2E=1, or execInView().
 *
 * 2. BrowserWindow needs a Page for launch to attach
 *    We load e2e/probe.html only under E2E=1 so electron.launch can finish.
 *
 * 3. electronApp.evaluate(fn, arg) — first argument to fn is ALWAYS require('electron')
 *    Your payload is the **second** parameter. Wrong: `evaluate(({ method }) => …, payload)`.
 *    Right: `evaluate((_electron, payload) => …, payload)`.
 *
 * 4. Do not re-test pure src/ in Playwright
 *    Units own classifiers/parsers. E2e proves main *wired* them (history, nav-guard, health).
 *
 * 5. ERP URL load is async and may be login or desk
 *    Assert origin allowlist + path prefix, not a fixed final path.
 *
 * 6. Display / ALSA / WSL
 *    Launch can hang or flake without a display → xvfb-run; tests skip-OK on launch failure.
 *
 * 7. Native OS dialogs
 *    Playwright does not intercept Electron dialog.* — stub via evaluate if we add them later.
 */
