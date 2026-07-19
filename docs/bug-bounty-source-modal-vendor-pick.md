# Bug bounty — Source modal never fires after Vendor pick (Doc Bill)

## Status

**Open** (2026-07-18) — strike 3 in dogfood. Do **not** keep patching production `onPicked` until a matrix proves which trigger fires.

## Contexts where found

1. **erpnext-ui-app Doc Bill** (`electron/bill.html` + `bill-preload.cjs` + `main.js`) — after Vendor Link pick (click **or** type + optional ↑↓ + Tab/Enter), Source Selection modal does not appear.
2. **Same session after shell restart** — still fails (not “stale preload only”).
3. **Museum reference** (`~/agent-harness/erpnext/doc-shell/mockups/bind.js`) — *does* auto-open after supplier Link via `setTimeout(…, 500)` after `frm.set_value`; different host (in-page Frappe Link control, not Electron IPC + custom dropdown).
4. **Related family** — any post-Link “next step” modal (OI-001 Bill source, OI-024/028 PO/PR variants) shares the same trigger/focus class of bugs.

## Behavior observed

- Vendor dropdown / search **works** (user can pick a supplier; field shows a value).
- Source modal **does not** appear after that pick.
- Dogfood reports this across multiple fix attempts (see “Tried so far”).
- Unclear without instrumentation whether toolbar **Select PO / source** still opens the modal (critical bifurcate — see checklist).

## Behavior expected

| Step | Expected |
|------|----------|
| Blank Supplier search | Dropdown offers **Go to Vendor add…** as the selectable option |
| Vendor selected (click / Tab / Enter) | Source modal opens **immediately** (must not wait on ERP `set_value` / ajax quiet) |
| Modal open | Focus on modal (Bill WebContents **and** DOM control). **No** lockdown of Bill inputs (`pointer-events: none`, capture traps that brick the page, etc.) |
| Source chosen (keyboard or click), including NIC | Focus moves to **Terms** |
| Cancel / Esc | Modal closes; vendor remains set; Terms optional |

## Industry approaches (how products trigger a “next” modal after a Link pick)

Industry does **not** usually invent five permanent production paths. They pick **one product contract**, then validate with a **temporary matrix** when the host is flaky (Electron + remote form + custom autocomplete).

| # | Approach | Who uses it | How it works | Fits our stack? |
|---|----------|-------------|--------------|-----------------|
| **A** | **UI-event first** | QuickBooks-ish flows, many desktop shells | `onSelect` / `awesomplete-selectcomplete` opens the next UI **synchronously**; persistence is fire-and-forget | **Preferred product contract** for Doc Bill |
| **B** | **After successful write** | Strict form apps | `await set_value` → then open | Fragile here: bridge `after_ajax` can stall; strike 1–2 lived here |
| **C** | **Settling delay** | Museum doc-shell | `set_value` then `setTimeout(500)` open | Works in-page; delay is a smell if IPC already async |
| **D** | **Explicit toolbar only** | Conservative ERP UIs | No auto-open; user clicks “Select PO” | Always available as **fallback**; not the Bill product goal |
| **E** | **Wizard / route step** | Onboarding, mobile | Navigate to `/bill/source` after vendor | Heavy; overkill for Bill |

**Recommendation:** Product stays **A** (UI-event first). Use a **dogfood matrix page** (A–E buttons) only until we know which handlers actually run in Electron — then delete the matrix.

## Gotchas — focus, locks, and “modal never shows”

These bite **especially** when the modal lives in one `WebContentsView` and ERP lives in another.

### Input lockdown (avoid unless loading)

| Pattern | Risk |
|---------|------|
| `body.blocked { pointer-events: none }` on inputs | Stops typing; if mistargeted, picker “works” only partially or toolbar dies |
| Capture-phase `keydown` + `preventDefault` on `document` | Can steal Tab/Enter **before** picker commits, or brick the page if modal never mounts |
| Focus trap that assumes modal is in DOM | If open fails, trap holds focus nowhere useful |
| Hiding vendor dropdown by disabling the field | User thinks pick “worked”; follow-up never runs |
| `aria-modal` + no focus move | Screen-reader / keyboard users get a silent failure |

**Contract for this bug:** modal is a **visual + focus overlay only**. Do **not** lock Bill fields to “force” the modal. If we need to ignore stray keystrokes, scope the listener to the modal node and remove it in `close()`.

### Electron / architecture gotchas

| Gotcha | Symptom |
|--------|---------|
| Wrong WebContents focused (ERP vs Bill) | Modal exists in Bill DOM but user stares at Vanilla |
| `listSources` / `setHeader` IPC hang | Status stuck on “Loading…” / “Setting vendor…”; modal never appended |
| Gate on `openSourcePicker` flag from main | Skip/no-op path returns `ok` **without** flag → UI never opens (strike 1 class) |
| `await setHeader` before open | Looks like “picker dead” while ajax quiet waits (strike 2 class) |
| Silent `if (!editable()) return` in `onPicked` | Field value set by picker; **no status change; no modal** (high suspect) |
| `docstatus === 0` strict | If ERP ever sends `"0"` string, `editable()` false → same silent return |
| `sourceModalOpen` sticky true | First open throws after flag set; later opens no-op forever |
| Modal `z-index` under chrome/dropdown | “Opened” but invisible |
| Stale shell (preload not reloaded) | Missing APIs; status should say so — confirm restart |

