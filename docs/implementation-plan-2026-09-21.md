# Implementation plan — 2026-09-21

**Tranche:** Receiving Scanner — **phase 1 only: technical validation.** Prove a phone can scan a
printed purchase-order sheet, count blind, and file a receipt in ERPNext, on a machine holding no
company data.

**Source spec:** the Receiving Scanner functional spec (17 pages, written 2026-09-21) — **private,
not in this repo**; museum **OI-176** says where it lives and what this plan may repeat from it.
Section numbers below (§3.1, §4A.2 …) refer to it. The spec is the business document; this plan is
the build document and does not restate its reasoning.

**Runs beside, not instead of,** `implementation-plan-2026-09-16.md` (Pay Outstanding). Different
area of the codebase, different agent. The list of files this tranche must not open is under
**Boundary with the 2026-09-16 tranche**.

> **Status, 2026-09-24.** Direction set by 5zorro; six packets, ordered at the bottom.
> **Built:** P1a (Code 128 encoder), P1b (label payload, check reworked for underscores), P1c (the
> blind sheet model) and P4a (the counting session) — 51 receiving tests, `npm test` green at 1860.
> R1 and R5 are answered. **Next action needs a decision:** P1d, the page that prints the sheet,
> has to reach ERPNext from outside the Electron app, which is what P2 sets up. Either do P2 first,
> or give P1d a temporary route and replace it. P4b–P4d are pure and can go on meanwhile.
>
> **Nothing has been run against a phone, a printer or a scanner yet.** Every claim in this plan
> about how a device behaves is still a claim.

**A note on language.** This plan is meant to be audited by someone who does not write the code, so
technical terms are explained the first time they appear. Where a term is an exact ERPNext name it
is kept exactly, because getting it wrong later costs more than the awkwardness now.

**A note on what this file may say.** It is tracked and public. It must not name the legacy
accounting system, state the size of the item master, or frame the work as a migration — write "the
legacy system" and "~20k item numbers" instead (5zorro 2026-09-21). Museum **OI-176** holds the
mapping. The rule covers code and test comments too, which is where one slipped through the first
time.

---

## How to handle cross-architecture dogfood (copy into every new dated plan)

> **Template for future plans:** keep this section near the top of every
> `docs/implementation-plan-YYYY-MM-DD.md`. It is process SSoT for the *working* tranche — not for
> museum `open_items.md` (that inbox stays long-lived discovery).

Cross-surface dogfood (Bill + PO + IR + chrome/nav in one message) strains the LLM harness when
treated as one blob. Prefer **error classes / architecture families**, not a single mega-diff.

### Intake (before code)

1. Sort 5zorro feedback into **architecture families**.
2. Log under **Dogfood residuals** below. **Do not** reopen Done batches from prior plans.
3. **Do not** dump mid-workflow triage into museum `open_items.md`.
4. Prefer class language in residual rows.

### Execute (one family per slice)

1. Gather context for **one** family only.
2. Surgical fix + sibling/variant check.
3. **Self-critique** (class fixed vs symptom patched).
4. Unit tests for pure logic + `npm test` green.
5. Checkpoint the residual row; then the next family.

### Closeout (before deleting this plan)

1. Append durable **decisions** via `~/agent-harness/scripts/append-decision.sh`.
2. Update museum **OI status** — set `done` or note what promoted.
3. **Delete** this dated plan; open a **new** dated plan for the next tranche.

---

## Decisions taken 2026-09-21 (5zorro) — do not re-litigate

| # | Decision | Consequence |
|---|---|---|
| 1 | **Phase 1 is technical validation only**, on a personal machine with no company data (spec §11 Q4). | Teach mode, the supervisor/AP review queue, the legacy-system purchase-order extract and label-on-putaway are scoped here but **not built**. Nothing in this tranche touches real vendor data |
| 2 | **The phone client lives in this repo**, as plain files under `pwa/receiving/`, with its testable logic in `src/receiving/`. | One repository, one version, one `npm test`. `pwa/` names a *client* the way `electron/` does; `src/` stays the shared logic layer. No second release to maintain, no build step — the phone loads the same `src/` files the desktop app does |
| 3 | **No custom Frappe app. Ever.** The barcode format is locked now; the code that resolves vendor barcodes is deferred. | The stored barcode shape is `V:<supplier-code>:<vendor-code>` from day one so nothing needs rewriting later. When Pattern A is eventually built it calls ERPNext's own stock method plus a local cache — see **Why no server code is needed** |
| 4 | **The blind receiving sheet is a standalone page printed from a browser**, not a shell surface and not an ERPNext print format. | No wiring into `electron/main.js`, so no collision with the tranche in flight. It can be promoted into a shell surface later without a rewrite |
| 5 | **Blind receiving is enforced by ERPNext permissions, not by hiding fields in the phone app.** | The phone hides nothing, because it is never given the number. Ordering consequence: the permission work and its leak test come **before** the counting screen. See **P3** |

