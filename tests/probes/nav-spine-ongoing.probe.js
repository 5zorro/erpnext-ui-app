/**
 * @nav ongoing
 * Plan 2026-10-24 build step 3, the fourth axis (5zorro: *"to see if accumulated cruft happens such
 * that the flyout bar become unreliable and needs a pruning"*): a scripted day — `NAV_DAY` cells
 * (default 25, about 100 moves) from every start, picked by a seeded random (`NAV_SEED`), with
 * drafts left behind and deleted straight in ERPNext along the way — then the cruft check
 * (`src/nav-cruft.js`), the Drafts and Recent cells judged again as `ongoing:` ids, the cruft check
 * again, and once more after a restart. Leaves no records: the drafts it makes are deleted.
 */
import { test, expect } from "@playwright/test";
import { runOngoing } from "./nav-spine.js";

test("nav spine: a long session, then the flyout cells and the cruft check", async () => {
  test.setTimeout(3 * 60 * 60_000);
  const { failed } = await runOngoing();
  expect(failed).toEqual([]);
});
