# Browse ERPNext MariaDB schema (safe, reusable)

> **Purpose.** Look at **Vanilla ERPNext data shape** (DocTypes → `tab…` tables) for deep UI /
> bowtie / dogfood work — **without** editing ERPNext core files or casually mutating the live
> sandbox in ways that force a reinstall.
>
> **Audience.** 5zorro (and agents) whenever a process needs a “center docs + one hop out” map:
> AP (PO · IR · Bill), AR, Journal Entry, Payment Entry, etc.
>
> **Related:** Clean Core (ADR-0001) — shell talks HTTP only; this doc is **read schema**, not
> patch vendor code. Discovery notes about *what the UI should do* stay in museum
> `open_items.md` (e.g. OI-041). This file is **how to look**, not product brainstorm.

---

## Hard rules (read before connecting)

| # | Rule | Why |
|---|------|-----|
| 1 | **Prefer read-only** DB access (MariaDB user and/or DBeaver connection) | Accidental `UPDATE`/`DELETE` from a GUI is the #1 “I need a reinstall” path |
| 2 | **Never edit** files under `apps/erpnext` / `apps/frappe` in the container or a bind mount | That **is** Vanilla core; we develop the shell against **unmodified** ERPNext |
| 3 | **Never** “Customize Form → save” / customize DocType JSON on the site you treat as Vanilla truth unless you accept site drift | Site customizations survive in MariaDB (`tabDocField`, etc.) and confuse “what stock ERPNext does” |
| 4 | Schema browsing ≠ migrating | Do not run `bench migrate`, app installs, or `ALTER TABLE` “to clean up” while exploring |
| 5 | Use the **sandbox** site only | Production / shared companies are out of bounds for exploratory SQL |
| 6 | Credentials stay **local** | Do not paste DB passwords into git, PRs, museum public mirrors, or chat logs you will publish |

**Clean Core reminder:** Fixing UX by editing ERPNext Python/JS is out of policy. If Vanilla is wrong for clerks, the shell adapts or we document a business rule — we do not fork core for convenience.

---

## Preferred tool: Windows DBeaver → localhost TCP

| Approach | Use? |
|----------|------|
| **DBeaver (Windows) → `127.0.0.1` + published MariaDB port** | **Yes** — default |
| WSL `mariadb` / `bench mariadb` CLI | OK for one-off `DESCRIBE` / `SELECT` |
| Point DBeaver at WSL **data files** under `/var/lib/mysql` | **No** — MariaDB is a server, not a file you open |
| Linux DBeaver inside WSL + GUI bridge | Optional; more friction — skip unless you already use WSL GUIs |

### One-time: publish MariaDB to localhost only

**Do not paste the YAML into a terminal.** Compose settings live in a **file**. Your running
stack uses:

`~/erpnext/frappe_docker/pwd-custom.yml`

#### Steps (WSL)

1. Open that file in an editor (Cursor / nano / etc.).
2. Under the `db:` service, add a `ports:` block (same indent as `image:` / `networks:`):

```yaml
  db:
    image: mariadb:11.8
    networks:
      - frappe_network
    ports:
      - "127.0.0.1:3306:3306"
    healthcheck:
      # ... rest unchanged ...
```

3. Apply it by **recreating** the db container from WSL (this keeps your data volume; it does
   **not** reinstall ERPNext):

```bash
cd ~/erpnext/frappe_docker
docker compose -f pwd-custom.yml up -d --force-recreate db
```

4. Confirm the port is published:

```bash
docker ps --filter name=frappe_docker-db-1 --format '{{.Names}} {{.Ports}}'
```

You want to see something like `127.0.0.1:3306->3306/tcp`.  
(Docker Desktop → container → Ports should show the same.)

Notes:

- Bind **`127.0.0.1`** so the port is not exposed on the LAN.
- If host `3306` is already taken (Windows MariaDB, another container), use
  `127.0.0.1:3307:3306` instead and put **3307** in DBeaver.
- Frontend on `:8080` is unrelated; you are only publishing the **database** port.

### DBeaver connection settings

1. New connection → **MariaDB** driver.
2. Host: `127.0.0.1` (prefer over `localhost` if a Windows MariaDB steals the socket name).
3. Port: published host port.
4. Database: **site database name** (from site config on the ERP host — do not commit it here).
5. User / password: prefer a **read-only** user (next section); else site DB user with extreme care.
6. Driver properties (common Docker gotchas):
   - `allowPublicKeyRetrieval` = `true`
   - `useSSL` = `false` (local sandbox only)
7. **Connection settings → Connection type / Read-only** (DBeaver): enable **Read-only** for this connection so the GUI greys out edits.

Test connection once; save as e.g. `ERPNext sandbox (RO)`.

---

## Extra protection: read-only MariaDB user + DBeaver Read-only

**Defense in depth (both):**

| Layer | What |
|-------|------|
| **MariaDB `erp_ro`** | `SELECT` only on the site DB — agents and optional DBeaver login |
| **DBeaver F4 / Edit Connection → Read-only** | GUI won’t offer writes even if the DB user could |

