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

Idempotent without `--reset`: skips docs whose `remarks` already contain `[ui-app-sample-v1]`.

## Link graph (summary)

| Doc | From source | From nothing | Leftover open sources |
|-----|-------------|--------------|------------------------|
| SO | 15 ← Quotation | 10 | Quotation 15–24 unconverted |
| SI | 12 ← SO | 13 | SO 12–24 uninvoiced |
| PR | 12 ← PO | 13 (NIC) | |
| PI | 8 ← PR, 8 ← PO | 9 | PO 20–24 open (no PR/PI) |

Every 4th PO also sets `sales_order` on lines (SO picker on PO).

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

Output: `ops/sample-data/dogfood-sources/generated/` (gitignored). Catalog SSoT:
`src/sample-data/dogfood-ap-sources.js` (OI-103 scenarios 1–8 + packing / partial /
house-of-brands extras). This path does **not** post to MariaDB.