### Museum vs us (architecture mismatch)

```
Museum:  Frappe Link in same page → set_value → setTimeout → sourceModal(frm, mount)
Us:      Custom dropdown in Bill view → IPC setHeader (ERP view) → IPC listSources → DOM modal in Bill
```

Same *product* step; different *failure surface*. Copying museum’s 500ms delay does not fix Electron focus/IPC/gates.

## What we tried so far (strike log)

| Strike | Change set | Intent | Result |
|--------|------------|--------|--------|
| **0** | Initial T2: open after `setHeader` when `openSourcePicker: true` | Match museum after write | Modal often never shown |
| **1** | Harden modal (key trap, hide dropdown under modal, Terms focus, PO on PR) + Tab/picker rewrites (“always open”) + Vanilla save-then-open | UX polish + force open | Still no modal; rolled back |
| **2** | Rollback harden; on skipped supplier still return `openSourcePicker: true` | Fix no-op skip gate | Still no modal after restart |
| **3** | Open modal **in parallel** with `setHeader` (don’t await ajax); always highlight first link row; empty → Vendor add; focus modal / Terms after | UI-event-first | **Still no modal** (this bounty) |

Local commits on `wip/bill-dogfood` (not pushed): e.g. checkpoint `a03c5d9`, fix attempt `8474338`.

**Important:** We have been changing the **same production path** without a proof that `onPicked` → `openSourcePicker` → `showSourceModal` even runs end-to-end in the running shell.

## Unified project architecture (where the bug lives)

```
┌──────────── Bill WebContents (bill.html) ────────────┐
│  mountLinkPicker → pickValue → onPicked(vendor)      │
│       │                                              │
│       ├─ openSourcePicker(v)  ──IPC──► listSources   │
│       │         │                     (ERP eval)     │
│       │         └─ showSourceModal() → DOM overlay   │
│       │                                              │
│       └─ setHeader(supplier) ──IPC──► form bridge    │
└──────────────────────────────────────────────────────┘
         ▲ focusBillSurface          │
         │                           ▼
┌── Chrome ──┐              ┌── ERP WebContents ──┐
│ lens tabs  │              │ cur_frm set_value   │
└────────────┘              │ search_link / lists │
                            └─────────────────────┘
```

**SSoT for “vendor was chosen”:** the Link picker’s `pickValue` (UI event).  
**Not SSoT:** ERP ajax completion, dirty-gate, or `openSourcePicker` boolean alone.

## Do we need five mockups?

**Yes — one temporary matrix harness, not five permanent products.**

Industry pattern when a trigger is flaky: **A/B (or A–E) dogfood page** with identical modal DOM and five explicit buttons / paths, each logging a ring buffer. Ship **one** winner into Bill; delete the matrix.

| Mock | Trigger | Proves |
|------|---------|--------|
| **M0** | Toolbar **Select PO / source** only | Modal + IPC `listSources` work at all |
| **M1** | Button “Open modal now” (no vendor IPC) | DOM overlay + focus work in Bill view |
| **M2** | Fake `pickValue("Alpine…")` → open **sync**, no `setHeader` | UI-event path without ERP |
| **M3** | Fake pick → `setHeader` **then** open | Write-then-open (approach B) |
| **M4** | Fake pick → open **parallel** with `setHeader` (current prod intent) | Approach A under real IPC |
| **M5** | Real Link dropdown only (current prod) | Full path including Tab/Enter/click |

**Pass/fail rule:** if M0/M1 fail → stop touching picker logic (modal/IPC/focus broken).  
If M0–M4 pass and M5 fails → bug is only in Link key/click wiring.  
If M2 passes and M4/M5 fail → ERP/IPC side-effect is killing or racing the open.

**Do not** maintain five production skins. One HTML diagnostic (e.g. `electron/bill-source-matrix.html` or a `#debug` panel on Bill) behind a dogfood flag is enough.

## Ways forward (checklist)

### Immediate triage (before more “fixes”)

- [ ] **Bifurcate:** Does toolbar **Select PO / source** open the modal with a vendor already set?
  - Yes → picker/`onPicked` path broken; modal stack OK.
  - No → `listSources` / `showSourceModal` / focus / sticky flag — ignore Tab rewrites.
- [ ] Note status line text at pick time (`Setting vendor…` / `Loading…` / error / unchanged).
- [ ] Confirm Bill surface is focused (not Vanilla) when picking.
- [ ] Confirm status banner shows **Draft** (not Posted) — `editable()` gate.

### Instrumentation (required)