---

## What was verified live, 2026-09-21 (read-only inspection, no writes)

Against the running instance: **frappe 16.31.0 / erpnext 16.32.1**.

| Fact | Where | Why it matters |
|---|---|---|
| `Item Barcode.barcode` carries `unique: 1` | `erpnext/stock/doctype/item_barcode/item_barcode.json` | The collision problem in §4A.1 is real. Two suppliers both using `1234` means the second one is refused. The supplier namespace is required, not optional |
| `barcode_type` allows a blank value (first option is empty) | same file | Arbitrary vendor codes can be stored without ERPNext validating them against a standard's checksum rules, exactly as §4A assumed |
| `uom` on that table is a real Link to UOM | same file | The "a case label credits a case, an each label credits an each" idea is available. Its *behaviour* is still unverified — see open question R4 |
| `erpnext.stock.utils.scan_barcode` is a stock whitelisted method: exact match on `Item Barcode.barcode`, returns `{barcode, item_code, uom}` | `erpnext/stock/utils.py:577` | This is the method that removes the need for any server code of ours. Detail below |
| …it falls through to **Serial No**, then **Batch**, on a miss | `erpnext/stock/utils.py:607-622` | A payload that happens to match a serial number resolves to the wrong thing. The company prefix on our own labels is what prevents this; vendor payloads are namespaced |
| …and it reads with `frappe.db.get_value`, which does not apply permission checks | same | A receiver can resolve an item they are not otherwise allowed to read. Useful here, and it returns no quantity of any kind, so it is safe for blind receiving |
| `Purchase Order Item` has **every field at permission level 0** — including `qty`, `stock_qty`, `received_qty`, `rate` | `erpnext/buying/doctype/purchase_order_item/purchase_order_item.json` | There is no existing level-1 tier to slot into. Creating one changes the purchase-order form for **every** role, not just receivers. This is the largest risk in the tranche — see **P3** |
| `Item Supplier` child table has `supplier` + `supplier_part_no` | `erpnext/stock/doctype/item_supplier/item_supplier.json` | §4A's human-readable fallback exists natively: find our part number from the vendor's printed part number, no barcode involved |

### Why no server code is needed

"Permission level" (ERPNext calls it *permlevel*) is a tier number on a field. Fields at level 1 are
only sent to users whose role was granted level-1 read. Everything on the purchase-order line is
level 0 today, meaning everyone who can open the document gets every field.

The spec (§4A.1) concluded that resolving a namespaced barcode "goes through a custom app endpoint,
not ERPNext's stock barcode-scan field, which looks up the bare payload only." That is true only if
the *server* is expected to add the namespace. It does not have to. Receiving always happens in the
context of a purchase order, so the phone already knows the supplier and can build the full string
`V:SUPP:1234` itself before asking. ERPNext's own method then matches that full string exactly.
Client-side string building, stock endpoint, no app installed on the server.

The same reasoning closes the other place a custom app could have crept in. §5 requires variance to
be "computed server-side on submit." Nothing actually has to *happen* at submit time: the variance
is a query comparing the filed receipt's lines against the order's lines, run where the data lives.
The property that matters — the phone never sends or receives an expected quantity — is satisfied
by a query in the supervisor view. Field permissions hide values from the *client*; ERPNext's own
validation still reads the true quantity on the server, which is why a short or over count is still
detected server-side even though the receiver never saw the number.

**What still needs server-side change, unavoidably**, is *configuration* rather than code: records
stored in the site's own database (a permission-level change, a role, one extra field, one small new
document type). These are not edits to ERPNext's files, so Clean Core holds. Their cost is
reproducibility — with no app to carry them, they need a re-runnable setup script. See **Site
configuration this tranche introduces**.

---

## Boundary with the 2026-09-16 tranche

This tranche is **new files only**, plus `docs/`. Do not open:

