# Bug bounty — Bill chrome vs ERP desync after Customer/SO peek (strike 2)

## Status

**Fix in progress** (2026-08-22) — `ensureErpMatchesShellRoute`, park-on-route-hold, showBill refocus resync.

## Contexts where found

1. **Nav issue** (2026-08-22T14:29:22Z) — New Bill → Recent → Customer / Sales Order list to scout SOs for OI-134 dogfood → Recent **New Bill**. Bill chrome shows; form blank; source picker fails. Snapshot: `surfaceMode=bill`, `currentRoute=/app/purchase-invoice/new-*`, `erpPath=/desk/sales-order`, `doc=null`, `peekParent` set.
2. **Nav issue** (2026-08-22T14:34:58Z) — Same session; after return, NIC / “no source” path broken; bridge sometimes reads **Customer** (`doc.doctype=Customer`) while shell claims Bill.
3. **Related strike 1** — `docs/bug-bounty-setup-peek-return.md` (Account/Tax peek, 2026-08-21). Same class: shell route lies ahead of live ERP SPA.

**Not a navigation bug:** Nav issue (2026-08-22T14:42:34Z) — expected **Link Sales Order…** on toolbar, not on Customer:Job column. OI-134 placement / discoverability only.

## Behavior observed

| Signal | Value |
|--------|--------|
| Shell | `surfaceMode=bill`, `currentRoute` = Purchase Invoice |
| Live ERP | `/desk/sales-order` or Customer form |
| Bridge | `doc=null` or wrong doctype |
| Peek stack | Parent = Bill; children = Customer, Selling, SO list |
| User impact | Blank Bill, vendor/source modal errors, must restart or long recovery |

Trail pattern: `openHistoryRoute doc-preferred → openRoutePreferred wantDoc=true → showBill same-route refocus` **without** moving ERP off the peek child.

Secondary: `softPeekErp` from Recent logged `surfaceMode=home` while `currentRoute` still PI → `parkDocSurfaceIfNeeded` no-op → `resumeParkedDoc` could not rebind.

## Behavior expected

| Step | Expected |
|------|----------|
| Bill → Recent → Customer/SO (peek) | Park Bill + peek stack; ERP hops in SPA |
| Recent **New Bill** / Doc tab / Esc parent | Collapse peek; ERP `set_route` back to PI; bridge snapshot from live `cur_frm` |
| Doc chrome visible | **Requires** ERP on the same `/app/purchase-invoice/…` route — never paint from stale memory while ERP is on SO list |

Industry: Single SPA (Vanilla browser) never shows form A while router is on list B. Electron dual-view must resync the hidden ERP view before the Doc projector reads it.

## Architecture position

- **SSoT for “where am I?”** — live ERP path must match `currentRoute` before `snapshotBill` / `listSources` / merge IPC.
- **`showBill` same-route refocus** — optimization for Recent clicks; must not skip ERP resync when `erpLivePathDiffers`.
- **`parkedDocSurface`** — must arm when `currentRoute` is a Doc form even if chrome momentarily reports `surfaceMode=home` (Recent IPC).
- **OI-128 peek stack** — parent Bill row in Recent should trigger return + resync, not memory-only repaint.

## Forward path (implemented 2026-08-22)

1. `parkDocSurfaceIfNeeded` — park on PI `currentRoute` + `dirtyState.doc` when surfaceMode is home (route-hold).
2. `softPeekErp` — snapshot Bill when `currentRoute` is purchase-invoice even if surfaceMode ≠ bill.
3. `ensureErpMatchesShellRoute(path)` — `set_route` or `erpForceReopenRoute` when shell ≠ live ERP.
4. `showBill` refocus — call ensure + fresh `snapshotBill`; collapse peek when returning to parent Bill.
5. `resumeParkedDoc` — `erpForceReopenRoute` fallback when soft `set_route` fails.
6. Unit coverage for `erpLivePathDiffers` (existing) + manual dogfood: Bill → Customer → Recent New Bill → vendor + source modal green.

## Debrief

*(Fill when dogfood confirms fix.)*
