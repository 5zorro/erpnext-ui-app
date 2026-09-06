# Input-count / scrape gotchas (Bill anchor)

Methodology notes for advertising stacked bars (**Vanilla · Doc · Simplified** only).
Run a fresh comparison anytime:

```bash
cd ~/erpnext-ui-app && npm run report:input-count
```

**Dogfood gate before Simplified mockups:** challenge the numbers below; append gotchas
you hit; only then design mockups that sidestep the confirmed ones.

---

## What we count today

| Symbol | Source | Use |
|--------|--------|-----|
| \(N_d\) | `*_DOC_CURATED` (warm inventory, per doctype) | Doc advertising |
| Doc static | scrape of the Doc skin HTML (Bill fragments / `doc-form.html`) | Completeness gate vs curated (no synthetic lines) |
| \(N_v\) | scrape of `tests/fixtures/{bill,po,receipt}-vanilla-form.fixture.html` | Vanilla advertising proxy until live Desk dump |
| \(N_s\) | `simplifiedInteractables(vanillaItems, SEED_PROFILES[doctype])` | Simplified advertising (G11) |

Run `npm run report:input-count` for all three anchors, or `report:input-count:bill` /
`:po` / `:receipt` for one.

**Bar segments** (`advertisingBarSegments`):

1. **blankTabCycle** — focusables on a blank form (today ≈ full inventory)
2. **sourcedTabCycle** — focusables after get-from-source (today **same as blank** — placeholder)
3. **requiredModeSwitches** — date / tenkey pads on the Save path
4. **minimalSaveFromSourced** — Save-path stops + those mode switches

Mode switch is **inferred** from markup (`date` / `tenkey` / `none`), not timed on a keyboard.

---

## Snapshot (update when inventories change)

From `npm run report:input-count` (2026-09-05, all three anchors, Simplified N_s added):

| Doctype | Doc curated N_d | Simplified N_s | Vanilla fixture N_v | N_d vs N_v | N_s vs N_v |
|---------|-----------------|-----------------|----------------------|-----------|-----------|
| Bill (Purchase Invoice) | 57 | 54 | 65 | −12.3% | −16.9% |
| Purchase Order | 39 | 48 | 58 | −32.8% | −17.2% |
| Item Receipt (Purchase Receipt) | 56 | 56 | 66 | −15.2% | −15.2% |

\(N_v > N_d\) and \(N_v > N_s\) both hold on every anchor. \(N_d\) vs \(N_s\) does **not**
have a stable ordering — see G11.

---

## Gotchas (confirmed or suspected)

### G1 — Vanilla is a fixture, not live Desk HTML

The Vanilla file is a **representative density** snippet (Clean Core — no vendor edit).
Live Purchase Invoice may add section collapses, child-table chrome, custom fields, or
workspace buttons. **Dogfood:** Tab a blank PI in Vanilla on sandbox; if your mental
count is far from ~65, capture a Desk HTML dump and replace/extend the fixture.

The fixture also has no per-tab `hidden`/panel markup (checked 2026-09-06): fields from
every tab (Details, Payments, Terms, More Info, Connections) sit flat and unhidden in one
file, so \(N_v\) already counts every tab flattened, not what a real one-tab-at-a-time
Desk session shows at once. \(N_s\) (G11) is a direct subset of this same list, so it
inherits the flattening rather than suffering a separate penalty from it — but the
absolute numbers for **both** still overstate what a clerk sees on any one tab.

### G2 — Blank vs sourced not split yet

Both bar sides currently use the same inventory. Sourced Bill (from simple PO) should
**drop** many header/line fields that arrive prefilled — that is the interesting
advertising wedge. Needs a sourced inventory (or scrape of a sourced fixture) before
marketing copy.

### G3 — Doc curated ≠ Doc static scrape

Curated includes a **synthetic one-line item template** (and delete) not present in empty
`bill.html`. Advertising \(N_d\) uses curated; CI completeness uses static scrape ⊂ curated.

### G4 — Tab-cycle count ≠ verified Tab order

