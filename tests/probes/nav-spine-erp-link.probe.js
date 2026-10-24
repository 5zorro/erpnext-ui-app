/**
 * @nav spine
 * Plan 2026-10-24 build step 2: every cell of the navigation matrix that starts from
 * "erp-link" — the states it can reach × every move, judged on lands / typing / back / focus
 * (`src/nav-spine.js`). `NAV_ONLY=<id>,<id>` runs only those cells. Leaves no records: the
 * ZZ-NAV drafts it makes are deleted at the end, and no cell saves.
 */
import { test, expect } from "@playwright/test";
import { runSpine } from "./nav-spine.js";

test("nav spine: from erp-link", async () => {
  test.setTimeout(60 * 60_000);
  const { failed } = await runSpine("erp-link");
  expect(failed).toEqual([]);
});
