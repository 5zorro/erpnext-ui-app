# Product gotchas (Doc shell / Electron)

Runtime and architecture lessons from dogfood and nav incidents.  
For Playwright/e2e specifics see `e2e/GOTCHAS.md`. For input-count scrape methodology see
`docs/input-count-gotchas.md`.

**Museum policy:** cite **OI ids + one-line status** only — no discovery essay here.

---

## G1 — Bill PO line enrich vs logbook title (OI-151 P3, 2026-08-31)

**Dogfood doc:** `ACC-PINV-2026-00197` vs submitted PO `PUR-ORD-2026-00375` (OVERLIMIT fixture:
PO line qty **1**, bill qty **2** — skin should cap sourced row and NIC the excess).

### Observed

- PO **logbook** column (`title`) could show **OVERLIMIT** while **Save & Submit** stayed blocked.
- Status / toast: *"PO/PR line limit still loading — wait for source columns to finish, then retry Save."*
- Or: *"Adding line…"* / *Still loading…* stuck when ERP webview was busy (chaos lag).
- Nav-debug: repeated `bill-enrich-slice lineContext timeout`; sometimes **no** enrich logs for
  ~2 min (background loop wedged).
- HTTP experiments logged `via=http fail status=400` (wrong API) then `po=417` (child-doctype list).

### Expected

- **Two enrich slices** on bill open — do not conflate them:
  1. **`linkedPos`** — PO header `title` (logbook #). Cosmetic / wayfinding.
  2. **`lineContext`** — PO/PR **child row** qty + `billed_amt` → `maxBillableQty` in
     `billPoLineMetaByDoc`. **Required** for OI-151 split + cache-only save (no JIT fetch at submit).
- When (2) is cold, renderer **correctly** blocks save before IPC (`listPoCapCacheBlockers`).
- After (2) succeeds: `bill-po-meta-fetch via=http parents=N caps=M` with `caps ≥ 1` for sourced
  over-limit rows; submit splits then proceeds.

### Why it broke (architecture)

| Layer | Failure |
|-------|---------|
| **ERP webview `executeJavaScript`** | `frappe.db.get_list` / bridge eval **hangs** under form ajax + chaos; `raceTimeout` abandons the waiter but the browser may still hold the eval. |
| **`erpEval` serialize queue (removed)** | Chained promises behind abandoned evals → background enrich never logged the next round. |
| **POST `frappe.client.get_list` + manual Cookie** | Frappe returned **400** — wrong shape for this session. |
| **GET `/api/resource/Purchase Order Item?filters=…`** | **417** / permission quirks — **child doctypes are a bad list target**. |
| **GET `/api/resource/Purchase Order` (header only)** | Works for logbook — **misleading green** when child cap cache is still empty. |

### Fix (current SSoT)

1. **Read path:** `electron/main.js` → `erpSessionFetchImpl()` (`session.fetch`, cookies automatic).
2. **PO/PR line caps:** `GET /api/resource/Purchase Order/{name}?fields=["name","customer","customer_name","items"]`
   (and PR parent analog) — pure extractors in `src/bill-po-hydrate.js`
   (`poItemsAndHeadersFromParentDocs`, `prItemsFromParentDocs`).
3. **Logbook titles:** `GET /api/resource/Purchase Order?filters=…` list (header doctype only).
4. **Fallback:** bridge `fetchPoLineMeta` → `erpEval` only if HTTP parent fetch fails.
5. **Save path:** cache-only — `listOverbillCapCacheBlockers` / `OVERBILL_CAP_CACHE_BLOCKER`; no JIT
   cap fetch at submit. Renderer logs `bill-overbill-cache-block-renderer` to nav-debug.

**Key modules:** `src/erp-http-list.js`, `src/bill-po-hydrate.js`, `src/bill-po-qty-split.js`,
`electron/main.js` (`fetchBillPoLineMeta`, `enrichBillLineContext`, `saveBillFromErp`).

### Dogfood checklist (OI-151 P3)

After `npm start`, open the over-limit draft bill:

1. Nav-debug within ~2s: `bill-po-meta-fetch via=http parents=1 caps=1`.
2. PO logbook shows OVERLIMIT **and** source columns finish (no endless *Still loading…*).
3. Save & Submit → one PO-linked row qty **1**, one **NIC** row for excess → submit succeeds.
4. If blocked: check nav-debug for `bill-overbill-cache-block-renderer` (cache cold) vs
   `bill-po-meta-fetch via=http fail …` (HTTP still broken).

### Do not regress

- Do **not** reintroduce JIT PO cap fetch on save/submit (OI-151 policy: fetch once → cache → split).
- Do **not** treat logbook title load as proof that `maxBillableQty` is cached.
- Do **not** list **Purchase Order Item** / **Purchase Receipt Item** via `/api/resource/{child}` filters
  — fetch **parent doc + items[]** instead.
- Avoid **`erpEval` promise chains** that block the next IPC until a hung eval completes.

---

## Template (append G2+)

```markdown
### Gn — Short title (OI-xxx, date)

**Observed:** …
**Expected:** …
**Architecture / fix:** …
**Dogfood:** …
```
