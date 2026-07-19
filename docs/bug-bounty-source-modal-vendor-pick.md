# Bug bounty — Source modal never fires after Vendor pick (Doc Bill)

## Status

**Fixed** (2026-07-18) — see debrief at end. Dogfood confirmed after removing `Purchase Receipt Item` enrich from `listSources`.

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

**Do not** maintain five production skins. One HTML diagnostic (e.g. `electron/bill-source-matrix.html` or a `#debug` panel on Bill) behind a dogfood flag is enough. **For this bug, HAR replaced the matrix.**

## HAR evidence (2026-07-18 / `localhost.har`)

5zorro captured DevTools HAR on Vanilla `localhost:8080` while picking vendor **before** later patches. Timeline (UTC):

| t | Call | Result |
|---|------|--------|
| 02:33:13.758 | `search_link` `txt=alp` Supplier | **200** → `ALPINE SUPPLY` |
| 02:33:15.135 | `get_list` Purchase Order submitted | **200** → `PUR-ORD-2026-00012` |
| 02:33:15.136 | `get_list` Purchase Receipt submitted | **200** → `MAT-PRE-2026-00002` |
| 02:33:15.136 | draft PO / draft PR lists | **200** empty |
| 02:33:15.140 | `validate_link_and_fetch` + `get_party_details` | **200** (ERP set_value side effects) |
| 02:33:15.232 | `get_list` **Purchase Receipt Item** (PO# enrich) | **403** `PermissionError` |

**Root cause (confirmed):** `bill-list-sources` fetched PO/PR successfully, then called `frappe.db.get_list("Purchase Receipt Item", …)` to label PRs with PO numbers. That child-table list **403’d**. The `catch` around the whole eval returned `{ ok: false }`, so Bill UI never called `showSourceModal` — looked like “modal never fires” even though the pick + list path ran.

**Fix attempt 1:** try/catch around PR-item enrich — **insufficient**. Second HAR (02:38 UTC) still showed the same 403; modal still failed (catch may not bind Frappe xhr reject, and/or shell not restarted).

**Fix attempt 2:** **Remove** `get_list("Purchase Receipt Item")` from `listSources` entirely. PR rows show “no PO” until a permission-safe enrich exists. Next HAR must **not** contain that child-table call.

**Also learned:** HAR is Vanilla-only (port 8080). Doc Bill IPC itself is not in the HAR; we infer Bill called `listSources` because those four `get_list` filters match our code exactly.

Do **not** commit `localhost.har` (large; session cookies). Keep local for forensics or add to `.gitignore`.

---

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
2. Broader Bill museum↔alpha catalog + suites (2026-07-18): `bill-feature-catalog`, `link-picker-policy`, `bill-toolbar`, expanded `bill-map` — **130** unit tests. Open-after-vendor **dogfood green** after HAR root-cause fix.
3. Optional later: Electron smoke fake pick ⇒ `[data-testid="bill-source-modal"]`.
4. Keep list/label tests — they stay valuable; they are not a substitute for the chain.

---

## Ways forward (checklist)

### Immediate triage (before more “fixes”)

- [x] **Bifurcate / HAR:** pick ran; `listSources` ran; child-table 403 aborted `ok`.
- [x] Note status / network: PermissionError on Purchase Receipt Item.
- [x] Confirm Bill surface focused when picking (modal is in Bill WebContents).

### Instrumentation (required)

- [x] Ring / status: `Sources loaded (N groups)` after successful list.
- [x] Never silent-return in `onPicked` without status when not editable.
- [x] Treat `docstatus` with `Number(doc.docstatus) === 0` (`isDraftBillDoc`).

### Matrix harness

- [x] Skipped — HAR replaced M0–M5 for this incident (network proof of listSources).
- [x] Winning path = UI pick → listSources (PO/PR only) → showSourceModal.

### Product contract (after a winner)

- [x] Trigger = UI pick event (approach **A**); ERP write parallel.
- [x] No input lockdown for modal.
- [x] Focus modal on open; Terms after choose (policy in `bill-source-flow.js`).
- [x] Empty Supplier search → Go to Vendor add….
- [x] Unit tests for pure helpers / catalog; Electron smoke optional later.
- [ ] Optional: permission-safe PR→PO label enrich (whitelisted method), not child `get_list`.

---

## Hypothesis board (ranked)

1. ~~**Silent `onPicked` return**~~ — HAR shows listSources **did** run after pick.
2. **`listSources` fails entirely** — **CONFIRMED via HAR:** `Purchase Receipt Item` **403** aborted modal open. Fixed by **removing** that call (try/catch alone insufficient).
3. ~~**Modal opens off-focus / invisible**~~ — not primary; dogfood green after #2.
4. ~~**Pick handler never runs**~~ — **ruled out** by HAR.
5. ~~**Race:** `paint()` / snapshot~~ — not primary.

---

## Debrief

| Field | Notes |
|-------|-------|
| Winning mock (M#) | N/A — HAR forensics (`localhost.har` ×2) replaced the matrix |
| Root cause | `bill-list-sources` required `frappe.db.get_list("Purchase Receipt Item")` to label PRs with PO#s. Clerk session got **403 PermissionError**. That exception failed the whole `listSources` (`ok: false`), so Bill never called `showSourceModal` — looked like “vendor pick does nothing.” |
| Fix | Remove child-table enrich from the hot path (`ce79ba6`). PO/PR header lists alone build groups; PR rows may show “no PO.” try/catch-only (`dc1fabb`) was not enough. Also: UI-event-first open policy + catalog tests (`a64277d`). |
| Validation | 5zorro dogfood 2026-07-18: vendor pick → source modal opens after restart on `ce79ba6`. |
| Cleanup | No matrix page shipped. No input lockdowns kept for this bug. `*.har` gitignored — do not commit. Follow-up: permission-safe PO# enrich when needed. |
| Lessons | (1) Green unit tests on leaf mappers ≠ e2e chain. (2) Optional enrich must never gate required UX. (3) Frappe 403 may not be reliably `try/catch`’d from `executeJavaScript` — prefer not calling forbidden APIs. (4) DevTools HAR on Vanilla is enough to prove Bill IPC side effects. |
