# Sample data seed (sandbox only) — OI-055 / plan S−1

Deterministic corpus for dogfooding **create from nothing** vs **create from source**
across Quotation, Sales Order, Sales Invoice, Purchase Order, Purchase Receipt, and
Purchase Invoice (~25 **submitted** each + **5 drafts** each, last 60 days, multiple
SAMPLE vendors/customers). Drafts are create-from-nothing and use distinct parties
(first 5 vendors / customers) so Find Bill can open real `docstatus === 0` rows.

## Tax mix (OI-115)

| Side | Mix | Effect |
|------|-----|--------|
| **AR / customers** | ~7 of 8 taxable, 1 exempt | Submitted Sales Invoices for taxable customers get **Sales Taxes and Charges** (prefer `US ST 6.25% - HI`) → ST liability accounts |
| **AP / purchases** | No purchase sales-tax template | Wholesale/resale realism — Bills are nontaxable for sales tax |
| **Tax withholding (TDS)** | ~2 of 8 SAMPLE vendors | Category **`SAMPLE-TDS`** (10%, threshold 0); submitted PIs for those vendors withhold → **Tax Withholding Details** report |

**Reports after seed**

- **Tax Withholding Details** — filter the sandbox company / FY 2026; expect SAMPLE TW Bills (not sales-tax SIs).
- **Sales Invoice** taxes table / ST account ledger — open a taxable SAMPLE Customer SI (not the exempt customer).
- Sales tax does **not** appear in Tax Withholding Details (different ERP feature).

## Layout

| Path | Role |
|------|------|
| `src/sample-data/corpus-plan.js` | Pure plan SSoT (unit-tested) |
| `src/sample-data/sandbox-guard.js` | Allowlist / confirm checks (unit-tested) |
| `ops/sample-data/emit-plan.js` | Emit plan JSON |
| `ops/sample-data/seed_corpus.py` | Frappe applicator (`bench execute`) |
| `ops/sample-data/run-seed.sh` | Docker + sandbox gate |

## Run

```bash
# frappe_docker up on :8080, company name contains SANDBOX
CONFIRM_SAMPLE_SEED=1 npm run seed:sample

# wipe prior tagged docs then recreate (soft reset — keeps company / login / volumes)
CONFIRM_SAMPLE_SEED=1 npm run seed:sample -- --reset
```

Idempotent without `--reset`: skips docs whose `remarks` already contain the current tag
(`ui-app-sample-v2` — see `SAMPLE_TAG` in `corpus-plan.js`).

**Dupe-check dogfood (OI-054 / OI-087):** After you have typed seeded `bill_no` values once, a
**soft reset** avoids stale duplicate warnings:

```bash
CONFIRM_SAMPLE_SEED=1 npm run seed:sample -- --reset
npm run dogfood:ap-sources   # refresh HTML paper sources (gitignored output)
```

Use **fresh refs** (`DOGFOOD-…`) when manually testing entry — not the seeded `SMP-V…-INV-…` series.

## Link graph (summary)

| Doc | From source | From nothing | Leftover open sources |
|-----|-------------|--------------|------------------------|
| SO | 15 ← Quotation | 10 | Quotation 15–24 unconverted |
| SI | 12 ← SO | 13 | SO 12–24 uninvoiced |
| PR | 12 ← PO | 13 (NIC) | |
| PI | 8 ← PR, 8 ← PO | 9 | PO 20–24 open (no PR/PI) |

Every 4th PO also sets `sales_order` on lines (SO picker on PO).

**T0 AP fixtures (v2 tag, after `--reset`):**

| Plan key | OI | Role |
|----------|-----|------|
| `PO-MN` / `PR-MN` | OI-149, OI-102 | Same vendor; partial IR; **unbilled** — Bill source modal PO+PR |
| `PO-PP` / `PR-PP` | OI-153 | PO + full IR; **manual PE Pay $120** against PO before Bill (auto-seed best-effort) |
| `PO-LB` | OI-154, OI-121 | Logbook title **TO-5599** (Find by title, not ERP name) |

Paper sources **DF-14…DF-16** in `dogfood-ap-sources.js` match these sandbox rows.

**OI-131 picker fixtures:** `SAMPLE Vendor Idle` (one submitted PO older than the 60-day window) and `SAMPLE Vendor Never` (no PO). Not used in the create-from-source rotation. Re-seed to pick them in the Doc vendor dropdown.

## Human dogfood source pack (vendor paper → type into Doc)

ERP seed fills the **database**. For **data-entry dogfood** you also want paper-like
sources (PO ack / packing list / vendor invoice) that do **not** all share one online
template.

```bash
# HTML (open in browser → Print → Save as PDF)
npm run dogfood:ap-sources

# Or generate PDFs with Playwright Chromium
npm run dogfood:ap-sources:pdf
```

Output: `ops/sample-data/dogfood-sources/generated/` (gitignored — one `.html` and one `.pdf` per
scenario, plus a generated `README.md` index). Catalogue SSoT:
`src/sample-data/dogfood-ap-sources.js`. This path does **not** post to MariaDB.

### The catalogue is the list of edge cases we claim to handle

Unit tests prove the pure logic; this pack proves the **surface** — a person entering real-looking
paper into the real UI, which is the only thing that catches a button wired to nothing. Adding a
scenario here is how an edge case gets *formalized* rather than remembered.

Every entry carries four things, and `tests/dogfood-ap-sources.test.js` holds the catalogue to them:

| Field | Answers |
|---|---|
| `flow` | which side of the business — `ap` (money out) or `ar` (money in) |
| `target` | the ERPNext doctype the paper is typed **into** (derived from `kind`) |
| `scenario` | the edge case, in one line |
| `expect` | what proves it worked, or the trap to watch for |

`expect` is optional only because the original 20 scenarios predate it; the generated index prints
how many are still missing one, and a scenario with no pass/fail condition is a suggestion rather
than a test. Fill it in as each is dogfooded.

Both the generated index and each PDF's banner are built from those fields, so the catalogue and
the paper cannot drift apart.

**Money-in paper (AR).** `DF-18`–`DF-20` are the sales side: a customer RFQ → **Quotation**, a
customer PO → **Sales Order**, and a shipping notice → a partial **Sales Invoice**. `DF-20` depends
on `DF-19` being entered first, and says so.

**`DF-17` — the double-payment trap P1 creates.** Cancelling a bill *detaches* its payments on this
site, so a void-and-amend leaves the payment submitted-but-unallocated while the amended bill reads
Unpaid — and the vendor's statement then chases money you already sent. Vanilla's fix is
**Accounts → Payment Reconciliation**; there is no automatic re-link.

**OI-132 Import lines:** `DF-13` also emits `DF-13_purchase_order_import_paste.tsv` /
`.csv` — messy 11-column vendor export (2 junk header rows). Use **Import lines…** on
PO/Bill: ignore first 2 rows; map SKU, Vendor note (append), Qty, Extended; ignore the rest.
See generated `*_import_README.md` beside the paste files.