On this sandbox, **`erp_ro`@`%`** is already created with `SELECT` on `_2bc462bbddf20743`.

### Agent / CLI credentials (local only — not in git)

```text
~/.config/erpnext-ui-app/db-ro.env
```

Mode `600`. Host/port/db/user/password for SELECT-only. Lives under your home config (outside
the public repo). **Agents should source this and use `erp_ro` by default — not `root`.**

Optional — show the password for DBeaver:

```bash
grep ERP_DB_PASSWORD ~/.config/erpnext-ui-app/db-ro.env
```

### DBeaver: root + F4 Read-only (fine for you)

1. Select the connection → **F4** (or right‑click → **Edit Connection…**).
2. Enable **Read-only**.
3. Save. Browse normally.

### DBeaver: optional switch to `erp_ro`

1. F4 → Username `erp_ro`, password from `db-ro.env`, database `_2bc462bbddf20743`.
2. Still enable **Read-only** in the UI.
3. Test Connection → save → reconnect.

### Recreate `erp_ro` later (if you wipe the DB volume)

As MariaDB admin, then update `db-ro.env`:

```sql
CREATE USER 'erp_ro'@'%' IDENTIFIED BY 'NEW_PASSWORD';
GRANT SELECT ON `_2bc462bbddf20743`.* TO 'erp_ro'@'%';
SHOW GRANTS FOR 'erp_ro'@'%';
```

(`FLUSH PRIVILEGES` is optional after `GRANT`; not required before `SHOW GRANTS`.)

---

## How Frappe names tables (gotchas)

| Concept | Reality |
|---------|---------|
| DocType `Purchase Invoice` | Table `tabPurchase Invoice` (**space** in the name) |
| Child DocType `Purchase Invoice Item` | Table `tabPurchase Invoice Item` |
| Link field | Usually **no** InnoDB foreign key — just a string/name in a column |
| Line “detail” pointers (`po_detail`, `pr_detail`, `purchase_order_item`) | Often **Data**, not Link — still the join key for bowtie |
| “One hop out” | DocTypes referenced by **Link** or **Table** on the center DocType **or** its immediate child tables — **not** second-hop (e.g. Item → Bin → Stock Ledger is two hops) |
| Site custom fields | Live in MariaDB meta tables; stock JSON under `apps/erpnext/.../doctype/*.json` is the **vendor** definition |

**Do not** use DBeaver’s “edit row” on `tabDocType` / `tabDocField` to “fix” Vanilla.

---

## Repeatable recipe: any process (Journal Entry, AR, …)

Copy this checklist each time. Replace **CENTER** with the DocTypes that are the process’s primary data-entry docs.

### A. Pick the center (1–3 DocTypes)

Examples:

| Process | Center DocTypes (typical) |
|---------|---------------------------|
| **AP entry** | Purchase Order, Purchase Receipt (Item Receipt), Purchase Invoice (Bill) |
| **Journal Entry** | Journal Entry (+ Journal Entry Account child) |
| **AR entry** | Sales Order, Delivery Note, Sales Invoice (adjust to your dogfood scope) |
| **Pay Bill / Receive Payment** | Payment Entry (+ Payment Entry Reference / accounts children) |

Write the center names down before opening DBeaver.

### B. Discover Link / Table fields from vendor JSON (source of truth for “one hop”)

On the ERP host (WSL), with the bench container running:

```bash
# Example: Journal Entry — adjust path under apps/erpnext/erpnext/.../doctype/
docker exec frappe_docker-backend-1 python3 <<'PY'
import json, sys
from pathlib import Path
root = Path("/home/frappe/frappe-bench/apps/erpnext/erpnext")
# Pass one or more relative paths to *json DocType files
paths = sys.argv[1:] or [
    "accounts/doctype/journal_entry/journal_entry.json",
    "accounts/doctype/journal_entry_account/journal_entry_account.json",
]
hop = set()
for rel in paths:
    m = json.loads((root / rel).read_text())
    print("===", m.get("name"), "===")
    for f in m.get("fields", []):
        ft, opts, name = f.get("fieldtype"), f.get("options"), f.get("fieldname")
        if ft in ("Link", "Table", "Dynamic Link"):
            print(f"  {ft:12} {name:32} -> {opts}")
            if opts:
                hop.add(opts)
print("\n-- One-hop DocTypes (unique) --")
for o in sorted(hop):
    print(" ", o)
PY
```

Or open the same `*.json` files in the container / upstream GitHub for your ERPNext version.

### C. Map DocType → `tab…` name

Rule: `tab` + DocType name exactly (`Journal Entry` → `tabJournal Entry`).

Child Table fields → their child DocType → another `tab…` table (those children are still “center” for browsing, not hop-out masters).

### D. Build a DBeaver bookmark folder

Suggested folders:

- `AP — center`
- `AP — one hop`
- `JE — center`
- `JE — one hop`
- …

Star only the tables for the current deep dive so search stays usable.