`electron/main.js` · `electron/home.html` · `src/home-tiles.js` · `electron/pay-outstanding*` ·
`electron/payment-doc.html` · `electron/check-doc*` · `src/payment-*` · `src/check-*` ·
`src/delay-calendar.js` · `src/bank-business-days.js` · `src/outstanding-bills.js` ·
`src/pay-flow-*` · `src/flow-node-density.js` · `e2e/scaffold-pay-outstanding.spec.js` ·
`docs/implementation-plan-2026-09-08.md` · `docs/implementation-plan-2026-09-16.md`.

**That list is a snapshot, not a fence.** It was written from `git status` on 2026-09-21 and the
other tranche's working set grew during that same day — `electron/main.js`, `electron/doc-form.html`,
`src/bill-form-page.js`, `src/doc-actions.js` and more appeared after the list was drafted. Run
`git status` and look before opening anything outside `src/receiving/`, `pwa/receiving/`,
`ops/receiving-*/` and this file.

`HANDOFF.md` is **deferred**, deliberately: two entries are owed there and are listed under
**Registration owed** at the bottom — one-line edits to make once the other tranche is clear of that
file, not now. `CLAUDE.md` is gitignored and therefore safe to edit; it already carries a pointer to
this tranche, so a fresh session finds this plan from the first file in the read order.

---

## P1 — The blind receiving document (critical path)

Spec §11 Q1 is still open and says so plainly: if the printed purchase order does not carry a
scannable barcode per line, that sheet is the first build item. It does not, so it is.

This is also where §3.1's benefit comes from — the only benefit that lands before cutover. Today the
receiver looks up every single line on a computer to find the internal part number. On this sheet the
item is already identified, so that lookup disappears. The sheet is what makes the app faster than
the current process on day one, and speed is what stops people from working around it.

- **P1a — ✅ BUILT 2026-09-21. `src/receiving/code128.js`** (pure, 122 lines) + 10 tests. Turns a
  string into a Code 128 symbol, including the mod-103 check character the decoder verifies before
  it will emit a read, and into printable SVG. The symbol table was machine-transcribed from an
  independent implementation rather than typed, and the tests check it three ways: exact agreement
  with that implementation on nine payloads, a decode of our own output back to the original text,
  and the structural rules every symbol must satisfy.
  *Lazier path:* the `bwip-js` package. Rejected because it only solves printing — the phone side
  still needs its own code to take a scanned string apart — and because this repo currently ships
  zero runtime dependencies and an extra one would have to be cached on the phone for offline use.

  **How to regenerate the table or the test vectors** (the working files were scratch and are gone;
  this recipe is the whole of what was done). `pip install python-barcode`, then
  `barcode.charsets.code128` exposes `CODES` — 106 module patterns, index = symbol value — plus
  `STOP`, which needs `"11"` appended to close the symbol. `Code128(text).build()[0]` gives a full
  reference encoding. **Its encoder switches to code set C on digit runs**, producing a different
  and narrower symbol for the same data, so a vector is only usable for exact comparison if it came
  back in code set B alone: decode it symbol by symbol and reject any containing 99, 100, 101 or 98,
  which are the code-set switches. That is also the observation behind the width lever in P1e.
- **P1b — ✅ BUILT 2026-09-21. `src/receiving/label-payload.js`** (pure) + 13 tests. Builds and takes
  apart the payload described in §4A.2: company prefix, the item number exactly as it already
  exists, and a trailing check character. Taking one apart returns either the item number or a
  *typed* refusal, and the two refusals a receiver actually meets are kept distinct on purpose —
  "this is a vendor's label, scan the sheet instead" versus "that read was garbled, try again".
  **Item numbers are never changed** — §4A.2 rejects renumbering ~20k item numbers wholesale, and
  this plan does not reopen that. No default prefix exists, so a placeholder cannot ship by accident
  while P1e is still open.
  **Deviation from the spec, for 5zorro to veto:** §4A.2 named mod-10 (Luhn), which is defined over
  digits only. The build uses a check over 43 characters instead, so it survives letters.
  **Revised 2026-09-24** once R5 was answered (capitals, digits, dashes, underscores): the set is
  Code 39's with the space swapped for an underscore — still 43, still prime — and each character is
  weighted by its position, as Code 128 weights its own check. The tests now prove it catches every
  single-character typo **and** every swap of two different characters; the first version caught
  typos only. Dropping the space also removed a real trap: one label in 43 would have ended in an
  invisible space that any trimmed text box drops. Nothing is escaped or rewritten — Code 128 prints
  the underscore as an ordinary character.