We count focusable controls, not a real `Tab` walk (tabindex, roving tabindex, skipped
hidden panes). Dogfood with keyboard; if order differs, note it — do not “fix” the
count to match one browser quirk without a rule.

### G5 — Overlays / pickers usually excluded

Hidden commit-gate, retry, and similar are stripped. **Link pickers**, source-PO modal,
and print dialogs are **not** in the inventories. Decide explicitly whether advertising
“blank form” includes “open vendor picker once” effort (today: **no**).

### G6 — Chrome vs clerk path

Both lenses include toolbar / menu chrome. A “clerk path only” cut (header + lines +
taxes + Save) would change absolute numbers but should preserve \(N_v > N_d\) if both
sides use the same cut. Flag if dogfood wants a second series of bars.

### G7 — Frappe `data-fieldname` vs Doc `data-field`

Scraper accepts both. Live Desk dumps without `data-testid` rely on `field:…` ids —
keep dumps consistent when refreshing the Vanilla fixture.

### G8 — `inputmode="numeric"` on dates

Desk often marks date fields numeric. Scraper classifies by **field/testid name** first
so posting/due/bill dates stay `date`, not `tenkey`. Watch false tenkeys on other
numeric non-money fields.

### G9 — One child row assumed

Both sides model **one** items row (+ Doc synthetic line). Multi-line bills scale
linearly; advertising should say “per typical one-line bill” (or define a fixed line
count).

### G10 — Amount / read-only displays

Doc Amount column is display-only (not counted). Vanilla fixture may still count an
amount control if marked editable. Align rules when refreshing the fixture.

### G11 — Simplified N_s is Vanilla minus seed, not a separate fixture; N_d vs N_s is not ordered

`simplifiedInteractables()` (`src/input-count.js`) takes the **same** Vanilla-fixture scrape
used for \(N_v\) and drops any item whose field the doctype's seed profile assumes
(`simplified-seed-profiles.js`) — this matches the runtime (Simplified is Vanilla + an
assumptions bar, not a rebuilt form), so no new fixture was needed to add \(N_s\).

\(N_v > N_s\) holds on all three anchors (2026-09-05), but \(N_d\) and \(N_s\) do **not**
sit in a fixed order: Bill has \(N_s < N_d\) (54 vs 57), Purchase Order has \(N_d < N_s\)
(39 vs 48) by a wide margin, Item Receipt ties (56 vs 56). This is not a bug in either
number — Doc curated (\(N_d\)) is a warm inventory that includes commit-gate/retry buttons
and a synthetic line template (G3) that only exist in certain states, while \(N_s\) is a
literal one-state DOM count; they are measuring different things and were never meant to
rank against each other. Do not read \(N_d\) vs \(N_s\) as "Doc beats Simplified" or vice
versa — the only claim the numbers support is that both lenses cut real interactables
versus stock Vanilla.

Seed profiles for PO and Item Receipt (added 2026-09-05, same session as Bill's) have
**not** been dogfooded — see gotchas G1–G10 for the same caveat already carried by \(N_v\).
Treat this snapshot as a first-cut, honestly-labeled estimate, not a verified claim.

---

## Dogfood checklist (you)

1. Run `npm run report:input-count` and keep the two inventories open.
2. **Doc:** New Bill → Tab through blank form. Mark anything counted that you never reach,
   or anything you reach that is missing (especially after Add line).
3. **Vanilla:** New Purchase Invoice on sandbox → same. Compare density to the fixture list.
4. **Sourced (spot):** Get items from a simple PO on both lenses — note which fields you
   still Tab vs skip. (Feeds G2; no need for perfect numbers yet.)
5. Append new gotchas here (id `G11+`) with Observed / Expected one-liners.
6. When G1–G2 (and any blocker you add) feel honest enough, **then** draw Simplified
   mockups that sidestep those gotchas.

---

## Out of scope here

- Competitor product bars (legal / claim risk).
- Keystroke logging (never).
- Simplified/PO/IR dogfood (G11) — numbers are a mechanical first cut, not yet walked in the app.