- [ ] Ring log (status line or `localStorage` / main console):  
  `pick → onPicked → editable? → openSourcePicker enter → listSources ok/fail → showSourceModal enter → DOM appended → focus`.
- [ ] Never silent-return in `onPicked`: if `!editable()`, **setStatus** why.
- [ ] Treat `docstatus` with `Number(doc.docstatus) === 0` (string `"0"` gotcha).

### Matrix harness

- [ ] Add M0–M5 dogfood matrix (above); one commit; no push required.
- [ ] 5zorro runs matrix once; record which Ms fire in this bounty’s debrief table.
- [ ] Port **only** the winning trigger into production Bill; delete matrix.

### Product contract (after a winner)

- [ ] Trigger = UI pick event (approach **A**); ERP write parallel, non-blocking for modal.
- [ ] No input lockdown for modal.
- [ ] Focus modal on open; Terms after choose.
- [ ] Empty Supplier search → Go to Vendor add….
- [ ] Unit tests for pure helpers; Playwright smoke for “modal testid appears after fake pick” when e2e env allows.
- [ ] `assert` / status if `sourceModalOpen` stuck or `listSources` > 3s.

### Explicitly out of scope until matrix

- More Tab/Enter polish, Vanilla save-then-open, PR PO label tweaks, keyboard traps — they mask the root failure mode.

## Hypothesis board (ranked)

1. **Silent `onPicked` return** (`!editable()` or missing api) — value paints, no modal, no status.
2. **`listSources` fails or hangs** — status would show; confirm with 5zorro.
3. **Modal opens off-focus / invisible** (wrong WebContents, z-index, sticky `sourceModalOpen`).
4. **Pick handler never runs** (Tab moves focus without `pickValue`) — less likely if click also fails.
5. **Race:** `paint()` / snapshot after setHeader clears or blocks UI (should not remove modal; verify).

## What the automated tests actually say (honesty check — 2026-07-18)

**Short answer:** Unit tests cover **pure data helpers**. They do **not** cover the pick → modal **chain**. Dogfood failures were invisible to CI. That was winging the Electron wiring while keeping “green” on leaf functions.

| Layer | What exists | What it proves | What it does **not** prove |
|-------|-------------|----------------|----------------------------|
| `tests/source-modal.test.js` | `buildBillSourceGroups`, draft grey, PR↔PO labels, money format | Group **shape** if lists arrive | Modal opens; IPC; focus; vendor pick |
| `tests/link-search.test.js` | normalize / filter / labels / **empty → Vendor add** sentinel | Search row shaping | Dropdown Tab/Enter; `onPicked`; modal |
| `tests/erp-form-bridge.test.js` | doctype match, item enrich helpers, bridge version | Pure bridge helpers | `setHeader` / `listSources` in live ERP |
| `tests/dirty-gate.test.js` | nav gate / normalize | Leave-Bill prompts | Source modal |
| `e2e/scaffold-bill.spec.js` | Bill surface mounts + chip exists | Shell can show `bill.html` | Vendor pick, modal `data-testid`, Terms focus |
| Layer-2 browser→ERP e2e | **Not built** (plan says so) | — | Full Bill workflow |

**There is no unit (or e2e) test for:**

- “Vendor pick event ⇒ open source modal” (approach A vs B)
- `openSourcePicker` / `showSourceModal` / `editable()` gates in `bill.html`
- `bill-set-header` returning `openSourcePicker` / skip paths
- Modal DOM appears (`[data-testid="bill-source-modal"]`)
- Focus → Terms after choose

So when 5zorro said “it still isn’t opening,” **CI had nothing to fail.** Green `npm test` only meant the leaf pure modules still agreed with themselves.

**Why it happened:** Project rule is *pure first* (`src/` + `tests/`). The **trigger policy** (when to open) was left inline in `bill.html` / `main.js` instead of a small pure function like `shouldOpenSourceModalAfterVendorPick({ event, setHeaderResult })` with tests. Faster locally; blind to this class of bug.

**Remediation (with the matrix):**

1. Extract trigger policy to `src/` + unit tests **before** more Bill HTML patches. → **Done:** `src/bill-source-flow.js` + `tests/bill-source-flow.test.js`; Bill UI imports `shouldOpenSourceModalAfterVendorPick`.
2. Broader Bill museum↔alpha catalog + suites (2026-07-18): `bill-feature-catalog`, `link-picker-policy`, `bill-toolbar`, expanded `bill-map` — **130** unit tests. Electron open-after-vendor still **buggy** until dogfood/matrix proves DOM path.
3. Add Electron smoke: fake pick ⇒ `[data-testid="bill-source-modal"]` present (no live ERP lists required if M1/M2 style).
4. Keep list/label tests — they stay valuable; they are not a substitute for the chain.

---

## Debrief

*(Fill after matrix + fix.)*

| Field | Notes |
|-------|-------|
| Winning mock (M#) | |
| Root cause | |
| Fix | |
| Validation | toolbar / click / Tab / Enter / empty→Vendor add / Terms focus |
| Cleanup | matrix removed? lockdowns removed? |