- **P1c — ✅ BUILT 2026-09-24. `src/receiving/blind-po-sheet.js`** (pure) + 10 tests. Turns a
  submitted Purchase Order into the printable model: vendor, order number, order date, line count,
  and per line the barcode payload, item number, description and unit. The empty count box is the
  page's job, so the model has no field for it. It refuses a draft or cancelled order.
  **How the blind control is proven.** A Purchase Order row gives the quantity away under more names
  than `qty` — `stock_qty`, `received_qty`, `fg_item_qty`, and `total_weight`, which is weight ×
  quantity. So the model is built from an **allowlist**, and the tests seed every numeric field on
  this ERPNext version with a distinct five-digit prime, then assert none of them appears anywhere in
  the output, even as text; that the only numbers left are line numbers; and that a field ERPNext
  might add later stays off the sheet. Each assertion was checked by planting a leak — a quantity in
  a new field, inside a string, and nested — and watching it fail.
  An item number no label can carry (lowercase, spaces) prints **without a barcode** and is listed
  in `keyedByHand`, rather than stopping the whole sheet. One sandbox item is like that today.
  Not done, deliberately: the vendor's own part number (`supplier_part_no`) would help a receiver
  match a packing slip, but it was not in the scope above. Adding it is one line.
- **P1d — `pwa/receiving/po-sheet.html`**. A plain page: type or scan an order number, fetch the
  lines over ERPNext's normal web interface, render the sheet, print it. No shell wiring.
- **P1e — the width measurement (a physical task, not code).** §4A.2 closes on this and §11 Q6 keeps
  it open: measure the printed width of prefix + longest item number + check digit against the
  label maker's maximum label width. **The payload format is not final until that measurement
  exists.** Print a test sheet carrying the longest item number in the sandbox and measure it.
  **If it comes out too wide, the first lever is not the item numbers.** Code 128 can carry a run of
  digits at half width by switching to its numeric mode mid-symbol — observed 2026-09-21 in the
  reference implementation, which does exactly that on digit runs. Our encoder does not, because a
  single mode is simpler and nothing yet says width is a problem. Teaching it the numeric mode is a
  contained change to one module, and it comes before shortening a prefix or touching an item
  number.

**Decided 2026-09-24 (5zorro), R1: the per-line barcode is the item number.** 5zorro wants large
shelf labels with descriptions and small stickers on the items themselves; both carry the item
number, which is also ordinary industry practice for internal labels — retail GTIN/UPC codes name a
*product* and belong to its maker, so a business prints its own item number in Code 128. One format
covers the sheet, the shelf and the sticker. When an item repeats on one order, the app asks which
line (P4a). Two things recorded so they are not rediscovered: in bigger warehouses shelf labels
usually name the *location* rather than the item, which can be added later without touching this;
and on a very small sticker a 2D code (QR or DataMatrix) fits where a long Code 128 may not, but
only camera-based scanners read it.

---

## P2 — The secure address, and how a receiver installs it

A phone's camera refuses to work on a page served insecurely (§9.1). That blocks scanning *and*
blocks saving the page to the home screen, and it will surface on the first day of real device
testing, so it is scheduled second rather than discovered later.

- **P2a — `ops/receiving-proxy/`**. A small web server sitting in front of ERPNext that serves the
  scanner pages at `/receiving/` and passes everything else through to ERPNext untouched, over a
  locally-trusted certificate. A Caddy configuration is about four lines and issues its own local
  certificate; nginx with `mkcert` is the equivalent if Caddy is unwelcome. ERPNext does not know it
  is there and is not modified.
  Because the page and ERPNext then answer on the **same address**, the ordinary ERPNext login
  works with no cross-site configuration, and invariant 4 (one configured ERP base) holds — the
  phone client does not invent a second server URL, it uses the one in front.
- **P2b — `pwa/receiving/manifest.webmanifest` + icons + `sw.js`**. The manifest is the small file
  that tells the phone the app's name and icon and that it should open full screen. `sw.js` is a
  background script whose only job in phase 1 is to keep the page's own files available offline, so
  the icon opens even in a dead zone. Capturing scans offline is P4; this is only the shell.
- **P2c — `pwa/receiving/install.html` + `docs/receiving-phone-setup.md`.** The onboarding page and
  the printed card behind it. Two honest chores to document rather than hide:
  1. Each test phone must be told to trust the local certificate, at the operating-system level. A
     browser click-through warning is **not** enough — saving to the home screen will not be offered.
  2. Android offers to install; **iPhone does not** — it is the share menu, then "Add to Home
     Screen." The instructions must be per-platform.