### E. Optional Mermaid (after browsing, not instead)

One small diagram of **edges you care about** (center ↔ hop). Do **not** Mermaid the whole site database. Product discovery stays in museum OIs; a tiny diagram may live in a dated plan as ids + how, or stay private notes.

### F. When done

- Close the RW connection if you opened one.
- Do not leave exploratory `UPDATE`s uncommitted in your head — either revert (sandbox restore) or document the intentional seed data.
- If Desk feels “weird” after Customize Form experiments: assume **site meta drift**, not shell bugs — restore from backup or recreate sandbox rather than editing core apps.

---

## Worked example: AP (PO · IR · Bill) — center + one hop

Use this as the template; Journal Entry / AR get their own bookmark sets the same way.

### Center tables

| DocType | Table |
|---------|--------|
| Purchase Order | `tabPurchase Order` |
| Purchase Order Item | `tabPurchase Order Item` |
| Purchase Order Item Supplied | `tabPurchase Order Item Supplied` |
| Purchase Receipt | `tabPurchase Receipt` |
| Purchase Receipt Item | `tabPurchase Receipt Item` |
| Purchase Receipt Item Supplied | `tabPurchase Receipt Item Supplied` |
| Purchase Invoice | `tabPurchase Invoice` |
| Purchase Invoice Item | `tabPurchase Invoice Item` |
| Purchase Invoice Advance | `tabPurchase Invoice Advance` |
| Shared children often present | `tabPurchase Taxes and Charges`, `tabPayment Schedule`, `tabPricing Rule Detail`, `tabItem Wise Tax Detail` |

**Join columns that matter for M:N / partials** (on item rows):

- Receipt item → `purchase_order`, `purchase_order_item`, `purchase_invoice`, `sales_order`
- Invoice item → `purchase_order`, `po_detail`, `purchase_receipt`, `pr_detail`
- Order item → `sales_order`, `sales_order_item`

### One-hop masters (AP-relevant subset)

| Kind | Tables |
|------|--------|
| Party / address | `tabSupplier`, `tabSupplier Group`, `tabAddress`, `tabContact` |
| Item | `tabItem`, `tabItem Group`, `tabUOM`, `tabBrand` |
| Sales (from PO/IR lines) | `tabSales Order`, `tabSales Order Item` |
| Org / stock | `tabCompany`, `tabWarehouse` |
| GL / tax scaffolding | `tabAccount`, `tabCurrency`, `tabCost Center`, `tabTax Category`, `tabPurchase Taxes and Charges Template`, `tabPayment Terms Template`, `tabMode of Payment` |

**Usually skip on pass 1** even if Link’d: Letter Head, Print Heading, Auto Repeat, Incoterm, Scorecard, MPS, Job Card, Asset, … — still “one hop” in meta, low value for AP bowtie.

---

## Worked sketch: Journal Entry (start here next time)

Center (typical):

- `tabJournal Entry`
- `tabJournal Entry Account` (and any other Table children listed in the JSON)

One hop: whatever the Python recipe prints — commonly `Company`, `Account`, `Cost Center`, `Project`, `Party Type` / party links, currency, multi-currency accounts, etc. Build the bookmark list from the script output for **your** ERPNext version (field sets change by version).

---

## What this procedure does **not** replace

| Need | Use instead |
|------|-------------|
| Runtime “what links to this doc?” | Desk **Connections** on a sample doc |
| Clerk-facing field labels | Customize Form (**read-only look**) or DocType JSON `label` |
| Shell UX decisions | Museum `open_items.md` → dated plan |
| Broken ERP after reboot | `docs/erp-unreachable.md` / `ensure-erp-up.sh` |

---

## Recovery if something went wrong

| Symptom | Likely cause | Path |
|---------|--------------|------|
| Desk fields missing / extra vs fresh ERPNext | Site Customize Form / custom fields | Restore DB volume or recreate sandbox site — **do not** patch `apps/erpnext` |
| App errors after editing Python in the container | Core edit | Re-pull / recreate containers from stock images; discard local core edits |
| Accidental mass `DELETE`/`UPDATE` | RW SQL | Restore from volume backup / snapshot; re-seed sample data (`npm run seed:sample` with sandbox guards) |
| DBeaver connects to wrong MariaDB | Windows service on 3306 vs Docker | Use `127.0.0.1` + distinct published port; stop unused Windows MariaDB |

---

## Quick card (print / pin)

1. Sandbox only · DBeaver **read-only** · prefer `erp_ro` user.  
2. Publish DB as `127.0.0.1:PORT:3306` — never open core app files to “fix” schema.  
3. Center DocTypes → child `tab…` → Link/Table hop → bookmark folder.  
4. Detail columns (`po_detail`, …) are join keys even when type is Data.  
5. Mermaid after browsing; museum OIs for product intent.  
6. Drifted site → restore/reseed; never reinstall-by-editing-vendor-tree as a habit.  
7. **AP research hub (landed):** museum **OI-108** (PO/IR/Bill edges + sandbox gaps).
