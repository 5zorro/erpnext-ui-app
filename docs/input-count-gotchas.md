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
| \(N_d\) | `BILL_DOC_CURATED` (warm inventory) | Doc advertising / Simplified thin ceiling |
| Doc static | scrape of `electron/bill.html` | Completeness gate vs curated (no synthetic lines) |
| \(N_v\) | scrape of `tests/fixtures/bill-vanilla-form.fixture.html` | Vanilla advertising proxy until live Desk dump |

**Bar segments** (`advertisingBarSegments`):

1. **blankTabCycle** — focusables on a blank form (today ≈ full inventory)
2. **sourcedTabCycle** — focusables after get-from-source (today **same as blank** — placeholder)
3. **requiredModeSwitches** — date / tenkey pads on the Save path
4. **minimalSaveFromSourced** — Save-path stops + those mode switches

Mode switch is **inferred** from markup (`date` / `tenkey` / `none`), not timed on a keyboard.

---

## Snapshot (update when inventories change)

From `npm run report:input-count` (2026-08-02):

| Lens | Interactables | Mode switches | Effort |
|------|---------------|---------------|--------|
| Doc curated | 31 | 6 | 37 |
| Doc static HTML | 25 | 4 | 29 |
| Vanilla fixture | 65 | 9 | 74 |

\(N_v > N_d\) holds on this snapshot.

---

## Gotchas (confirmed or suspected)

### G1 — Vanilla is a fixture, not live Desk HTML

The Vanilla file is a **representative density** snippet (Clean Core — no vendor edit).
Live Purchase Invoice may add section collapses, child-table chrome, custom fields, or
workspace buttons. **Dogfood:** Tab a blank PI in Vanilla on sandbox; if your mental
count is far from ~65, capture a Desk HTML dump and replace/extend the fixture.

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
- PO / IR anchors (extend after Bill dogfood).