- **P2d — the device name.** Asked once at setup and stored, so the audit trail can tell one
  person's phone from a shared handheld later (§7.1).

### What the proxy does and does not add (asked 2026-09-21)

Verified the same day: `frappe_docker-frontend-1` already holds port 8080 and is an nginx web
server; the ERPNext application container is not exposed directly. **This arrangement already
exists** — every request today already passes through a web server that serves static files itself
and forwards the rest. Phase 1 adds one folder to it, plus a certificate.

- **Serving static files** runs no code and interprets nothing. Its two classic failures — serving
  files outside the folder, and listing the folder — are off by default in both Caddy and nginx.
- **Sharing one address with ERPNext is the safer option, not the convenient one.** A separate
  address would require switching on cross-origin access in ERPNext and issuing credentials usable
  from any page. Sharing an address needs no such setting.
- **Its real cost, stated plainly:** our page then runs with the same browser privileges as the
  signed-in ERPNext session. So the page renders **no** HTML built from server data by string
  concatenation, and the proxy sets a Content-Security-Policy header. Both are cheap; both are
  rules, not checkboxes.
- **The surface that actually grows is phone reachability**, which the dock requires with or without
  this page. **Decision: own network only, never the open internet, for the whole pilot.**
- **The likeliest real incident is a lost phone with a saved login** — more likely than anything
  involving the web server. The mitigation is already §6's role table: that account cannot pay,
  cannot adjust stock, cannot edit items, cannot cancel a receipt. With the 12-hour re-login and
  disabling the user, the permission design *is* the lost-device plan. Do not weaken that role for
  convenience later without re-reading this line.

*Lazier path:* skip the printed card and text each receiver the link. Fine for two or three people;
the card exists because §6 says named backup receivers get provisioned before go-live, and a card is
what makes that a ten-second job for a supervisor rather than a support call.

---

## P3 — Blind receiving: the control, and proving it holds

This is the highest-value control in the design and the easiest one to leak (§5). It is scheduled
before the counting screen on purpose: a blind screen drawn over an interface that will still answer
"how many were ordered?" is theatre, and would be discovered after the UI was built around it.

It is also the shape `HANDOFF.md` invariant 7 already demands. A skin does not withhold a field for
feel; it reflects a fact. Here the fact is that the receiver's account genuinely cannot obtain the
number. The phone hides nothing.

- **P3a — raise `Purchase Order Item.qty` to permission level 1**, and grant level-1 read to every
  role that legitimately needs quantity (purchasing, stock, accounts). **This is the riskiest step
  in the tranche**: every field on that table is level 0 today, so this changes the purchase-order
  form for everyone, and any report, export or script that reads quantity for another role is a
  candidate to break. Phase 1 exists precisely to measure that, on a machine with no company data.
  Apply it, then walk the ordinary purchasing paths and record what changed.
- **P3b — the `Receiving Clerk` role** with §6's grants: create and submit Purchase Receipt; read
  Purchase Order (header and lines, quantity blocked by the level); **no** cancel or amend; **no**
  Item create or edit; **no** Purchase Invoice or Payment Entry; and **never** Stock Reconciliation
  or Stock Entry. The last exclusion is absolute — holding the goods and being able to adjust the
  quantity on hand is theft that hides itself in one motion.
- **P3c — `ops/receiving-setup/leak-test.mjs`.** A re-runnable script that logs in as a receiver and
  tries to obtain an ordered quantity every way there is: the order list view with quantity as a
  column, the report view, the document read interface, a direct child-table query, a saved report,
  a CSV export, a print format. Each route records pass or leak. Re-run after **every** configuration
  change, because a later grant can silently undo this.
  **One leak route is already known:** ERPNext's own `make_purchase_receipt` method
  (`erpnext/buying/doctype/purchase_order/purchase_order.py:761`, whitelisted) returns a
  ready-made receipt with quantities already filled in from the order. The phone must therefore
  **not** use it, and must build its own submission from the fields it is allowed to see. That is a
  design constraint, not just a test case.
- **P3d — the reveal policy** (§5): a site setting with three values — never (the default), after
  submit, after supervisor review. Pure, in `src/receiving/reveal-policy.js`, consumed by the
  confirmation screen. Cheap now, expensive to retrofit into a screen built without it.

