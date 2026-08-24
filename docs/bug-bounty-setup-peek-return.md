# Bug bounty — Cannot return to Bill from a setup peek (Account / Tax)

## Status

**Fixed** (2026-08-20) — see debrief.

## Contexts where found

1. **Vanilla Desk in this app** — on a new Bill, Taxes and Charges → Account Link → **Create a new Account**. ERP lands on `new-account-*`. Esc does not return. Recent **New Bill** does not return. Draft typing is lost if the clerk starts over.
2. **Same class, 2026-08-14 (OI-112)** — Tax Category / Company detour with no obvious path back to New Bill. Soft-peek + Doc park was the fix *when the hop started from the Doc surface*. This incident started **already on Vanilla**, so park never ran.
3. **Nav issue log** (2026-08-21T03:09:50Z) — frozen snapshot: `surfaceMode=erp`, `parked=null`, `peekParent=""`, shell `currentRoute` = Bill, live `erpPath` = `/desk/account/new-account-*`.

## Behavior observed

- “New Account” appears in Recent (so the hop was tracked).
- Esc / “exit” does nothing (no peek armed, no parked Doc).
- Recent **New Bill** classifies as `doc-preferred` with **lens=vanilla** → `showErp` + `loadURL`. The unsaved new Account traps or no-ops that hard nav. The shell still sets `currentRoute` to the Bill, so chrome lies.
- Recovery was a long way around; the Bill draft did not survive.

## Behavior expected

| Step | Expected |
|------|----------|
| Bill (Vanilla or Doc) → Create new Account | Treat as a **peek** under that Bill |
| Esc / Doc tab / Recent parent Bill | In-SPA `set_route` back to the Bill; tax-row typing still in Frappe locals |
| Hard Home / other Doc | Collapse peeks; Account remains a standalone Recent row |

Industry: Vanilla in a **browser** does this hop with `frappe.set_route` in one SPA. Browser Back returns. A dirty new Account may confirm leave; it must not silently trap the clerk with a chrome that already claims “Bill.”

## Architecture position

SSoT for “am I peeking?” is `peekStack` (OI-128 A), not only `parkedDocSurface`. Doc park remains the rebind path when the hop started from Doc. Vanilla-to-Vanilla hops must **begin** that stack from the previous Bill route. Warm ERP returns use `set_route`, not `loadURL`. `currentRoute` must follow the live ERP path (poll resync).

## Forward path

1. `applyErpHopToPeekStack(from, to)` on every ERP `trackNav`.
2. Esc / Doc tab / Recent parent → `erpSoftSetRoute(parent, { abandonUnsaved: true })`.
3. Poll: if shell route ≠ live `/desk`/`/app` path, `trackNav` the live URL.
4. Units for the Account hop, `/desk` vs `/app` equality, and route desync.

## Debrief (fixed 2026-08-20)

The 2026-08-14 soft-peek only armed when `softPeekErp` ran from the Doc surface. Create-new-Account is an in-SPA Desk hop after Vanilla skin, so `parkedDocSurface` stayed null and Recent used `loadURL`. Fix: start the peek stack from the previous Doc-skinned route; return with `set_route` and clear the child’s `__unsaved` trap; do not claim the destination route until the SPA moves. Variant: any setup master (Tax Category, Supplier, Company) hopped from a live Vanilla Bill/PO/IR.
