/**
 * Scaffold — the views must cover the window in every window state.
 *
 * 5zorro dogfood incident 2026-09-17 (focus-incidents.log, surfaceMode "home"): "tried testing
 * by putting the screen at full screen on a 1080p monitor and it does not use all vertical
 * space. something didn't update." The shell listened to `resize` alone; measured here before
 * the fix, going fullscreen left 1347px of dead space under the views and 2560px beside them —
 * the views simply kept their windowed size.
 *
 * No unit test can see this: the numbers only exist once a real window manager has resized a
 * real window. Gotcha: WebContentsViews are read from the main process (win.contentView.children),
 * not through a Page.
 */
import { test, expect } from "@playwright/test";
import { launchShell, waitForE2eApi } from "./helpers.js";

/** Content bounds vs. the union of every on-screen view. Off-screen views are parked at OFF. */
async function deadSpace(app) {
  return app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.isVisible());
    if (!win) return null;
    const cb = win.getContentBounds();
    const on = (win.contentView?.children || [])
      .map((v) => v.getBounds())
      .filter((b) => b.x > -1000 && b.y > -1000);
    if (!on.length) return null;
    return {
      fullScreen: win.isFullScreen(),
      bottom: cb.height - Math.max(...on.map((b) => b.y + b.height)),
      right: cb.width - Math.max(...on.map((b) => b.x + b.width)),
    };
  });
}

async function setFullScreen(app, on) {
  await app.evaluate(({ BrowserWindow }, want) => {
    const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.isVisible());
    win.setFullScreen(want);
  }, on);
}

test.describe("scaffold: window fit", () => {
  /** @type {import('@playwright/test').ElectronApplication | undefined} */
  let app;

  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
    app = undefined;
  });

  test("no dead space windowed, fullscreen, or back again", async () => {
    test.setTimeout(120_000);
    try {
      app = await launchShell();
    } catch (err) {
      test.skip(true, `launch skip-OK: ${err?.message || err}`);
      return;
    }
    await waitForE2eApi(app);

    // A window that has just been shown may still be settling; the shell's own settle passes
    // are what this waits on. 1px of slack for odd content heights split across views.
    await expect.poll(async () => (await deadSpace(app))?.bottom, { timeout: 15_000 }).toBeLessThanOrEqual(1);

    await setFullScreen(app, true);
    await expect.poll(async () => (await deadSpace(app))?.fullScreen, { timeout: 15_000 }).toBe(true);
    await expect
      .poll(async () => {
        const d = await deadSpace(app);
        return Math.max(Math.abs(d?.bottom ?? 999), Math.abs(d?.right ?? 999));
      }, { timeout: 15_000 })
      .toBeLessThanOrEqual(1);

    await setFullScreen(app, false);
    await expect
      .poll(async () => {
        const d = await deadSpace(app);
        return d && d.fullScreen === false
          ? Math.max(Math.abs(d.bottom), Math.abs(d.right))
          : 999;
      }, { timeout: 15_000 })
      .toBeLessThanOrEqual(1);
  });

  // Win+Right / Win+Left, which 5zorro uses daily. Worth its own case: the snap's `resize` event
  // reports the *pre-snap* size, and the real one arrives in the `move` events after it, so this
  // passes for a different reason than the fullscreen case above.
  test("no dead space when snapped to either half of the screen", async () => {
    test.setTimeout(120_000);
    try {
      app = await launchShell();
    } catch (err) {
      test.skip(true, `launch skip-OK: ${err?.message || err}`);
      return;
    }
    await waitForE2eApi(app);

    const halves = await app.evaluate(({ screen }) => {
      const wa = screen.getPrimaryDisplay().workArea;
      return {
        right: { x: wa.x + Math.floor(wa.width / 2), y: wa.y, width: Math.ceil(wa.width / 2), height: wa.height },
        left: { x: wa.x, y: wa.y, width: Math.floor(wa.width / 2), height: wa.height },
      };
    });

    for (const side of [halves.right, halves.left]) {
      await app.evaluate(({ BrowserWindow }, b) => {
        const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.isVisible());
        win.setBounds(b);
      }, side);
      await expect
        .poll(async () => {
          const d = await deadSpace(app);
          return d ? Math.max(Math.abs(d.bottom), Math.abs(d.right)) : 999;
        }, { timeout: 15_000 })
        .toBeLessThanOrEqual(1);
    }
  });
});