*Lazier path, and it is a real option:* do not restrict at all, and rely on the count being
timestamped and attributed instead. §11 Q8 already contemplates this — if whoever is on the sales
floor covers receiving, "the goal shifts from restricting receiving to attributing it." That is a
smaller win but a much smaller blast radius. **If P3a proves too invasive on the pilot instance, fall
back to this and say so out loud rather than half-enforcing.**

---

## P4 — The count itself (pure logic, before any screen)

All of this is ordinary testable logic with no camera and no network, so it lands in `src/` with
tests first, per the pure-first invariant.

- **P4a — ✅ BUILT 2026-09-24. `src/receiving/blind-count.js`** (pure) + 16 tests. The state of a
  receiving session: a scan resolves to a line, a count is keyed, a line can be corrected before
  submission. It starts from the P1c sheet, never a raw order, and copies only the fields it names.
  Each rule below failed its test when a bug was planted against it. Rules that are easy to get
  wrong and are therefore tests:
  - the quantity box starts **blank, never 1** — a defaulted 1 gets accepted without looking and
    destroys the count (§7.4);
  - **scanning the line already on screen adds one**, as the convenience path. **Deviation from
    §7.4, for 5zorro to veto:** the spec says a *rapid* re-scan adds 1. Read literally, scanning five
    stickers counts four, because the first scan only selects the line. So the second scan counts
    the first as well: five stickers make five, and a single scan still leaves the box blank for
    the keypad. There is no timer: a slow receiver whose re-scan silently did nothing would be worse,
    and a phone camera re-reads one label many times a second anyway. **Dropping those repeat reads
    is P5a's job** — without it, one sticker held in view would count dozens;
  - once a count is **typed**, scanning that line again changes nothing and says so, so a habit
    re-scan cannot turn 12 into 13; typing replaces a scanned count; **zero** is a real answer,
    distinct from blank;
  - an unresolvable payload produces a **blocking** prompt, never a silent failure — §7.4 is explicit
    that a silent scan failure is the fastest way to lose the receiver's trust;
  - when one item appears on two lines of the same order, the app asks which line (see R1);
  - the session state carries **no** expected quantity under any name — asserted by test.
- **P4b — `src/receiving/receiving-exceptions.js`.** §7.6's six reason codes and where each one
  goes: SHORT and OVER detected from the data rather than declared by the receiver; DAMAGED needs a
  photo; WRONG_ITEM and UNKNOWN_BARCODE go to a supervisor; NO_PO is off at site level by default.
- **P4c — `src/receiving/receiving-queue.js`.** Warehouse dead zones are certain and a lost scan is
  an unrecoverable trust failure (§7.8). Every scan, count, photo and reason code is written down as
  it happens, not at submission. A receipt filed with no signal waits in a queue and goes up when
  signal returns. The classes of conflict that can be waiting on the other side — order closed,
  order cancelled, line removed, already received by someone else — each resolve to a supervisor
  with the original capture intact. **Nothing is ever discarded silently.**
- **P4d — `src/receiving/receipt-payload.js`.** Build the Purchase Receipt submission from the
  counted lines plus the order fields the receiver is allowed to see. Reuse `src/receipt-map.js`
  (the existing Item Receipt field map) where the shapes agree, so the desktop skin and the phone
  do not drift into two different ideas of the same document.

---

## P5 — The walking skeleton: scan a line, file a receipt

One chain, end to end, on a real phone: sign in → choose an order (scan the sheet's order barcode,
or search) → scan a line → key a count → submit → confirmation. Everything else in §7 is deferred.

- **P5a — reading barcodes.** Use the phone's built-in barcode reader where it exists, with the
  `ZXing` library as the fallback. 🔴 **It must drop the camera's repeat reads of one label** — a
  camera reports the same code every frame while it is in view, and P4a counts every scan it is
  handed (see P4a). Usual shape: after a read, ignore that same code until it has left the view or a
  short pause has passed. **Verify on the actual test phones before designing around
  either** — the built-in reader is absent on some platforms, and a wrong assumption here changes
  what has to be cached for offline use.
- **P5b — hardware scanners.** A paired ring scanner behaves like a keyboard, so the page keeps a
  focused hidden input to catch it (§9). Cheap to add now, awkward to retrofit.
- **P5c — the dock conditions**, from §9 and §7.4: touch targets no smaller than 64px because
  receivers wear gloves; no swipes or long-presses; the screen kept awake for the session; clearly
  different sounds *and* vibrations for a good and a bad scan, because a dock is loud and the phone
  may be in a pocket; legible in direct sun and in a dim warehouse; scan to line shown in under
  half a second.
- **P5d — submission.** Create and submit a Purchase Receipt. **Verification debt, tracked the way
  the 2026-09-08 tranche tracked it: this write path counts as unverified until it has run against
  the sandbox and the resulting document has been read back.** Nothing downstream may assume it
  works before that.
- **P5e — over-receipt, gated verification.** ERPNext refuses receipts beyond the ordered quantity
  past a tolerance. But an over count must still file and route to a supervisor, not bounce off the
  server and leave the receiver stuck at the dock holding boxes. Confirm the actual behaviour and
  the setting that governs it **before** building the submission path; if it bounces, the tolerance
  becomes part of the site configuration below.

---

## P6 — Photographing every page

§7.5, confirmed 2026-09-21: a photo of **every** page of the receiving paperwork, so the paper never
has to be scanned later. This replaces the document-scanner purchase rather than supplementing it,
and it works because the paper is captured at the dock before it is warped, oiled and rained on.

- At least one page photo before submission is allowed.
- Multi-page capture is the main flow, not an extra: a visible page counter, a shutter that stays put
  so pages can be taken one after another without returning to a menu, a thumbnail strip with retake
  and delete per page, explicit ordering, and a "done capturing" action that records the final page
  count on the receipt — that recorded count is what makes a missing page detectable later.
- Photos attach to the Purchase Receipt through ERPNext's normal file upload, in page order, and may
  upload separately from the receipt itself so a poor signal does not hold up the filing.
- Blur and glare warnings are **deferred**. A page too poor to read is worse than a missing one, but
  the detection is the least certain piece here and phase 1 does not need it.
- **Retention is a decision, not code**, and it is owed before go-live: these images become the
  archival receiving record and the evidence in any vendor claim. Decide the period and confirm
  backup coverage alongside the accounting record retention policy (§11 Q7).

---

## Site configuration this tranche introduces

None of this is a change to ERPNext's own files. All of it is records in the site's database, which
is why Clean Core holds — and why it needs a script, since there is no app to carry it.

| Change | Kind | Why |
|---|---|---|
| `Purchase Order Item.qty` → permission level 1, plus level-1 read for purchasing / stock / accounts roles | property change + permission rows | Blind receiving (§5). The high-blast-radius item |
| `Receiving Clerk` role and its grants | role + permission rows | §6. Stock adjustment excluded absolutely |
| `Purchase Receipt` — one added field for the captured page count | extra field | Makes a missing page detectable later (§7.5) |
| `Receiving Scan Event` — a small new document type, insert-only | new document type, site-local | §8's immutable log: every scan, not just the filed document. **Must not** be a child table of the receipt, because it has to survive that receipt being amended or cancelled |
| Over-receipt tolerance, if P5e shows a bounce | setting | An over count must file, not fail |

All applied by **`ops/receiving-setup/apply.mjs`**, re-runnable and safe to run twice, so the pilot
instance can be rebuilt from scratch. This script is the price of having no custom app, and it is
the cheaper side of that trade.

---

## Open questions

Carried from the spec, still open: **Q1** (does the printed order carry a per-line barcode today —
answered "no", which is why P1 exists), **Q5** (how the purchase-order and item extract from the
legacy system will run — not needed in phase 1), **Q6** (final label payload format, gated on the width
measurement in P1e), **Q7** (photo retention and backup coverage), **Q8** (who covers receiving when
both clerks are out driving — this decides how many named accounts exist, and whether P3 restricts
or merely attributes).

Raised by this plan:

| # | Question | Why it matters |
|---|---|---|
| R1 | ✅ **Answered 2026-09-24: the item number** (see P1). Does the sheet's per-line barcode encode the **item number** or the **specific order line**? | Item number keeps one payload format across the whole system and matches future shelf labels, but needs a prompt when an item appears twice on one order. Line encoding is unambiguous and creates a second format. Recommendation: item number |
| R2 | Which warehouse do phase-1 receipts post to? | A receipt line needs one. Defaulting from the order line is the obvious answer; it needs confirming, not assuming |
| R3 | Is price visible to the receiver? | Blind receiving is about quantity only, so price is not part of the control. Worth stating on purpose, because the submission should not come to depend on a field that might later be restricted |
| R4 | Does the unit-of-measure field on a barcode behave as expected — does scanning a case label credit a case? | §4A assumes it does. It is the difference between one label per item and one per packaging level. Verify on this version before designing around it |
| R5 | ✅ **Answered 2026-09-24: capital letters, digits, dashes and underscores** — no lowercase, no spaces. The label set was changed to fit (P1b). **What characters do the ~20k item numbers actually use?** | Raised by building P1b. A printed label can carry digits, uppercase letters and a handful of symbols; lowercase has no place in the symbology's alphanumeric set. The code currently refuses anything outside that set rather than quietly changing it, so if item numbers are mixed case this surfaces immediately instead of after ~20k labels are printed. Cheap to answer: export the item list from the legacy system and look |

---

## Order

`P1` → `P2` → `P3` → `P4` → `P5` → `P6`.

P1 first because the sheet is the only thing that makes the app faster than today, and because
nothing can be scanned until something is printed. P2 second because the camera does not work
without it and it will otherwise be discovered on the first day of device testing. P3 before any
counting screen, because a blind screen over a non-blind interface is theatre. P4 before P5 because
the logic is testable without a phone and the screens are not.

## Out of this tranche

- Everything §10 lists: putaway and bin locations, picking, packing, delivery, cycle counting, any
  write path to the legacy system, serial and lot capture.
- Teach mode and the supervisor review queue for new barcode mappings.
- The supervisor / AP variance queue (desktop) — it is the piece that would touch the files the
  other tranche owns.
- The legacy-system purchase-order and item extract.
- Pattern A resolution code (format locked, code deferred — decision 3) and Pattern C shelf labels.
- Optional location capture at submit. §8 is right that this is a labour-relations decision before
  it is a technical one, and phase 1 does not need it.
- Any change to `electron/`.

## Waiting on 5zorro (nothing here is an agent's call)

| # | What | Why it blocks something |
|---|---|---|
| 1 | ✅ ~~Which characters do the item numbers use?~~ Answered 2026-09-24 (**R5**): capitals, digits, dashes, underscores | Closed; P1b's check character was reworked to carry underscores |
| 2 | **The label-width measurement** (P1e) — longest item number, plus prefix and check character, against the label maker's maximum width | The payload format is not final until this exists. If it comes out too wide, the first lever is the encoder's numeric mode, not the item numbers |
| 3 | **Veto or accept the position-weighted mod-43 check** in place of the spec's Luhn check digit (P1b) | Already built that way. Reversing it is a one-function change, and it gets more expensive once labels are printed |
| 4 | ✅ ~~Item number or order line?~~ Answered 2026-09-24 (**R1**): the item number | Closed; P1c built on it |
| 5 | **Restrict, or only attribute?** (P3a vs its lazier path, and spec Q8) | Raising the order quantity to a restricted permission tier changes the purchase-order form for every role. Phase 1 exists partly to measure that, but the fallback — timestamp and attribute rather than restrict — is a legitimate end state, not a failure |
| 6 | **Keep this plan tracked, or make it private?** | It is scrubbed and safe to track, and the three-file orientation contract assumes an off-machine agent can read it. Gitignoring it would quietly break that. Recommendation: keep it tracked |
| 7 | **Three pre-existing public mentions** of the legacy system, listed in museum **OI-176** | Removing them from history means rewriting pushed history and force-pushing a repo with a merged PR on `main`. Editing the files going forward is cheap; erasing history is not. No agent should do either unasked |

## Registration owed (deliberately deferred)

Two one-line edits, to be made once the 2026-09-16 tranche is clear of those files:

1. `HANDOFF.md` § Read order — add this plan to the list of dated plans.
2. `HANDOFF.md` § Invariants — note that invariant 6 ("one window") governs the **desktop shell**;
   the phone client is a separate client, not a second window. Fold at closeout with the rest of
   this tranche's durable rules.

Until then, an agent that has only `HANDOFF.md` will not find this plan. That is the accepted cost
of not editing a contended file, and it expires the moment the other tranche closes.

## Dogfood residuals

*(Empty — new tranche.)*

| Family | Status | Notes |
|---|---|---|

## Validate

```bash
cd ~/erpnext-ui-app && npm test
```

Layer 1 (pure unit tests) is the gate, as always. The phone app itself is layer 4 — manual, on a real
device, at a dock if possible. There is no Electron smoke test here because there is no Electron
surface in this tranche.

**Git:** commit on `alpha`; only **5zorro** pushes.
